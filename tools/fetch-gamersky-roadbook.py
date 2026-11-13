"""Read the public roadbook/map endpoints used by GamerSky's map frontend.

Developer resource cache only; downloaded content is not distributed by the mod.
No login, cookies, user-specific collections or paid endpoints are requested.
"""
from pathlib import Path
import argparse
import json
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'build/gamersky')
parser.add_argument('--maps', type=int, nargs='+', default=list(range(251, 259)))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)


def fetch(url, name, payload=None):
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(url, data=data, headers={
        'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json',
        'Referer': 'https://www.gamersky.com/tools/guide-map/roadbooks/53'})
    with urllib.request.urlopen(request, timeout=45) as response:
        content = response.read()
    value = json.loads(content)
    (args.output / name).write_bytes(content)
    return value


book = fetch('https://renderer.gamersky.com/guideMap/web/public/roadbooks/id/53', 'roadbook-53.api.json')
assert book['data']['id'] == 53 and book['data']['flows']
print('roadbook', book['data']['id'], len(book['data']['flows']), 'flows')
for map_id in args.maps:
    for endpoint, payload in [
        ('map/getMap', {'gameMapId': map_id}),
        ('landmark/getLandmarkList', {'gameMapId': map_id, 'keyword': None,
                                    'catalogIdsSelected': [], 'userId': 0}),
    ]:
        name = 'map-' + str(map_id) + '-' + endpoint.split('/')[-1] + '.json'
        fetch('https://mapapi.gamersky.com/' + endpoint, name, payload)
        print('saved', name)
