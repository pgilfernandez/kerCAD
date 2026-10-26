import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DELETE, GET, POST, PUT } from "@/app/api/kercad-shared-projects/route";
import { projectAssetFromBytes } from "@/lib/projectAssets";
import { createStarterDocument } from "@/lib/parametricDocument";
import { createEmptyDocument } from "@/lib/parametricDocument";
import { exportKercadProject, importKercadProject } from "@/lib/kercadProject";

let root: string;
const url = "http://localhost/api/kercad-shared-projects?fileName=Lesson.kercad";
async function save(name: string, revision?: string, author?: string) {
  const document = createEmptyDocument();
  document.name = name;
  const bytes = await exportKercadProject(document);
  return POST(new Request(url, { method: "POST", body: new Uint8Array(bytes), headers: { ...(revision ? { "if-match": revision } : { "if-none-match": "*" }), ...(author ? { "x-kercad-author": encodeURIComponent(author) } : {}) } }));
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "kercad-shared-test-"));
  vi.stubEnv("KERCAD_SHARED_PROJECTS_DIR", root);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("kerCAD shared library", () => {
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
    const bytes = await exportKercadProject(document, [asset]);
    expect((await POST(new Request(url, { method: "POST", body: new Uint8Array(bytes) }))).status).toBe(201);
    const restored = await importKercadProject(await (await GET(new Request(url))).arrayBuffer());
    expect(restored.document.features).toMatchObject(document.features);
    expect(restored.assets[0].bytes).toEqual(asset.bytes);
  });
  it("disables sharing without configuration and supports the legacy Docker directory", async () => {
    vi.stubEnv("KERCAD_SHARED_PROJECTS_DIR", "");
    expect((await (await GET(new Request(url))).json()).enabled).toBe(false);
    vi.stubEnv("KERCAD_SHARED_PROJECTS_DIR", undefined);
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
    expect((await importKercadProject(await a.arrayBuffer())).document.name).toBe("Initial");
    expect((await save("Browser A", revision)).status).toBe(200);
    expect((await save("Browser B", b.headers.get("etag")!)).status).toBe(409);
    expect((await importKercadProject(await readFile(path.join(root, "Lesson.kercad")))).document.name).toBe("Browser A");
    expect((await (await GET(new Request(url.split("?")[0]))).json()).projects).toHaveLength(1);
  });
  it("allows only one concurrent writer for a revision", async () => {
    const response = await save("Initial");
    const results = await Promise.all([save("A", response.headers.get("etag")!), save("B", response.headers.get("etag")!)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it("does not delete another request's lock", async () => {
    const lock = path.join(root, "Lesson.kercad.lock");
    await writeFile(lock, "owner");
    expect((await save("Contender")).status).toBe(409);
    expect(await readFile(lock, "utf8")).toBe("owner");
  });
  it("rejects invalid packages and unsafe file names", async () => {
    expect((await POST(new Request(url, { method: "POST", body: "invalid" }))).status).toBe(400);
    expect((await GET(new Request(url.replace("Lesson.kercad", "..%2Fsecret.kercad")))).status).toBe(400);
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
    await writeFile(path.join(root, "Other.kercad"), "unrelated");
    expect((await remove(latest.headers.get("etag")!)).status).toBe(204);
    expect((await GET(new Request(url))).status).toBe(404);
    expect(await readdir(path.join(root, ".authors"))).toEqual([]);
    expect(await readFile(path.join(root, "Other.kercad"), "utf8")).toBe("unrelated");
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
    const lock = path.join(root, "Lesson.kercad.lock");
    await writeFile(lock, "writer");
    expect((await remove(revision)).status).toBe(409);
    expect(await readFile(lock, "utf8")).toBe("writer");
    expect((await remove(revision, url.replace("Lesson.kercad", "..%2Fsecret.kercad"))).status).toBe(400);
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


describe("shared project thumbnails", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const upload = (revision: string, bytes = jpeg) => PUT(new Request(url, { method: "PUT", headers: { "content-type": "image/jpeg", "if-match": revision }, body: bytes }));
  it("serves only the matching revision and removes images when the project is deleted", async () => {
    const first = await save("Initial");
    const revision = first.headers.get("etag")!;
    expect((await upload(revision)).status).toBe(204);
    const listing = await (await GET(new Request(url.split("?")[0]))).json();
    const preview = listing.projects[0].thumbnailUrl;
    expect(preview).toContain("thumbnail=");
    const response = await GET(new Request(`http://localhost${preview}`));
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
    const changed = await save("Changed", revision);
    expect((await upload(revision)).status).toBe(409);
    expect((await GET(new Request(`http://localhost${preview}`))).status).toBe(404);
    expect((await (await GET(new Request(url.split("?")[0]))).json()).projects[0].thumbnailUrl).toBeUndefined();
    expect((await DELETE(new Request(url, { method: "DELETE", headers: { "if-match": changed.headers.get("etag")! } }))).status).toBe(204);
    expect(await readdir(path.join(root, ".thumbnails"))).toEqual([]);
  });
  it("rejects malformed and oversized images and does not remove another writer's lock", async () => {
    const revision = (await save("Initial")).headers.get("etag")!;
    expect((await upload(revision, new Uint8Array([1, 2]))).status).toBe(400);
    expect((await upload(revision, new Uint8Array(1024 * 1024 + 1))).status).toBe(413);
    const lock = path.join(root, "Lesson.kercad.lock");
    await writeFile(lock, "owner");
    expect((await upload(revision)).status).toBe(409);
    expect(await readFile(lock, "utf8")).toBe("owner");
  });
});
