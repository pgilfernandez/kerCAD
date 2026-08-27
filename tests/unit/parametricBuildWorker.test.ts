import { describe, expect, it, vi } from "vitest";
import { createStarterDocument } from "@/lib/parametricDocument";
import { ParametricBuildWorkerClient, parametricBuildTransferables, type ParametricBuildWorkerResponse } from "@/lib/parametricBuildWorker";
import type { BuildResult, RenderMesh } from "@/types/parametric";

function mesh(): RenderMesh {
  return {
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 0, 1]),
    indices: new Uint32Array([0]),
    edges: new Float32Array([0, 0, 0]),
    metrics: { width: 0, depth: 0, height: 0, volume: 0 },
  };
}

function buildResult(): BuildResult {
  return { mesh: mesh(), objectRecords: [], operationContext: null, completedFeatureIds: [], warning: null };
}

function objectRecord(objectId: string, x: number) {
  const recordMesh = mesh();
  recordMesh.positions[0] = x;
  return {
    objectId,
    renderId: `object:${objectId}`,
    geometryFingerprint: `geometry:${objectId}:${x}`,
    color: "#fff",
    worldTransform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: recordMesh,
  } satisfies BuildResult["objectRecords"][number];
}

class FakeWorker {
  onmessage: ((event: MessageEvent<ParametricBuildWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe("parametric build worker client", () => {
  it("publishes only the active version and terminates an obsolete build", async () => {
    const workers: FakeWorker[] = [];
    const client = new ParametricBuildWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const first = client.buildModel(createStarterDocument(1));
    const second = client.buildModel(createStarterDocument(2));
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    const secondRequest = workers[1].postMessage.mock.calls[0][0] as { requestId: number };
    workers[1].onmessage?.({ data: { type: "model-built", requestId: secondRequest.requestId, result: buildResult() } } as MessageEvent<ParametricBuildWorkerResponse>);
    await expect(second).resolves.toMatchObject({ warning: null });
  });

  it("ignores stale responses with a different version", async () => {
    const worker = new FakeWorker();
    const client = new ParametricBuildWorkerClient(() => worker);
    const pending = client.buildModel(createStarterDocument(1));
    const request = worker.postMessage.mock.calls[0][0] as { requestId: number };
    worker.onmessage?.({ data: { type: "model-built", requestId: request.requestId + 1, result: buildResult() } } as MessageEvent<ParametricBuildWorkerResponse>);
    let settled = false;
    void pending.finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.onmessage?.({ data: { type: "model-built", requestId: request.requestId, result: buildResult() } } as MessageEvent<ParametricBuildWorkerResponse>);
    await expect(pending).resolves.toBeTruthy();
  });

  it("transfers every mesh buffer without duplicates", () => {
    const result = buildResult();
    result.objectRecords.push({
      objectId: "object-1",
      renderId: "object:object-1",
      geometryFingerprint: "geometry-1",
      color: "#fff",
      worldTransform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      mesh: result.mesh!,
    });
    expect(parametricBuildTransferables(result)).toHaveLength(4);
  });

  it("merges unchanged object meshes from incremental worker results", async () => {
    const worker = new FakeWorker();
    const client = new ParametricBuildWorkerClient(() => worker);
    const firstPending = client.buildModel(createStarterDocument(1));
    const firstRequest = worker.postMessage.mock.calls[0][0] as { requestId: number };
    const first = buildResult();
    first.objectRecords = [objectRecord("object-a", 1), objectRecord("object-b", 2)];
    first.renderDelta = {
      reusedObjectIds: [],
      activeObjects: first.objectRecords.map(({ mesh: _mesh, ...metadata }) => metadata),
    };
    worker.onmessage?.({ data: { type: "model-built", requestId: firstRequest.requestId, result: first } } as MessageEvent<ParametricBuildWorkerResponse>);
    const firstResult = await firstPending;

    const secondPending = client.buildModel(createStarterDocument(2));
    const secondRequest = worker.postMessage.mock.calls[1][0] as { requestId: number };
    const changed = objectRecord("object-b", 4);
    const second = buildResult();
    second.objectRecords = [changed];
    second.renderDelta = {
      reusedObjectIds: ["object-a"],
      activeObjects: [
        { ...firstResult.objectRecords[0], mesh: undefined },
        { ...changed, mesh: undefined },
      ].map(({ mesh: _mesh, ...metadata }) => metadata),
    };
    worker.onmessage?.({ data: { type: "model-built", requestId: secondRequest.requestId, result: second } } as MessageEvent<ParametricBuildWorkerResponse>);

    const result = await secondPending;
    expect(result.objectRecords.map((record) => [record.objectId, record.mesh.positions[0]])).toEqual([
      ["object-a", 1],
      ["object-b", 4],
    ]);
    expect(result.mesh?.positions).toEqual(new Float32Array([1, 0, 0, 4, 0, 0]));
    expect(result.renderDelta).toBeUndefined();
  });
});
