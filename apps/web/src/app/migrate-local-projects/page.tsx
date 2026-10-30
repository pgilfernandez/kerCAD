"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { listLibraryProjects, newProjectLibraryId, saveLibraryProject, type ProjectLibraryEntry } from "@/lib/projectLibrary";
import { uiText } from "@/lib/kercadI18n";

const MESSAGE_TYPE = "kercad-local-project-migration/v1";

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
  for (const [key, label] of [["kercad.parametric.document.v1", "Diseño local"], ["kercad.parametric.document.recovery.v1", "Recuperación local"]] as const) {
    try { add(JSON.parse(localStorage.getItem(key) ?? "null"), label); } catch {}
  }
  try {
    const snapshots = JSON.parse(localStorage.getItem("kercad.parametric.snapshots.v1") ?? "[]") as unknown;
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
        setStatus(uiText("ui.page.solicitud.de.migracion.invalida.741d9b"));
        return;
      }
      void listLibraryProjects()
        .then((storedProjects) => {
          const projects = [...storedProjects, ...legacyLocalProjects()];
          window.opener.postMessage({ type: MESSAGE_TYPE, token: messageToken, projects } satisfies MigrationMessage, targetOrigin);
          setStatus(uiText("ui.page.proyectos.enviados.al.nuevo.origen.844fac", { value0: projects.length }));
          window.setTimeout(() => window.close(), 800);
        })
        .catch((error) => {
          window.opener.postMessage({ type: MESSAGE_TYPE, token: messageToken, error: error instanceof Error ? error.message : "No se pudo leer la biblioteca." } satisfies MigrationMessage, targetOrigin);
        });
      return;
    }

    if (!sourceOrigin || sourceOrigin === window.location.origin) {
      setStatus(uiText("ui.page.indica.un.origen.anterior.distinto.mediante.sour.c3b95a"));
      return;
    }

    const token = migrationToken();
    setSourceWindowUrl(`${sourceOrigin}/migrate-local-projects?sender=1&target=${encodeURIComponent(window.location.origin)}&token=${encodeURIComponent(token)}`);
    setStatus(uiText("ui.page.pulsa.el.boton.para.abrir.temporalmente.la.bibli.726480"));

    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== sourceOrigin || !isMigrationMessage(event.data) || event.data.token !== token || startedRef.current) return;
      startedRef.current = true;
      if (event.data.error) {
        setStatus(uiText("ui.page.no.se.pudo.leer.la.biblioteca.anterior.7a574a", { value0: event.data.error }));
        return;
      }
      const incoming = Array.isArray(event.data.projects) ? event.data.projects : [];
      void (async () => {
        setStatus(uiText("ui.page.copiando.proyectos.f63870", { value0: incoming.length }));
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
        setStatus(uiText("ui.page.proyectos.copiados.c952dc", { value0: copied, value1: preserved ? uiText("ui.page.conflictos.se.conservaron.como.copias.separad.4ece67", { value0: preserved }) : "" }));
      })().catch((error) => setStatus(uiText("ui.page.la.copia.no.pudo.completarse.ee67f9", { value0: error instanceof Error ? error.message : uiText("ui.page.error.desconocido.9032e0") })));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef5f8", color: "#27485c", fontFamily: "Inter, Arial, sans-serif" }}>
    <section style={{ width: "min(560px, 100%)", padding: 28, border: "1px solid #c9dbe5", borderRadius: 12, background: "white", boxShadow: "0 18px 45px rgba(31, 72, 96, .12)" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>{uiText("ui.page.migrar.proyectos.locales.de52b4")}</h1>
      <p role="status" style={{ margin: 0, lineHeight: 1.55 }}>{status}</p>
      {!finished && sourceWindowUrl ? <button type="button" onClick={() => {
        startedRef.current = false;
        const sourceWindow = window.open(sourceWindowUrl, "kercad-project-migration", "popup,width=560,height=420");
        if (!sourceWindow) setStatus(uiText("ui.page.el.navegador.bloqueo.la.ventana.permite.ventanas.28089f"));
        else setStatus(uiText("ui.page.leyendo.la.biblioteca.anterior.6d07b0"));
      }} style={{ marginTop: 20, padding: "10px 16px", border: 0, borderRadius: 7, color: "white", background: "#148eb8", fontWeight: 700, cursor: "pointer" }}>{uiText("ui.page.copiar.proyectos.desde.172.23.7.18.0f1b44")}</button> : null}
      {finished ? <a href="/" style={{ display: "inline-block", marginTop: 20, padding: "10px 16px", borderRadius: 7, color: "white", background: "#148eb8", textDecoration: "none", fontWeight: 700 }}>{uiText("ui.page.abrir.proyectos.7888af")}</a> : null}
    </section>
  </main>;
}
