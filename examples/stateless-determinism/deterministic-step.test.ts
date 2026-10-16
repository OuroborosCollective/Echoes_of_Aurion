import assert from "node:assert/strict";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import {
  deterministicStep,
  stableJsonForTest,
  type DeterministicInput,
} from "./deterministic-step.ts";

const baseInput: DeterministicInput = {
  tick: 7,
  entity: { id: "entity-1", x: 10, y: 20 },
  direction: "right",
  distance: 3,
};

test("same input yields the same complete result", () => {
  const first = deterministicStep(baseInput);
  const second = deterministicStep({
    distance: 3,
    direction: "right",
    entity: { y: 20, id: "entity-1", x: 10 },
    tick: 7,
  });
  assert.deepEqual(second, first);
  assert.match(first.evidenceSha256, /^[0-9a-f]{64}$/);
});

test("all directions and zero distance are deterministic", () => {
  const cases = [
    ["up", 3, 10, 23],
    ["down", 3, 10, 17],
    ["left", 3, 7, 20],
    ["right", 3, 13, 20],
    ["right", 0, 10, 20],
  ] as const;

  for (const [direction, distance, x, y] of cases) {
    const result = deterministicStep({ ...baseInput, direction, distance });
    assert.deepEqual(result.output.projection, { id: "entity-1", x, y });
    assert.equal(result.output.effects.length, 1);
  }
});

test("invalid shapes and values fail closed", () => {
  for (const value of [null, [], "input", 1, true, () => undefined]) {
    assert.throws(() => deterministicStep(value as never), TypeError);
  }

  const invalid: Array<[unknown, RegExp]> = [
    [{ ...baseInput, tick: -1 }, /tick must be a non-negative safe integer/],
    [{ ...baseInput, tick: 1.5 }, /tick must be a safe integer/],
    [{ ...baseInput, distance: -1 }, /distance must be a non-negative safe integer/],
    [{ ...baseInput, direction: "diagonal" }, /direction must be one of/],
    [{ ...baseInput, entity: { id: "   ", x: 1, y: 2 } }, /entity id/],
    [{ ...baseInput, entity: { ...baseInput.entity, x: Number.NaN } }, /coordinates/],
  ];

  for (const [value, pattern] of invalid) {
    assert.throws(() => deterministicStep(value as DeterministicInput), pattern);
  }
});

test("required fields must be own enumerable data properties", () => {
  for (const key of ["tick", "entity", "direction", "distance"]) {
    const value: Record<string, unknown> = { ...baseInput };
    delete value[key];
    assert.throws(
      () => deterministicStep(value as unknown as DeterministicInput),
      /missing required field/,
    );
  }

  let reads = 0;
  const accessor = {
    ...baseInput,
    entity: { id: "entity-1", get x() { reads += 1; return 10; }, y: 20 },
  };
  assert.throws(() => deterministicStep(accessor), TypeError);
  assert.equal(reads, 0);
});

test("proxies fail without executing traps", () => {
  let traps = 0;
  const proxy = new Proxy(baseInput, {
    get() { traps += 1; throw new Error("trap"); },
    ownKeys() { traps += 1; throw new Error("trap"); },
    getPrototypeOf() { traps += 1; throw new Error("trap"); },
  });
  assert.throws(() => deterministicStep(proxy), TypeError);
  assert.throws(() => stableJsonForTest(proxy), TypeError);
  assert.equal(traps, 0);
});

test("safe integer boundaries are accepted and overflow is rejected", () => {
  const boundary = deterministicStep({
    tick: Number.MAX_SAFE_INTEGER,
    entity: { id: "boundary", x: Number.MAX_SAFE_INTEGER - 1, y: 0 },
    direction: "right",
    distance: 1,
  });
  assert.equal(boundary.output.projection.x, Number.MAX_SAFE_INTEGER);

  for (const [direction, x, y] of [
    ["right", Number.MAX_SAFE_INTEGER, 0],
    ["left", Number.MIN_SAFE_INTEGER, 0],
    ["up", 0, Number.MAX_SAFE_INTEGER],
    ["down", 0, Number.MIN_SAFE_INTEGER],
  ] as const) {
    assert.throws(
      () => deterministicStep({
        ...baseInput,
        entity: { id: "boundary", x, y },
        direction,
        distance: 1,
      }),
      /resulting coordinates must be safe integers/,
    );
  }
});

test("canonicalization sorts object keys, preserves arrays and normalizes -0", () => {
  const value = Object.create(null) as Record<string, unknown>;
  value.z = { b: 2, a: 1 };
  value.a = -0;
  value.list = [{ z: true, a: "value" }, null, 3];

  assert.equal(
    stableJsonForTest(value),
    '{"a":0,"list":[{"a":"value","z":true},null,3],"z":{"a":1,"b":2}}',
  );
});

test("canonicalization rejects unsupported and ambiguous structures", () => {
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BigInt(1),
    undefined,
    Symbol("value"),
    () => undefined,
    new Date(0),
    new Map(),
    Array(1),
    [1, , 2],
    Object.assign([1], { extra: 2 }),
    { nested: undefined },
  ]) {
    assert.throws(() => stableJsonForTest(value), TypeError);
  }

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => stableJsonForTest(cyclic), /cyclic references/);
});

test("frozen input is not mutated and output shares no mutable input objects", () => {
  const input = Object.freeze({
    ...baseInput,
    entity: Object.freeze({ ...baseInput.entity }),
  });
  const before = JSON.stringify(input);
  const result = deterministicStep(input);
  result.output.projection.x = -100;
  result.output.effects[0].from.x = -100;

  assert.equal(JSON.stringify(input), before);
  assert.equal(deterministicStep(input).output.projection.x, 13);
});

test("golden canonical bytes agree with an independent Web Crypto digest", async () => {
  const result = deterministicStep(baseInput);
  const canonical =
    '{"effects":[{"entityId":"entity-1","from":{"x":10,"y":20},"tick":7,"to":{"x":13,"y":20},"type":"entity-moved"}],"projection":{"id":"entity-1","x":13,"y":20},"tick":7}';

  assert.equal(stableJsonForTest(result.output), canonical);

  const independent = Buffer.from(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)),
  ).toString("hex");
  assert.equal(result.evidenceSha256, independent);

  const nodeDigest = createHash("sha256").update(canonical, "utf8").digest("hex");
  assert.equal(nodeDigest, independent);
});

test("100 repeated executions remain byte-identical", () => {
  const expected = deterministicStep(baseInput);
  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(deterministicStep(baseInput), expected);
  }
});
