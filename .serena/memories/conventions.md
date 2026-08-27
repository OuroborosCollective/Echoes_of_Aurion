# Code conventions
- Prefer additive, typed contracts in `shared/`; stable literal unions and readonly fields for canonical data.
- Deterministic logic must avoid `Math.random()`, wall-clock identity, UUIDs, unsorted traversal, and external response timing.
- React is the frame; Babylon scene code remains lifecycle-safe and disposes listeners/resources on teardown.
- Client events may request/display; they never authorize gameplay mutations or rewards.
- Audio is presentation-only. Route cues through `AudioEvent` and `AurionSoundscape`; optional assets must degrade to synth fallback and never break gameplay.
- Keep tests beside the relevant client/shared module and use explicit negative/replay cases.