import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DELETE, GET, POST } from "@/app/api/educad-shared-projects/route";
import { projectAssetFromBytes } from "@/lib/projectAssets";
import { createStarterDocument } from "@/lib/parametricDocument";
import { createEmptyDocument } from "@/lib/parametricDocument";
import { exportEducadProject, importEducadProject } from "@/lib/educadProject";

let root: string;
const url = "http://localhost/api/educad-shared-projects?fileName=Lesson.educad";
async function save(name: string, revision?: string, author?: string) {
  const document = createEmptyDocument();
  document.name = name;
  const bytes = await exportEducadProject(document);
  return POST(new Request(url, { method: "POST", body: new Uint8Array(bytes), headers: { ...(revision ? { "if-match": revision } : { "if-none-match": "*" }), ...(author ? { "x-educad-author": encodeURIComponent(author) } : {}) } }));
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "educad-shared-test-"));
  vi.stubEnv("EDUCAD_SHARED_PROJECTS_DIR", root);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("eduCAD shared library", () => {
  it("lists the last author and timestamp, and keeps attribution on conflicts", async () => {
    const first = await save("Original", undefined, "María López");
    const revision = first.headers.get("etag")!;
    const second = await save("Edited", revision, "Álvaro");
    expect(second.status).toBe(200);
    expect((await save("Stale", revision, "Other author")).status).toBe(409);
    const listing = await (await GET(new Request(url.split("?")[0]))).json();
    expect(listing.projects[0]).toMatchObject({ updatedBy: "Álvaro", updatedAt: expect.any(Number) });
  });
  it("rejects oversized author names without writing a project", async () => {
    expect((await save("Invalid author", undefined, "a".repeat(81))).status).toBe(400);
  });
  it("preserves a real operation history and packaged source assets", async () => {
    const document = createStarterDocument();
    const asset = await projectAssetFromBytes("profile.svg", "svg", new TextEncoder().encode("<svg/>"));
    const bytes = await exportEducadProject(document, [asset]);
    expect((await POST(new Request(url, { method: "POST", body: new Uint8Array(bytes) }))).status).toBe(201);
    const restored = await importEducadProject(await (await GET(new Request(url))).arrayBuffer());
    expect(restored.document.features).toMatchObject(document.features);
    expect(restored.assets[0].bytes).toEqual(asset.bytes);
  });
  it("disables sharing without configuration and supports the legacy Docker directory", async () => {
    vi.stubEnv("EDUCAD_SHARED_PROJECTS_DIR", "");
    expect((await (await GET(new Request(url))).json()).enabled).toBe(false);
    vi.stubEnv("EDUCAD_SHARED_PROJECTS_DIR", undefined);
    vi.stubEnv("SKETCHFORGE_SHARED_PROJECTS_DIR", root);
    expect((await save("Legacy volume")).status).toBe(201);
  });
  it("rejects cross-origin writes and oversized declared bodies", async () => {
    expect((await POST(new Request(url, { method: "POST", body: "bad", headers: { origin: "http://elsewhere.test" } }))).status).toBe(403);
    expect((await POST(new Request(url, { method: "POST", body: "bad", headers: { "content-length": String(257 * 1024 * 1024) } }))).status).toBe(413);
  });
  it("round trips a project and rejects a stale second browser without changing stored data", async () => {
    expect((await save("Initial")).status).toBe(201);
    const a = await GET(new Request(url));
    const b = await GET(new Request(url));
    const revision = a.headers.get("etag")!;
    expect(b.headers.get("etag")).toBe(revision);
    expect((await importEducadProject(await a.arrayBuffer())).document.name).toBe("Initial");
    expect((await save("Browser A", revision)).status).toBe(200);
    expect((await save("Browser B", b.headers.get("etag")!)).status).toBe(409);
    expect((await importEducadProject(await readFile(path.join(root, "Lesson.educad")))).document.name).toBe("Browser A");
    expect((await (await GET(new Request(url.split("?")[0]))).json()).projects).toHaveLength(1);
  });
  it("allows only one concurrent writer for a revision", async () => {
    const response = await save("Initial");
    const results = await Promise.all([save("A", response.headers.get("etag")!), save("B", response.headers.get("etag")!)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it("does not delete another request's lock", async () => {
    const lock = path.join(root, "Lesson.educad.lock");
    await writeFile(lock, "owner");
    expect((await save("Contender")).status).toBe(409);
    expect(await readFile(lock, "utf8")).toBe("owner");
  });
  it("rejects invalid packages and unsafe file names", async () => {
    expect((await POST(new Request(url, { method: "POST", body: "invalid" }))).status).toBe(400);
    expect((await GET(new Request(url.replace("Lesson.educad", "..%2Fsecret.educad")))).status).toBe(400);
  });
  it("never overwrites an existing project without its revision", async () => {
    await save("First");
    expect((await save("Second")).status).toBe(409);
  });
});


describe("deleting shared projects", () => {
  const remove = (revision?: string, target = url) => DELETE(new Request(target, { method: "DELETE", headers: revision ? { "if-match": revision } : {} }));
  it("deletes the matched revision and its attribution, leaving other projects untouched", async () => {
    const first = await save("Initial", undefined, "Author");
    const latest = await save("Updated", first.headers.get("etag")!, "Second author");
    await writeFile(path.join(root, "Other.educad"), "unrelated");
    expect((await remove(latest.headers.get("etag")!)).status).toBe(204);
    expect((await GET(new Request(url))).status).toBe(404);
    expect(await readdir(path.join(root, ".authors"))).toEqual([]);
    expect(await readFile(path.join(root, "Other.educad"), "utf8")).toBe("unrelated");
  });
  it("rejects missing and stale revisions without deleting the file", async () => {
    const first = await save("Initial");
    await save("Updated", first.headers.get("etag")!);
    expect((await remove()).status).toBe(428);
    expect((await remove(first.headers.get("etag")!)).status).toBe(409);
    expect((await GET(new Request(url))).status).toBe(200);
  });
  it("preserves a writer's lock and rejects unsafe paths and cross-origin deletes", async () => {
    const saved = await save("Initial");
    const revision = saved.headers.get("etag")!;
    const lock = path.join(root, "Lesson.educad.lock");
    await writeFile(lock, "writer");
    expect((await remove(revision)).status).toBe(409);
    expect(await readFile(lock, "utf8")).toBe("writer");
    expect((await remove(revision, url.replace("Lesson.educad", "..%2Fsecret.educad"))).status).toBe(400);
    expect((await DELETE(new Request(url, { method: "DELETE", headers: { origin: "https://elsewhere.test", "if-match": revision } }))).status).toBe(403);
  });
  it("reports missing projects and serializes deletion against saving", async () => {
    expect((await remove("missing" )).status).toBe(404);
    const initial = await save("Initial");
    const revision = initial.headers.get("etag")!;
    const results = await Promise.all([remove(revision), save("Updated", revision)]);
    expect(results.filter(response => response.ok)).toHaveLength(1);
    expect(results.filter(response => response.status === 409)).toHaveLength(1);
  });
});
