import assert from "node:assert/strict";
import test from "node:test";
import { buildReceipt, parseNervaResponse, selectTargets } from "./run-nerva.mjs";
import { requiresAurionRelease } from "../../scripts/aurion-release-paths.mjs";

const revision = "a".repeat(40);

test("allowlist profiles cannot select arbitrary outside addresses", () => {
  const targets = selectTargets("public-web");
  assert.deepEqual(targets.map(({ id, address }) => [id, address]), [
    ["aurion_https", "arelogic.space:443"],
    ["aurion_http", "arelogic.space:80"],
  ]);
  assert.throws(() => selectTargets("example.org:443"), /NERVA_PROFILE_NOT_ALLOWED/);
});

test("Nerva JSON observations have typed, redacted findings", () => {
  const observation = parseNervaResponse(JSON.stringify({
    host: "private.internal", ip: "10.4.3.2", port: 443, protocol: "https",
    metadata: { token: "NOT_FOR_PUBLIC_LOGS" },
    security_findings: [
      { id: "ssh-weak-kex", severity: "low", description: "sensitive server details", evidence: "SECRET_VALUE" },
    ],
  }), 443);
  assert.deepEqual(observation, {
    state: "observed", protocol: "https",
    findings: [{ id: "ssh-weak-kex", severity: "low" }],
  });
  assert.doesNotMatch(JSON.stringify(observation), /private.internal|10\.4\.3\.2|NOT_FOR_PUBLIC_LOGS|SECRET_VALUE|sensitive server details/);
});

test("Nerva NDJSON and single-element JSON array are accepted", () => {
  for (const output of [
    '{"port":80,"protocol":"http"}\n',
    '[{"port":80,"protocol":"http"}]',
  ]) {
    assert.equal(parseNervaResponse(output, 80).protocol, "http");
  }
});

test("unverified outputs never become successful observations", () => {
  assert.deepEqual(parseNervaResponse("", 443), {
    state: "unverified", protocol: null, findings: [],
  });
  assert.throws(
    () => parseNervaResponse('{"port":22,"protocol":"ssh"}', 443),
    /NERVA_PORT_MISMATCH/,
  );
  assert.throws(() => parseNervaResponse("{invalid", 443), /NERVA_JSON_INVALID/);
  assert.throws(() => parseNervaResponse('{"port":443,"security_findings":{}}', 443), /NERVA_FINDINGS_INVALID/);
});

test("JSON receipt classifies findings, incomplete and errors without raw service data", () => {
  const baseline = {
    revision, profile: "public-web",
    results: [
      { id: "aurion_https", port: 443, state: "observed", protocol: "https", findings: [] },
      { id: "aurion_http", port: 80, state: "observed", protocol: "http", findings: [] },
    ],
  };
  const good = buildReceipt(baseline);
  assert.equal(good.status, "PASS");
  assert.equal(good.sourceRevision, revision);
  assert.equal(good.nerva.version, "v1.75.1");
  assert.equal(good.privacy.rawOutputStored, false);
  assert.equal(buildReceipt({ ...baseline, results: [
    { ...baseline.results[0], findings: [{ id: "docker-unauth-api", severity: "critical" }] },
    baseline.results[1],
  ] }).status, "FINDINGS");
  assert.equal(buildReceipt({ ...baseline, results: [
    { ...baseline.results[0], state: "unverified" }, baseline.results[1],
  ] }).status, "INCOMPLETE");
  assert.equal(buildReceipt({ ...baseline, results: [
    { ...baseline.results[0], state: "error" }, baseline.results[1],
  ] }).status, "ERROR");
  assert.throws(() => buildReceipt({ ...baseline, revision: "main" }), /NERVA_REVISION_INVALID/);
});

test("Nerva-only changes cannot start a production release; mixed changes still can", () => {
  const changed = [
    ".github/workflows/aurion-nerva-security.yml",
    ".github/nerva/run-nerva.mjs",
    ".github/nerva/run-nerva.test.mjs",
    ".github/nerva/README.md",
    "scripts/aurion-release-paths.mjs",
    "Memory.md",
  ];
  assert.equal(requiresAurionRelease(changed), false);
  assert.equal(requiresAurionRelease([...changed, "godot-client/project.godot"]), true);
  assert.equal(requiresAurionRelease([...changed, "server/zoneGateway.ts"]), true);
  assert.equal(requiresAurionRelease([".github/workflows/deploy-aurion-zone-runtime.yml"]), true);
});
