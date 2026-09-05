"use client";

import { FileUp, Grid3X3, Home, List, Plus, Search, Settings, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ProjectLibraryEntry } from "@/lib/projectLibrary";

type Props = {
  projects: ProjectLibraryEntry[];
  busy?: boolean;
  onCreate: () => void;
  onOpen: (project: ProjectLibraryEntry) => void;
  onImport: (file: File) => void;
  onDelete: (project: ProjectLibraryEntry) => void;
};

function updatedLabel(timestamp: number) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))} min ago`;
  if (age < 86_400_000) return "Today";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(timestamp);
}

export function ProjectDashboard({ projects, busy = false, onCreate, onOpen, onImport, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);
  return <main className="educad-dashboard-shell" aria-busy={busy}>
    <header className="educad-dashboard-topbar">
      <strong className="educad-dashboard-brand"><span className="educad-dashboard-logo">eC</span><span>eduCAD</span></strong>
      <label className="educad-dashboard-search"><Search size={22} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></label>
    </header>
    <div className="educad-dashboard-layout">
      <aside className="educad-dashboard-sidebar">
        <button className="active" type="button"><Home size={23} /><span>Home</span></button>
        <button type="button" disabled><Grid3X3 size={23} /><span>Challenges</span></button>
        <button className="settings" type="button" disabled><Settings size={23} /><span>Settings</span></button>
      </aside>
      <section className="educad-dashboard-main">
        <div className="educad-dashboard-actions">
          <button type="button" onClick={() => inputRef.current?.click()}><span><FileUp size={27} /></span><strong>Open eduCAD project</strong></button>
        </div>
        <header className="educad-dashboard-project-heading">
          <div><h1>Projects</h1><span>{visible.length} visible</span></div>
          <div className="educad-dashboard-view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid3X3 size={20} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={21} /></button></div>
        </header>
        <div className={`educad-dashboard-projects ${view}`}>
          {!query.trim() ? <article className="educad-dashboard-card educad-dashboard-new-card">
            <button className="card-open" type="button" onClick={onCreate}>
              <span className="card-preview"><span className="new-project-plus"><Plus size={48} /></span></span>
              <span className="card-copy"><strong>Create new 3D design</strong><small>Start with an empty workplane</small></span>
            </button>
          </article> : null}
          {visible.map((project, index) => <article className="educad-dashboard-card" key={project.id}>
            <button className="card-open" type="button" onClick={() => onOpen(project)}>
              <span className={`card-preview accent-${index % 4}`}>{project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="preview-grid" /><strong>{project.document.objects.length ? `${project.document.objects.length} object${project.document.objects.length === 1 ? "" : "s"}` : "Empty design"}</strong></>}</span>
              <span className="card-copy"><strong>{project.name}</strong><small>{updatedLabel(project.updatedAt)} · {project.document.features.length} operations</small></span>
            </button>
            <button className="card-delete" type="button" aria-label={`Delete ${project.name}`} title="Delete project" onClick={() => onDelete(project)}><Trash2 size={17} /></button>
          </article>)}
          {query.trim() && !visible.length ? <div className="educad-dashboard-empty"><strong>No projects found</strong><span>Try another project name.</span></div> : null}
        </div>
      </section>
    </div>
    <input ref={inputRef} hidden type="file" accept=".educad,.educad.json,.json,application/vnd.educad.project+zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
  </main>;
}
