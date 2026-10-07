"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { listLibraryProjects, newProjectLibraryId, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";

const MESSAGE_TYPE = "educad-local-project-migration/v1";

type MigrationMessage = {
  type: typeof MESSAGE_TYPE;
  token: string;
  projects?: ProjectLibraryEntry[];
  error?: string;
};

function safeHttpOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function isMigrationMessage(value: unknown): value is MigrationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<MigrationMessage>;
  return message.type === MESSAGE_TYPE && typeof message.token === "string";
}

// randomUUID is restricted to secure contexts in some browsers. The token only
// pairs two windows opened by this page during one local migration session.
function migrationToken() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `migration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function legacyLocalProjects() {
  const recovered: ProjectLibraryEntry[] = [];
  const add = (value: unknown, label: string, createdAt = Date.now()) => {
    if (!validateDocument(value)) return;
    const document = normalizeParametricDocument(structuredClone(value));
    recovered.push({
      id: `legacy-${label}-${createdAt}-${recovered.length}`,
      name: document.name || label,
      createdAt,
      updatedAt: createdAt,
      document,
    });
  };
  for (const [key, label] of [["educad.parametric.document.v1", "Diseño local"], ["educad.parametric.document.recovery.v1", "Recuperación local"]] as const) {
    try { add(JSON.parse(localStorage.getItem(key) ?? "null"), label); } catch {}
  }
  try {
    const snapshots = JSON.parse(localStorage.getItem("educad.parametric.snapshots.v1") ?? "[]") as unknown;
    if (Array.isArray(snapshots)) for (const snapshot of snapshots) {
      if (!snapshot || typeof snapshot !== "object") continue;
      const value = snapshot as { document?: unknown; createdAt?: unknown };
      add(value.document, "Instantánea local", typeof value.createdAt === "number" ? value.createdAt : Date.now());
    }
  } catch {}
  return recovered;
}

export default function MigrateLocalProjectsPage() {
  const [status, setStatus] = useState("Preparando migración…");
  const [finished, setFinished] = useState(false);
  const [sourceWindowUrl, setSourceWindowUrl] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const sender = parameters.get("sender") === "1";
    const targetOrigin = safeHttpOrigin(parameters.get("target"));
    const sourceOrigin = safeHttpOrigin(parameters.get("source"));
    const messageToken = parameters.get("token");

    if (sender) {
      if (!targetOrigin || !messageToken || !window.opener) {
        setStatus("Solicitud de migración inválida.");
        return;
      }
      void listLibraryProjects()
        .then((storedProjects) => {
          const projects = [...storedProjects, ...legacyLocalProjects()];
          window.opener.postMessage({ type: MESSAGE_TYPE, token: messageToken, projects } satisfies MigrationMessage, targetOrigin);
          setStatus(`${projects.length} proyectos enviados al nuevo origen.`);
          window.setTimeout(() => window.close(), 800);
        })
        .catch((error) => {
          window.opener.postMessage({ type: MESSAGE_TYPE, token: messageToken, error: error instanceof Error ? error.message : "No se pudo leer la biblioteca." } satisfies MigrationMessage, targetOrigin);
        });
      return;
    }

    if (!sourceOrigin || sourceOrigin === window.location.origin) {
      setStatus("Indica un origen anterior distinto mediante ?source=http://IP:PUERTO.");
      return;
    }

    const token = migrationToken();
    setSourceWindowUrl(`${sourceOrigin}/migrate-local-projects?sender=1&target=${encodeURIComponent(window.location.origin)}&token=${encodeURIComponent(token)}`);
    setStatus("Pulsa el botón para abrir temporalmente la biblioteca anterior y copiarla.");

    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== sourceOrigin || !isMigrationMessage(event.data) || event.data.token !== token || startedRef.current) return;
      startedRef.current = true;
      if (event.data.error) {
        setStatus(`No se pudo leer la biblioteca anterior: ${event.data.error}`);
        return;
      }
      const incoming = Array.isArray(event.data.projects) ? event.data.projects : [];
      void (async () => {
        setStatus(`Copiando ${incoming.length} proyectos…`);
        const current = await listLibraryProjects();
        const currentById = new Map(current.map((project) => [project.id, project]));
        let copied = 0;
        let preserved = 0;
        for (const project of incoming) {
          if (!project || typeof project.id !== "string" || typeof project.name !== "string" || !project.document) continue;
          const existing = currentById.get(project.id);
          const entry = structuredClone(project);
          if (existing) {
            entry.id = newProjectLibraryId();
            entry.name = `${entry.name} (migrado)`;
            preserved += 1;
          }
          await saveLibraryProject(entry);
          copied += 1;
        }
        setFinished(true);
        setStatus(`${copied} proyectos copiados.${preserved ? ` ${preserved} conflictos se conservaron como copias separadas.` : ""}`);
      })().catch((error) => setStatus(`La copia no pudo completarse: ${error instanceof Error ? error.message : "error desconocido"}`));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef5f8", color: "#27485c", fontFamily: "Inter, Arial, sans-serif" }}>
    <section style={{ width: "min(560px, 100%)", padding: 28, border: "1px solid #c9dbe5", borderRadius: 12, background: "white", boxShadow: "0 18px 45px rgba(31, 72, 96, .12)" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>Migrar proyectos locales</h1>
      <p role="status" style={{ margin: 0, lineHeight: 1.55 }}>{status}</p>
      {!finished && sourceWindowUrl ? <button type="button" onClick={() => {
        startedRef.current = false;
        const sourceWindow = window.open(sourceWindowUrl, "educad-project-migration", "popup,width=560,height=420");
        if (!sourceWindow) setStatus("El navegador bloqueó la ventana. Permite ventanas emergentes para esta página y vuelve a intentarlo.");
        else setStatus("Leyendo la biblioteca anterior…");
      }} style={{ marginTop: 20, padding: "10px 16px", border: 0, borderRadius: 7, color: "white", background: "#148eb8", fontWeight: 700, cursor: "pointer" }}>Copiar proyectos desde 172.23.7.18</button> : null}
      {finished ? <a href="/" style={{ display: "inline-block", marginTop: 20, padding: "10px 16px", borderRadius: 7, color: "white", background: "#148eb8", textDecoration: "none", fontWeight: 700 }}>Abrir proyectos</a> : null}
    </section>
  </main>;
}
