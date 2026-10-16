import { createHash } from "node:crypto";
import { types } from "node:util";

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

function assertRecord(
  value: unknown,
  name: string,
  required: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }

  if (types.isProxy(value)) {
    throw new TypeError(`${name} must not be a proxy`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must be a plain data object`);
  }

  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !property.enumerable || !("value" in property)) {
      throw new TypeError(
        `${name} must contain only enumerable string-keyed data properties`,
      );
    }
  }

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${name} is missing required field: ${key}`);
    }
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
  assertRecord(input, "input", ["tick", "entity", "direction", "distance"]);
  assertSafeInteger(input.tick, "tick");
  if (input.tick < 0) {
    throw new Error("tick must be a non-negative safe integer");
  }

  assertRecord(input.entity, "entity", ["id", "x", "y"]);
  assertEntityId(input.entity.id);
  assertSafeInteger(input.entity.x, "coordinates");
  assertSafeInteger(input.entity.y, "coordinates");
  assertSafeInteger(input.distance, "distance");
  assertDirection(input.direction);

  if (input.distance < 0) {
    throw new Error("distance must be a non-negative safe integer");
  }
}

function directionDelta(direction: Direction, distance: number): Position {
  switch (direction) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: -distance, y: 0 };
    case "right":
      return { x: distance, y: 0 };
  }
}

function constructOutput(input: DeterministicInput): CanonicalOutput {
  const delta = directionDelta(input.direction, input.distance);
  const from = { x: input.entity.x, y: input.entity.y };
  const to = { x: from.x + delta.x, y: from.y + delta.y };

  if (!Number.isSafeInteger(to.x) || !Number.isSafeInteger(to.y)) {
    throw new Error("resulting coordinates must be safe integers");
  }

  return {
    tick: input.tick,
    projection: { id: input.entity.id, x: to.x, y: to.y },
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
      return Object.is(current, -0) ? "0" : JSON.stringify(current);
    }

    if (typeof current !== "object") {
      throw new TypeError("value is not representable as canonical JSON");
    }

    if (types.isProxy(current)) {
      throw new TypeError("canonical JSON does not accept proxies");
    }

    if (seen.has(current)) {
      throw new TypeError("cyclic references are not representable as canonical JSON");
    }

    seen.add(current);
    try {
      if (Array.isArray(current)) {
        if (
          Object.getPrototypeOf(current) !== Array.prototype ||
          Reflect.ownKeys(current).length !== current.length + 1
        ) {
          throw new TypeError("canonical JSON accepts only dense undecorated arrays");
        }

        const items: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const property = Object.getOwnPropertyDescriptor(current, String(index));
          if (!property || !property.enumerable || !("value" in property)) {
            throw new TypeError("canonical JSON accepts only dense data arrays");
          }
          items.push(serialize(property.value));
        }
        return `[${items.join(",")}]`;
      }

      assertRecord(current, "canonical JSON object");
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

export function deterministicStep(input: DeterministicInput): DeterministicResult {
  validateInput(input);
  const output = constructOutput(input);
  return {
    output,
    evidenceSha256: sha256(stableJsonForTest(output)),
  };
}
