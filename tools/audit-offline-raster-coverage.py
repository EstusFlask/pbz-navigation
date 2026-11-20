"""Inventory legacy tile bakes that can exceed the upstream 512-chunk cap.

The chunky BVH splits the triangle array at its midpoint until each leaf has
at most 256 triangles. Up to 131072 triangles therefore fit in 512 leaves.
Larger legacy inputs are conservatively selected for exact reconstruction;
separate height layers/variants can make some selections unnecessary.
"""
from pathlib import Path
import argparse,concurrent.futures,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def scan(file):
    raw=file.read_bytes();r=json.loads(raw);triangles=r.get('inputTriangles')
    covered=bool(r.get('rasterCoverage')) and all(c.get('schema')==1 for c in r['rasterCoverage'])
    return dict(x=r.get('x'),y=r.get('y'),inputTriangles=triangles,sourceInputSHA256=r.get('inputSHA256'),compilerSHA256=r.get('compilerSHA256'),receiptSHA256=hashlib.sha256(raw).hexdigest(),covered=covered,error=r.get('error'),selected=not covered and (not isinstance(triangles,int) or triangles>131072))
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=ROOT/'build/offline-navigation/raster-coverage-audit.json');p.add_argument('--world');p.add_argument('--workers',type=int,default=12);args=p.parse_args()
    out=args.output.resolve()
    if not out.is_relative_to(ROOT/'build'):raise ValueError('Private evidence must stay under build/')
    base=ROOT/'build/offline-navigation/worlds';results=[]
    for world in sorted(base.iterdir()):
        if not world.is_dir()or(args.world and world.name!=args.world)or not(world/'navigation-index.json').exists():continue
        index=json.loads((world/'navigation-index.json').read_bytes())
        leaves=[world/'grids'/g['id']for g in index['grids']]if index.get('kind')=='multi-grid-world'else[world]
        for folder in leaves:
            selected=[];count=0;fixed=0;digest=hashlib.sha256();files=sorted((folder/'tiles').glob('*/receipt.json'))
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers)as pool:
                for file,row in zip(files,pool.map(scan,files)):
                    count+=1;fixed+=row['covered'];digest.update(file.parent.name.encode());digest.update(bytes.fromhex(row['receiptSHA256']))
                    if row['selected']or row['error']:selected.append(row)
            record=dict(world=world.name,grid=folder.relative_to(world).as_posix(),folder=folder.relative_to(ROOT).as_posix(),receipts=count,alreadyCovered=fixed,conservativeLegacyCandidates=len(selected),sourceReceiptLedgerSHA256=digest.hexdigest(),selected=selected)
            results.append(record);print(world.name,record['grid'],'receipts',count,'candidates',len(selected),'alreadyCovered',fixed,flush=True)
            out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(dict(schema=1,scope='Legacy rasterization coverage, not physical/game acceptance',algorithm='Conservative balanced-BVH leaf upper bound; exact per-layer/variant coverage recorded by corrected bakes',worlds=results,totalReceipts=sum(r['receipts']for r in results),totalCandidates=sum(r['conservativeLegacyCandidates']for r in results),complete=False),indent=2)+'\n',encoding='utf-8')
    value=json.loads(out.read_text());value['complete']=True;out.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
