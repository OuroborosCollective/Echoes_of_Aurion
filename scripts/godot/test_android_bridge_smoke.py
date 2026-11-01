import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bridge_smoke", Path(__file__).with_name("android-bridge-smoke.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class Reports(unittest.TestCase):
    def report(self):
        return dict(schemaVersion=1, layer="android-jni-bridge-smoke", mode="warm", guard="fixed", pid=100,
                    phase="callback_rejected", runtimeClass="JNISingleton", javaGetActivity=True, objectGetActivity=False,
                    activityPresent=True, intentDataPresent=False, callbacks=1, waiting=False, requestActive=False,
                    sessionPresent=False, worldConfirmed=False, loginEnabled=True, dispatchSequence=1, fullLogin="UNVERIFIED", physicalDevice="UNVERIFIED")

    def test_safe_report(self):
        self.assertEqual(smoke.validate_report(self.report())["callbacks"], 1)

    def test_unknown_secret_fields_are_never_reflected(self):
        value = self.report()
        value["token"] = "deliberately-secret-fixture"
        with self.assertRaises(RuntimeError) as error:
            smoke.validate_report(value)
        self.assertEqual(str(error.exception), "SMOKE_REPORT_INVALID")

    def test_synthetic_bridge_cannot_claim_a_session_or_device_success(self):
        for key, value in [("sessionPresent", True), ("worldConfirmed", True), ("requestActive", True), ("fullLogin", "PASS"), ("physicalDevice", "PASS")]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                smoke.validate_report({**self.report(), key: value})

    def test_missing_native_activity_is_explicitly_unknown(self):
        smoke.validate_report({**self.report(), "guard": "legacy", "activityPresent": False, "intentDataPresent": None, "phase": "waiting", "waiting": True, "callbacks": 0})

    def test_pre_dispatch_report_does_not_ack_duplicate(self):
        self.assertFalse(smoke.fresh_dispatch(self.report(), 2, 100))
        self.assertFalse(smoke.fresh_dispatch({**self.report(), "dispatchSequence": 2}, 2, 101))

    def test_fresh_native_intent_ack_matches_sequence_and_process(self):
        self.assertTrue(smoke.fresh_dispatch({**self.report(), "dispatchSequence": 2}, 2, 100))

    def test_timeout_preserves_the_last_validated_report_without_accepting_it(self):
        prior = dict(smoke.PROGRESS)
        try:
            smoke.PROGRESS.clear()
            report = self.report()
            with patch.object(smoke, "snapshot", return_value=report), \
                    patch.object(smoke.time, "monotonic", side_effect=[0, 1, 21]), patch.object(smoke.time, "sleep"):
                with self.assertRaisesRegex(RuntimeError, "^SMOKE_REPORT_TIMEOUT$"):
                    smoke.wait_report(lambda _value: False)
            self.assertEqual(smoke.PROGRESS.get("lastReport"), report)
        finally:
            smoke.PROGRESS.clear()
            smoke.PROGRESS.update(prior)

    def test_boot_diagnostics_preserve_cause_without_urls_or_secrets(self):
        value = "ERROR invalid GPU mode swiftshader\nERROR https://example.invalid/app/auth/callback?code=not-a-real-secret\nERROR token=not-a-real-token\nPANIC opaque " + "z"*50
        result = "\n".join(smoke.safe_boot_diagnostics(value))
        self.assertIn("invalid GPU mode swiftshader", result)
        for forbidden in ("https://", "callback?", "not-a-real-secret", "not-a-real-token", "z"*50):
            self.assertNotIn(forbidden, result)

    def test_browser_diagnostics_only_emit_fixed_labels_and_resource_ids(self):
        xml = '<hierarchy><node text="Use without an account" resource-id="com.android.chrome:id/signin_fre_dismiss_button"/><node text="secret-token-fixture" resource-id="com.android.chrome:id/secret-token-fixture"/><node text="https://example.invalid/callback?code=secret-code-fixture" resource-id="other:id/url_bar"/></hierarchy>'
        report = smoke.browser_diagnostics(xml, "com.android.chrome", "topResumedActivity com.android.chrome/firstrun.FirstRunActivity secret-cookie-fixture", False)
        self.assertEqual(report["knownLabels"], ["use without an account"])
        self.assertEqual(report["knownIds"], ["signin_fre_dismiss_button"])
        self.assertTrue(report["browserForeground"])
        self.assertTrue(report["firstRunActivity"])
        self.assertNotIn("secret", str(report))
        self.assertNotIn("https://", str(report))
        self.assertFalse(smoke.browser_diagnostics("invalid secret", "com.android.chrome", "", False)["uiParsed"])

    def test_browser_observer_does_not_launch_a_competing_first_run_intent(self):
        def device(*args, **kwargs):
            if args[:3] == ("shell", "am", "start"):
                self.fail("a second VIEW can replace the APK's pending first-run navigation")
            if args[:4] == ("shell", "pm", "list", "packages"):
                return "package:com.android.chrome"
            return "topResumedActivity com.android.chrome/Main"
        with patch.object(smoke, "adb", side_effect=device), patch.object(smoke.FixturePage, "hits", {"/legacy"}):
            smoke.open_browser("legacy")

    def test_progress_phases_clear_browser_states(self):
        # Browser observations from legacy must not be attributed to fixed.
        prior = dict(smoke.PROGRESS)
        try:
            smoke.PROGRESS.clear()
            smoke.PROGRESS.update({
                "stage": "legacy_callback",
                "browserPackage": "com.android.chrome",
                "browserStates": [{"firstRunActivity": True}],
                "legacyRedObserved": True,
                "lastReport": self.report(),
            })
            smoke.begin_guard("fixed")
            self.assertEqual(smoke.PROGRESS["stage"], "fixed_install")
            self.assertEqual(smoke.PROGRESS["browserStates"], [])
            self.assertNotIn("browserPackage", smoke.PROGRESS)
            self.assertNotIn("lastReport", smoke.PROGRESS)
            self.assertTrue(smoke.PROGRESS["legacyRedObserved"])
        finally:
            smoke.PROGRESS.clear()
            smoke.PROGRESS.update(prior)

    def test_other_variant_page_cannot_satisfy_browser_observation(self):
        def device(*args, **kwargs):
            if args[:4] == ("shell", "pm", "list", "packages"):
                return "package:com.android.chrome"
            if args[:4] == ("shell", "dumpsys", "activity", "activities"):
                return "topResumedActivity com.android.chrome/Main"
            return "<hierarchy/>"
        with patch.object(smoke, "adb", side_effect=device), patch.object(smoke.FixturePage, "hits", {"/legacy"}), \
                patch.object(smoke.time, "monotonic", side_effect=[0, 1, 50]), patch.object(smoke.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "^BROWSER_FIXTURE_UNOBSERVED$"):
                smoke.open_browser("fixed")


if __name__ == "__main__":
    unittest.main()
