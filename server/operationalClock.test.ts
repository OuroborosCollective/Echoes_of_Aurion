import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  deadlineAfter,
  fixedOperationalClock,
  operationalDate,
  operationalNow,
} from "../shared/operationalClock";

describe("explicit operational time boundary", () => {
  it("replays a recorded timestamp while every implicit host read is unavailable", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw Error("unexpected host clock");
    });
    try {
      const clock = fixedOperationalClock(1_800_000_000_000);
      for (let replay = 0; replay < 10; replay++) {
        expect(operationalNow(clock)).toBe(1_800_000_000_000);
        expect(deadlineAfter(operationalNow(clock), 600_000)).toBe(
          1_800_000_600_000
        );
        expect(operationalDate(clock).getTime()).toBe(1_800_000_000_000);
      }
    } finally {
      now.mockRestore();
    }
  });
  it("rejects invalid samples, durations and date-range overflow before a deadline is created", () => {
    for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER])
      expect(() => operationalNow({ now: () => value })).toThrow(
        "OPERATIONAL_TIME_INVALID"
      );
    for (const value of [-1, NaN, 0.5, Infinity])
      expect(() => deadlineAfter(1, value)).toThrow();
    expect(() => deadlineAfter(8_640_000_000_000_000, 1)).toThrow();
  });
  it("keeps ambient randomness and clock references out of application logic", () => {
    const violations: string[] = [];
    const scan = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scan(file);
          continue;
        }
        if (
          !/\.tsx?$/.test(file) ||
          /\.(test|spec)\./.test(file) ||
          file === "shared/operationalClock.ts"
        )
          continue;
        const source = ts.createSourceFile(
          file,
          readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );
        const visit = (node: ts.Node) => {
          if (
            ts.isPropertyAccessExpression(node) &&
            ["Math.random", "Date.now"].includes(node.getText(source))
          )
            violations.push(`${file}:${node.getText(source)}`);
          if (
            ts.isElementAccessExpression(node) &&
            ts.isStringLiteral(node.argumentExpression) &&
            ((node.expression.getText(source) === "Math" &&
              node.argumentExpression.text === "random") ||
              (node.expression.getText(source) === "Date" &&
                node.argumentExpression.text === "now"))
          )
            violations.push(`${file}:ambient alias`);
          if (
            (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
            node.expression.getText(source) === "Date" &&
            !node.arguments?.length
          )
            violations.push(`${file}:implicit Date`);
          if (
            file.startsWith("client/src/xaurion/") &&
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text.endsWith("operationalClock")
          )
            violations.push(`${file}:simulation imports host clock`);
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    for (const directory of ["client/src", "server", "shared"]) scan(directory);
    expect(violations).toEqual([]);
  });
});
