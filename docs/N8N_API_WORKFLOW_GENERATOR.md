# n8n-Workflow-Generator für Echoes of Aurion

Dieses Repository enthält `scripts/create_n8n_workflows.py`. Das Skript nimmt die JSON-Antwort des aktiven Aurion-Planers entgegen und erzeugt daraus drei echte n8n-Workflow-Definitionen. Die Definitionen werden standardmäßig **angelegt, aber nicht veröffentlicht**. Die Aktivierung erfolgt nur mit `--activate`.

> Die n8n-REST-API authentifiziert Requests über den Header `X-N8N-API-KEY`. n8n dokumentiert die Workflow-Erstellung über ein Workflow-Objekt mit `name`, `nodes`, `connections` und `settings`.[1] [2]

## Voraussetzungen

Setzen Sie die beiden Variablen nur in der lokalen Shell, im CI-Secret-Speicher oder im VPS-Secret-Store. Committen Sie niemals den API-Key.

```bash
export N8N_API_URL='https://n8n-with-ai-assistant-r7uy.srv1491137.hstgr.cloud/api/v1'
export N8N_API_KEY='nicht-im-repository-speichern'
```

Der API-Key wird in n8n unter **Settings → n8n API** erzeugt. Für nicht-Enterprise-Instanzen gelten laut n8n die verfügbaren Account-Berechtigungen; falls Scopes verfügbar sind, verwenden Sie mindestens die nötigen Workflow-Rechte.[1]

## Vorschau ohne API-Aufruf

```bash
python3 scripts/create_n8n_workflows.py \
  aurion_webhook_test_response_formatted.json \
  --dry-run \
  --output-dir generated-n8n-workflows
```

Der Dry-Run erzeugt drei lokale JSON-Dateien. Er sendet nichts an n8n und benötigt keinen API-Key.

## Workflows anlegen, aber nicht aktivieren

```bash
export N8N_API_URL='https://n8n-with-ai-assistant-r7uy.srv1491137.hstgr.cloud/api/v1'
export N8N_API_KEY='…'

python3 scripts/create_n8n_workflows.py \
  aurion_webhook_test_response_formatted.json \
  --output-dir generated-n8n-workflows
```

Das Skript ruft `POST /api/v1/workflows` für jeden der drei Vorschläge auf. Jeder erzeugte Workflow erhält einen eigenen Webhook-Pfad `aurion/generated/1`, `aurion/generated/2` oder `aurion/generated/3`.

## Workflows anlegen und veröffentlichen

Aktivieren Sie diesen Modus erst nach der lokalen Vorschau und einer Prüfung der erzeugten JSON-Dateien:

```bash
N8N_API_URL='https://n8n-with-ai-assistant-r7uy.srv1491137.hstgr.cloud/api/v1' \
N8N_API_KEY="$N8N_API_KEY" \
python3 scripts/create_n8n_workflows.py \
  aurion_webhook_test_response_formatted.json \
  --activate \
  --output-dir generated-n8n-workflows
```

`--activate` ruft nach der Anlage für jede zurückgegebene Workflow-ID den Publish-Endpunkt auf. Ohne gültigen API-Key bricht das Skript vor dem ersten API-Request ab. Ein halb konfigurierter Workflow wird nicht als erfolgreich gemeldet.

## GitHub Actions

Für CI/CD sollten Sie `N8N_API_URL` als Repository-Variable und `N8N_API_KEY` als Repository-Secret hinterlegen. Verwenden Sie mindestens `contents: read` für den Checkout. Ein Beispiel:

```yaml
name: Publish Aurion automation workflows

on:
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 30

      - name: Build or download planner response
        run: test -f aurion_webhook_test_response_formatted.json

      - name: Publish generated workflows
        env:
          N8N_API_URL: ${{ vars.N8N_API_URL }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
        run: |
          python3 scripts/create_n8n_workflows.py \
            aurion_webhook_test_response_formatted.json \
            --activate \
            --output-dir generated-n8n-workflows
```

Für eine erste Einführung lassen Sie `--activate` weg. Dadurch werden die Workflows angelegt, aber nicht veröffentlicht. Der n8n-API-Key sollte ein Ablaufdatum haben und nach einem Testlauf rotieren.

## Sicherheits- und Betriebsgrenzen

Das Skript erzeugt aus den Vorschlägen funktionale Webhook-Wrapper. Es kann nicht aus einer freien Beschreibung zuverlässig beliebige n8n-Knoten, Credentials oder externe Seiteneffekte ableiten. Externe Credentials werden daher nicht automatisch erzeugt. Workflow-Definitionen sollten vor der Veröffentlichung geprüft werden, insbesondere wenn die Vorschläge später um GitHub-, Linear-, Datenbank- oder Deployment-Schreibaktionen erweitert werden.

Die drei generierten Workflows enthalten keine n8n-Credentials. Sie nehmen JSON über ihren jeweiligen Webhook entgegen und geben den geprüften Automationsplan zurück. Für echte externe Aktionen müssen die dafür benötigten n8n-Credentials nachträglich im n8n-Editor oder über einen separat kontrollierten Credential-Prozess hinterlegt werden.

## Quellen

[1]: https://docs.n8n.io/connect/n8n-api/authentication "n8n Docs: Authentication"
[2]: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8n "n8n Docs: n8n node and workflow operations"
