import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("explicit identity/time boundary", () => {
  it("prevents reintroduction of implicit randomness and clocks into identity and retry logic", () => {
    const paths = ["client/src/lib/ledger.ts", "client/src/lib/companionLearning.ts", "client/src/lib/companionFrameCapture.ts", "server/_core/retryPolicy.ts", "server/rewardReceiptIdentity.ts", "shared/npcSnapshotProtocol.ts", "client/src/lib/visibleCanvasCapture.ts", "client/src/lib/companionWorldInputs.ts"];
    const forbidden: string[] = [];
    for (const path of paths) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ["Math.random", "Date.now", "performance.now", "crypto.randomUUID"].includes(node.expression.getText(source))) forbidden.push(`${path}:${node.expression.getText(source)}`);
        if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) forbidden.push(`${path}:implicit Date`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(forbidden).toEqual([]);
  });
});
