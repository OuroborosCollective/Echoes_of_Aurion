# Echoes of Aurion — Spielerwebsite (GitHub Pages)

**Zweck:** Eine emotionale, öffentlich zugängliche Spielvorstellung, kein Entwickler-Portfolio und keine Alternative zur Aurion-Spielruntime. Die technische Umsetzung ist rein statisch und getrennt von `client/`, `server/` und den kanonischen Spielzuständen.

**Inhalt:** Portal-Konzeptkunst, die lebendige Welt, NPC-Erinnerungen und Gerüchte, Erkundung, Handwerk, Kampf und eine kurze erzählerische Geschichte. Aktuelle Referenzen: [Aurion README](../../README.md), [Spielereinstieg](../account-first-entry.md), [Asset-Art-Direction](../../ASSETS.md).

**Kunst:** `public-site/media/aurion-realm.svg` ist eine für die Website entworfene **Konzeptillustration**, kein Live-Screenshot. Die separat vorhandenen echten 3D-Asset-Vorschauen `assets/fantasy-v1/*.preview.png` bleiben in ihrem kanonischen Pfad und werden durch diese neue Seite nicht als vollständig im Spiel ausgeliefert ausgegeben.

**GitBook:** Das bestehende [Aurion GitBook](https://ouroboroscollective.gitbook.io/ouroboroscollective-docs/) ist bereits an `main` über Git Sync angebunden. Die neue Seite verlinkt es, ändert aber nicht seine bestehende Navigation oder gesperrten Spaces. Dokumentations- und GitHub-Pages-Site sind getrennte Publikationen.

## Prüfungen

```bash
python3 scripts/verify-aurion-public-site.py --mode preview
# Erwarteter Zustand vor rechtlicher Freigabe: Fehler, keine Veröffentlichung
python3 scripts/verify-aurion-public-site.py --mode release
python3 -m http.server 8765 --directory public-site
```

Mobil/Desktop, Tastaturzugang, Kontrast, Links und reduzierte Animation separat visuell überprüfen. CI: `Aurion Player Site - Review` prüft den echten PR-Head.

## Absichtliche Veröffentlichungssperre

1. `public-site/rechtliches.html`: ladungsfähige Anbieteranschrift, geschäftliche Kontaktadresse, vollständige DSGVO-Informationen und relevante Rechtsgrundlagen fachlich vervollständigen.
2. Danach `PUBLICATION_BLOCKER` und `noindex` nur auf ausdrückliche Freigabe entfernen. Der Release-Validator verhindert vorher eine Veröffentlichung.
3. Nach erfolgreicher exakter PR-Head-CI und ausdrücklicher Merge-Freigabe mergen.
4. In **Settings → Pages → Source: GitHub Actions** aktivieren; das wird durch Repositorydateien allein nicht umgestellt.
5. `Aurion Player Site - Publish Pages` manuell von `main` starten.
6. Den erfolgreichen Actions-Deploy, die exakte SHA, Assets/CSS, HTTPS-Erreichbarkeit und die echte URL `https://ouroboroscollective.github.io/Echoes_of_Aurion/` extern readback-prüfen. Diese URL ist **nur die erwartete Adresse**, kein Nachweis über eine Live-Veröffentlichung.

Die Seite enthält keine Formulare, Cookies, Drittanbieter-Skripte, Spieler-Accounts oder Backendzugriffe. Feature-Texte sind Spieler- und Entwicklungsziele, kein empirisch überprüfter Nachweis eines aktuellen Produktionsreleases.
