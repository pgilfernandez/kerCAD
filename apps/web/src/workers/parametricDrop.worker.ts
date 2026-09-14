/// <reference lib="webworker" />
import { parametricDropToWorkplaneDeltas } from "@/lib/parametricKernel";
import type { ParametricDocument } from "@/types/parametric";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<{ document: ParametricDocument; selection: Array<{ id: string; kind: "object" | "feature" }> }>) => {
  void parametricDropToWorkplaneDeltas(event.data.document, event.data.selection)
    .then(deltas => scope.postMessage({ deltas }))
    .catch(error => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }));
};
