# Evidence-Bound CSS v0.4.0 — Family-Disjoint Benchmark

Diese Seite dokumentiert den veröffentlichten Stand des CSS-Lernkorpus und Benchmark-Layers auf Hugging Face.

## Release-Status

Dataset: `ouroboroscollective/evidence-bound-css`

Release: `0.4.0`

Der kanonische Wissensbestand umfasst weiterhin **601 eindeutige Inhalte**. Die zusätzlichen Repair-, Negative-, Preference- und Benchmark-Configs sind alternative Trainings- bzw. Evaluationsansichten und dürfen nicht als vollständig unabhängige Fakten addiert werden.

## Bestehende Qualitätsbasis

v0.3 enthält:

* 120 runtime-verifizierte Repair-Fälle
* 120 verifier-bestätigte Hard Negatives
* 120 runtime-abgeleitete Preference-Pairs
* 30 CSS-/DOM-Verhaltensfamilien
* 4 Varianten pro Familie

Admission-Gate:

1. kaputter Zustand verfehlt das Erfolgsprädikat;
2. guter Fix erfüllt das Erfolgsprädikat;
3. plausibler Hard Negative verfehlt dasselbe Erfolgsprädikat weiterhin.

## v0.4 Benchmark Layer

v0.4 bildet aus den 30 runtime-verifizierten Familien einen **family-disjoint Benchmark**.

### Split-Policy

Die Familien werden deterministisch lexikographisch sortiert und vollständig einem Split zugewiesen:

| Split      | Familien | Zeilen je Benchmark-Ansicht |
| ---------- | -------: | --------------------------: |
| Train      |       20 |                          80 |
| Validation |        5 |                          20 |
| Test       |        5 |                          20 |

Alle vier Varianten einer Familie bleiben im selben Split.

Die drei Benchmark-Ansichten sind:

* `benchmark_repairs_de`
* `benchmark_hard_negatives_de`
* `benchmark_preferences_de`

### Leakage-Checks

Veröffentlichtes Ergebnis:

* Family-Overlap Train ↔ Validation: **0**
* Family-Overlap Train ↔ Test: **0**
* Family-Overlap Validation ↔ Test: **0**
* normalisierte exakte HTML/CSS/Predicate-Kollisionen Train ↔ Validation: **0**
* normalisierte exakte HTML/CSS/Predicate-Kollisionen Train ↔ Test: **0**
* normalisierte exakte HTML/CSS/Predicate-Kollisionen Validation ↔ Test: **0**

Manifest:

`benchmark_manifest_v04.json`

## Separater Test-Replay

Die **20 Repair-Zeilen des Test-Splits** wurden zusätzlich separat gegen die lokale Browser-Runtime replayed.

Runtime:

`Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`

Ergebnis:

* **20 / 20 PASS**
* 20 / 20 kaputte Zustände verfehlten das Erfolgsprädikat
* 20 / 20 reparierte Zustände erfüllten dasselbe Erfolgsprädikat
* 0 Replay-Fehler

Testfamilien:

* `specificity_override`
* `table_scroll_wrapper`
* `text_ellipsis`
* `two_columns_gap`
* `z_index_positioning`

Replay-Receipt:

`benchmark_test_replay_v04.json`

## Hugging-Face-Commits v0.4

* Repair Benchmark: `2435e4a5d9a23bc7d97af9fa68e32793d209e9cb`
* Hard-Negative Benchmark: `d9b3c890391db6a004efe7b606292105d9696630`
* Preference Benchmark: `52f3dfce5e8037181201eb6330cb7e29192c5539`
* Benchmark Manifest: `75815b429a7993bec13b1308edc6160a550dbcc0`
* Test Replay Receipt: `d474175b014e857453cce67ac5df5ef268cfc83d`
* Dataset Card v0.4: `b415da629fcd6f9081bd424fa9cd61c39ace9da7`
* Provenance Registry v0.4: `770ad5c59f91c016262ccd442a2180ff4d0a1fda`

## Publisher-Attestation

Das Quellpaket `CSS_Wissenspaket_DE.zip` wurde nach Aussage des Publishers privat für ihn im Research-/Learning-GPT-Workflow erstellt, übersetzt und projektspezifisch strukturiert. Die vollständige Veröffentlichung dieses daraus kuratierten Korpus wurde am 4. Oktober 2026 autorisiert.

Quellpaket SHA-256:

`12353f528865470a753efc860889a0d82156455a9cc1145a28ce3abd525f24e7`

Die Attestation ist eine Publikationsfreigabe, kein unabhängiges juristisches Eigentumsgutachten. `downstream_license` bleibt `unspecified`, bis eine konkrete Standardlizenz festgelegt wird.

## Truth Boundary

Der Benchmark ist **family-disjoint innerhalb dieses Datensatzes**.

Er ist ausdrücklich **nicht** als nachgewiesen kontaminationsfrei gegenüber öffentlichen Web-Korpora oder externen Modell-Pretraining-Daten zu verstehen.

Der separate Test-Replay bestätigt ausschließlich die 20 Repair-Zeilen des v0.4-Test-Splits in der genannten Chromium-Runtime.

## Fremdquellen

* `TheOdinProject/css-exercises`: MIT-lizenzierte Kandidaten-/Referenzquelle; immutable Revision und Attribution erforderlich.
* `sarvinoz23/html_css_website1`: weiterhin nicht ingestiert; Repository-/Asset-Rechte ungeklärt.

## Öffentlicher Datensatz

https://huggingface.co/datasets/ouroboroscollective/evidence-bound-css
