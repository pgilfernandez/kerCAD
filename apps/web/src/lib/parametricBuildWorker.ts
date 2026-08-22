import type { BuildResult, ParametricDocument } from "@/types/parametric";

export type ParametricBuildWorkerRequest = {
  type: "build-model" | "build-context";
  requestId: number;
  document: ParametricDocument;
  featureId?: string;
};

export type ParametricBuildWorkerResponse =
  | { type: "model-built"; requestId: number; result: BuildResult }
  | { type: "context-built"; requestId: number; result: BuildResult["operationContext"] }
  | { type: "build-error"; requestId: number; message: string };

type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<ParametricBuildWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};

type PendingBuild = {
  requestId: number;
  resolve: (result: BuildResult | BuildResult["operationContext"]) => void;
  reject: (error: Error) => void;
};

function abortError() {
  const error = new Error("La reconstrucción CAD anterior ha sido cancelada.");
  error.name = "AbortError";
  return error;
}

export function parametricBuildTransferables(result: BuildResult | BuildResult["operationContext"]) {
  const buffers = new Set<ArrayBuffer>();
  const addMesh = (mesh: BuildResult["mesh"]) => {
    if (!mesh) return;
    for (const view of [mesh.positions, mesh.normals, mesh.indices, mesh.edges]) {
      if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
    }
  };
  if (result && "objectRecords" in result) {
    addMesh(result.mesh);
    result.objectRecords.forEach((record) => addMesh(record.mesh));
    addMesh(result.operationContext?.mesh ?? null);
    addMesh(result.operationContext?.selectionMesh ?? null);
    addMesh(result.operationContext?.detailMesh ?? null);
  } else {
    addMesh(result?.mesh ?? null);
    addMesh(result?.selectionMesh ?? null);
    addMesh(result?.detailMesh ?? null);
  }
  return [...buffers];
}

export class ParametricBuildWorkerClient {
  private worker: WorkerLike | null = null;
  private pending: PendingBuild | null = null;
  private nextRequestId = 0;

  constructor(private readonly createWorker: () => WorkerLike) {}

  buildModel(document: ParametricDocument): Promise<BuildResult> {
    return this.request({ type: "build-model", document }) as Promise<BuildResult>;
  }

  buildContext(document: ParametricDocument, featureId: string): Promise<BuildResult["operationContext"]> {
    return this.request({ type: "build-context", document, featureId }) as Promise<BuildResult["operationContext"]>;
  }

  cancel() {
    if (!this.pending) return;
    this.pending.reject(abortError());
    this.pending = null;
    this.restartWorker();
  }

  dispose() {
    this.pending?.reject(abortError());
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private request(input: Omit<ParametricBuildWorkerRequest, "requestId">) {
    this.cancel();
    const worker = this.ensureWorker();
    const requestId = ++this.nextRequestId;
    const request = { ...input, requestId } as ParametricBuildWorkerRequest;
    return new Promise<BuildResult | BuildResult["operationContext"]>((resolve, reject) => {
      this.pending = { requestId, resolve, reject };
      worker.postMessage(request);
    });
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => this.failActive(event.message || "El worker CAD ha fallado.");
    worker.onmessageerror = () => this.failActive("El worker CAD devolvió datos no válidos.");
    this.worker = worker;
    return worker;
  }

  private restartWorker() {
    this.worker?.terminate();
    this.worker = null;
  }

  private failActive(message: string) {
    this.pending?.reject(new Error(message));
    this.pending = null;
    this.restartWorker();
  }

  private handleMessage(response: ParametricBuildWorkerResponse) {
    const pending = this.pending;
    if (!pending || response.requestId !== pending.requestId) return;
    this.pending = null;
    if (response.type === "build-error") pending.reject(new Error(response.message));
    else pending.resolve(response.result);
  }
}
