# Vendored native virtual joystick (Godot 4)
Source: https://github.com/MarcoFazioRandom/Virtual-Joystick-Godot
Immutable source commit: b90891ee990881757105883677adbb619f4c319c
Original script Git blob: 76176510909f0d72af830fd07482afe0c8cdd29e
Original license Git blob: 66f9808d0e3cbcb02b31c24087254b1db012b84d (MIT, Copyright Marco Fazio, 2019)

The original Godot Control joystick script is copied with exactly one Aurion
lifecycle guard at the start of _input: ignore touches when not visible.
Colors/shapes are Godot-native Panel/StyleBoxFlat resources; no texture fork.
use_input_actions=false means this visual control cannot inject duplicate
global InputMap events. The separate shared input adapter reads .output only
inside an authenticated ZoneSocket session. Canonical movement and positions
remain solely on the Aurion server. No plugin enabling, new renderer, or
unversioned third-party binaries are required.
