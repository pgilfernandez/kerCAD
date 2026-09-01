import type { BuildResult, ParametricDocument, ParametricObjectRenderRecord, RenderMesh } from "@/types/parametric";

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
  const error = new Error("The previous CAD rebuild was cancelled.");
  error.name = "AbortError";
  return error;
}

function combinedRenderMesh(records: ParametricObjectRenderRecord[]): RenderMesh | null {
  if (records.length === 0) return null;
  const positionLength = records.reduce((total, record) => total + record.mesh.positions.length, 0);
  const normalLength = records.reduce((total, record) => total + record.mesh.normals.length, 0);
  const indexLength = records.reduce((total, record) => total + record.mesh.indices.length, 0);
  const edgeLength = records.reduce((total, record) => total + record.mesh.edges.length, 0);
  const positions = new Float32Array(positionLength);
  const normals = new Float32Array(normalLength);
  const indices = new Uint32Array(indexLength);
  const edges = new Float32Array(edgeLength);
  const faceGroups: NonNullable<RenderMesh["faceGroups"]> = [];
  const edgeGroups: NonNullable<RenderMesh["edgeGroups"]> = [];
  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  let edgeOffset = 0;
  let vertexOffset = 0;
  let faceIdOffset = 0;
  let edgeIdOffset = 0;
  let volume = 0;
  for (const record of records) {
    const mesh = record.mesh;
    positions.set(mesh.positions, positionOffset);
    normals.set(mesh.normals, normalOffset);
    for (let index = 0; index < mesh.indices.length; index += 1) indices[indexOffset + index] = mesh.indices[index] + vertexOffset;
    edges.set(mesh.edges, edgeOffset);
    for (const group of mesh.faceGroups ?? []) faceGroups.push({ ...group, start: group.start + indexOffset, faceId: group.faceId + faceIdOffset });
    for (const group of mesh.edgeGroups ?? []) edgeGroups.push({ ...group, start: group.start + edgeOffset / 3, edgeId: group.edgeId + edgeIdOffset });
    positionOffset += mesh.positions.length;
    normalOffset += mesh.normals.length;
    indexOffset += mesh.indices.length;
    edgeOffset += mesh.edges.length;
    vertexOffset += mesh.positions.length / 3;
    faceIdOffset += Math.max(0, ...(mesh.faceGroups ?? []).map((group) => group.faceId + 1));
    edgeIdOffset += Math.max(0, ...(mesh.edgeGroups ?? []).map((group) => group.edgeId + 1));
    volume += mesh.metrics.volume;
  }
  let xMin = Infinity;
  let yMin = Infinity;
  let zMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  let zMax = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    xMin = Math.min(xMin, positions[index]);
    yMin = Math.min(yMin, positions[index + 1]);
    zMin = Math.min(zMin, positions[index + 2]);
    xMax = Math.max(xMax, positions[index]);
    yMax = Math.max(yMax, positions[index + 1]);
    zMax = Math.max(zMax, positions[index + 2]);
  }
  return {
    positions,
    normals,
    indices,
    edges,
    faceGroups,
    edgeGroups,
    metrics: {
      width: Number.isFinite(xMin) ? xMax - xMin : 0,
      depth: Number.isFinite(yMin) ? yMax - yMin : 0,
      height: Number.isFinite(zMin) ? zMax - zMin : 0,
      volume,
    },
  };
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
  private previousModelResult: BuildResult | null = null;

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
    this.previousModelResult = null;
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
    worker.onmessageerror = () => this.failActive("The CAD worker returned invalid data.");
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
    else if (response.type === "model-built") {
      const result = this.mergeModelDelta(response.result);
      this.previousModelResult = result;
      pending.resolve(result);
    } else pending.resolve(response.result);
  }

  private mergeModelDelta(result: BuildResult): BuildResult {
    if (!result.renderDelta) return result;
    const changedRecords = new Map(result.objectRecords.map((record) => [record.objectId, record]));
    const previousRecords = new Map(this.previousModelResult?.objectRecords.map((record) => [record.objectId, record]) ?? []);
    const reusedObjectIds = new Set(result.renderDelta.reusedObjectIds);
    const objectRecords = result.renderDelta.activeObjects.flatMap((metadata) => {
      const changed = changedRecords.get(metadata.objectId);
      if (changed) return [{ ...changed, ...metadata }];
      const previous = reusedObjectIds.has(metadata.objectId) ? previousRecords.get(metadata.objectId) : undefined;
      return previous ? [{ ...previous, ...metadata }] : [];
    });
    return {
      ...result,
      mesh: combinedRenderMesh(objectRecords),
      objectRecords,
      renderDelta: undefined,
    };
  }
}
