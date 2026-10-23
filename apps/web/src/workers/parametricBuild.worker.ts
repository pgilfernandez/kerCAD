/// <reference lib="webworker" />

import { parametricBuildTransferables, type ParametricBuildWorkerRequest, type ParametricBuildWorkerResponse } from "@/lib/parametricBuildWorker";
import { buildParametricModel, buildParametricOperationContext } from "@/lib/parametricKernel";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ParametricBuildWorkerRequest>) => {
  const request = event.data;
  const build = request.type === "build-model"
    ? buildParametricModel(request.document, true, request.reportProgress ? (progress) => {
      workerScope.postMessage({ type: "build-progress", requestId: request.requestId, progress } satisfies ParametricBuildWorkerResponse);
    } : undefined)
    : buildParametricOperationContext(request.document, request.featureId ?? "");
  void build.then((result) => {
    const response: ParametricBuildWorkerResponse = request.type === "build-model"
      ? { type: "model-built", requestId: request.requestId, result: result as Awaited<ReturnType<typeof buildParametricModel>> }
      : { type: "context-built", requestId: request.requestId, result: result as Awaited<ReturnType<typeof buildParametricOperationContext>> };
    workerScope.postMessage(response, { transfer: parametricBuildTransferables(response.result) });
  }).catch((error: unknown) => {
    const response: ParametricBuildWorkerResponse = {
      type: "build-error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  });
};
