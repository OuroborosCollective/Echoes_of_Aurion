from pathlib import Path

promoter_path = Path("deploy/promote-aurion-container-runtime.sh")
promoter = promoter_path.read_text(encoding="utf-8")

required_old = '''for required_name in DATABASE_URL JWT_SECRET; do
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?${required_name}=" "$env_file"
done
oidc_count=0
for oidc_name in OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI; do
  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?${oidc_name}=" "$env_file"; then
    oidc_count=$((oidc_count + 1))
  fi
done
[[ "$oidc_count" -eq 0 || "$oidc_count" -eq 4 ]]
'''
required_new = '''env_key_has_value() {
  ENV_FILE="$env_file" ENV_KEY="$1" node -e '
    const fs=require("node:fs");
    const key=process.env.ENV_KEY;
    const source=fs.readFileSync(process.env.ENV_FILE,"utf8");
    for(const line of source.split(/\\r?\\n/)) {
      const match=line.match(/^\\s*(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=([\\s\\S]*)$/);
      if(!match||match[1]!==key) continue;
      let value=match[2].trim();
      if((value.startsWith("\\\"")&&value.endsWith("\\\""))||(value.startsWith("\\'")&&value.endsWith("\\'"))) value=value.slice(1,-1).trim();
      process.exit(value.length>0?0:1);
    }
    process.exit(1);
  '
}

for required_name in DATABASE_URL JWT_SECRET VITE_APP_ID; do
  env_key_has_value "$required_name"
done
oidc_count=0
for oidc_name in OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI; do
  if env_key_has_value "$oidc_name"; then
    oidc_count=$((oidc_count + 1))
  fi
done
legacy_oauth=0
if env_key_has_value OAUTH_SERVER_URL; then
  legacy_oauth=1
fi
if [[ "$oidc_count" -eq 4 ]]; then
  auth_mode=oidc
elif [[ "$oidc_count" -eq 0 && "$legacy_oauth" -eq 1 ]]; then
  auth_mode=legacy_oauth
else
  echo "Aurion authentication configuration is incomplete" >&2
  exit 65
fi
'''
if promoter.count(required_old) != 1:
    raise SystemExit(f"auth boundary replacement count={promoter.count(required_old)}")
promoter = promoter.replace(required_old, required_new, 1)

early_pointer = '''ln -sTfn "$release" "${base}/current.next"
mv -Tf "${base}/current.next" "$current"
test "$(readlink -f "$current")" = "$release"

'''
if promoter.count(early_pointer) != 1:
    raise SystemExit(f"early pointer boundary count={promoter.count(early_pointer)}")
promoter = promoter.replace(early_pointer, "", 1)
promoter = promoter.replace(
    '  docker compose --project-name "$project" --env-file "$env_file" -f "${current}/docker-compose.traefik.yml" "$@"\n',
    '  docker compose --project-name "$project" --env-file "$env_file" -f "${release}/docker-compose.traefik.yml" "$@"\n',
    1,
)

public_success = '''if [[ "$public_ready" -ne 1 ]]; then
  rollback_public_service
  exit 72
fi

# The mutable convenience tag is updated only after exact container and public readback succeed.
'''
public_replacement = '''if [[ "$public_ready" -ne 1 ]]; then
  rollback_public_service
  exit 72
fi

# Publish the release pointer only after the exact public SHA is visible.
ln -sTfn "$release" "${base}/current.next"
mv -Tf "${base}/current.next" "$current"
test "$(readlink -f "$current")" = "$release"

# The mutable convenience tag is updated only after exact container and public readback succeed.
'''
if promoter.count(public_success) != 1:
    raise SystemExit(f"public success boundary count={promoter.count(public_success)}")
promoter = promoter.replace(public_success, public_replacement, 1)

receipt_env_old = 'EXPECTED_SHA="$expected_sha" IMAGE_ID="$expected_image_id" PREVIOUS_IMAGE_ID="$previous_image_id" PREVIOUS_IMAGE_REF="$previous_image_ref" PREVIOUS_REVISION="$previous_revision" PUBLIC_NETWORK="$public_network" PRIVATE_NETWORK="$private_network" RECEIPT="$receipt" node -e '\nreceipt_env_new = 'EXPECTED_SHA="$expected_sha" IMAGE_ID="$expected_image_id" PREVIOUS_IMAGE_ID="$previous_image_id" PREVIOUS_IMAGE_REF="$previous_image_ref" PREVIOUS_REVISION="$previous_revision" PUBLIC_NETWORK="$public_network" PRIVATE_NETWORK="$private_network" AUTH_MODE="$auth_mode" RECEIPT="$receipt" node -e '\nif promoter.count(receipt_env_old) != 1:
    raise SystemExit("receipt environment boundary missing")
promoter = promoter.replace(receipt_env_old, receipt_env_new, 1)
promoter = promoter.replace(
    '    networks:[process.env.PUBLIC_NETWORK,process.env.PRIVATE_NETWORK],\n    publicHealth:true,\n',
    '    networks:[process.env.PUBLIC_NETWORK,process.env.PRIVATE_NETWORK],\n    authMode:process.env.AUTH_MODE,\n    publicHealth:true,\n',
    1,
)

for forbidden in ('${current}/docker-compose.traefik.yml', 'for required_name in DATABASE_URL JWT_SECRET;'):
    if forbidden in promoter:
        raise SystemExit(f"stale promoter boundary remains: {forbidden}")
for required in ('VITE_APP_ID', 'OAUTH_SERVER_URL', 'auth_mode=oidc', 'auth_mode=legacy_oauth', 'AUTH_MODE="$auth_mode"', 'Publish the release pointer only after'):
    if required not in promoter:
        raise SystemExit(f"required promoter boundary missing: {required}")
promoter_path.write_text(promoter, encoding="utf-8")

sdk_path = Path("server/_core/sdk.ts")
sdk = sdk_path.read_text(encoding="utf-8")
sdk_old = '''  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
'''
sdk_new = '''  constructor(private client: ReturnType<typeof axios.create>) {
    const oidcConfigured = [
      "OIDC_ISSUER_URL",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_REDIRECT_URI",
    ].every(key => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0);
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Legacy OAuth provider configured");
    } else if (oidcConfigured) {
      console.log("[OAuth] OIDC provider configured");
    } else {
      console.error("[OAuth] ERROR: neither OIDC nor legacy OAuth is configured");
    }
  }
'''
if sdk.count(sdk_old) != 1:
    raise SystemExit(f"sdk auth log replacement count={sdk.count(sdk_old)}")
sdk_path.write_text(sdk.replace(sdk_old, sdk_new, 1), encoding="utf-8")

test_path = Path("server/aurionFullContainerCutover.test.ts")
test = test_path.read_text(encoding="utf-8")ntest_old = '''  it("requires protected environment permissions and complete-or-absent OIDC consent", () => {
    expect(containerPromoter).toContain("root:root:600");
    expect(containerPromoter).toContain("OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI");
    expect(containerPromoter).toContain('[[ "$oidc_count" -eq 0 || "$oidc_count" -eq 4 ]]');
    expect(containerPromoter).not.toContain('cat "$env_file"');
  });
'''
test_new = '''  it("requires protected environment permissions and exactly one complete authentication mode", () => {
    expect(containerPromoter).toContain("root:root:600");
    expect(containerPromoter).toContain("DATABASE_URL JWT_SECRET VITE_APP_ID");
    expect(containerPromoter).toContain("OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI");
    expect(containerPromoter).toContain("OAUTH_SERVER_URL");
    expect(containerPromoter).toContain("auth_mode=oidc");
    expect(containerPromoter).toContain("auth_mode=legacy_oauth");
    expect(containerPromoter).not.toContain('cat "$env_file"');
  });

  it("publishes the release pointer only after public revision readback", () => {
    expect(containerPromoter.indexOf('body.revision!==process.env.EXPECTED_SHA')).toBeLessThan(
      containerPromoter.indexOf('ln -sTfn "$release" "${base}/current.next"'),
    );
    expect(containerPromoter).toContain("authMode:process.env.AUTH_MODE");
  });

  it("bootstraps the exact new root promoter without accepting an arbitrary failed predecessor", () => {
    expect(workflow).toContain("LEGACY_PROMOTER_REPLACED");
    expect(workflow).toContain('cmp -s "${artifact}/deploy/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime');
    expect(workflow).toContain('},null,2)+"\\\\n");');
  });
'''
if test.count(test_old) != 1:
    raise SystemExit(f"cutover test replacement count={test.count(test_old)}")
test = test.replace(test_old, test_new, 1)
test = test.replace(
    '  const server = read("server/_core/index.ts");\n',
    '  const server = read("server/_core/index.ts");\n  const sdk = read("server/_core/sdk.ts");\n',
    1,
)
test = test.replace(
    '    expect(containerPromoter).not.toContain(\'cat "$env_file"\');\n',
    '    expect(containerPromoter).not.toContain(\'cat "$env_file"\');\n    expect(sdk).toContain("OIDC provider configured");\n',
    1,
)
test_path.write_text(test, encoding="utf-8")
