import { acquireSharedProjectLock } from "@/lib/sharedProjectLock";
import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { importEducadProject, EDUCAD_PACKAGE_LIMITS, EDUCAD_PACKAGE_MEDIA_TYPE } from "@/lib/educadProject";

export const runtime = "nodejs";
export const revalidate = false;

const SHARED_PROJECTS_ENV = "EDUCAD_SHARED_PROJECTS_DIR";

type SharedProjectFile = {
  fileName: string;
  name: string;
  updatedAt: number;
  size: number;
  revision: string;
  updatedBy?: string;
  thumbnailUrl?: string;
};

function sharedProjectsDirectory() {
  const configured = (process.env[SHARED_PROJECTS_ENV] ?? process.env.SKETCHFORGE_SHARED_PROJECTS_DIR)?.trim();
  return configured ? path.resolve(configured) : null;
}

function safeProjectFileName(requestedName: string) {
  const withoutExtension = requestedName.replace(/\.educad$/i, "");
  const stem = path.basename(withoutExtension)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 115);
  return `${stem || "Untitled project"}.educad`;
}

function revisionForBytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function projectRecord(fileName: string, stat: { size: number; mtimeMs: number }, revision: string): SharedProjectFile {
  return {
    fileName,
    name: fileName.replace(/\.educad$/i, ""),
    updatedAt: stat.mtimeMs,
    size: stat.size,
    revision,
  };
}

function thumbnailPath(root: string, fileName: string, revision: string) {
  const key = createHash("sha256").update(fileName).digest("hex");
  return path.join(root, ".thumbnails", `${key}-${revision}.jpg`);
}

function authorPath(root: string, fileName: string, revision: string) {
  const key = createHash("sha256").update(fileName).digest("hex");
  return path.join(root, ".authors", `${key}-${revision}.json`);
}

async function readAuthor(root: string, fileName: string, revision: string): Promise<string | undefined> {
  try {
    const metadata = JSON.parse(await fs.readFile(authorPath(root, fileName, revision), "utf8"));
    return typeof metadata.updatedBy === "string" ? metadata.updatedBy : undefined;
  } catch { return undefined; }
}

function unquoteEtag(value: string | null) {
  if (!value) return null;
  return value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "");
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

async function regularFileStat(filePath: string) {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function disabledResponse() {
  return NextResponse.json(
    { enabled: false, projects: [], error: `${SHARED_PROJECTS_ENV} is not configured` },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return disabledResponse();
  try {
    await fs.mkdir(root, { recursive: true });
    const requestUrl = new URL(request.url);
    const requestedFile = requestUrl.searchParams.get("fileName");
    if (requestedFile) {
      const fileName = safeProjectFileName(requestedFile);
      if (fileName !== requestedFile) return NextResponse.json({ error: "Invalid shared project name" }, { status: 400 });
      const filePath = path.join(root, fileName);
      const stat = await regularFileStat(filePath);
      if (!stat) return NextResponse.json({ error: "Shared project was not found" }, { status: 404 });
      const bytes = await fs.readFile(filePath);
      const thumbnailRevision = requestUrl.searchParams.get("thumbnail");
      if (thumbnailRevision !== null) {
        if (thumbnailRevision !== revisionForBytes(bytes)) return new Response(null, { status: 404 });
        const imagePath = thumbnailPath(root, fileName, thumbnailRevision);
        if (!await regularFileStat(imagePath)) return new Response(null, { status: 404 });
        return new Response(await fs.readFile(imagePath), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      return new Response(bytes, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          "Content-Length": String(bytes.byteLength),
          "Content-Type": EDUCAD_PACKAGE_MEDIA_TYPE,
          ETag: `"${revisionForBytes(bytes)}"`,
        },
      });
    }

    const entries = await fs.readdir(root, { withFileTypes: true });
    const projects = await Promise.all(entries
      .filter((entry) => entry.isFile() && /\.educad$/i.test(entry.name))
      .map(async (entry): Promise<SharedProjectFile | null> => {
        const stat = await regularFileStat(path.join(root, entry.name));
        if (!stat) return null;
        const revision = revisionForBytes(await fs.readFile(path.join(root, entry.name)));
        return { ...projectRecord(entry.name, stat, revision), updatedBy: await readAuthor(root, entry.name, revision),
          thumbnailUrl: await regularFileStat(thumbnailPath(root, entry.name, revision)) ? `/api/educad-shared-projects?fileName=${encodeURIComponent(entry.name)}&thumbnail=${revision}` : undefined };
      }));
    return NextResponse.json(
      { enabled: true, projects: projects.filter((entry): entry is SharedProjectFile => Boolean(entry)).sort((a, b) => b.updatedAt - a.updatedAt) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ enabled: true, projects: [], error: error instanceof Error ? error.message : "Could not read shared projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return NextResponse.json({ error: "Shared project storage is disabled" }, { status: 404 });
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Shared projects only accept same-origin saves" }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > EDUCAD_PACKAGE_LIMITS.archiveBytes) {
    return NextResponse.json({ error: ".educad file exceeds the shared storage size limit" }, { status: 413 });
  }

  let lockHandle: Awaited<ReturnType<typeof acquireSharedProjectLock>> | null = null;
  let lockPath = "";
  let temporaryPath = "";
  try {
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > EDUCAD_PACKAGE_LIMITS.archiveBytes) {
            await reader.cancel();
            return NextResponse.json({ error: "Project exceeds the shared storage size limit" }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (bytes.byteLength > EDUCAD_PACKAGE_LIMITS.archiveBytes) return NextResponse.json({ error: ".educad file exceeds the shared storage size limit" }, { status: 413 });
    const rawAuthor = decodeURIComponent(request.headers.get("x-educad-author") ?? "");
    const updatedBy = rawAuthor.trim();
    if (updatedBy.length > 80 || /[\u0000-\u001f\u007f]/.test(updatedBy)) {
      return NextResponse.json({ error: "Author name must contain at most 80 characters and no control characters" }, { status: 400 });
    }
    const summary = await importEducadProject(bytes);
    const requestUrl = new URL(request.url);
    const requestedName = requestUrl.searchParams.get("fileName");
    const fileName = safeProjectFileName(requestedName ?? summary.document.name);
    if (requestedName && requestedName !== fileName) return NextResponse.json({ error: "Invalid shared project name" }, { status: 400 });
    await fs.mkdir(root, { recursive: true });
    const filePath = path.join(root, fileName);
    lockPath = `${filePath}.lock`;
    temporaryPath = path.join(root, `.${fileName}.${randomUUID()}.tmp`);

    try {
      lockHandle = await acquireSharedProjectLock(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return NextResponse.json({ error: "This shared project is currently being saved by someone else" }, { status: 409 });
      }
      throw error;
    }

    const currentStat = await regularFileStat(filePath);
    const currentRevision = currentStat ? revisionForBytes(await fs.readFile(filePath)) : null;
    const expectedRevision = unquoteEtag(request.headers.get("if-match"));
    const createOnly = request.headers.get("if-none-match") === "*";
    if (currentStat && (createOnly || !expectedRevision || expectedRevision !== currentRevision)) {
      return NextResponse.json(
        { error: "The shared project changed after you opened it. Reload it or save under a different name.", currentRevision },
        { status: 409 },
      );
    }
    if (!currentStat && expectedRevision) {
      return NextResponse.json({ error: "The shared project no longer exists. Save it under a different name." }, { status: 409 });
    }

    const temporaryHandle = await fs.open(temporaryPath, "wx");
    try {
      await temporaryHandle.writeFile(bytes);
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    // Store attribution keyed to these exact bytes before publishing the file.
    // Older attribution cannot accidentally describe a different revision.
    await fs.mkdir(path.join(root, ".authors"), { recursive: true });
    await fs.writeFile(authorPath(root, fileName, revisionForBytes(bytes)), JSON.stringify({ updatedBy: updatedBy || undefined }));
    await fs.rename(temporaryPath, filePath);
    temporaryPath = "";
    const savedStat = await fs.stat(filePath);
    const project = projectRecord(fileName, savedStat, revisionForBytes(bytes));
    return NextResponse.json(
      { project: { ...project, name: summary.document.name, updatedBy: updatedBy || undefined } },
      { status: currentStat ? 200 : 201, headers: { "Cache-Control": "no-store", ETag: `"${project.revision}"` } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save shared project" }, { status: 400 });
  } finally {
    if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined);
    await lockHandle?.release();
  }
}

export async function DELETE(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return NextResponse.json({ error: "Shared project storage is disabled" }, { status: 404 });
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Shared projects only accept same-origin deletes" }, { status: 403 });
  const fileName = new URL(request.url).searchParams.get("fileName");
  if (!fileName || safeProjectFileName(fileName) !== fileName) return NextResponse.json({ error: "Invalid shared project name" }, { status: 400 });
  const expectedRevision = unquoteEtag(request.headers.get("if-match"));
  if (!expectedRevision) return NextResponse.json({ error: "A project revision is required to delete" }, { status: 428 });
  const filePath = path.join(root, fileName);
  const lockPath = `${filePath}.lock`;
  let lockHandle: Awaited<ReturnType<typeof acquireSharedProjectLock>> | null = null;
  try {
    try {
      lockHandle = await acquireSharedProjectLock(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return NextResponse.json({ error: "The project is being changed. Refresh the library and try again." }, { status: 409 });
      throw error;
    }
    if (!await regularFileStat(filePath)) return NextResponse.json({ error: "Shared project was not found" }, { status: 404 });
    const currentRevision = revisionForBytes(await fs.readFile(filePath));
    if (expectedRevision !== currentRevision) return NextResponse.json({ error: "The project changed since you loaded the library. Refresh and review it before deleting.", currentRevision }, { status: 409 });
    await fs.unlink(filePath);
    // Attribution cleanup is best effort: a successful deletion must not be
    // reported as failed merely because its optional metadata could not be removed.
    const key = createHash("sha256").update(fileName).digest("hex");
    const metadataDirectory = path.join(root, ".authors");
    const entries = await fs.readdir(metadataDirectory).catch(() => [] as string[]);
    await Promise.all(entries.filter(name => name.startsWith(`${key}-`) && name.endsWith(".json"))
      .map(name => fs.unlink(path.join(metadataDirectory, name)).catch(() => undefined)));
    const previews = await fs.readdir(path.join(root, ".thumbnails")).catch(() => [] as string[]);
    await Promise.all(previews.filter(name => name.startsWith(`${key}-`) && name.endsWith(".jpg"))
      .map(name => fs.unlink(path.join(root, ".thumbnails", name)).catch(() => undefined)));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ error: "Shared project was not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete the shared project. Try again." }, { status: 500 });
  } finally {
    await lockHandle?.release();
  }
}


export async function PUT(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return new Response(null, { status: 404 });
  if (!sameOriginRequest(request)) return new Response(null, { status: 403 });
  const fileName = new URL(request.url).searchParams.get("fileName");
  if (!fileName || safeProjectFileName(fileName) !== fileName) return new Response(null, { status: 400 });
  const revision = unquoteEtag(request.headers.get("if-match"));
  if (!revision) return new Response(null, { status: 428 });
  if (request.headers.get("content-type") !== "image/jpeg") return new Response(null, { status: 415 });
  const maximum = 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maximum) return new Response(null, { status: 413 });
  let lock: Awaited<ReturnType<typeof acquireSharedProjectLock>> | null = null;
  const lockPath = path.join(root, `${fileName}.lock`);
  let temporary = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) { await reader.cancel(); return new Response(null, { status: 413 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return new Response(null, { status: 400 });
    try { lock = await acquireSharedProjectLock(lockPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return new Response(null, { status: 409 }); throw error; }
    const projectPath = path.join(root, fileName);
    if (!await regularFileStat(projectPath)) return new Response(null, { status: 404 });
    if (revisionForBytes(await fs.readFile(projectPath)) !== revision) return new Response(null, { status: 409 });
    const destination = thumbnailPath(root, fileName, revision);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    temporary = `${destination}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, destination);
    temporary = "";
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(null, { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500 });
  } finally {
    if (temporary) await fs.unlink(temporary).catch(() => undefined);
    await lock?.release();
  }
}
