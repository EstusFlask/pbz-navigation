"""Host-side capture integrity tests; no game process or input is touched."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from pbz_field_io import publish_json


def module(filename):
    spec = importlib.util.spec_from_file_location(filename, ROOT / 'tools' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


monitor = module('monitor-navigation.py')
markers = module('mark-navigation-case.py')


class FieldCapture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'ProjectPBZ/PBZModLoader').mkdir(parents=True)
        (self.root / 'ProjectPBZ/Saved').mkdir()
        self.log = self.root / 'ProjectPBZ/PBZModLoader/loader.log'
        self.ring = self.root / 'ProjectPBZ/Saved/PBZQuestRoute-log.txt'
        self.source = monitor.Sources(self.root, self.root)

    def test_append_and_split_utf8_record(self):
        text = '[PBZQuestRoute] 楼梯上行\n'.encode()
        self.log.write_bytes(text[:-3])
        self.assertEqual(self.source.read(), [])
        with self.log.open('ab') as out:
            out.write(text[-3:])
        rows = self.source.read()
        self.assertEqual([r['line'] for r in rows], ['[PBZQuestRoute] 楼梯上行'])
        self.assertEqual(self.source.read(), [])

    def test_ring_rewrite_keeps_new_entries_without_repeating_old(self):
        self.ring.write_text('one\ntwo\n', 'utf-8')
        self.assertEqual(len(self.source.read(initial=True)), 2)
        self.ring.write_text('two\nthree\n', 'utf-8')
        self.assertEqual([r['line'] for r in self.source.read()], ['three'])
        self.assertEqual(self.source.read(), [])

    def test_log_truncation_discards_old_partial_line(self):
        self.log.write_bytes(b'[PBZQuestRoute] old complete\n[PBZQuestRoute] incomplete')
        self.source.read()
        self.log.write_bytes(b'[PBZQuestRoute] new\n')
        rows = self.source.read()
        self.assertEqual(rows[0]['kind'], 'log-reset')
        self.assertEqual(rows[1]['line'], '[PBZQuestRoute] new')

    def test_tracker_heartbeat_does_not_hide_target_changes(self):
        path = self.root / 'PBZQuestRoute-tracker.json'
        def write(stamp, key):
            path.write_text(json.dumps({'writtenAt': stamp, 'target': {'key': key}}), 'utf-8')
        write(1, 'a')
        self.assertEqual(len(self.source.read()), 1)
        write(2, 'a')
        self.assertEqual(self.source.read(), [])
        write(3, 'b')
        self.assertEqual(self.source.read()[0]['value']['target']['key'], 'b')

    def test_background_press_and_held_press_are_not_markers(self):
        gate = markers.PressGate()
        self.assertFalse(gate.update(True, False, 0))
        self.assertFalse(gate.update(True, True, 1))
        gate.update(False, True, 2)
        self.assertTrue(gate.update(True, True, 3))
        self.assertFalse(gate.update(True, True, 4))
        gate.update(False, True, 4.1)
        self.assertFalse(gate.update(True, True, 4.5))
        gate.update(False, True, 5)
        self.assertTrue(gate.update(True, True, 6))

    def test_case_export_keeps_unicode_and_preceding_telemetry(self):
        (self.root / 'runtime-status.json').write_text(json.dumps({'说明': '楼梯'}), 'utf-8')
        (self.root / 'status.json').write_text('{}', 'utf-8')
        before = {'capturedAt': '2026-11-14T03:00:00.000+00:00', 'feet': [1, 2, 3]}
        (self.root / 'player.jsonl').write_text(json.dumps(before) + '\n', 'utf-8')
        (self.root / 'events.jsonl').write_text('', 'utf-8')
        row = markers.capture_case(self.root, '2026-11-14T03:00:01.123+00:00', ['gamepad-0-Y'], 123)
        case = self.root / row['case']
        value = json.loads((case / 'marker.json').read_text('utf-8'))
        self.assertEqual(value['runtime']['说明'], '楼梯')
        self.assertEqual(json.loads((case / 'player-before.jsonl').read_text('utf-8')), before)

    def test_busy_windows_status_reader_does_not_stop_capture(self):
        path = self.root / 'status.json'
        original = Path.replace
        attempts = []
        def busy_then_release(source, destination):
            attempts.append(1)
            if len(attempts) < 3:
                raise PermissionError('Windows reader denies rename')
            return original(source, destination)
        with patch.object(Path, 'replace', busy_then_release):
            self.assertTrue(publish_json(path, {'active': True}))
        self.assertEqual(json.loads(path.read_text('utf-8')), {'active': True})
        with patch.object(Path, 'replace', side_effect=PermissionError('still busy')):
            self.assertFalse(publish_json(path, {'active': False}))
        self.assertEqual(json.loads(path.read_text('utf-8')), {'active': True})


if __name__ == '__main__':
    unittest.main()
