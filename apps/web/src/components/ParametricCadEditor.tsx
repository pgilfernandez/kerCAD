"use client";

import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  CircleDot,
  Download,
  Eye,
  EyeOff,
  FileBox,
  FileJson,
  GraduationCap,
  Grid3X3,
  Hexagon,
  Import,
  LoaderCircle,
  Menu,
  MousePointer2,
  Redo2,
  Rotate3D,
  Save,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParametricViewport, type CameraView } from "@/components/ParametricViewport";
import {
  cloneDocument,
  createExtrudeFeature,
  createFilletFeature,
  createHoleFeature,
  createSketchFeature,
  createStarterDocument,
  documentHasSolid,
  previousSketch,
  validateDocument,
} from "@/lib/parametricDocument";
import { buildParametricModel, exportParametricStep } from "@/lib/parametricKernel";
import type { BuildResult, ParametricDocument, ParametricFeature } from "@/types/parametric";

const STORAGE_KEY = "educad.parametric.document.v1";

type HistoryState = { entries: ParametricDocument[]; index: number };
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

function downloadBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function safeFileName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "pieza";
}

function featureIcon(feature: ParametricFeature) {
  if (feature.kind === "sketch") return feature.profile.shape === "circle" ? CircleDot : Square;
  if (feature.kind === "extrude") return Box;
  if (feature.kind === "hole") return CircleDot;
  return Sparkles;
}

function featureLabel(feature: ParametricFeature) {
  if (feature.kind === "sketch") return "Boceto 2D";
  if (feature.kind === "extrude") return "Extrusión";
  if (feature.kind === "hole") return "Taladro";
  return "Redondeo";
}

function NumberField({ label, value, onChange, min = -1000, max = 1000, step = 1, suffix = "mm" }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="pcad-number-field">
      <span>{label}</span>
      <span className="pcad-input-wrap">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

export function ParametricCadEditor() {
  const starter = useMemo(() => createStarterDocument(), []);
  const [history, setHistory] = useState<HistoryState>({ entries: [starter], index: 0 });
  const document = history.entries[history.index];
  const [selectedId, setSelectedId] = useState<string | null>(starter.features[0]?.id ?? null);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectMeshes: [], operationContext: null, completedFeatureIds: [], warning: null });
  const [kernelState, setKernelState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<CameraView>({ name: "iso", token: 0 });
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const buildVersion = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (validateDocument(parsed)) {
          setHistory({ entries: [parsed], index: 0 });
          setSelectedId(parsed.features[0]?.id ?? null);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
  }, [document, hydrated]);

  useEffect(() => {
    const version = ++buildVersion.current;
    setKernelState("loading");
    const timer = window.setTimeout(() => {
      buildParametricModel(document)
        .then((next) => {
          if (version !== buildVersion.current) return;
          setBuild(next);
          setKernelState("ready");
        })
        .catch((error: unknown) => {
          if (version !== buildVersion.current) return;
          setBuild((previous) => ({ ...previous, warning: error instanceof Error ? error.message : String(error) }));
          setKernelState("error");
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [document]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selected = document.features.find((feature) => feature.id === selectedId) ?? null;

  const commit = useCallback((next: ParametricDocument) => {
    next.updatedAt = Date.now();
    setHistory((current) => ({
      entries: [...current.entries.slice(0, current.index + 1), next].slice(-80),
      index: Math.min(79, current.index + 1),
    }));
  }, []);

  const mutateDocument = useCallback((mutator: (draft: ParametricDocument) => void) => {
    const next = cloneDocument(document);
    mutator(next);
    commit(next);
  }, [commit, document]);

  const updateFeature = useCallback((id: string, updater: (feature: ParametricFeature) => ParametricFeature) => {
    mutateDocument((draft) => {
      draft.features = draft.features.map((feature) => feature.id === id ? updater(feature) : feature);
    });
  }, [mutateDocument]);

  const addSketch = (shape: "rectangle" | "circle") => {
    const feature = createSketchFeature(shape, document.features.filter((item) => item.kind === "sketch").length + 1);
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const addExtrude = () => {
    const sketch = previousSketch(document.features, selectedId);
    if (!sketch) {
      setNotice({ tone: "info", text: "Crea o selecciona un boceto antes de extruir." });
      return;
    }
    const feature = createExtrudeFeature(sketch.id, document.features.filter((item) => item.kind === "extrude").length + 1, documentHasSolid(document.features));
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const addHole = () => {
    if (!documentHasSolid(document.features)) {
      setNotice({ tone: "info", text: "Primero crea un sólido con una extrusión." });
      return;
    }
    const feature = createHoleFeature(document.features.filter((item) => item.kind === "hole").length + 1);
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const addFillet = () => {
    if (!documentHasSolid(document.features)) {
      setNotice({ tone: "info", text: "Primero crea un sólido con una extrusión." });
      return;
    }
    const feature = createFilletFeature(document.features.filter((item) => item.kind === "fillet").length + 1);
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const removeSelected = () => {
    if (!selected) return;
    mutateDocument((draft) => {
      const removedId = selected.id;
      draft.features = draft.features.filter((feature) => feature.id !== removedId && !(selected.kind === "sketch" && feature.kind === "extrude" && feature.sketchId === removedId));
    });
    const index = document.features.findIndex((feature) => feature.id === selected.id);
    setSelectedId(document.features[index - 1]?.id ?? document.features[index + 1]?.id ?? null);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return;
    const from = document.features.findIndex((feature) => feature.id === selected.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= document.features.length) return;
    mutateDocument((draft) => {
      const [feature] = draft.features.splice(from, 1);
      draft.features.splice(to, 0, feature);
    });
  };

  const undo = () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  const redo = () => setHistory((current) => ({ ...current, index: Math.min(current.entries.length - 1, current.index + 1) }));

  const exportDocument = () => {
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }), `${safeFileName(document.name)}.educad.json`);
    setNotice({ tone: "success", text: "Documento paramétrico exportado." });
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      const blob = await exportParametricStep(document);
      downloadBlob(blob, `${safeFileName(document.name)}.step`);
      setNotice({ tone: "success", text: "STEP B-Rep exportado correctamente." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudo exportar STEP." });
    } finally {
      setExporting(false);
    }
  };

  const importDocument = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(parsed)) throw new Error("El archivo no es un documento eduCAD v1 válido.");
      setHistory({ entries: [parsed], index: 0 });
      setSelectedId(parsed.features[0]?.id ?? null);
      setNotice({ tone: "success", text: "Documento paramétrico abierto." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudo abrir el archivo." });
    }
  };

  const newDocument = () => {
    const next = createStarterDocument();
    setHistory({ entries: [next], index: 0 });
    setSelectedId(next.features[0]?.id ?? null);
    setNotice({ tone: "info", text: "Se ha creado una pieza de ejemplo nueva." });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));

  return (
    <main className="pcad-app">
      <header className="pcad-header">
        <button className="pcad-icon-button pcad-mobile-menu" aria-label="Abrir menú"><Menu size={20} /></button>
        <div className="pcad-brand" aria-label="eduCAD">
          <span className="pcad-logo"><Hexagon size={25} strokeWidth={2.4} /><span>e</span></span>
          <strong>edu<span>CAD</span></strong>
          <small>parametric</small>
        </div>
        <div className="pcad-project-title">
          <input
            value={document.name}
            aria-label="Nombre del proyecto"
            onChange={(event) => mutateDocument((draft) => { draft.name = event.target.value; })}
          />
          <span><Save size={13} /> guardado en este navegador</span>
        </div>
        <div className="pcad-header-actions">
          <button onClick={() => setShowLesson(true)} className="pcad-challenge"><GraduationCap size={18} /> Reto guiado</button>
          <button className="pcad-avatar" aria-label="Perfil local">P</button>
        </div>
      </header>

      <nav className="pcad-ribbon" aria-label="Herramientas CAD">
        <div className="pcad-ribbon-group compact">
          <button title="Nueva pieza" onClick={newDocument}><FileBox size={22} /><span>Nuevo</span></button>
          <button title="Importar documento" onClick={() => importRef.current?.click()}><Import size={22} /><span>Abrir</span></button>
          <button title="Deshacer" disabled={history.index === 0} onClick={undo}><Undo2 size={22} /><span>Deshacer</span></button>
          <button title="Rehacer" disabled={history.index === history.entries.length - 1} onClick={redo}><Redo2 size={22} /><span>Rehacer</span></button>
        </div>
        <div className="pcad-ribbon-group">
          <button onClick={() => addSketch("rectangle")}><Square size={24} /><span>Boceto rect.</span></button>
          <button onClick={() => addSketch("circle")}><CircleDot size={24} /><span>Boceto círculo</span></button>
          <button onClick={addExtrude}><Box size={24} /><span>Extruir</span></button>
          <button onClick={addHole}><Grid3X3 size={24} /><span>Taladro</span></button>
          <button onClick={addFillet}><Sparkles size={24} /><span>Redondear</span></button>
        </div>
        <div className="pcad-ribbon-spacer" />
        <div className="pcad-ribbon-group export">
          <button onClick={exportDocument}><FileJson size={23} /><span>Proyecto</span></button>
          <button onClick={exportStep} disabled={exporting || !build.mesh}>{exporting ? <LoaderCircle className="pcad-spin" size={23} /> : <Download size={23} />}<span>STEP</span></button>
        </div>
      </nav>

      <section className="pcad-workspace">
        <aside className="pcad-tree-panel">
          <div className="pcad-panel-heading">
            <span><Shapes size={17} /> Historial del modelo</span>
            <button aria-label="Opciones del historial"><ChevronDown size={16} /></button>
          </div>
          <div className="pcad-origin-row"><Rotate3D size={16} /><span>Origen</span><small>XY · Z↑</small></div>
          <div className="pcad-feature-list">
            {document.features.map((feature, index) => {
              const Icon = featureIcon(feature);
              const complete = build.completedFeatureIds.includes(feature.id);
              return (
                <button
                  key={feature.id}
                  className={`pcad-feature-row ${selectedId === feature.id ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""}`}
                  onClick={() => setSelectedId(feature.id)}
                >
                  <span className="pcad-tree-line" />
                  <span className={`pcad-feature-icon ${feature.kind}`}><Icon size={16} /></span>
                  <span className="pcad-feature-name"><strong>{feature.name}</strong><small>{featureLabel(feature)}</small></span>
                  <span className={`pcad-feature-state ${complete ? "ok" : "pending"}`}>{feature.suppressed ? <EyeOff size={14} /> : complete ? <Check size={13} /> : <span>{index + 1}</span>}</span>
                </button>
              );
            })}
          </div>
          <div className="pcad-tree-actions">
            <button onClick={() => moveSelected(-1)} disabled={!selected || document.features[0]?.id === selected.id} title="Subir operación"><ArrowUp size={16} /></button>
            <button onClick={() => moveSelected(1)} disabled={!selected || document.features.at(-1)?.id === selected.id} title="Bajar operación"><ArrowDown size={16} /></button>
            <button onClick={removeSelected} disabled={!selected} title="Eliminar operación"><Trash2 size={16} /></button>
          </div>
          <div className="pcad-concept-card">
            <span>IDEA CLAVE</span>
            <strong>El orden importa</strong>
            <p>Cada operación usa el resultado anterior. Arrastra mentalmente el tiempo de arriba abajo.</p>
          </div>
        </aside>

        <div className="pcad-stage">
          <ParametricViewport mesh={build.mesh} objectMeshes={build.objectMeshes} color={document.color} workplane={document.workplane} view={view} />
          <div className="pcad-view-buttons" aria-label="Vistas de cámara">
            <button onClick={() => setCamera("top")}>SUP</button>
            <button onClick={() => setCamera("front")}>FREN</button>
            <button onClick={() => setCamera("right")}>DER</button>
            <button className="active" onClick={() => setCamera("iso")}>ISO</button>
          </div>
          <div className="pcad-navigation-hint"><MousePointer2 size={15} /> Arrastra para orbitar · rueda para zoom · ⇧ arrastra para desplazar</div>
          {kernelState === "loading" && <div className="pcad-kernel-status"><LoaderCircle className="pcad-spin" size={17} /> Reconstruyendo B-Rep…</div>}
          {build.warning && <div className="pcad-build-warning"><strong>La reconstrucción se detuvo</strong><span>{build.warning}</span></div>}
        </div>

        <aside className="pcad-inspector">
          <div className="pcad-panel-heading"><span>Parámetros</span><span className="pcad-unit">mm</span></div>
          {selected ? (
            <FeatureInspector
              feature={selected}
              features={document.features}
              onUpdate={(updater) => updateFeature(selected.id, updater)}
              onDelete={removeSelected}
            />
          ) : (
            <div className="pcad-empty-inspector"><MousePointer2 size={28} /><strong>Selecciona una operación</strong><span>Aquí podrás editar sus parámetros.</span></div>
          )}
          {build.mesh && (
            <div className="pcad-metrics">
              <span>RESULTADO EXACTO</span>
              <div><small>Ancho</small><strong>{build.mesh.metrics.width.toFixed(1)} mm</strong></div>
              <div><small>Fondo</small><strong>{build.mesh.metrics.depth.toFixed(1)} mm</strong></div>
              <div><small>Alto</small><strong>{build.mesh.metrics.height.toFixed(1)} mm</strong></div>
              <div><small>Volumen</small><strong>{build.mesh.metrics.volume.toFixed(0)} mm³</strong></div>
            </div>
          )}
        </aside>
      </section>

      <footer className="pcad-statusbar">
        <span className={`pcad-dot ${kernelState}`} />
        <span>{kernelState === "ready" ? "OpenCascade listo" : kernelState === "error" ? "Error del núcleo" : "Cargando núcleo CAD"}</span>
        <span className="pcad-status-spacer" />
        <span>B-Rep exacto</span><span>·</span><span>{document.features.length} operaciones</span><span>·</span><span>unidades: mm</span>
      </footer>

      <input
        ref={importRef}
        type="file"
        accept=".json,.educad"
        hidden
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDocument(file); event.target.value = ""; }}
      />

      {notice && <div className={`pcad-toast ${notice.tone}`}>{notice.tone === "success" ? <Check size={18} /> : notice.tone === "error" ? <EyeOff size={18} /> : <GraduationCap size={18} />}<span>{notice.text}</span></div>}

      {showLesson && (
        <div className="pcad-modal-backdrop" onMouseDown={() => setShowLesson(false)}>
          <article className="pcad-lesson" onMouseDown={(event) => event.stopPropagation()}>
            <span className="pcad-lesson-badge"><GraduationCap size={18} /> RETO 01</span>
            <h2>Convierte la placa en una etiqueta</h2>
            <p>Edita parámetros existentes: no necesitas empezar de cero.</p>
            <ol>
              <li>Cambia el <strong>ancho del Boceto base a 90 mm</strong>.</li>
              <li>Pon los taladros en <strong>X = −32 y X = 32</strong>.</li>
              <li>Reduce el redondeo exterior a <strong>3 mm</strong>.</li>
              <li>Exporta el resultado como <strong>STEP</strong>.</li>
            </ol>
            <button onClick={() => setShowLesson(false)}>Empezar el reto</button>
          </article>
        </div>
      )}
    </main>
  );
}

function FeatureInspector({ feature, features, onUpdate, onDelete }: {
  feature: ParametricFeature;
  features: ParametricFeature[];
  onUpdate: (updater: (feature: ParametricFeature) => ParametricFeature) => void;
  onDelete: () => void;
}) {
  const patch = (values: Partial<ParametricFeature>) => onUpdate((current) => ({ ...current, ...values } as ParametricFeature));
  return (
    <div className="pcad-inspector-body">
      <div className="pcad-feature-title">
        <span className={`pcad-feature-icon large ${feature.kind}`}>{(() => { const Icon = featureIcon(feature); return <Icon size={19} />; })()}</span>
        <label><small>{featureLabel(feature)}</small><input value={feature.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      </div>
      <label className="pcad-toggle-row">
        <span><Eye size={16} /> Operación activa</span>
        <input type="checkbox" checked={!feature.suppressed} onChange={(event) => patch({ suppressed: !event.target.checked })} />
      </label>

      {feature.kind === "sketch" && (
        <>
          <section className="pcad-property-section"><h3>Plano y posición</h3>
            <label className="pcad-select-field"><span>Plano</span><select value={feature.plane} disabled><option>XY</option></select></label>
            <div className="pcad-field-grid"><NumberField label="Centro X" value={feature.x} onChange={(x) => patch({ x })} /><NumberField label="Centro Y" value={feature.y} onChange={(y) => patch({ y })} /></div>
            <NumberField label="Desfase del plano" value={feature.offset} onChange={(offset) => patch({ offset })} />
          </section>
          <section className="pcad-property-section"><h3>Cotas del perfil</h3>
            {feature.profile.shape === "rectangle" ? (
              <div className="pcad-field-grid">
                <NumberField label="Ancho" value={feature.profile.width} min={0.1} onChange={(width) => patch({ profile: { shape: "rectangle", width, depth: feature.profile.shape === "rectangle" ? feature.profile.depth : 30 } })} />
                <NumberField label="Fondo" value={feature.profile.depth} min={0.1} onChange={(depth) => patch({ profile: { shape: "rectangle", width: feature.profile.shape === "rectangle" ? feature.profile.width : 40, depth } })} />
              </div>
            ) : <NumberField label="Diámetro" value={feature.profile.diameter} min={0.1} onChange={(diameter) => patch({ profile: { shape: "circle", diameter } })} />}
            <div className="pcad-constraint-ok"><Check size={14} /> Boceto totalmente acotado</div>
          </section>
        </>
      )}

      {feature.kind === "extrude" && (
        <>
          <section className="pcad-property-section"><h3>Referencia</h3>
            <label className="pcad-select-field"><span>Boceto</span><select value={feature.sketchId} onChange={(event) => patch({ sketchId: event.target.value })}>{features.filter((item) => item.kind === "sketch").map((sketch) => <option key={sketch.id} value={sketch.id}>{sketch.name}</option>)}</select></label>
          </section>
          <section className="pcad-property-section"><h3>Operación</h3>
            <label className="pcad-select-field"><span>Resultado</span><select value={feature.operation} onChange={(event) => patch({ operation: event.target.value as "add" | "cut" | "intersect" })}><option value="add">Añadir</option><option value="cut">Sustraer</option><option value="intersect">Intersección</option></select></label>
            <NumberField label="Distancia" value={feature.distance} min={0.1} onChange={(distance) => patch({ distance })} />
            <label className="pcad-toggle-row inset"><span>Simétrica al plano</span><input type="checkbox" checked={feature.symmetric} onChange={(event) => patch({ symmetric: event.target.checked })} /></label>
          </section>
        </>
      )}

      {feature.kind === "hole" && (
        <>
          <section className="pcad-property-section"><h3>Posición del centro</h3><div className="pcad-field-grid"><NumberField label="X" value={feature.x} onChange={(x) => patch({ x })} /><NumberField label="Y" value={feature.y} onChange={(y) => patch({ y })} /></div></section>
          <section className="pcad-property-section"><h3>Taladro</h3>
            <NumberField label="Diámetro" value={feature.diameter} min={0.1} onChange={(diameter) => patch({ diameter })} />
            <label className="pcad-select-field"><span>Final</span><select value={feature.termination} onChange={(event) => patch({ termination: event.target.value as "through-all" | "blind" })}><option value="through-all">Pasante</option><option value="blind">Profundidad</option></select></label>
            {feature.termination === "blind" && <NumberField label="Profundidad" value={feature.depth} min={0.1} onChange={(depth) => patch({ depth })} />}
          </section>
        </>
      )}

      {feature.kind === "fillet" && (
        <section className="pcad-property-section"><h3>Redondeo</h3>
          <NumberField label="Radio" value={feature.radius} min={0.1} step={0.5} onChange={(radius) => patch({ radius })} />
          <label className="pcad-select-field"><span>Aristas</span><select value={feature.edges} onChange={(event) => patch({ edges: event.target.value as "vertical" | "all" })}><option value="vertical">Solo verticales</option><option value="all">Todas las aristas</option></select></label>
        </section>
      )}
      <button className="pcad-delete-feature" onClick={onDelete}><Trash2 size={16} /> Eliminar operación</button>
    </div>
  );
}
