"use client";

import { ChevronLeft, ChevronUp, History, Home, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParametricViewport, type CameraView } from "@/components/ParametricViewport";
import {
  ToolbarAlignIcon,
  ToolbarChamferIcon,
  ToolbarCopyIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarDuplicateIcon,
  ToolbarFilletIcon,
  ToolbarGroupIcon,
  ToolbarHideSelectedIcon,
  ToolbarHomeIcon,
  ToolbarImportIcon,
  ToolbarMirrorIcon,
  ToolbarPasteIcon,
  ToolbarRedoIcon,
  ToolbarSettingsIcon,
  ToolbarShapeAddIcon,
  ToolbarSnapGridIcon,
  ToolbarTrashIcon,
  ToolbarUndoIcon,
  ToolbarUngroupIcon,
  ToolbarVectorExportIcon,
} from "@/components/icons";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { cloneDocument, createFilletFeature, createStarterDocument, validateDocument } from "@/lib/parametricDocument";
import { buildParametricModel, exportParametricStep } from "@/lib/parametricKernel";
import {
  addPrimitive,
  applyWorkplanePatch,
  deleteParametricObject,
  duplicateParametricObject,
  objectFeatures,
  viewportSelectionForObject,
  workplaneShapeForObject,
  type SupportedPrimitive,
} from "@/lib/parametricObjects";
import { toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { BuildResult, ParametricDocument } from "@/types/parametric";
import type { GridSize, WorkplaneShape } from "@/types/sketchforge";

const STORAGE_KEY = "educad.parametric.document.v1";
type HistoryState = { entries: ParametricDocument[]; index: number };
type Notice = { type: "ok" | "info" | "error"; text: string } | null;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "modelo";
}

export function SketchForgeParametricEditor() {
  const initialDocument = useMemo(() => createStarterDocument(), []);
  const [history, setHistory] = useState<HistoryState>({ entries: [initialDocument], index: 0 });
  const document = history.entries[history.index];
  const [selectedId, setSelectedId] = useState<string | null>(objectFeatures(initialDocument)[0]?.id ?? null);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, completedFeatureIds: [], warning: null });
  const [kernelBusy, setKernelBusy] = useState(true);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [snap, setSnap] = useState<GridSize>(DEFAULT_SNAP_GRID);
  const [snapOpen, setSnapOpen] = useState(false);
  const [view, setView] = useState<CameraView>({ name: "iso", token: 0 });
  const [clipboardId, setClipboardId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const buildCounter = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (validateDocument(parsed)) {
          setHistory({ entries: [parsed], index: 0 });
          setSelectedId(objectFeatures(parsed)[0]?.id ?? null);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document, hydrated]);

  useEffect(() => {
    const counter = ++buildCounter.current;
    setKernelBusy(true);
    const timeout = window.setTimeout(() => {
      buildParametricModel(document).then((result) => {
        if (counter !== buildCounter.current) return;
        setBuild(result);
        setKernelBusy(false);
      }).catch((error: unknown) => {
        if (counter !== buildCounter.current) return;
        setBuild((current) => ({ ...current, warning: error instanceof Error ? error.message : String(error) }));
        setKernelBusy(false);
      });
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [document]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const commit = useCallback((next: ParametricDocument) => {
    next.updatedAt = Date.now();
    setHistory((current) => {
      const entries = [...current.entries.slice(0, current.index + 1), next].slice(-100);
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const mutate = useCallback((mutator: (draft: ParametricDocument) => void) => {
    const next = cloneDocument(document);
    mutator(next);
    commit(next);
  }, [commit, document]);

  const selectedShape = workplaneShapeForObject(document, selectedId);
  const selectedBox = viewportSelectionForObject(document, selectedId);
  const snapAmount = snap === "Off" ? 0.01 : snap === "Brick" ? 8 : Number.parseFloat(snap) || 1;

  const addShape = (kind: SupportedPrimitive) => {
    let id = "";
    mutate((draft) => {
      const count = objectFeatures(draft).length;
      id = addPrimitive(draft, kind, { x: count === 0 ? 0 : count * 8, y: count === 0 ? 0 : count * 6 });
    });
    setSelectedId(id);
    setShapesOpen(false);
    setNotice({ type: "ok", text: `${kind === "box" ? "Caja" : "Cilindro"} añadido` });
  };

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    const ids = objectFeatures(document).map((feature) => feature.id);
    const index = ids.indexOf(selectedId);
    mutate((draft) => deleteParametricObject(draft, selectedId));
    setSelectedId(ids[index - 1] ?? ids[index + 1] ?? null);
  }, [document, mutate, selectedId]);

  const duplicateSelected = useCallback((sourceId = selectedId) => {
    if (!sourceId) return;
    let nextId: string | null = null;
    mutate((draft) => { nextId = duplicateParametricObject(draft, sourceId); });
    if (nextId) setSelectedId(nextId);
    setNotice({ type: "ok", text: "Forma duplicada" });
  }, [mutate, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (!selectedId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? snapAmount * 5 : snapAmount;
      mutate((draft) => applyWorkplanePatch(draft, selectedId, {
        x: (selectedShape?.x ?? 0) + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
        z: (selectedShape?.z ?? 0) + (event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0),
      }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mutate, removeSelected, selectedId, selectedShape?.x, selectedShape?.z, snapAmount]);

  const updateSelected = (patch: Partial<WorkplaneShape>) => {
    if (!selectedId) return;
    mutate((draft) => applyWorkplanePatch(draft, selectedId, patch));
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));
  const undo = () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  const redo = () => setHistory((current) => ({ ...current, index: Math.min(current.entries.length - 1, current.index + 1) }));

  const newDocument = () => {
    const next = createStarterDocument();
    setHistory({ entries: [next], index: 0 });
    setSelectedId(objectFeatures(next)[0]?.id ?? null);
    setNotice({ type: "info", text: "Nuevo diseño" });
  };

  const addFillet = () => {
    if (!selectedShape || selectedShape.hole) return;
    mutate((draft) => draft.features.push(createFilletFeature(draft.features.filter((feature) => feature.kind === "fillet").length + 1)));
    setNotice({ type: "ok", text: "Redondeo paramétrico añadido" });
  };

  const exportProject = () => {
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }), `${fileName(document.name)}.educad.json`);
    setNotice({ type: "ok", text: "Proyecto paramétrico exportado" });
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      downloadBlob(await exportParametricStep(document), `${fileName(document.name)}.step`);
      setNotice({ type: "ok", text: "STEP B-Rep exportado" });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo exportar" });
    } finally {
      setExporting(false);
    }
  };

  const importProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(parsed)) throw new Error("Este no es un proyecto eduCAD compatible.");
      setHistory({ entries: [parsed], index: 0 });
      setSelectedId(objectFeatures(parsed)[0]?.id ?? null);
      setNotice({ type: "ok", text: "Proyecto abierto" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "No se pudo abrir" });
    }
  };

  if (!hydrated) {
    return <main className="educad-reference-shell"><div className="editor-loading-screen"><div className="editor-loading-toolbar" /><div className="educad-initial-loading">Preparando el espacio de trabajo…</div></div></main>;
  }

  return (
    <main className="educad-reference-shell">
      <div className="secondary-toolbar">
        <div className="toolbar-workspace-tabs">
          <button className="active">Diseño 3D</button>
          <button onClick={() => setNotice({ type: "info", text: "Selecciona una forma para editar su boceto paramétrico" })}>Boceto</button>
          <span className="educad-project-name">eduCAD · {document.name}</span>
        </div>
        <div className="toolbar-mode-content geometry">
          <ToolbarSection label="Home" className="toolbar-home-section"><Tool label="Nuevo diseño" onClick={newDocument}><ToolbarHomeIcon /></Tool></ToolbarSection>
          <div className="tool-group left">
            <ToolbarSection label="Clipboard">
              <Tool label="Copiar" enabled={Boolean(selectedId)} onClick={() => { setClipboardId(selectedId); setNotice({ type: "info", text: "Forma copiada" }); }}><ToolbarCopyIcon /></Tool>
              <Tool label="Pegar" enabled={Boolean(clipboardId)} onClick={() => duplicateSelected(clipboardId)}><ToolbarPasteIcon /></Tool>
              <Tool label="Duplicar" enabled={Boolean(selectedId)} onClick={() => duplicateSelected()}><ToolbarDuplicateIcon /></Tool>
              <Tool label="Eliminar" enabled={Boolean(selectedId)} onClick={removeSelected}><ToolbarTrashIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="History">
              <Tool label="Deshacer" enabled={history.index > 0} onClick={undo}><ToolbarUndoIcon /></Tool>
              <Tool label="Rehacer" enabled={history.index < history.entries.length - 1} onClick={redo}><ToolbarRedoIcon /></Tool>
              <Tool label="Historial paramétrico" enabled onClick={() => setHistoryOpen((value) => !value)} active={historyOpen}><History size={26} /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Shapes" className="toolbar-shapes-section">
              <button className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`} aria-label="Añadir forma" onClick={() => setShapesOpen((value) => !value)}><ToolbarShapeAddIcon /></button>
              {shapesOpen && (
                <div className="shape-menu-dropdown">
                  <div className="shape-menu-title">Formas básicas</div>
                  <div className="shape-menu-list">
                    {toolbarShapeAssets.slice(0, 2).map((asset) => <button className="shape-menu-item" key={asset.id} onClick={() => addShape(asset.kind as SupportedPrimitive)}><img src={asset.menuIcon} alt="" /><span>{asset.name === "Box" ? "Caja" : "Cilindro"}<small>Boceto + extrusión</small></span></button>)}
                    <div className="educad-shape-coming"><strong>Más operaciones CAD</strong><span>Revolución, cono y esfera llegarán como operaciones paramétricas.</span></div>
                  </div>
                </div>
              )}
            </ToolbarSection>
          </div>
          <div className="toolbar-spacer" />
          <div className="tool-group right">
            <ToolbarSection label="Visibility" className="compact toolbar-visibility-section"><Tool label="Ocultar" enabled={Boolean(selectedShape)} onClick={() => updateSelected({ hidden: !selectedShape?.hidden })} active={Boolean(selectedShape?.hidden)}><ToolbarHideSelectedIcon /></Tool></ToolbarSection>
            <ToolbarSection label="Combine">
              <Tool label="Agrupar paramétricamente" enabled={objectFeatures(document).length > 1} onClick={() => setNotice({ type: "info", text: "Las formas se combinan según Solid/Hole y el orden del historial" })}><ToolbarGroupIcon /></Tool>
              <Tool label="Desagrupar" enabled={false}><ToolbarUngroupIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Modify">
              <Tool label="Alinear" enabled={false}><ToolbarAlignIcon /></Tool>
              <Tool label="Simetría" enabled={Boolean(selectedShape)} onClick={() => selectedId && mutate((draft) => applyWorkplanePatch(draft, selectedId, { x: -(selectedShape?.x ?? 0) }))}><ToolbarMirrorIcon /></Tool>
              <Tool label="Ajustar a rejilla" enabled={Boolean(selectedShape)} onClick={() => selectedId && mutate((draft) => applyWorkplanePatch(draft, selectedId, { x: Math.round((selectedShape?.x ?? 0) / snapAmount) * snapAmount, z: Math.round((selectedShape?.z ?? 0) / snapAmount) * snapAmount }))}><ToolbarSnapGridIcon /></Tool>
              <Tool label="Chaflán" enabled={false}><ToolbarChamferIcon /></Tool>
              <Tool label="Redondeo" enabled={Boolean(selectedShape && !selectedShape.hole)} onClick={addFillet}><ToolbarFilletIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label="Arrange">
              <Tool label="Bajar al plano" enabled={Boolean(selectedShape)} onClick={() => updateSelected({ elevation: 0 })}><ToolbarDropToWorkplaneIcon /></Tool>
            </ToolbarSection>
          </div>
          <ToolbarSection label="Manage" className="toolbar-actions-section">
            <div className="action-buttons">
              <button className="action-icon-button" aria-label="Importar" onClick={() => importRef.current?.click()}><ToolbarImportIcon /></button>
              <button className="action-icon-button" aria-label="Exportar" onClick={() => setExportOpen((value) => !value)}><ToolbarVectorExportIcon /></button>
              <button className="action-icon-button" aria-label="Ajustes" onClick={() => setSettingsOpen((value) => !value)}><ToolbarSettingsIcon /></button>
            </div>
          </ToolbarSection>
        </div>
      </div>

      <section className="educad-workplane-stage">
        <ParametricViewport
          mesh={build.mesh}
          color={document.color}
          view={view}
          selection={selectedBox}
          snap={snapAmount}
          onSelectionMove={(x, y) => selectedId && mutate((draft) => applyWorkplanePatch(draft, selectedId, { x, z: y }))}
        />
        <ViewCube onView={setCamera} />
        <div className="camera-controls" aria-label="Controles de cámara">
          <button aria-label="Contraer"><ChevronLeft size={24} /></button>
          <button aria-label="Vista inicial" onClick={() => setCamera("home")}><Home size={24} /></button>
          <button aria-label="Acercar" onClick={() => setCamera("zoom-in")}><Plus size={28} /></button>
          <button aria-label="Alejar" onClick={() => setCamera("zoom-out")}><Minus size={28} /></button>
        </div>
        <div className="educad-drag-tip">Arrastra la forma seleccionada sobre el plano · usa las flechas para mover con precisión</div>
        {kernelBusy && <div className="educad-kernel-pill">Reconstruyendo OpenCascade…</div>}
        {build.warning && <div className="educad-rebuild-error"><strong>El historial se detuvo aquí</strong><span>{build.warning}</span></div>}
        {notice && <div className={`educad-reference-toast ${notice.type}`}>{notice.text}</div>}

        {historyOpen && <ParametricHistory document={document} selectedId={selectedId} completed={build.completedFeatureIds} onSelect={setSelectedId} onClose={() => setHistoryOpen(false)} />}
        {selectedShape && (
          <ShapeInspector
            shape={selectedShape}
            snap={snap}
            snapOpen={snapOpen}
            workspace={DEFAULT_WORKPLANE_WORKSPACE}
            onUpdate={updateSelected}
            onSnapChange={setSnap}
            onSnapOpenChange={setSnapOpen}
          />
        )}
      </section>

      {exportOpen && (
        <aside className="top-action-panel export-action-panel educad-export-panel">
          <header><div className="top-action-heading"><strong>Exportar</strong><span>Conserva los parámetros o fabrica la pieza</span></div><button onClick={() => setExportOpen(false)}><X /></button></header>
          <div className="educad-export-options">
            <button onClick={exportProject}><span className="export-format-icon">JSON</span><strong>Proyecto eduCAD</strong><small>Historial editable y parámetros</small></button>
            <button onClick={() => void exportStep()} disabled={exporting || !build.mesh}><span className="export-format-icon step">STEP</span><strong>{exporting ? "Exportando…" : "Modelo STEP"}</strong><small>B-Rep exacto para fabricación</small></button>
          </div>
        </aside>
      )}

      {settingsOpen && (
        <aside className="top-action-panel educad-settings-panel">
          <header><strong>Ajustes del diseño</strong><button onClick={() => setSettingsOpen(false)}><X /></button></header>
          <label><span>Nombre</span><input value={document.name} onChange={(event) => mutate((draft) => { draft.name = event.target.value; })} /></label>
          <label><span>Color</span><input type="color" value={document.color} onChange={(event) => mutate((draft) => { draft.color = event.target.value; })} /></label>
          <p>El proyecto se guarda automáticamente en este navegador.</p>
        </aside>
      )}

      <input ref={importRef} hidden type="file" accept=".json,.educad" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.target.value = ""; }} />
    </main>
  );
}

function ToolbarSection({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`toolbar-section ${className}`}><div className="toolbar-section-label">{label}</div><div className="toolbar-section-tools">{children}</div></div>;
}

function Tool({ label, enabled = true, active = false, onClick, children }: { label: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`toolbar-icon ${enabled ? "" : "disabled"} ${active ? "active" : ""}`} aria-label={label} title={label} disabled={!enabled} onClick={onClick}>{children}</button>;
}

function ViewCube({ onView }: { onView: (view: CameraView["name"]) => void }) {
  return <div className="view-cube" aria-label="Cubo de vistas"><div className="view-cube-inner" style={{ transform: "rotateX(-22deg) rotateY(34deg)" }}><button className="cube-face cube-top" onClick={() => onView("top")}>TOP</button><button className="cube-face cube-bottom" onClick={() => onView("top")}>BOTTOM</button><button className="cube-face cube-front" onClick={() => onView("front")}>FRONT</button><button className="cube-face cube-back" onClick={() => onView("front")}>BACK</button><button className="cube-face cube-right" onClick={() => onView("right")}>RIGHT</button><button className="cube-face cube-left" onClick={() => onView("right")}>LEFT</button></div></div>;
}

function ParametricHistory({ document, selectedId, completed, onSelect, onClose }: { document: ParametricDocument; selectedId: string | null; completed: string[]; onSelect: (id: string) => void; onClose: () => void }) {
  return <aside className="educad-history-drawer"><header><div><strong>Historial paramétrico</strong><span>El modelo se reconstruye de arriba abajo</span></div><button onClick={onClose}><X /></button></header><div className="educad-history-origin">Origen <small>XY · Z↑</small></div><div className="educad-history-list">{document.features.map((feature, index) => <button key={feature.id} className={`${selectedId === feature.id ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""}`} onClick={() => onSelect(feature.id)}><span className={`educad-history-kind ${feature.kind}`}>{index + 1}</span><span><strong>{feature.name}</strong><small>{feature.kind === "sketch" ? "Boceto" : feature.kind === "extrude" ? "Extrusión" : feature.kind === "hole" ? "Taladro" : "Redondeo"}</small></span><i>{completed.includes(feature.id) ? "✓" : "·"}</i></button>)}</div><div className="educad-history-lesson"><strong>¿Por qué aparece un boceto?</strong><p>Cada forma sencilla sigue siendo CAD: primero se define un perfil 2D y después se crea volumen.</p></div></aside>;
}
