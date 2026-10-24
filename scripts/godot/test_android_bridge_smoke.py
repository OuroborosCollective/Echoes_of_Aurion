import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("bridge_smoke", Path(__file__).with_name("android-bridge-smoke.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class Reports(unittest.TestCase):
    def report(self):
        return dict(schemaVersion=1, layer="android-jni-bridge-smoke", mode="warm", guard="fixed", pid=100,
                    phase="callback_rejected", runtimeClass="JNISingleton", javaGetActivity=True, objectGetActivity=False,
                    activityPresent=True, intentDataPresent=False, callbacks=1, waiting=False, requestActive=False,
                    sessionPresent=False, worldConfirmed=False, loginEnabled=True, fullLogin="UNVERIFIED", physicalDevice="UNVERIFIED")

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


if __name__ == "__main__":
    unittest.main()
