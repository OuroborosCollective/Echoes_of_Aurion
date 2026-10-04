# Evidence-Bound CSS v0.2.0 — 601er-Korpus

Diese Seite dokumentiert den veröffentlichten Stand des CSS-Lernkorpus auf Hugging Face.

## Release-Status

Dataset: `ouroboroscollective/evidence-bound-css`

Release: `0.2.0`

Veröffentlichter Korpus:

| Ansicht        | Zeilen | Rolle                                         |
| -------------- | -----: | --------------------------------------------- |
| `knowledge_de` |    601 | kanonische Wissensansicht                     |
| `sft_de`       |    601 | alternative SFT-Ansicht derselben 601 Inhalte |
| `recipes_de`   |     32 | rückwärtskompatible Rezept-Teilmenge          |

Die Zeilenzahlen der Ansichten dürfen nicht als 1.234 unabhängige Trainingsbeispiele addiert werden. Der kanonische Bestand umfasst **601 eindeutige Inhalte**.

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

Die Attestation wird als **Publikationsfreigabe** dokumentiert, nicht als unabhängiges juristisches Eigentumsgutachten. Für die Weiterverwendung wurde keine Standardlizenz wie MIT, Apache-2.0 oder CC BY vorgegeben; daher bleibt `downstream_license = unspecified`.

## Reproduzierte Verifikation

* 233 / 233 Manifest-Hashes: PASS
* 130 / 130 lokale Datei-/Fragmentziele: PASS
* 158 / 158 lokale Chromium-Prüfungen: PASS
* lokaler Browser: Chromium 144.0.7559.96
* separater HF-Engine-Smoke: Chromium, Firefox und WebKit startbar; dies ist ausdrücklich **kein** 158er Cross-Browser-Test

## Hub-Readback

Die beiden vollständigen 601er Dateien wurden nach direkter Library-Rückgewinnung mit 601 / 601 eindeutigen IDs validiert und erneut in den Hub geschrieben.

* `knowledge_de.jsonl`: Commit `b5d320c0263908300ae32269ee653146b1eb93b9`
* `sft_de.jsonl`: Commit `a425904d68d31ef6f6e067e82ef3ce948c849a65`

Direkter Repository-Readback bestätigt die Dateien. Der Hugging-Face Dataset Viewer meldete beim anschließenden Abruf vorübergehend Serverüberlastung; dieser temporäre Viewer-Zustand wird nicht als Datenfehler ausgelegt.

## Truth Boundary

Der Korpus ist Trainings- und Wissensmaterial. Er ist kein SOTA-Claim und kein nachgewiesen kontaminationsfreier Benchmark.

Eval-Splits sollen künftig source- und family-disjoint aufgebaut und gegen Trainingsquellen dedupliziert werden. Es werden keine zufälligen Test-Splits aus demselben 601er Ursprungspaket als scheinbar unabhängige Evaluation erzeugt.

## Fremdquellen

Die Publisher-Freigabe gilt nicht automatisch für Drittquellen.

* `TheOdinProject/css-exercises`: MIT-lizenzierte Kandidaten-/Referenzquelle; immutable Revision und Attribution erforderlich.
* `sarvinoz23/html_css_website1`: weiterhin **nicht ingestiert**, da Repository-/Asset-Rechte nicht geklärt sind.

## Öffentlicher Datensatz

https://huggingface.co/datasets/ouroboroscollective/evidence-bound-css
