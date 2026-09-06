"use client";

import { FileUp, Grid3X3, Home, List, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolbarEditOperationIcon } from "@/components/icons";
import type { ProjectLibraryEntry } from "@/lib/projectLibrary";

type Props = {
  projects: ProjectLibraryEntry[];
  busy?: boolean;
  onShowLanding: () => void;
  onCreate: () => void;
  onOpen: (project: ProjectLibraryEntry) => void;
  onImport: (file: File) => void;
  onDelete: (project: ProjectLibraryEntry) => void;
  onRename: (project: ProjectLibraryEntry, name: string) => void;
};

function updatedLabel(timestamp: number) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))} min ago`;
  if (age < 86_400_000) return "Today";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(timestamp);
}

export function ProjectDashboard({ projects, busy = false, onShowLanding, onCreate, onOpen, onImport, onDelete, onRename }: Props) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [renaming, setRenaming] = useState<ProjectLibraryEntry | null>(null);
  const [deleting, setDeleting] = useState<ProjectLibraryEntry | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => projects
    .filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => sort === "recent"
      ? right.updatedAt - left.updatedAt
      : left.name.localeCompare(right.name, undefined, { sensitivity: "base" })), [projects, query, sort]);
  useEffect(() => {
    if (!renaming) return;
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renaming]);
  const beginRename = (project: ProjectLibraryEntry) => {
    setRenameDraft(project.name);
    setRenaming(project);
  };
  const commitRename = () => {
    if (!renaming || !renameDraft.trim()) return;
    onRename(renaming, renameDraft.trim());
    setRenaming(null);
  };
  return <main className="educad-dashboard-shell" aria-busy={busy}>
    <header className="educad-dashboard-topbar">
      <strong className="educad-dashboard-brand"><img className="educad-dashboard-logo" src="/assets/educad/logo.svg" alt="" /><span>eduCAD</span></strong>
      <button className="educad-dashboard-about" type="button" onClick={onShowLanding}>About eduCAD</button>
    </header>
    <div className="educad-dashboard-layout">
      <aside className="educad-dashboard-sidebar">
        <button className="active" type="button"><Home size={23} /><span>Home</span></button>
        <button type="button" disabled><Grid3X3 size={23} /><span>Challenges</span></button>
        <button className="settings" type="button" disabled><Settings size={23} /><span>Settings</span></button>
      </aside>
      <section className="educad-dashboard-main">
        <header className="educad-dashboard-project-heading">
          <div><h1>Projects</h1><span>{visible.length} visible</span></div>
          <div className="educad-dashboard-project-controls">
            <label className="educad-dashboard-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></label>
            <div className="educad-dashboard-sort-toggle" role="group" aria-label="Sort projects"><button type="button" className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")} aria-label="Sort by recent" title="Sort by recent"><img src="/assets/educad/toolbar/project-sort-recent.svg" alt="" /></button><button type="button" className={sort === "name" ? "active" : ""} onClick={() => setSort("name")} aria-label="Sort by name" title="Sort by name"><img src="/assets/educad/toolbar/project-sort-name.svg" alt="" /></button></div>
            <div className="educad-dashboard-view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid3X3 size={20} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={21} /></button></div>
          </div>
        </header>
        <div className={`educad-dashboard-projects ${view}`}>
          {!query.trim() ? <article className="educad-dashboard-card educad-dashboard-new-card">
            <button className="card-open" type="button" onClick={onCreate}>
              <span className="card-preview"><span className="new-project-plus"><Plus size={48} /></span></span>
              <span className="card-copy"><strong>Create new 3D design</strong><small>Start with an empty workplane</small></span>
            </button>
          </article> : null}
          {!query.trim() ? <article className="educad-dashboard-card educad-dashboard-open-card">
            <button className="card-open" type="button" onClick={() => inputRef.current?.click()}>
              <span className="card-preview"><span className="new-project-plus"><FileUp size={43} /></span></span>
              <span className="card-copy"><strong>Open eduCAD project</strong><small>Open a saved .educad design</small></span>
            </button>
          </article> : null}
          {visible.map((project, index) => <article className="educad-dashboard-card" key={project.id}>
            <button className="card-open" type="button" onClick={() => onOpen(project)}>
              <span className={`card-preview accent-${index % 4}`}>{project.thumbnail ? <img src={project.thumbnail} alt="" /> : <><span className="preview-grid" /><strong>{project.document.objects.length ? `${project.document.objects.length} object${project.document.objects.length === 1 ? "" : "s"}` : "Empty design"}</strong></>}</span>
              <span className="card-copy"><strong>{project.name}</strong><small>{updatedLabel(project.updatedAt)} · {project.document.features.length} operations</small></span>
            </button>
            <button className="card-rename" type="button" aria-label={`Rename ${project.name}`} title="Rename project" onClick={() => beginRename(project)}><ToolbarEditOperationIcon /></button>
            <button className="card-delete" type="button" aria-label={`Delete ${project.name}`} title="Delete project" onClick={() => setDeleting(project)}><Trash2 size={17} /></button>
          </article>)}
          {query.trim() && !visible.length ? <div className="educad-dashboard-empty"><strong>No projects found</strong><span>Try another project name.</span></div> : null}
        </div>
      </section>
    </div>
    {renaming ? <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setRenaming(null)}>
      <form className="educad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-project-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
        <header><strong id="educad-project-rename-title">Rename project</strong><button type="button" aria-label="Cancel" onClick={() => setRenaming(null)}><X size={18} /></button></header>
        <label><span>Name</span><input ref={renameInputRef} value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenaming(null); }} /></label>
        <footer><button type="button" onClick={() => setRenaming(null)}>Cancel</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>OK</button></footer>
      </form>
    </div> : null}
    {deleting ? <div className="educad-dialog-backdrop" role="presentation" onPointerDown={() => setDeleting(null)}>
      <section className="educad-rename-dialog educad-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-project-delete-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><strong id="educad-project-delete-title">Delete project?</strong><button type="button" aria-label="Cancel" onClick={() => setDeleting(null)}><X size={18} /></button></header>
        <p>Delete <strong>{deleting.name}</strong>? This cannot be undone.</p>
        <footer><button type="button" onClick={() => setDeleting(null)}>Cancel</button><button className="danger" type="button" onClick={() => { onDelete(deleting); setDeleting(null); }}>Delete</button></footer>
      </section>
    </div> : null}
    <input ref={inputRef} hidden type="file" accept=".educad,.educad.json,.json,application/vnd.educad.project+zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
  </main>;
}
