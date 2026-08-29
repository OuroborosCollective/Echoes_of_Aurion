from pathlib import Path
import re

path = Path(".github/workflows/deploy-aurion-zone-runtime.yml")
text = path.read_text(encoding="utf-8")

anchor = "  workflow_dispatch:\n"
extra_paths = '''      - "Dockerfile"\n      - "docker-compose.traefik.yml"\n      - "client/**"\n      - "server/**"\n      - "shared/**"\n      - "game-data/**"\n      - "public/**"\n      - "deploy/**"\n      - "scripts/**"\n      - "patches/**"\n      - "vite.config.ts"\n      - "tsconfig.json"\n'''
if '      - "Dockerfile"\n' not in text:
    if text.count(anchor) != 1:
        raise SystemExit("workflow_dispatch anchor mismatch")
    text = text.replace(anchor, extra_paths + anchor, 1)

replacements = {
    "  group: deploy-aurion-zone-runtime\n": "  group: deploy-aurion-runtime\n",
    "    name: Verify and build immutable Aurion zone runtime\n": "    name: Verify and build immutable Aurion runtimes\n",
    "          bash -n deploy/promote-aurion-zone-runtime.sh\n": "          bash -n deploy/promote-aurion-zone-runtime.sh\n          bash -n deploy/promote-aurion-container-runtime.sh\n",
    "    name: Promote verified Aurion zone runtime\n": "    name: Promote verified full Aurion runtime\n",
    "      - name: Promote node runtime and bounded schema runner\n": "      - name: Promote full container, fallback zone and bounded schema runner\n",
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"missing workflow token: {old!r}")
    text = text.replace(old, new, 1)

if "    timeout-minutes: 45\n" not in text:
    text = text.replace(
        "    runs-on: ubuntu-24.04\n\n    steps:\n",
        "    runs-on: ubuntu-24.04\n    timeout-minutes: 45\n\n    steps:\n",
        1,
    )
if "    timeout-minutes: 20\n" not in text:
    text = text.replace(
        "    environment: production\n    env:\n",
        "    environment: production\n    timeout-minutes: 20\n    env:\n",
        1,
    )

build_pattern = re.compile(
    r"      - name: Build zone runtime and bounded schema runner\n.*?(?=      - name: Publish immutable runtime artifact\n)",
    re.S,
)
build_replacement = '''      - name: Build full runtime, zone fallback and bounded schema runner
        env:
          AURION_RELEASE_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          pnpm build:runtime-artifact
          pnpm build:zone-runtime
          node scripts/build-aurion-production-reconcile-artifact.mjs
          node --input-type=module <<'NODE'
          import fs from "node:fs";
          const runtime=JSON.parse(fs.readFileSync("dist/.aurion-runtime-build.json","utf8"));
          if(runtime.revision!==process.env.GITHUB_SHA) throw new Error("full runtime revision mismatch");
          const schema=JSON.parse(fs.readFileSync("dist-production-reconcile/manifest.json","utf8"));
          if(schema.schemaVersion!==1) throw new Error("unexpected schema artifact version");
          if(schema.recordType!=="aurion_production_schema_reconcile_artifact") throw new Error("unexpected schema artifact type");
          if(schema.revision!==process.env.GITHUB_SHA) throw new Error("schema artifact revision mismatch");
          if(schema.mode!=="read_only"||schema.moduleFormat!=="commonjs") throw new Error("schema artifact boundary mismatch");
          for(const file of [
            "deploy/aurion-production-schema-reconcile",
            "deploy/aurion-reconcile-runtime-image.conf",
            "deploy/aurion-reconcile-runtime-network.conf",
            "deploy/verify-aurion-production-schema-reconcile-artifact.mjs",
          ]) if(!schema.files?.[file]) throw new Error(`schema artifact is missing ${file}`);
          NODE
          (cd dist-production-reconcile && sha256sum --strict -c checksums.sha256)
          node dist-production-reconcile/deploy/verify-aurion-production-schema-reconcile-artifact.mjs dist-production-reconcile "$GITHUB_SHA"
          printf '{"revision":"%s","runId":"%s","artifact":"aurion-zone-runtime"}\\n' \\
            "${GITHUB_SHA}" "${GITHUB_RUN_ID}" > dist-zone/.aurion-zone-runtime-release.json
          tar -C dist-zone -czf aurion-zone-runtime-release.tgz .
          sha256sum aurion-zone-runtime-release.tgz > aurion-zone-runtime-release.tgz.sha256

      - name: Build revision-labelled full container image
        env:
          AURION_RELEASE_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          image="echoes-of-aurion:sha-${GITHUB_SHA}"
          docker build \\
            --platform linux/amd64 \\
            --pull \\
            --build-arg "AURION_RELEASE_SHA=${GITHUB_SHA}" \\
            --label "org.opencontainers.image.revision=${GITHUB_SHA}" \\
            --tag "$image" \\
            .
          image_id="$(docker image inspect --format='{{.Id}}' "$image")"
          revision="$(docker image inspect --format='{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")"
          [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]
          test "$revision" = "$GITHUB_SHA"
          IMAGE_ID="$image_id" IMAGE_REF="$image" node -e '
            const fs=require("node:fs");
            fs.writeFileSync("aurion-full-runtime-image.json",JSON.stringify({
              schemaVersion:1,
              recordType:"aurion_full_runtime_image",
              revision:process.env.GITHUB_SHA,
              imageReference:process.env.IMAGE_REF,
              imageId:process.env.IMAGE_ID,
            },null,2)+"\\n");
          '
          docker save "$image" | gzip -1 > aurion-full-runtime-image.tar.gz
          sha256sum aurion-full-runtime-image.tar.gz > aurion-full-runtime-image.tar.gz.sha256

'''
text, count = build_pattern.subn(build_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"build block replacement count={count}")

artifact_anchor = '''            aurion-zone-runtime-release.tgz.sha256
            deploy/aurion-zone-runtime.service
'''
artifact_replacement = '''            aurion-zone-runtime-release.tgz.sha256
            aurion-full-runtime-image.tar.gz
            aurion-full-runtime-image.tar.gz.sha256
            aurion-full-runtime-image.json
            docker-compose.traefik.yml
            deploy/aurion-zone-runtime.service
'''
if artifact_anchor not in text:
    raise SystemExit("artifact anchor missing")
text = text.replace(artifact_anchor, artifact_replacement, 1)
text = text.replace(
    "            deploy/promote-aurion-zone-runtime.sh\n",
    "            deploy/promote-aurion-zone-runtime.sh\n            deploy/promote-aurion-container-runtime.sh\n",
    1,
)

receipt_anchor = '''          grep -Fq "${EXPECTED_SHA}" /opt/echoes-of-aurion-schema-reconcile/current/manifest.json
'''
receipt_replacement = '''          grep -Fq "${EXPECTED_SHA}" /opt/echoes-of-aurion-schema-reconcile/current/manifest.json
          test -f "/opt/echoes-of-aurion/releases/${RELEASE_ID}/deployment-receipt.json"
          grep -Fq "${EXPECTED_SHA}" "/opt/echoes-of-aurion/releases/${RELEASE_ID}/deployment-receipt.json"
'''
if receipt_anchor not in text:
    raise SystemExit("receipt anchor missing")
text = text.replace(receipt_anchor, receipt_replacement, 1)
text = text.replace(
    "          cat /opt/aurion-zone-runtime/current/.aurion-zone-runtime-release.json\n",
    "          cat /opt/aurion-zone-runtime/current/.aurion-zone-runtime-release.json\n          cat \"/opt/echoes-of-aurion/releases/${RELEASE_ID}/deployment-receipt.json\"\n",
    1,
)

health_pattern = re.compile(
    r"      - name: Verify public runtime health\n.*?(?=\n  production-schema-readback:\n)",
    re.S,
)
health_replacement = '''      - name: Verify public full-runtime health
        run: |
          set -euo pipefail
          public_ready=0
          for _attempt in $(seq 1 20); do
            if health_json="$(curl --fail --silent --show-error --max-time 10 https://arelogic.space/healthz 2>/dev/null)"; then
              if EXPECTED_SHA="$EXPECTED_SHA" HEALTH_JSON="$health_json" node -e '
                const body=JSON.parse(process.env.HEALTH_JSON);
                if(body.ok!==true||body.status!=="ok"||body.service!=="echoes-of-aurion"||body.revision!==process.env.EXPECTED_SHA) process.exit(1);
              '; then
                printf '%s\\n' "$health_json"
                public_ready=1
                break
              fi
            fi
            sleep 2
          done
          [[ "$public_ready" -eq 1 ]]
'''
text, count = health_pattern.subn(health_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"health block replacement count={count}")

path.write_text(text, encoding="utf-8")
