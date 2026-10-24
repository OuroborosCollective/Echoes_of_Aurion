"""Real emulator/JNI bridge smoke. No auth account, transaction, or production call."""
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ET

PACKAGE = "org.ouroboroscollective.aurion.godot.smoke"
SERIAL = "emulator-5554"
CALLBACK = "https://arelogic.space/app/auth/callback"  # no code, state, or verifier
FIELDS = {"schemaVersion", "layer", "mode", "guard", "pid", "phase", "runtimeClass",
          "javaGetActivity", "objectGetActivity", "activityPresent", "intentDataPresent",
          "callbacks", "waiting", "requestActive", "sessionPresent", "worldConfirmed",
          "loginEnabled", "fullLogin", "physicalDevice", "dispatchSequence"}
FAILURES = {"SMOKE_REPORT_INVALID", "JNI_RUNTIME_UNAVAILABLE", "JNI_METHOD_CONTRACT_CHANGED",
            "UNEXPECTED_AUTHORITY", "ADB_STEP_FAILED", "SMOKE_REPORT_TIMEOUT", "BROWSER_UNAVAILABLE",
            "BROWSER_FIXTURE_UNOBSERVED", "FOREIGN_ADB_TARGET", "APK_IDENTITY_MISMATCH",
            "LEGACY_GUARD_NOT_RED", "FIXED_WARM_FAILED", "DUPLICATE_CALLBACK_FORWARDED", "COLD_FLOW_UNSAFE"}
PROGRESS = {"stage": "initializing"}


def safe_boot_diagnostics(log):
    rows = []
    for line in log.splitlines():
        if not re.search(r"ERROR|PANIC|FATAL|failed|not enough|unsupported", line, re.I):
            continue
        if re.search(r"token|cookie|password|authorization|verifier|credential|\bbearer\b|(?:^|\s)(?:code|state)=", line, re.I):
            rows.append("[REDACTED_BOOT_LINE]")
            continue
        line = re.sub(r"https?://\S+", "[URL]", line)
        line = re.sub(r"[A-Za-z0-9_+/-]{32,}={0,2}", "[OPAQUE]", line)
        rows.append(line[:400])
    return rows[-30:]


def boot_emulator():
    output = Path(os.environ["AURION_SMOKE_OUTPUT"])
    deadline = time.monotonic() + 180
    completed = False
    while time.monotonic() < deadline:
        try:
            value = adb("shell", "getprop", "sys.boot_completed", tolerate=True, timeout=10)
        except subprocess.TimeoutExpired:
            value = ""
        if value == "1":
            completed = True
            break
        time.sleep(2)
    alive = False
    try:
        pid = int((Path(os.environ["RUNNER_TEMP"]) / "aurion-emulator.pid").read_text())
        os.kill(pid, 0)
        alive = True
    except (ValueError, OSError):
        pass
    host_log = Path(os.environ["RUNNER_TEMP"]) / "aurion-emulator.log"
    report = {"bootCompleted": completed, "hostProcessAlive": alive, "runtime": "UNVERIFIED",
              "diagnostics": safe_boot_diagnostics(host_log.read_text(errors="replace") if host_log.exists() else "")}
    (output / "emulator-boot-evidence.json").write_text(json.dumps(report, indent=2) + "\n")
    if not completed:
        print(json.dumps(report))
        raise RuntimeError("EMULATOR_BOOT_TIMEOUT") from None
    print("ANDROID_EMULATOR_BOOT_VERIFIED / BRIDGE_RUNTIME_PENDING")


def require(value, code):
    if not value:
        raise RuntimeError(code) from None


def validate_report(report):
    require(isinstance(report, dict) and set(report) == FIELDS, "SMOKE_REPORT_INVALID")
    require(report["schemaVersion"] == 1 and report["layer"] == "android-jni-bridge-smoke", "SMOKE_REPORT_INVALID")
    require(report["guard"] in ("legacy", "fixed") and report["mode"] in ("warm", "cold"), "SMOKE_REPORT_INVALID")
    require(report["phase"] in ("waiting", "other", "callback_rejected", "cold_login_required"), "SMOKE_REPORT_INVALID")
    require(report["runtimeClass"] == "JNISingleton", "JNI_RUNTIME_UNAVAILABLE")
    require(type(report["pid"]) is int and report["pid"] > 0, "SMOKE_REPORT_INVALID")
    require(type(report["callbacks"]) is int and 0 <= report["callbacks"] <= 2, "SMOKE_REPORT_INVALID")
    require(type(report["dispatchSequence"]) is int and 0 <= report["dispatchSequence"] <= 3, "SMOKE_REPORT_INVALID")
    for field in ("javaGetActivity", "objectGetActivity", "activityPresent", "waiting", "requestActive", "sessionPresent", "worldConfirmed", "loginEnabled"):
        require(type(report[field]) is bool, "SMOKE_REPORT_INVALID")
    require(type(report["intentDataPresent"]) is bool if report["activityPresent"] else report["intentDataPresent"] is None, "SMOKE_REPORT_INVALID")
    require(report["javaGetActivity"] and not report["objectGetActivity"], "JNI_METHOD_CONTRACT_CHANGED")
    require(not report["requestActive"] and not report["sessionPresent"] and not report["worldConfirmed"], "UNEXPECTED_AUTHORITY")
    require(report["fullLogin"] == report["physicalDevice"] == "UNVERIFIED", "SMOKE_REPORT_INVALID")
    return report


def fresh_dispatch(report, sequence, pid):
    return report["dispatchSequence"] == sequence and report["pid"] == pid


def adb(*args, timeout=15, tolerate=False, input=None):
    result = subprocess.run([os.environ.get("ADB", "adb"), "-s", SERIAL, *args], input=input,
                            text=True, capture_output=True, timeout=timeout)
    require(tolerate or result.returncode == 0, "ADB_STEP_FAILED")
    return result.stdout.strip()


def snapshot():
    raw = adb("exec-out", "run-as", PACKAGE, "cat", "files/bridge-smoke.json", tolerate=True)
    try:
        value = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return validate_report(value)


def wait_report(predicate, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        report = snapshot()
        if report is not None and predicate(report):
            return report
        time.sleep(0.25)
    raise RuntimeError("SMOKE_REPORT_TIMEOUT") from None


class FixturePage(http.server.BaseHTTPRequestHandler):
    hits = set()

    def do_GET(self):
        self.hits.add(self.path)
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b"<!doctype html><title>Aurion bridge fixture</title><p>Bridge smoke only. No login.</p>")

    def log_message(self, *_args):
        pass  # Never record browser URLs or headers.


def open_browser(guard):
    packages = adb("shell", "pm", "list", "packages")
    browser = next((p for p in ("com.android.chrome", "com.android.browser") if "package:" + p in packages), None)
    require(browser is not None, "BROWSER_UNAVAILABLE")
    PROGRESS["browserPackage"] = browser
    adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-p", browser,
        "-d", "http://127.0.0.1:8765/" + guard)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        foreground = adb("shell", "dumpsys", "activity", "activities")
        resumed = [s for s in foreground.splitlines() if "ResumedActivity" in s or "topResumedActivity" in s]
        if "/" + guard in FixturePage.hits and any(browser in line for line in resumed):
            return
        # Dismiss only the empty emulator browser's first-run UI, never a login
        # or a consent/authentication screen. No account is created or entered.
        adb("shell", "uiautomator", "dump", "/data/local/tmp/aurion-smoke-ui.xml", tolerate=True)
        xml = adb("exec-out", "cat", "/data/local/tmp/aurion-smoke-ui.xml", tolerate=True)
        try:
            nodes = ET.fromstring(xml).iter("node")
        except ET.ParseError:
            time.sleep(0.5)
            continue
        for node in nodes:
            if node.get("text", "").casefold() in {"accept & continue", "use without an account", "use without account", "no thanks", "skip", "more"}:
                bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
                if bounds:
                    x1, y1, x2, y2 = map(int, bounds.groups())
                    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                    break
        time.sleep(0.5)
    raise RuntimeError("BROWSER_FIXTURE_UNOBSERVED") from None


def dispatch(component, sequence):
    # Explicit OS delivery is intentional for a debug signer. It proves real
    # Activity/onNewIntent/JNI, not verified production-domain association.
    adb("shell", "am", "start", "-W", "--activity-clear-top", "--activity-single-top",
        "-n", component, "-a", "android.intent.action.VIEW", "-d", CALLBACK,
        "--ei", "aurion_smoke_dispatch", str(sequence))


def run(output):
    require(adb("get-serialno") == SERIAL, "FOREIGN_ADB_TARGET")
    require(adb("shell", "getprop", "ro.kernel.qemu") == "1", "FOREIGN_ADB_TARGET")
    require(adb("shell", "getprop", "ro.product.cpu.abi") == "x86_64", "FOREIGN_ADB_TARGET")
    adb("reverse", "tcp:8765", "tcp:8765")
    evidence = {"schemaVersion": 1, "layer": "android-jni-bridge-smoke", "productionAppLinkVerified": False,
                "syntheticExplicitIntent": True, "fullLogin": "UNVERIFIED", "physicalDevice": "UNVERIFIED",
                "androidFingerprint": adb("shell", "getprop", "ro.build.fingerprint"), "cases": {}}
    for guard in ("legacy", "fixed"):
        PROGRESS["stage"] = guard + "_install"
        build = json.loads((output / (guard + "-build.json")).read_text())
        require(build["guard"] == guard and build["sourceRevision"] == os.environ["AURION_EXPECTED_REVISION"], "APK_IDENTITY_MISMATCH")
        require(build["internetPermission"] is False and build["productionDomainFilter"] is False and build["configuredOrigin"] == "loopback-only", "APK_IDENTITY_MISMATCH")
        apk = output / (guard + ".apk")
        require(hashlib.file_digest(apk.open("rb"), "sha256").hexdigest() == build["apkSha256"], "APK_IDENTITY_MISMATCH")
        adb("uninstall", PACKAGE, tolerate=True)
        adb("install", str(apk), timeout=90)
        path = adb("shell", "pm", "path", PACKAGE).removeprefix("package:")
        require(re.fullmatch(r"/data/app/[A-Za-z0-9_./=+~\-]+/base\.apk", path), "APK_IDENTITY_MISMATCH")
        require(adb("shell", "sha256sum", path).split()[0] == build["apkSha256"], "APK_IDENTITY_MISMATCH")
        component = PACKAGE + "/" + build["launcher"]
        adb("shell", "am", "start", "-W", "-n", component)
        before = wait_report(lambda r: r["guard"] == guard and r["phase"] == "waiting")
        PROGRESS["stage"] = guard + "_browser"
        open_browser(guard)
        PROGRESS["stage"] = guard + "_callback"
        dispatch(component, 1)
        if guard == "legacy":
            time.sleep(5)
            after = snapshot()
            require(after is not None and after["pid"] == before["pid"] and after["waiting"] and after["callbacks"] == 0 and not after["activityPresent"], "LEGACY_GUARD_NOT_RED")
            evidence["cases"]["legacy"] = {"expectedFailure": "JNI_ACTIVITY_UNAVAILABLE", "observed": after}
            PROGRESS["legacyRedObserved"] = True
            (output / "runtime-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        else:
            after = wait_report(lambda r: r["phase"] == "callback_rejected" and fresh_dispatch(r, 1, before["pid"]))
            require(after["pid"] == before["pid"] and after["callbacks"] == 1 and not after["waiting"] and after["activityPresent"] and not after["intentDataPresent"], "FIXED_WARM_FAILED")
            evidence["cases"]["fixedWarm"] = after
            (output / "runtime-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
            # After terminal rejection Main stops polling; another OS Intent
            # must not recreate authority or forward a second callback.
            dispatch(component, 2)
            duplicate = wait_report(lambda r: fresh_dispatch(r, 2, before["pid"]))
            require(duplicate is not None and duplicate["pid"] == before["pid"] and duplicate["callbacks"] == 1 and not duplicate["waiting"], "DUPLICATE_CALLBACK_FORWARDED")
            evidence["cases"]["fixedDuplicate"] = duplicate
            PROGRESS["stage"] = "fixed_cold_start"
            adb("shell", "run-as", PACKAGE, "tee", "files/smoke-mode", input="cold\n")
            adb("shell", "am", "force-stop", PACKAGE)
            dispatch(component, 3)
            cold = wait_report(lambda r: r["phase"] == "cold_login_required" and r["dispatchSequence"] == 3 and r["pid"] != before["pid"])
            require(cold["activityPresent"] and cold["loginEnabled"] and not cold["intentDataPresent"] and not cold["waiting"] and cold["callbacks"] == 0, "COLD_FLOW_UNSAFE")
            evidence["cases"]["fixedCold"] = cold
    return evidence


if __name__ == "__main__":
    if sys.argv[1:] == ["--boot"]:
        try:
            boot_emulator()
        except BaseException:
            print("EMULATOR_BOOT_FAILED / INSPECT_REDACTED_BOOT_EVIDENCE")
            raise SystemExit(1) from None
        raise SystemExit(0)
    require(not sys.argv[1:], "SMOKE_REPORT_INVALID")
    output = Path(os.environ["AURION_SMOKE_OUTPUT"])
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), FixturePage)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        evidence = run(output)
        (output / "runtime-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print("ANDROID_JNI_BRIDGE_SMOKE_VERIFIED / FULL_LOGIN_UNVERIFIED")
    except BaseException as error:
        # Raw subprocess/HTTP exceptions may contain URLs or process arguments.
        # Only a fixed public failure marker crosses the CI log boundary.
        code = str(error) if isinstance(error, RuntimeError) and str(error) in FAILURES else "SMOKE_INTERNAL_FAILURE"
        (output / "failure-evidence.json").write_text(json.dumps({"code": code, **PROGRESS}) + "\n")
        print("ANDROID_JNI_BRIDGE_SMOKE_FAILED / " + code)
        raise SystemExit(1) from None
    finally:
        server.shutdown()
