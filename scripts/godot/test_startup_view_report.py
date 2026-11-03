"""Synthetic negative controls only; these tests never constitute live evidence."""
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
from startup_view_report import build_report, ENGINE_LOCK
from test_live_view_parity import colored_world


class StartupReportControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.now = datetime.now(timezone.utc)
        stamp = self.now.isoformat().replace('+00:00', 'Z')
        self.nonce, self.revision = 'a' * 32, 'b' * 40
        runtime = {'status':'ok', 'revision':self.revision, 'runtimeImageDigest':'sha256:' + 'c' * 64}
        self.index = {'schema':'aurion.startup-capture-index.v1', 'status':'CAPTURED', 'nonce':self.nonce, 'sourceRevision':self.revision,
                      'targetTick':42, 'minimumTick':40, 'identities':{'distinct':True,'subjectsAtSamePosition':True}, 'runtime':runtime, 'runtimeAfter':dict(runtime), 'files':{}, 'editorGameParentPid':100,
                      'editorVersion':ENGINE_LOCK['version'],'editorBinary':{'version':ENGINE_LOCK['version'],'archiveSha256':ENGINE_LOCK['sha256'],'binarySha256':'8'*64},
                      'editor':{'nonce':self.nonce,'pid':100,'editor':True,'scene':'res://addons/aurion_bridge/authoring_entry.tscn'},
                      'receipt':{'tick':42,'worldId':'echoes-of-aurion-global','zoneId':'observatory_threshold','sourceRevision':self.revision,'receiptHash':'d'*64,'postStateHash':'e'*64},
                      'oracle':{'status':'MATCH','zoneId':'observatory_threshold','sourceRevision':self.revision,'requestedRange':{'fromTick':42,'toTick':42},'terminalReceiptHash':'d'*64,'finalStateHash':'e'*64}}
        self.observations = {}
        for name, source in [('aurion','aurion-web'), ('godot','godot-live-editor')]:
            self.observations[name] = {'schema':'aurion.startup-view.observation.v1','source':source,'nonce':self.nonce,'minimumTick':40,'captureIndex':1,
                'startedAtUtc':stamp,'capturedAtUtc':stamp,'connected':True,'viewportPx':[640,360],
                'worldId':'echoes-of-aurion-global',
                'worldVisible':True,
                'snapshot':{'tick':42,'zoneId':'observatory_threshold','projectionDigest':'f'*64,'presenceCount':1,'mobCount':0},
                'camera':{'positionMm':[0,5000,10000],'targetMm':[0,1600,0],'fovMilliDeg':58000},
                'chunks':{'status':'APPLIED','count':9,'desiredCount':9,'pendingCount':0,'failedCount':0},
                'player':{'visible':True,'renderedHeightMeters':1.8,'boneCount':30},
                'npcs':{'visible':True,'renderedHeightMeters':1.8,'boneCount':30},
                'assets':{'rendered':2,'loading':0,'failed':0}}
            colored_world(self.directory / (name + '.png'))
        self.observations['godot'].update({'pid':101,'worldVisible':True,'stale':False,'environmentPresent':True,'chunks':[{'worldId':'echoes-of-aurion-global'}],
            'actors':[{'entityId':'player:1','assetId':'glb_actual'}], 'actorCache':{'pending':0},'worldAssets':{'rendered':2,'pending':0}})

    def run_report(self):
        for name, data in self.observations.items():
            (self.directory / (name + '-observation.json')).write_text(json.dumps(data))
        self.index['files'] = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.directory.iterdir() if p.name in ('aurion.png','godot.png','aurion-observation.json','godot-observation.json')}
        (self.directory / 'capture-index.json').write_text(json.dumps(self.index))
        return build_report(self.directory, self.now)

    def test_matching_synthetic_control_and_original_images(self):
        report = self.run_report()
        self.assertEqual(report['status'], 'PASS', report['issues'])
        self.assertEqual(report['visual']['differencePercent'], 0)
        self.assertTrue((self.directory / 'difference.png').is_file())
        self.assertTrue((self.directory / 'report.html').is_file())

    def test_real_threshold_is_enforced_in_final_status(self):
        colored_world(self.directory / 'godot.png', alternate=True)
        report = self.run_report()
        self.assertGreater(report['visual']['differencePercent'], 75)
        self.assertIn('REAL_VIEW_VISUAL_MISMATCH', report['issues'])
        self.assertIn('Mehr als 75%', ' '.join(report['diagnosis']))

    def test_exactly_75_percent_passes_but_one_more_pixel_fails_report(self):
        with Image.open(self.directory / 'godot.png') as source:
            image = source.convert('RGB')
        image.paste((255,255,255), (0,0,480,360))
        image.save(self.directory / 'godot.png')
        report = self.run_report()
        self.assertEqual(report['visual']['differencePercent'], 75)
        self.assertEqual(report['status'], 'PASS', report['issues'])
        image.putpixel((480,0), (255,255,255))
        image.save(self.directory / 'godot.png')
        self.assertIn('REAL_VIEW_VISUAL_MISMATCH', self.run_report()['issues'])

    def test_empty_cameras_cannot_match_as_valid_readback(self):
        for value in self.observations.values(): value['camera'] = {}
        self.assertIn('CAMERA_READBACK_MISSING', self.run_report()['issues'])

    def test_missing_frames_do_not_invent_environment_diagnosis(self):
        self.index['status'] = 'FAIL'
        self.index['issues'] = ['AUTHENTICATED_BROWSER_NOT_CONFIGURED']
        self.observations = {}
        report = self.run_report()
        self.assertIn('AUTHENTICATED_BROWSER_NOT_CONFIGURED', report['issues'])
        self.assertNotIn('GODOT_ENVIRONMENT_MISSING', report['issues'])

    def test_absent_health_does_not_invent_a_revision_difference(self):
        self.index.pop('runtime')
        self.index.pop('runtimeAfter')
        report = self.run_report()
        self.assertIn('LIVE_RUNTIME_IDENTITY_UNVERIFIED', report['issues'])
        self.assertNotIn('LIVE_REVISION_MISMATCH', report['issues'])

    def test_loading_screen_is_not_a_visible_game_view(self):
        self.observations['aurion']['worldVisible'] = False
        self.assertIn('BROWSER_WORLD_OBSCURED_BY_LOADING_SCREEN', self.run_report()['issues'])

    def test_partial_terrain_is_not_complete_even_after_one_applied_result(self):
        for update in [{'count':1,'pendingCount':8}, {'failedCount':1}, {'desiredCount':None}]:
            with self.subTest(update=update):
                old = dict(self.observations['aurion']['chunks'])
                self.observations['aurion']['chunks'].update(update)
                self.assertIn('BROWSER_TERRAIN_INCOMPLETE',self.run_report()['issues'])
                self.observations['aurion']['chunks'] = old

    def test_missing_unloaded_or_hidden_browser_actor_fails(self):
        for field in ['player','npcs']:
            for value in [None, {}, {'visible':False,'renderedHeightMeters':1.8}, {'visible':True,'renderedHeightMeters':0}]:
                with self.subTest(field=field,value=value):
                    old = self.observations['aurion'][field]
                    self.observations['aurion'][field] = value
                    self.assertIn('BROWSER_ACTOR_MODELS_MISSING',self.run_report()['issues'])
                    self.observations['aurion'][field] = old

    def test_separate_camera_asset_terrain_and_environment_diagnoses(self):
        native = self.observations['godot']
        native['camera']['fovMilliDeg'] = 75000
        native.update(chunks=[], actors=[], environmentPresent=False)
        native['actorCache']['pending'] = 1
        report = self.run_report()
        for code in ['CAMERA_PROJECTION_MISMATCH','GODOT_TERRAIN_MISSING','GODOT_ACTOR_MODELS_MISSING','GODOT_ENVIRONMENT_MISSING','ASSETS_LOADING_OR_FAILED']:
            self.assertIn(code, report['issues'])
        self.assertEqual(report['visual']['differencePercent'], 0)  # Identical empty/wrong state is never enough.

    def test_new_tick_second_capture_or_foreign_nonce_cannot_pass(self):
        for mutation in [{'captureIndex':2}, {'nonce':'f'*32}, {'connected':False}]:
            with self.subTest(mutation=mutation):
                old = dict(self.observations['godot'])
                self.observations['godot'].update(mutation)
                self.assertEqual(self.run_report()['status'], 'FAIL')
                self.observations['godot'] = old
        self.observations['godot']['snapshot']['tick'] = 43
        self.assertIn('CAPTURE_TICK_MISMATCH', self.run_report()['issues'])

    def test_receipt_and_oracle_must_be_the_actual_captured_tick(self):
        self.index['oracle']['requestedRange']['fromTick'] = 41
        self.assertIn('CANONICAL_RECEIPT_UNVERIFIED', self.run_report()['issues'])

    def test_captured_tick_must_follow_the_same_bound_in_both_clients(self):
        self.observations['godot']['minimumTick'] = 39
        self.assertIn('CAPTURE_TICK_MISMATCH',self.run_report()['issues'])
        self.observations['godot']['minimumTick'] = 40
        self.index['minimumTick'] = 43
        self.assertIn('CAPTURE_TICK_MISMATCH',self.run_report()['issues'])

    def test_unverified_accounts_subject_position_or_editor_digest_cannot_pass(self):
        self.index['identities']['distinct'] = False
        self.assertIn('CAPTURE_IDENTITIES_UNVERIFIED',self.run_report()['issues'])
        self.index['identities'] = {'distinct':True,'subjectsAtSamePosition':False}
        self.assertIn('CAPTURE_SUBJECT_POSITION_MISMATCH',self.run_report()['issues'])
        self.index['editorBinary']['binarySha256'] = 'bad'
        self.assertIn('GODOT_EXECUTABLE_UNVERIFIED',self.run_report()['issues'])

    def test_different_canonical_projection_digest_fails(self):
        self.observations['godot']['snapshot']['projectionDigest'] = '9'*64
        self.assertIn('CANONICAL_SNAPSHOT_MISMATCH', self.run_report()['issues'])

    def test_tampered_png_and_missing_capture_still_produce_report(self):
        self.run_report()
        colored_world(self.directory / 'godot.png', alternate=True)
        self.assertIn('GODOT_IMAGE_HASH_MISMATCH', build_report(self.directory, self.now)['issues'])
        (self.directory / 'capture-index.json').unlink()
        report = build_report(self.directory, self.now)
        self.assertEqual(report['status'], 'FAIL')
        self.assertIn('LIVE_CAPTURE_INCOMPLETE', report['issues'])

    def test_malformed_metadata_remains_red_without_crashing(self):
        for value in [None, [], {}, 0, 'invalid']:
            with self.subTest(value=value):
                self.observations['godot']['capturedAtUtc'] = value
                self.observations['godot']['camera'] = value
                self.observations['godot']['snapshot'] = value
                self.assertEqual(self.run_report()['status'], 'FAIL')

    def test_revision_and_runtime_restart_during_capture_fail(self):
        self.index['runtimeAfter']['runtimeImageDigest'] = 'sha256:' + '9'*64
        self.assertIn('LIVE_IMAGE_MISMATCH', self.run_report()['issues'])


if __name__ == '__main__':
    unittest.main()
