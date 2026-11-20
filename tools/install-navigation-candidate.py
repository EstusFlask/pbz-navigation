"""Install a verified candidate into navigation-owned folders, with rollback.

User installation authorization is required before invoking this tool. It never
launches the game or changes saves, settings, other Mods, or manager preferences.
"""
from pathlib import Path
import argparse,csv,datetime,hashlib,io,json,os,shutil,subprocess,uuid,zipfile
ROOT=Path(__file__).resolve().parents[1]
NAV='ProjectPBZ/PBZModLoader/mods/PBZQuestRoute/'
COMPAT='platform/steam/ue4ss/Mods/PBZQuestRouteCompat/'
ASSETS='ProjectPBZ/Content/Mods/PBZQuestRoute/'
SNAPSHOT_NOTES={'README-en.txt','README-zh.txt','UNRELEASED-WORLD-INTEGRATION.txt'}
def digest(file):
    with Path(file).open('rb')as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def atomic(file,raw):
    temp=file.with_name(file.name+'.navigation.tmp');temp.write_bytes(raw);os.replace(temp,file)
def idle():
    rows=csv.reader(io.StringIO(subprocess.check_output(['tasklist','/fo','csv','/nh'],text=True,errors='replace')))
    active=[r[0]for r in rows if r and('projectpbz'in r[0].lower()or r[0].lower()=='uemodmanager.exe')]
    if active:raise RuntimeError('Close the game and Mod Manager before installation: '+', '.join(active))
def same_volume_move(source,destination,allowed_source,allowed_destination):
    source=source.resolve();destination=destination.resolve()
    if not source.is_relative_to(allowed_source.resolve())or not destination.is_relative_to(allowed_destination.resolve()):raise ValueError('Move escaped explicitly owned directories')
    if destination.exists():raise ValueError('Refusing to overwrite a backup')
    destination.parent.mkdir(parents=True,exist_ok=True)
    if source.stat().st_dev!=destination.parent.stat().st_dev:raise ValueError('Atomic installation requires the same volume')
    os.rename(source,destination)
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',required=True)
    parser.add_argument('--snapshot-receipt',type=Path,help='Verified private development staging receipt')
    parser.add_argument('--game',type=Path,required=True)
    parser.add_argument('--manager',type=Path,required=True)
    args=parser.parse_args()
    game=args.game.resolve();manager=args.manager.resolve();version=args.version
    idle()
    snapshot_files=None
    if args.snapshot_receipt:
        private=(ROOT/'build/offline-navigation').resolve()
        receipt=args.snapshot_receipt.resolve()
        if receipt.parent!=private or not receipt.name.endswith('.receipt.json'):
            raise ValueError('Expected a private navigation staging receipt')
        snapshot=json.loads(receipt.read_bytes())
        if (snapshot['kind']!='unreleased-world-integration' or snapshot['version']!=version
            or snapshot['installed'] or not snapshot['overlaysVerified']):
            raise ValueError('Unexpected development snapshot')
        info=snapshot['archive']
        archive=(ROOT/info['file']).resolve()
        label=receipt.name.removesuffix('.receipt.json')
        if archive.parent!=private or archive.name!=label+'.zip' or archive.stat().st_size!=info['bytes']:
            raise ValueError('Snapshot archive differs from staging receipt')
        expected_archive_sha=info['sha256']
        snapshot_files=snapshot['files']
    else:
        candidate=json.loads((ROOT/f'release/LOCAL-CANDIDATE-{version}.json').read_bytes())
        package=next(r for r in candidate['packages']if r['flavor']=='development')
        archive=(ROOT/package['archive']).resolve()
        if not archive.is_relative_to(ROOT/'dist'):raise ValueError('Candidate must come from dist')
        expected_archive_sha=package['sha256']
        label=version
    if digest(archive)!=expected_archive_sha:raise ValueError('Candidate archive hash differs')
    if not(game/'ProjectPBZ/Binaries/Win64').is_dir():raise ValueError('Game layout differs')
    statefile=manager/'Data/games/phantom-blade-zero/mods.json';original_state=statefile.read_bytes();state=json.loads(original_state);state_sha=hashlib.sha256(original_state).hexdigest()
    def owns(file):
        name=file.get('fileName','').replace('\\','/');target=file.get('target')
        return(target=='InstallRoot'and name.startswith(NAV))or(target=='Ue4ssMods'and name.startswith('PBZQuestRouteCompat/'))
    old=[m for m in state['mods']if any(owns(f)for f in m['files'])]
    if len(old)>1 or any(not owns(f)for m in old for f in m['files']):raise ValueError('Ambiguous or mixed navigation ownership')
    others=[m for m in state['mods']if m not in old];other_files={}
    if old and old[0]['id'] in json.dumps(state.get('sets',[])):
        raise ValueError('Navigation appears in a Mod set; migrate that set explicitly')
    occupied=set()
    for m in others:
        for f in m['files']:
            occupied.add((f.get('target'),f.get('fileName','').replace('\\','/').casefold()))
            if f.get('deployedPath'):
                p=Path(f['deployedPath']).resolve()
                if p.is_relative_to(game)and p.is_file():other_files[str(p)]=digest(p)
    saved={}
    for base in [game/'ProjectPBZ/Saved',Path(os.environ['LOCALAPPDATA'])/'ProjectPBZ/Saved']:
        files=list((base/'SaveGames').rglob('*'))if(base/'SaveGames').exists()else[]
        files.extend(base.glob('PBZQuestRoute-settings*.json'))
        for file in files:
            if file.is_file():saved[str(file.resolve())]=digest(file)
    if snapshot_files:
        for name,sha in snapshot_files.items():
            if name in SNAPSHOT_NOTES or name.startswith((NAV,COMPAT)):continue
            if not name.startswith(ASSETS):raise ValueError('Unexpected file in navigation snapshot: '+name)
            asset=(game/name).resolve()
            if not asset.is_relative_to(game/ASSETS) or not asset.is_file() or digest(asset)!=sha:
                raise ValueError('Installed navigation asset does not match snapshot: '+name)
            other_files[str(asset)]=sha
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');work=ROOT/'build'/f'install-navigation-{label}-{stamp}';work.mkdir();backup=work/'backup';backup.mkdir();(backup/'mods.json').write_bytes(original_state)
    new_id=uuid.uuid4().hex[:12];library=(manager/'Data/games/phantom-blade-zero/library'/new_id).resolve();library.mkdir(parents=True);newgame=work/'new-game';newgame.mkdir();records=[];expected={}
    report=dict(schema=1,version=version,flavor='development',archive=str(archive),archiveSHA256=expected_archive_sha,game=str(game),backup=str(backup),managerState=str(statefile),originalManagerSHA256=state_sha,savedBefore=saved,otherFilesBefore=other_files,installed=False,startedGame=False)
    moved=[];placed=[];state_written=False
    try:
        with zipfile.ZipFile(archive)as z:
            names=z.namelist()
            if len(set(name.casefold()for name in names))!=len(names):raise ValueError('Duplicate archive paths')
            if snapshot_files is not None and set(names)!=set(snapshot_files):
                raise ValueError('Snapshot archive inventory differs from staging receipt')
            for name in names:
                if not(name.startswith(NAV)or name.startswith(COMPAT)):continue
                if '\\' in name or any(part in ('.','..','') or ':' in part for part in name.split('/')):
                    raise ValueError('Unsafe install path')
                target='InstallRoot'if name.startswith(NAV)else'Ue4ssMods';relative=name if target=='InstallRoot'else name[len('platform/steam/ue4ss/Mods/'):]
                if (target,relative.casefold()) in occupied:raise ValueError('Another Mod owns '+name)
                file=library/target/relative
                if not file.resolve().is_relative_to(library):raise ValueError('Library path escaped')
                file.parent.mkdir(parents=True,exist_ok=True);sha=hashlib.sha256()
                with z.open(name)as source,file.open('wb')as dest:
                    while chunk:=source.read(1048576):sha.update(chunk);dest.write(chunk)
                identity=sha.hexdigest();staged=newgame/name;staged.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,staged)
                if snapshot_files is not None and identity!=snapshot_files[name]:
                    raise ValueError('Snapshot file hash differs: '+name)
                if digest(staged)!=identity:raise ValueError('Prepared game copy differs')
                expected[name]=identity;records.append(dict(fileName=relative,target=target,size=file.stat().st_size,sha256=identity.upper(),deployedPath=str(game/name)))
        runtime_name=NAV+'PBZRouteBuild.js';profile=json.loads((newgame/runtime_name).read_text(encoding='utf-8').split('module.exports=',1)[1].strip().removesuffix(';'))
        if profile['version']!=version or not profile['development']:raise ValueError('Wrong installed profile')
        idle()
        if digest(statefile)!=state_sha:raise ValueError('Manager state changed during preparation')
        for relative,backup_name in [(NAV.rstrip('/'),'navigation'),(COMPAT.rstrip('/'),'compatibility')]:
            target=(game/relative).resolve()
            if not target.is_relative_to(game):raise ValueError('Game target escaped through a link')
            if target.exists():
                same_volume_move(target,backup/backup_name,game,work)
                moved.append((backup/backup_name,target))
            same_volume_move(newgame/relative,target,work,game);placed.append(target)
        missing=[];changed=[]
        for name,identity in expected.items():
            file=game/name
            if not file.is_file():missing.append(name)
            elif digest(file)!=identity:changed.append(name)
        actual={p.relative_to(game).as_posix()for prefix in [NAV,COMPAT]for p in(game/prefix).rglob('*')if p.is_file()}
        if missing or changed or actual!=set(expected):raise ValueError('Installed file inventory/hash differs')
        for name,identity in {**other_files,**saved}.items():
            if not Path(name).is_file()or digest(name)!=identity:raise ValueError('An unrelated file changed during installation: '+name)
        record=dict(id=new_id,name='Quest and Exploration Navigation - Fork (Development)',version=version,sourceFileName=archive.name,installedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),enabled=True,files=records)
        position=state['mods'].index(old[0])if old else len(state['mods']);state['mods']=[m for m in state['mods']if m not in old];state['mods'].insert(position,record)
        if old:
            previous=old[0]['id'];state['offForTest']=[new_id if v==previous else v for v in state.get('offForTest',[])]
        if [m for m in state['mods']if m['id']!=new_id]!=others:raise ValueError('Other Mod records changed')
        if digest(statefile)!=state_sha:raise ValueError('Concurrent manager state change')
        atomic(statefile,(json.dumps(state,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));state_written=True
        report.update(installed=True,modId=new_id,managerLibrary=str(library),installedFiles=len(expected),installedBytes=sum(r['size']for r in records),matched=len(expected),missing=[],changed=[],extraFiles=[],otherModRecordsUnchanged=True,otherFilesUnchanged=True,savesAndSettingsUnchanged=True,managerSHA256=digest(statefile),expectedSHA256=expected)
        (work/'receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');pointer=ROOT/'build/offline-navigation'/('installed-'+label+'-receipt-path.txt');pointer.parent.mkdir(parents=True,exist_ok=True);pointer.write_text(str(work/'receipt.json'),encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items()if k not in('expectedSHA256','savedBefore','otherFilesBefore')},ensure_ascii=True),flush=True)
    except BaseException:
        if state_written:atomic(statefile,original_state)
        for i,target in enumerate(reversed(placed)):
            if target.exists():same_volume_move(target,backup/f'failed-new-{i}',game,work)
        for saved_dir,target in reversed(moved):
            if saved_dir.exists():same_volume_move(saved_dir,target,work,game)
        if library.exists():same_volume_move(library,backup/'failed-library',manager,work)
        raise
if __name__=='__main__':main()
