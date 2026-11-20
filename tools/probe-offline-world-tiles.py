"""Re-tile a small exact collision window without modifying a built world."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('tiles',ROOT/'tools/build-offline-world-tiles.py')
tiles=importlib.util.module_from_spec(spec);spec.loader.exec_module(tiles)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--x',type=int,required=True);parser.add_argument('--y',type=int,required=True)
    parser.add_argument('--cells',type=int,default=128)
    args=parser.parse_args();folder=args.world.resolve();out=args.output.resolve()
    if not out.is_relative_to(ROOT/'build') or out==folder or not 32<=args.cells<=256:raise ValueError('Invalid private experiment')
    out.mkdir(parents=True,exist_ok=True);work=out/'work';work.mkdir(exist_ok=True)
    metadata=json.loads((folder/'spatial-index.json').read_text());old=metadata['extentCm'];extent=metadata['cellCm']*args.cells
    bounds=[(args.x-1)*old,-(args.y+2)*old,(args.x+2)*old,-(args.y-1)*old]
    x0,x1=round(bounds[0]/extent),round(bounds[2]/extent);y0,y1=round(-bounds[3]/extent),round(-bounds[1]/extent)
    metadata.update(tileCells=args.cells,extentCm=extent,candidateTiles=(x1-x0)*(y1-y0),scope='diagnostic collision window only',
                    sourceWorldIndexSHA256=tiles.digest(folder/'navigation-index.json'))
    metadata['spatialIndexSHA256']=hashlib.sha256(json.dumps(metadata,sort_keys=True).encode()).hexdigest()
    tiles.atomic_json(out/'spatial-index.json',metadata)
    db=sqlite3.connect(f'file:{(folder/"spatial.sqlite").as_posix()}?mode=ro',uri=True)
    process=subprocess.Popen(['node',str(ROOT/'offline-navigation/build-world-tile.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8',cwd=ROOT)
    try:
        for y in range(y0,y1):
            for x in range(x0,x1):
                directory=out/'tiles'/f'{x}_{y}';directory.mkdir(parents=True,exist_ok=True)
                tiles.materialize(db,folder,x,y,metadata,work)
                process.stdin.write(json.dumps(dict(input=str(work/'input.pbzmesh'),metadata=str(work/'input.json'),output=str(directory)))+'\n');process.stdin.flush()
                result=json.loads(process.stdout.readline())
                if result.get('error'):raise ValueError(result['error'])
        tiles.finalize(out,metadata)
    finally:process.stdin.close();process.wait();db.close()
    tiles.atomic_json(out/'probe.json',dict(world=metadata['world'],boundsUE=bounds,sourceWorld=str(folder.relative_to(ROOT)),cellCm=metadata['cellCm'],tileCells=args.cells,physicalVerified=False))


if __name__=='__main__':main()
