"""Import local development reports read-only from the game's Saved directory."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import sys
from survey_analysis import summarize, markdown
sys.stdout.reconfigure(encoding='utf-8')

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--saved',type=Path,default=Path(os.environ.get('LOCALAPPDATA','.'))/'ProjectPBZ/Saved')
parser.add_argument('--output',type=Path,default=ROOT/'build/development-cases')
parser.add_argument('--limit',type=int,default=20)
args=parser.parse_args()
output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
cases=[];errors=[]
for source in sorted(args.saved.glob('PBZQuestRoute-dev-*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:max(1,min(args.limit,100))]:
    try:
        if source.stat().st_size>8*1024*1024:raise ValueError('report size limit')
        raw=source.read_bytes();data=json.loads(raw)
        if data.get('schema')!=1 or not data.get('caseId'):raise ValueError('unsupported report schema')
        target=(output/source.name).resolve();assert target.is_relative_to(output)
        target.write_bytes(raw)
        state=data.get('snapshot',{});legs=state.get('trip',{}).get('legs',[])
        cases.append(dict(case=data['caseId'],build=data.get('build'),at=data.get('at'),world=state.get('world'),
            sourceEncoding='utf-16-bom' if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else 'json-autodetected',
            target=state.get('target'),targetKey=state.get('targetKey'),requestedReverse=state.get('settings',{}).get('ReverseSearch'),
            solvers=[dict(provider=l.get('provider'),direction=l.get('searchDirection'),partial=l.get('partial'),diagnostic=l.get('diagnostic')) for l in legs],
            afterComplete=data.get('after',{}).get('complete'),markerKind=data.get('markerKind','navigation-issue'),surveyAttempt=data.get('surveyAttempt'),
            status='personal wrong-turn observation; review before excluding' if data.get('markerKind')=='player-mistake' else 'unreviewed navigation marker',
            file=str(target),sha256=hashlib.sha256(raw).hexdigest()))
    except (OSError,ValueError,AssertionError) as error:errors.append(dict(file=str(source),error=str(error)))
surveys=[]
for source in sorted(args.saved.glob('PBZQuestRoute-survey-*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:max(1,min(args.limit,100))]:
    try:
        raw=source.read_bytes()
        if len(raw)>8*1024*1024:raise ValueError('survey manifest size limit')
        data=json.loads(raw)
        if data.get('schema')!=1 or data.get('kind')!='survey':raise ValueError('unsupported survey manifest')
        attempt=data['attemptId']
        if not re.fullmatch(r'[0-9TZ]+-\d{3}',attempt):raise ValueError('invalid survey identity')
        if source.name!=f'PBZQuestRoute-survey-{attempt}.json':raise ValueError('manifest identity mismatch')
        if len(data.get('chunks',[]))>240:raise ValueError('survey chunk count limit')
        chunks=[];hashes=[];expected_index=1
        for ref in data.get('chunks',[]):
            name=ref['file']
            if ref['index']!=expected_index or name!=f'PBZQuestRoute-surveydata-{attempt}-{expected_index:03}.json':raise ValueError('invalid chunk reference')
            expected_index+=1
            try:
                chunk_source=args.saved/name
                if chunk_source.stat().st_size>8*1024*1024:raise ValueError('chunk size limit')
                chunk_raw=chunk_source.read_bytes();chunk=json.loads(chunk_raw)
                if chunk.get('schema')!=1 or chunk.get('kind')!='survey-chunk' or chunk.get('attemptId')!=attempt or chunk.get('index')!=ref['index']:raise ValueError('chunk identity mismatch')
                (output/name).write_bytes(chunk_raw);chunks.append(chunk)
                hashes.append(dict(file=name,sha256=hashlib.sha256(chunk_raw).hexdigest()))
            except (OSError,ValueError) as error:errors.append(dict(file=name,error=str(error)))
        target=output/source.name;target.write_bytes(raw)
        summary=summarize(data,chunks);summary.update(file=str(target),sha256=hashlib.sha256(raw).hexdigest(),chunkHashes=hashes)
        (output/(source.stem+'-analysis.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        surveys.append(summary)
    except (OSError,ValueError,KeyError,TypeError) as error:errors.append(dict(file=str(source),error=str(error)))
(output/'index.json').write_text(json.dumps(dict(cases=cases,surveys=surveys,errors=errors),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(output/'SURVEY-REPORT.md').write_text(markdown(surveys),encoding='utf-8')
print(json.dumps(dict(imported=len(cases),importedSurveys=len(surveys),surveyReport=str(output/'SURVEY-REPORT.md'),cases=cases,
    surveys=[dict(attempt=s['attempt'],task=s['task']['id'],status=s['status'],dataComplete=s['dataComplete'],samples=s['samples']) for s in surveys],errors=errors),ensure_ascii=False))
