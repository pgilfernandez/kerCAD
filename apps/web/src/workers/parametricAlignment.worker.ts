/// <reference lib="webworker" />
import { parametricAlignmentTargets } from "@/lib/parametricKernel";
import type { AlignmentItem } from "@/lib/parametricAlignment";
import type { ParametricDocument } from "@/types/parametric";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<{ document: ParametricDocument; selection: AlignmentItem[] }>) => {
  void parametricAlignmentTargets(event.data.document, event.data.selection, target => {
    const mesh = target.mesh;
    const transfer = [...new Set([mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer, mesh.edges.buffer])]
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
    scope.postMessage({ target }, transfer);
  })
    .then(() => scope.postMessage({ complete: true }))
    .catch(error => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }));
};
