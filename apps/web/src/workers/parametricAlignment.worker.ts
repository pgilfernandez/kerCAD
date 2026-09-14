/// <reference lib="webworker" />
import { parametricAlignmentTargets } from "@/lib/parametricKernel";
import type { AlignmentItem } from "@/lib/parametricAlignment";
import type { ParametricDocument } from "@/types/parametric";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<{ document: ParametricDocument; selection: AlignmentItem[] }>) => {
  void parametricAlignmentTargets(event.data.document, event.data.selection)
    .then(targets => scope.postMessage({ targets }))
    .catch(error => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }));
};
