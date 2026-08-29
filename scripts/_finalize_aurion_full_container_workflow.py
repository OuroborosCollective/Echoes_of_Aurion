from pathlib import Path

path = Path(".github/workflows/deploy-aurion-zone-runtime.yml")
text = path.read_text(encoding="utf-8")

for stale in (
    '      - "deploy/arelogic-zone-runtime.nginx.conf"\n',
    '      - "deploy/arelogic-zone-runtime-rate-limit.nginx.conf"\n',
    '            deploy/arelogic-zone-runtime.nginx.conf\n',
    '            deploy/arelogic-zone-runtime-rate-limit.nginx.conf\n',
):
    text = text.replace(stale, "")

sha_guard = '          test "${GITHUB_REF}" = "refs/heads/main"\n'
if '[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]' not in text:
    if text.count(sha_guard) < 1:
        raise SystemExit("main-ref guard missing")
    text = text.replace(
        sha_guard,
        sha_guard + '          [[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]\n',
        1,
    )

text = text.replace(
    '''          printf '{"revision":"%s","runId":"%s","artifact":"aurion-zone-runtime"}\n' \\
            "${GITHUB_SHA}" "${GITHUB_RUN_ID}" > dist-zone/.aurion-zone-runtime-release.json
''',
    '''          printf '{"revision":"%s","runId":"%s","artifact":"aurion-zone-runtime"}\\n' \\
            "${GITHUB_SHA}" "${GITHUB_RUN_ID}" > dist-zone/.aurion-zone-runtime-release.json
''',
)
text = text.replace(
    '''            },null,2)+"\n");
''',
    '''            },null,2)+"\\n");
''',
)
text = text.replace(
    '''                printf '%s\n' "$health_json"
''',
    '''                printf '%s\\n' "$health_json"
''',
)

legacy_invocations = '''          sudo /usr/local/sbin/promote-aurion-zone-runtime "${artifact}" "${EXPECTED_SHA}" "${RELEASE_ID}"
          sudo /usr/local/sbin/promote-aurion-zone-runtime "${artifact}" "${EXPECTED_SHA}" "${RELEASE_ID}"
'''
bounded_bootstrap = '''          set +e
          sudo /usr/local/sbin/promote-aurion-zone-runtime "${artifact}" "${EXPECTED_SHA}" "${RELEASE_ID}"
          bootstrap_status=$?
          set -e
          cmp -s "${artifact}/deploy/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime
          if [[ "$bootstrap_status" -ne 0 ]]; then
            printf 'LEGACY_PROMOTER_REPLACED status=%s\\n' "$bootstrap_status"
          fi
          sudo /usr/local/sbin/promote-aurion-zone-runtime "${artifact}" "${EXPECTED_SHA}" "${RELEASE_ID}"
'''
if legacy_invocations in text:
    text = text.replace(legacy_invocations, bounded_bootstrap, 1)
elif bounded_bootstrap not in text:
    raise SystemExit("promoter bootstrap boundary missing")

for forbidden in (
    "systemctl reload nginx",
    "nginx -t",
    "arelogic-zone-runtime.nginx.conf",
    "arelogic-zone-runtime-rate-limit.nginx.conf",
):
    if forbidden in text:
        raise SystemExit(f"stale nginx boundary remains: {forbidden}")
for required in (
    '[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]',
    'LEGACY_PROMOTER_REPLACED status=%s\\n',
    '},null,2)+"\\n");',
    "https://arelogic.space/healthz",
):
    if required not in text:
        raise SystemExit(f"required workflow contract missing: {required}")

path.write_text(text, encoding="utf-8")
