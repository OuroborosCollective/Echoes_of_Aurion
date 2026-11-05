"""Bounded operator helper. No credential, callback or clipboard value is returned.

Run only for the owner's requested login, after the optional page is verified.
This uses the already-authorized local Godot MCP probe and unchanged native flow.
"""
import asyncio
import argparse
import json
import time
from fastmcp import Client

ROOT = "get_tree().current_scene"
CALLBACK = "https://arelogic.space/app/auth/callback?"
last_phase = None

def report(phase):
    global last_phase
    if last_phase != phase:
        print(json.dumps({"phase": phase}), flush=True)
        last_phase = phase

async def run(expected_pid, start_new_attempt=False):
    async with Client("http://127.0.0.1:39090/mcp") as client:
        async def evaluate(expression):
            result = await asyncio.wait_for(
                client.call_tool("godot_debugger_evaluate_expression", {"expression": expression}),
                timeout=10,
            )
            value = result.structured_content
            if not isinstance(value, dict) or not value.get("evaluated") or value.get("error"):
                raise RuntimeError("GODOT_PROBE_REJECTED")
            return value.get("value")

        if await evaluate("OS.get_process_id()") != expected_pid:
            report("wrong_process")
            return
        scene = await evaluate(f"{ROOT}.get_script().resource_path")
        if scene != "res://addons/aurion_bridge/authoring_entry.gd":
            report("wrong_scene")
            return
        scene_id = await evaluate(f"{ROOT}.get_instance_id()")
        if type(scene_id) is not int or scene_id <= 0:
            raise RuntimeError("INVALID_SCENE_ID")
        raw_evaluate = evaluate
        async def scoped_evaluate(expression):
            guarded = (
                f"({expression}) if is_instance_valid({ROOT}) and "
                f"{ROOT}.get_instance_id() == {scene_id} and "
                f"OS.get_process_id() == {expected_pid} else \"WRONG_SESSION\""
            )
            result = await raw_evaluate(guarded)
            if result == "WRONG_SESSION":
                raise RuntimeError("SESSION_CHANGED")
            return result
        evaluate = scoped_evaluate
        state_expr = (f"[{ROOT}._auth.callback_pending(), {ROOT}._auth.protected_response_allowed(), "
                      f"{ROOT}._auth.request_in_flight(), "
                      f"DisplayServer.clipboard_get().begins_with(\"{CALLBACK}\"), "
                      f"{ROOT}._auth._flow._started_at_ms, {ROOT}._auth._request_epoch]")
        state = await evaluate(state_expr)
        if state[1]:
            report("already_authenticated")
            return
        if state[2]:
            report("existing_request_in_flight")
            return
        if not state[0]:
            if not start_new_attempt:
                report("explicit_start_required")
                return
            started = await evaluate(
                f"{ROOT}._retry_login() if not {ROOT}._auth.callback_pending() and "
                f"not {ROOT}._auth.request_in_flight() and not "
                f"{ROOT}._auth.protected_response_allowed() else false"
            )
            if started is False:
                report("session_changed_before_start")
                return
        report("waiting_for_browser_confirmation")
        deadline = time.monotonic() + 600
        issued = False
        submitted = False
        submitted_at = None
        binding = tuple(state[4:6]) if state[0] else None
        expected_epoch = binding[1] if binding else None
        start_deadline = time.monotonic() + 20
        try:
            while time.monotonic() < deadline:
                state = await evaluate(state_expr)
                pending, authenticated, busy, has_callback = state[:4]
                if expected_epoch is not None and state[5] != expected_epoch:
                    report("transaction_changed")
                    return
                if authenticated:
                    report("native_session_confirmed" if submitted else "session_changed")
                    return
                if pending and binding is None:
                    binding = tuple(state[4:6])
                    expected_epoch = binding[1]
                if not submitted and binding is not None and tuple(state[4:6]) != binding:
                    report("transaction_changed")
                    return
                if binding is None and time.monotonic() >= start_deadline:
                    report("native_start_not_confirmed")
                    return
                if submitted:
                    if not busy and (not pending or time.monotonic() - submitted_at > 20):
                        report("native_session_not_confirmed")
                        return
                elif pending and has_callback:
                    expression = (
                        f"[{ROOT}._callback.set_text(DisplayServer.clipboard_get()), "
                        f"{ROOT}._complete(), DisplayServer.clipboard_set(\"\"), {ROOT}._auth._request_epoch] "
                        f"if {ROOT}._auth.callback_pending() and "
                        f"{ROOT}._auth._flow._started_at_ms == {binding[0]} and "
                        f"{ROOT}._auth._request_epoch == {binding[1]} and "
                        f"DisplayServer.clipboard_get().begins_with(\"{CALLBACK}\") "
                        f"and DisplayServer.clipboard_get().length() <= 2048 else false"
                    )
                    attempted = await evaluate(expression)
                    if attempted is False:
                        report("callback_not_admitted")
                        return
                    submitted = True
                    expected_epoch = attempted[3]
                    submitted_at = time.monotonic()
                    report("callback_delivered_to_native_client")
                elif pending:
                    issued = True
                    # Re-announce for a newly connected viewer, without overwriting
                    # an arriving return URL. The branch is evaluated in one frame.
                    await evaluate(
                        f"DisplayServer.clipboard_set({ROOT}._login_url) if "
                        f"{ROOT}._auth.callback_pending() and not "
                        f"DisplayServer.clipboard_get().begins_with(\"{CALLBACK}\") and "
                        f"{ROOT}._auth._flow._started_at_ms == {binding[0]} and "
                        f"{ROOT}._auth._request_epoch == {binding[1]} else false"
                    )
                elif issued and not busy:
                    report("transaction_ended_without_session")
                    return
                await asyncio.sleep(2)
            report("transaction_deadline_reached")
        finally:
            # Clear only this workflow's current native-auth clipboard values.
            if expected_epoch is not None:
                await evaluate(
                    f'DisplayServer.clipboard_set("") if {ROOT}._auth._request_epoch == {expected_epoch} and ('
                    f'DisplayServer.clipboard_get().begins_with("{CALLBACK}") or '
                    'DisplayServer.clipboard_get().begins_with("https://arelogic.space/api/native-auth/browser/")) '
                    'else false'
                )

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-pid', type=int, required=True)
    parser.add_argument('--start-new-attempt', action='store_true')
    args = parser.parse_args()
    if args.expected_pid <= 0:
        parser.error('expected PID must be positive')
    try:
        asyncio.run(asyncio.wait_for(run(args.expected_pid, args.start_new_attempt), timeout=620))
    except Exception:
        # Exceptions from connectors may contain request context. Never print them.
        report("helper_failed_no_secret_details")
        raise SystemExit(1)
