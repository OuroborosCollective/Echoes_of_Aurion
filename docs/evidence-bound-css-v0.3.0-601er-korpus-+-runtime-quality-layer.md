# Evidence-Bound CSS v0.3.0 — 601er-Korpus + Runtime Quality Layer

Diese Seite dokumentiert den veröffentlichten Stand des CSS-Lernkorpus auf Hugging Face.

## Release-Status

Dataset: `ouroboroscollective/evidence-bound-css`

Release: `0.3.0`

| Ansicht                          | Zeilen | Rolle                                         |
| -------------------------------- | -----: | --------------------------------------------- |
| `knowledge_de`                   |    601 | kanonische Wissensansicht                     |
| `sft_de`                         |    601 | alternative SFT-Ansicht derselben 601 Inhalte |
| `recipes_de`                     |     32 | rückwärtskompatible Rezept-Teilmenge          |
| `debug_reasoning_de`             |    100 | source-grounded Debugging-Ableitung           |
| `browser_verified_repairs_de`    |      6 | ursprünglicher runtime-verifizierter Seed     |
| `browser_verified_repairs_v2_de` |    120 | runtime-verifizierte Repair-Fälle             |
| `hard_negatives_de`              |    120 | verifier-bestätigte Fehlreparaturen           |
| `preference_pairs_de`            |    120 | runtime-abgeleitete Preference-Paare          |

Die Ansichten überlappen bewusst. Sie dürfen nicht als 1.700+ unabhängige Fakten gezählt werden. Der kanonische Wissensbestand umfasst weiterhin **601 eindeutige Inhalte**.

## Inventar

* 279 CSS-Eigenschaften
* 74 Selektor-/State-Muster
* 78 CSS-Funktionen
* 18 At-Regeln
* 100 Debugging-/Fehlerfälle
* 32 Lösungsrezepte
* 20 vollständige Offline-Beispiele

## Publisher-Attestation

Das Quellpaket `CSS_Wissenspaket_DE.zip` wurde nach Aussage des Publishers privat für ihn im Research-/Learning-GPT-Workflow erstellt, übersetzt und projektspezifisch strukturiert. Der Publisher hat am 4. Oktober 2026 die Veröffentlichung des vollständigen daraus kuratierten Korpus autorisiert.

Quellpaket SHA-256:

`12353f528865470a753efc860889a0d82156455a9cc1145a28ce3abd525f24e7`

Die Attestation wird als **Publikationsfreigabe** dokumentiert, nicht als unabhängiges juristisches Eigentumsgutachten. `downstream_license` bleibt `unspecified`, solange keine konkrete Standardlizenz festgelegt ist.

## Baseline-Verifikation

* 233 / 233 Manifest-Hashes: PASS
* 130 / 130 lokale Datei-/Fragmentziele: PASS
* 158 / 158 lokale Chromium-Prüfungen: PASS
* Baseline-Browser: Chromium 144.0.7559.96
* separater HF-Engine-Smoke: Chromium, Firefox und WebKit startbar; ausdrücklich kein 158er Cross-Browser-Test

## v0.3 Runtime Quality Layer

Die v0.3-Suite umfasst **30 CSS-/DOM-Verhaltensfamilien × 4 Varianten = 120 Kandidaten**.

Jeder Kandidat wurde gegen denselben dreistufigen Admission-Gate geprüft:

1. der kaputte Zustand muss das Erfolgsprädikat **nicht** erfüllen;
2. der vorgeschlagene Fix muss das Erfolgsprädikat erfüllen;
3. ein plausibler Hard Negative muss dasselbe Erfolgsprädikat weiterhin verfehlen.

Ergebnis:

* 120 Kandidaten
* 120 kaputte Zustände reproduziert
* 120 positive Fixes bestanden
* 120 Hard Negatives scheiterten am selben Gate
* 120 Repair-Records aufgenommen
* 120 Hard-Negative-Records aufgenommen
* 120 Preference-Pairs aufgenommen

Runtime:

`Chromium 144.0.7559.96`

Verifier:

`playwright_chromium_dom_computed_style`

Runtime-Origin:

`local_container`

Die Suite wurde nur wegen Werkzeug-Zeitlimits in vier Batches ausgeführt. Der Admission-Gate war in allen vier Batches identisch.

## Abgedeckte v0.3-Familien

Unter anderem:

* Flex-/Grid-Intrinsic-Sizing
* Box-Sizing
* 50%-Spalten plus Gap
* lange ungebrochene Zeichenfolgen
* Text-Ellipsis
* Flex-Achsenausrichtung
* `margin-inline: auto`
* absolute Containing Blocks
* scrollbare Flex-Panels
* intrinsisches Bildseitenverhältnis
* responsive `max-inline-size`
* `min-width`-Konflikte
* `pre-wrap`
* scrollbare Tabellenwrapper
* Media Queries
* Custom-Property-Fallbacks
* Spezifität
* `:hover`
* `:checked + sibling`
* `:has()`
* Transform-Zentrierung
* z-index plus Positioning
* Pointer-Event-Overlays
* `calc()`
* gleiche Flexspalten
* `prefers-reduced-motion`
* `prefers-color-scheme`
* Print Media
* Grid-Content-Overflow

## Hugging-Face-Commits v0.3

* Repairs v2: `0d65c6b673ceec3d2a7f500c376b7d0f98a66e3f`
* Hard Negatives: `3167cb251a10cb254bc10a7464d8901877a94cd2`
* Preference Pairs: `4d13359a91b5668e92c10e6cba0ad99b32068222`
* Dataset Card v0.3: `063a41fa89926bb3d48d1848798ef025f0d07802`
* Provenance Registry v0.3: `1a58c6bd4116c4968965ffb3d990605221b8cae2`

## Truth Boundary

Der Korpus ist Trainings- und Wissensmaterial. Er ist kein SOTA-Claim und kein nachgewiesen kontaminationsfreier Benchmark.

Ein synthetischer Repair-Kandidat wird nur als `runtime_verified` aufgenommen, wenn der Defekt vor dem Fix messbar ist, der Fix das Ziel erreicht und ein plausibler Hard Negative denselben Gate weiterhin nicht besteht.

Evaluationen sollen künftig source- und family-disjoint aufgebaut und gegen Trainingsquellen dedupliziert werden.

## Fremdquellen

Die Publisher-Freigabe gilt nicht automatisch für Drittquellen.

* `TheOdinProject/css-exercises`: MIT-lizenzierte Kandidaten-/Referenzquelle; immutable Revision und Attribution erforderlich.
* `sarvinoz23/html_css_website1`: weiterhin **nicht ingestiert**, da Repository-/Asset-Rechte nicht geklärt sind.

## Öffentlicher Datensatz

https://huggingface.co/datasets/ouroboroscollective/evidence-bound-css
