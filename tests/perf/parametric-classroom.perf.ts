import { describe, expect, it } from "vitest";
import { parametricGeometryFingerprint, parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { topologicallySortedParametricFeatures } from "@/lib/parametricDependencyGraph";
import { createParametricClassroomScene } from "../fixtures/parametricClassroomScene";

const BUDGETS_MS = {
  geometryFingerprint: 8,
  allObjectFingerprints: 25,
  dependencySort: 12,
  documentClone: 20,
} as const;

function averageDuration(runs: number, task: () => void) {
  task();
  const started = performance.now();
  for (let run = 0; run < runs; run += 1) task();
  return (performance.now() - started) / runs;
}

describe("parametric classroom interaction budgets", () => {
  it("keeps synchronous document work below the interaction-path budgets", () => {
    const document = createParametricClassroomScene();
    const rows = [
      {
        task: "geometry fingerprint",
        averageMs: averageDuration(100, () => { parametricGeometryFingerprint(document); }),
        budgetMs: BUDGETS_MS.geometryFingerprint,
      },
      {
        task: "all per-object fingerprints",
        averageMs: averageDuration(50, () => {
          for (const object of document.objects) parametricObjectGeometryFingerprint(document, object.id);
        }),
        budgetMs: BUDGETS_MS.allObjectFingerprints,
      },
      {
        task: "dependency sort",
        averageMs: averageDuration(100, () => { topologicallySortedParametricFeatures(document); }),
        budgetMs: BUDGETS_MS.dependencySort,
      },
      {
        task: "document clone",
        averageMs: averageDuration(50, () => { structuredClone(document); }),
        budgetMs: BUDGETS_MS.documentClone,
      },
    ];

    console.table(rows.map((row) => ({ ...row, averageMs: Number(row.averageMs.toFixed(3)) })));
    for (const row of rows) expect(row.averageMs, `${row.task} exceeded ${row.budgetMs} ms`).toBeLessThan(row.budgetMs);
  });
});
