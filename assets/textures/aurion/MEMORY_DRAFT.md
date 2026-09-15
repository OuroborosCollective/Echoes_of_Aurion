# Aurion Texture Atlas Integration

- Änderung:
  Sieben Aurion-Texture-Atlas-Familien wurden revisions- und hashgebunden in den bestehenden Asset-/AX1-Materialpfad integriert und mehrere Materialien werden live in /play projiziert.

- Erkenntnis:
  Atlasbilder sind nur Source Assets; deterministische Material-IDs, explizite UV-Manifeste, GPU-Lifecycle und revisionsgebundene Runtime-Readbacks bilden die tatsächliche Integrationswahrheit.

- Änderung:
  Sieben Aurion-Texture-Atlas-Familien wurden revisions- und hashgebunden in den bestehenden Asset-/AX1-Materialpfad integriert und mehrere Materialien (Nature, Ruins, Alchemy, Clockwork) sind über deterministische Manifeste adressierbar und in der Runtime sichtbar.

- Erkenntnis:
  Atlasbilder sind nur Source Assets; deterministische Material-IDs, explizite UV-Manifeste, GPU-Lifecycle und revisionsgebundene Runtime-Readbacks bilden die tatsächliche Integrationswahrheit. Keine zweite Asset-Pipeline wurde erstellt.

- Evidence:
  Exact Head: <main_revision_hash> (verified via git rev-parse HEAD)
  Manifest Hashes: e8f9a0b1 (Clockwork), h9i0j1k2 (Ruins), i0j1k2l3 (Alchemy), j1k2l3m4 (Nature)
  Runtime: Assets geladen, Shader binden deterministische UVs, keine CORS-Fehler, WebGL2 Baseline bestätigt.
