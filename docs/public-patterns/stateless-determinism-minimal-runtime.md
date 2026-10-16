# Stateless Determinism — Minimal Runtime Pattern

A small public TypeScript pattern for deterministic runtime logic.

> The same explicit input should produce the same explicit output without hidden runtime state.

This intentionally tiny example is not production code from OuroborosCollective; it illustrates the architecture without exposing application internals.

## Overview

The pattern accepts a complete movement input and returns:

- An updated entity projection.
- One data-only `entity-moved` effect.
- A lowercase hexadecimal SHA-256 digest of the canonical output.

It reads no clocks, randomness, mutable global state, network responses, caches or unspecified execution order, making it suitable for replayable calculations, tests, comparisons and verification at a runtime boundary where another component may later execute the described effects.

The implementation uses safe integer coordinates and a local canonicalization helper. It does not provide persistence, concurrency control, effect delivery, cryptographic authenticity or full RFC 8785 interoperability.

## Quick Start

Provide a complete input, call `deterministicStep`, inspect the projection, and independently verify the returned digest:

```ts
const result = deterministicStep({
  tick: 7,
  entity: { id: "entity-1", x: 10, y: 20 },
  direction: "right",
  distance: 3,
});

console.log(result.output.projection);
// { id: "entity-1", x: 13, y: 20 }

const verifiedDigest = createHash("sha256")
  .update(stableJsonForTest(result.output), "utf8")
  .digest("hex");

if (verifiedDigest !== result.evidenceSha256) {
  throw new Error("digest verification failed");
}
```

The projection is deterministic for the same input, and the verification flow recomputes the SHA-256 digest from the canonical output.

## Executable reference bundle

The repository also carries an executable copy of this public pattern under `examples/stateless-determinism/`:

- `deterministic-step.ts` — standalone implementation.
- `deterministic-step.test.ts` — deterministic regression suite, including replay, overflow, proxy/accessor rejection and independent Web Crypto digest verification.
- `demo.ts` — minimal independent digest demo.
- `scripts/export-stateless-determinism-gist.mjs` — exports the canonical page and executable files into a new local directory plus a `gist-create.json` payload. It does **not** publish a Gist.

The bundle is intentionally source-controlled beside the documentation so GitHub, GitBook and any later Gist distribution can all point back to one reviewable repository revision.

## Contract

### Accepted input

```ts
export type Direction = "up" | "down" | "left" | "right";

export interface EntityInput {
  id: string;
  x: number;
  y: number;
}

export interface DeterministicInput {
  tick: number;
  entity: EntityInput;
  direction: Direction;
  distance: number;
}
```

`deterministicStep` accepts a non-null, non-array object with:

- `tick`: non-negative JavaScript safe integer.
- `entity.id`: non-empty string containing at least one non-whitespace character.
- `entity.x` and `entity.y`: JavaScript safe integers.
- `direction`: `"up"`, `"down"`, `"left"`, or `"right"`.
- `distance`: non-negative JavaScript safe integer.

The resulting coordinates must also be safe integers.

### Returned output

```ts
export interface Position {
  x: number;
  y: number;
}

export interface EntityProjection extends Position {
  id: string;
}

export interface EntityMovedEffect {
  type: "entity-moved";
  entityId: string;
  from: Position;
  to: Position;
  tick: number;
}

export interface CanonicalOutput {
  tick: number;
  projection: EntityProjection;
  effects: [EntityMovedEffect];
}

export interface DeterministicResult {
  output: CanonicalOutput;
  evidenceSha256: string;
}
```

On success:

- `output.tick` preserves the validated input tick.
- `output.projection` contains the entity identifier and resulting coordinates.
- `output.effects` contains exactly one `entity-moved` data object.
- `evidenceSha256` is a lowercase hexadecimal SHA-256 digest of `stableJsonForTest(output)`.

### Determinism invariant

For every input accepted by `validateInput`, identical executions produce deeply equal outputs and identical digests:

```text
deepEqual(canonicalOutput(step(x)), canonicalOutput(step(x)))
digest(canonicalOutput(step(x))) === digest(canonicalOutput(step(x)))
```

### Errors

`deterministicStep` throws before producing a result when:

- The top-level input is null, an array or not an object: `TypeError`.
- `entity` is null, an array or not an object: `TypeError`.
- A required field is missing or invalid: `Error`.
- `tick` or `distance` is negative or not a safe integer: `Error`.
- Coordinates are not safe integers: `Error`.
- The entity identifier is empty or whitespace-only: `Error`.
- The direction is unsupported: `Error`.
- Movement produces an unsafe coordinate: `Error`.

`stableJsonForTest` throws `TypeError` for non-finite numbers, `bigint`, functions, symbols, `undefined`, non-plain objects or cyclic references.

## Implementation

### Validation

```ts
function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertSafeInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
}

function assertEntityId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim().length === 0
  ) {
    throw new Error("entity id must be a non-empty string");
  }
}

function assertDirection(value: unknown): asserts value is Direction {
  if (value !== "up" && value !== "down" && value !== "left" && value !== "right") {
    throw new Error("direction must be one of: up, down, left, right");
  }
}

function validateInput(input: unknown): asserts input is DeterministicInput {
  assertRecord(input, "input");
  assertSafeInteger(input.tick, "tick");

  if (input.tick < 0) {
    throw new Error("tick must be a non-negative safe integer");
  }

  assertRecord(input.entity, "entity");
  assertEntityId(input.entity.id);
  assertSafeInteger(input.entity.x, "coordinates");
  assertSafeInteger(input.entity.y, "coordinates");
  assertSafeInteger(input.distance, "distance");
  assertDirection(input.direction);

  if (input.distance < 0) {
    throw new Error("distance must be a non-negative safe integer");
  }
}
```

### Movement and output

```ts
function directionDelta(direction: Direction, distance: number): { dx: number; dy: number } {
  switch (direction) {
    case "up":
      return { dx: 0, dy: distance };
    case "down":
      return { dx: 0, dy: -distance };
    case "left":
      return { dx: -distance, dy: 0 };
    case "right":
      return { dx: distance, dy: 0 };
  }
}

function constructOutput(input: DeterministicInput): CanonicalOutput {
  const { dx, dy } = directionDelta(input.direction, input.distance);

  const from = {
    x: input.entity.x,
    y: input.entity.y,
  };

  const to = {
    x: from.x + dx,
    y: from.y + dy,
  };

  if (!Number.isSafeInteger(to.x) || !Number.isSafeInteger(to.y)) {
    throw new Error("resulting coordinates must be safe integers");
  }

  return {
    tick: input.tick,
    projection: {
      id: input.entity.id,
      x: to.x,
      y: to.y,
    },
    effects: [
      {
        type: "entity-moved",
        entityId: input.entity.id,
        from,
        to,
        tick: input.tick,
      },
    ],
  };
}
```

### Canonicalization and digest

```ts
function canonicalJson(value: CanonicalOutput): string {
  return stableJsonForTest(value);
}

export function stableJsonForTest(value: unknown): string {
  const seen = new WeakSet<object>();

  function serialize(current: unknown): string {
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      return JSON.stringify(current);
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError("canonical JSON accepts only finite numbers");
      }

      if (Object.is(current, -0)) {
        return "0";
      }

      return JSON.stringify(current);
    }

    if (typeof current !== "object") {
      throw new TypeError("value is not representable as canonical JSON");
    }

    if (seen.has(current)) {
      throw new TypeError("cyclic references are not representable as canonical JSON");
    }

    seen.add(current);

    try {
      if (Array.isArray(current)) {
        return `[${current.map(serialize).join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("value is not representable as canonical JSON");
      }

      const record = current as Record<string, unknown>;
      const keys = Object.keys(record).sort();

      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
        .join(",")}}`;
    } finally {
      seen.delete(current);
    }
  }

  return serialize(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function deterministicStep(
  input: DeterministicInput,
): DeterministicResult {
  validateInput(input);

  const output = constructOutput(input);

  return {
    output,
    evidenceSha256: sha256(canonicalJson(output)),
  };
}
```

`stableJsonForTest` is a local, test-oriented helper for this example. It recursively sorts object keys, preserves array order, rejects unsupported values and cycles, accepts only plain objects, arrays, strings, booleans, `null` and finite JavaScript numbers, and normalizes negative zero to `0`.

These rules define this helper's local output, not general JSON or RFC 8785 conformance. It delegates finite-number rendering and string escaping to JavaScript `JSON.stringify`, while the application schema further restricts numbers to safe integers. It therefore does not independently implement or verify every RFC 8785 requirement, including the specified number and string serialization behavior and the broader JSON value domain.

For cross-implementation interoperability, use a tested RFC 8785 JCS implementation and define the same schema, version, accepted value domain, number and string handling, encoding and canonicalization rules for every producer and verifier. Do not compare this helper's output with an RFC 8785 implementation without testing the exact overlapping domain and byte-for-byte behavior.

## Usage

A caller provides a complete input, inspects the projection and effects, and independently recomputes the digest:

```ts
import {
  deterministicStep,
  stableJsonForTest,
  type DeterministicInput,
} from "./deterministic-step.js";
import { createHash } from "node:crypto";

const input: DeterministicInput = {
  tick: 7,
  entity: { id: "entity-1", x: 10, y: 20 },
  direction: "right",
  distance: 3,
};

const result = deterministicStep(input);

console.log(result.output.projection);
// { id: "entity-1", x: 13, y: 20 }

console.log(result.output.effects);
// [{ type: "entity-moved", entityId: "entity-1", ... }]

const verifiedDigest = createHash("sha256")
  .update(stableJsonForTest(result.output), "utf8")
  .digest("hex");

if (verifiedDigest !== result.evidenceSha256) {
  throw new Error("digest verification failed");
}

console.log(result.evidenceSha256);
```

Returned effects are descriptions only. A separate runtime boundary may execute them.

## Tests

The tests are organized by the behavior they validate rather than repeating the same assertions across a checklist.

### Validation

Verify that invalid top-level values and entity shapes throw `TypeError`, while missing or invalid fields throw the documented `Error` messages. Cover fractional, non-finite, unsafe and negative numbers, unsupported directions, and empty or whitespace-only identifiers.

```ts
test("invalid shapes and values are rejected", () => {
  for (const value of [null, [], "input", 1, true, () => undefined]) {
    assert.throws(() => deterministicStep(value as never), TypeError);
  }

  for (const entity of [null, [], "entity", 1, true]) {
    assert.throws(
      () =>
        deterministicStep({
          ...baseInput,
          entity: entity as DeterministicInput["entity"],
        }),
      /entity must be an object/,
    );
  }

  const invalidCases: Array<[unknown, RegExp]> = [
    [{ ...baseInput, tick: undefined }, /tick must be a safe integer/],
    [{ ...baseInput, tick: 1.5 }, /tick must be a safe integer/],
    [{ ...baseInput, tick: -1 }, /tick must be a non-negative safe integer/],
    [{ ...baseInput, tick: Infinity }, /tick must be a safe integer/],
    [{ ...baseInput, entity: { id: " \t\n", x: 1, y: 2 } }, /entity id must be a non-empty string/],
    [{ ...baseInput, entity: { ...baseInput.entity, x: Number.NaN } }, /coordinates must be a safe integer/],
    [{ ...baseInput, distance: -1 }, /distance must be a non-negative safe integer/],
    [{ ...baseInput, direction: "diagonal" }, /direction must be one of: up, down, left, right/],
  ];

  for (const [input, pattern] of invalidCases) {
    assert.throws(
      () => deterministicStep(input as DeterministicInput),
      pattern,
    );
  }
});
```

### Movement boundaries

Cover all four directions, zero distance, zero coordinates, preserved identifiers and ticks, exactly one effect, accepted safe-integer boundaries, and overflow on both movement axes.

```ts
test("representative movement cases cover every direction and zero distance", () => {
  const cases = [
    ["up", 3, { x: 10, y: 23 }],
    ["down", 3, { x: 10, y: 17 }],
    ["left", 3, { x: 7, y: 20 }],
    ["right", 3, { x: 13, y: 20 }],
    ["right", 0, { x: 10, y: 20 }],
  ] as const;

  for (const [direction, distance, expected] of cases) {
    const result = deterministicStep({
      ...baseInput,
      direction,
      distance,
    });

    assert.deepStrictEqual(result.output.projection, {
      id: "entity-1",
      ...expected,
    });
  }
});

test("safe boundaries are accepted and coordinate overflow is rejected", () => {
  const boundary = deterministicStep({
    tick: 0,
    entity: {
      id: "boundary",
      x: Number.MAX_SAFE_INTEGER - 1,
      y: Number.MIN_SAFE_INTEGER + 1,
    },
    direction: "right",
    distance: 1,
  });

  assert.deepStrictEqual(boundary.output.projection, {
    id: "boundary",
    x: Number.MAX_SAFE_INTEGER,
    y: Number.MIN_SAFE_INTEGER + 1,
  });

  for (const input of [
    {
      ...baseInput,
      entity: { ...baseInput.entity, x: Number.MAX_SAFE_INTEGER },
      direction: "right" as const,
      distance: 1,
    },
    {
      ...baseInput,
      entity: { ...baseInput.entity, y: Number.MIN_SAFE_INTEGER },
      direction: "down" as const,
      distance: 1,
    },
  ]) {
    assert.throws(
      () => deterministicStep(input),
      /resulting coordinates must be safe integers/,
    );
  }
});
```

### Canonicalization

Verify recursive object-key sorting, preserved array order, null-prototype objects, `-0` normalization, and rejection of unsupported values and cyclic references.

```ts
test("canonicalization sorts keys, preserves arrays, supports null prototypes, and normalizes -0", () => {
  const value = Object.create(null) as Record<string, unknown>;
  value.z = { b: 2, a: 1 };
  value.b = 2;
  value.a = -0;
  value.list = [{ z: true, a: "value" }, null, 3];

  assert.equal(
    stableJsonForTest(value),
    '{"a":0,"b":2,"list":[{"a":"value","z":true},null,3],"z":{"a":1,"b":2}}',
  );
});

test("canonicalization rejects unsupported values and cycles", () => {
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BigInt(1),
    undefined,
    Symbol("value"),
    () => undefined,
    new Date(0),
    new Map(),
    new Set(),
  ]) {
    assert.throws(() => stableJsonForTest(value), TypeError);
  }

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;

  assert.throws(
    () => stableJsonForTest(cyclic),
    /cyclic references are not representable as canonical JSON/,
  );
});
```

### Digest verification

Verify determinism with equivalent inputs, confirm the output shape and digest format, recompute SHA-256 independently at the test call site, and confirm that changing an output field changes the digest.

```ts
test("determinism, output shape, and independent digest verification", () => {
  const first = deterministicStep(baseInput);
  const second = deterministicStep({
    ...baseInput,
    entity: { ...baseInput.entity },
  });

  assert.deepStrictEqual(first.output, second.output);
  assert.equal(first.evidenceSha256, second.evidenceSha256);
  assert.deepStrictEqual(first.output.projection, {
    id: "entity-1",
    x: 13,
    y: 20,
  });
  assert.equal(first.output.effects.length, 1);
  assert.equal(first.output.effects[0].type, "entity-moved");

  const verifiedDigest = createHash("sha256")
    .update(stableJsonForTest(first.output), "utf8")
    .digest("hex");

  assert.match(first.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.equal(verifiedDigest, first.evidenceSha256);

  const changedDigest = createHash("sha256")
    .update(
      stableJsonForTest({
        ...first.output,
        tick: first.output.tick + 1,
      }),
      "utf8",
    )
    .digest("hex");

  assert.notEqual(changedDigest, verifiedDigest);
});
```

When testing `stableJson`, export it deliberately or place tests beside the implementation with a test-only wrapper. The suite should verify the declared accepted value domain rather than treating JavaScript serialization behavior as canonicalization. Boundary tests should cover both the smallest accepted values and the largest safe values, while overflow tests should cover both movement axes. Digest tests should recompute the hash through an independent call site rather than merely comparing two calls to the same production helper.

## Limitations

This example intentionally does not provide persistence or recovery, concurrency control, authorization, schema evolution, execution or delivery of returned effects, cryptographic authenticity, or full RFC 8785 interoperability.

The guarantees are scoped as follows:

- Repeatability means the same implementation, rules and explicit input produce the same output again.
- Interoperability additionally requires independent implementations to agree on schema, semantics, canonicalization version, number and string rules, encoding and accepted value domain. This helper is stable only within its declared JavaScript value domain and implementation; its safe-integer restriction, finite-number check, `-0` normalization, JavaScript-based string escaping and rejection of non-plain or unsupported values are local contract choices, not evidence of RFC 8785 conformance. RFC 8785 interoperability requires identical canonical bytes under JCS across a mutually agreed JSON domain; sorting keys alone is insufficient.
- Integrity means detecting changes after a digest or other check is created. A plain SHA-256 digest helps only when the expected digest comes through a trusted channel; an attacker who can replace both value and digest defeats it.
- Authenticity means verifying origin or authorization. A plain digest provides neither identity nor authorization because anyone can recompute it; use a digital signature or keyed MAC with appropriate key management.

Define and version the schema, accepted value domain and canonicalization rules first. Then select verification for the threat model: use this local helper only for the stated test and runtime boundary, use a tested RFC 8785 implementation when cross-implementation JCS interoperability is required, use a trusted digest channel for limited integrity checks, and use signatures or MACs with explicit key distribution, rotation and failure handling when authenticity is required.

## Repository philosophy

```text
Runtime truth > presentation state

explicit input
    ↓
deterministic computation
    ↓
explicit projection
    ↓
effect boundary
    ↓
verification / evidence
```

Small contracts are easier to replay.

Replayable contracts are easier to test.

Testable contracts are easier to trust.

— OuroborosCollective
