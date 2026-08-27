# Aurion Audio Asset Ledger

**Runtime base:** `73542eabfe981135593676648d5a2717f3b2c0a8`  
**Candidate branch:** `feature/aurion-audio-system`  
**Protocol:** `aurion-audio.v1`  
**Status rule:** generated files remain `inactive` until release review and browser decode readback.

| Asset | Cue | Duration | Technical format | SHA-256 | Status |
| --- | --- | ---: | --- | --- | --- |
| `public/audio/ambient-tower.wav` | `ambient.tower` | 117.551020 s | PCM S16LE, 44.1 kHz, stereo | `82d7262d1f6231fc6bf79e0552aea4aca9c67a28cc1d57f2724649723b6460dc` | `inactive` |
| `public/audio/ambient-plains.wav` | `ambient.plains` | 114.494694 s | PCM S16LE, 44.1 kHz, stereo | `b8ca19ebcaf62b5e12484d0a0a0980cb8566b7f8256889e901d52228bd76318e` | `inactive` |
| `public/audio/ambient-forest.wav` | `ambient.forest` | 118.386939 s | PCM S16LE, 44.1 kHz, stereo | `946dd349748cea7b8a789ba7e4c8dc75b3cb0ce6cef11ee7e335e8117cf784e8` | `inactive` |
| `public/audio/ambient-cinder-vault.wav` | `ambient.cinder_vault` | 114.703673 s | PCM S16LE, 44.1 kHz, stereo | `3d05daeb328140bce232d2e2035eb3f62cf8b1d98e3c9e2628ef148b69ba062e` | `inactive` |

The four tracks total **465.136326 seconds**. A Wolfram calculation independently confirmed **78.24902334823608 MiB** of uncompressed stereo 16-bit PCM at 44.1 kHz for that aggregate duration. The runtime may use the tracks as optional ambient sources, while the deterministic Web Audio fallback remains available if fetch/decode/autoplay is unavailable.

The assets were generated as original, instrumental, loop-oriented material for Aurion zones. No external voice, artist, song title, or copied melodic reference is used. The repository copy is an additive candidate artifact; no production storage, CDN, database, or deployment was mutated.
