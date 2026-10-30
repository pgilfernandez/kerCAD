"use client";

import { LEGACY_PROJECT_ACCEPT } from "@/lib/legacyBrand";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
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
  createEmptyDocument,
  documentHasSolid,
  previousSketch,
  validateDocument,
} from "@/lib/parametricDocument";
import { buildParametricModel, exportParametricStep } from "@/lib/parametricKernel";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint } from "@/lib/parametricBuildState";
import type { BuildResult, ParametricDocument, ParametricFeature } from "@/types/parametric";
import { uiText } from "@/lib/kercadI18n";

const STORAGE_KEY = "kercad.parametric.document.v1";

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
  if (feature.kind === "sketch") return uiText("ui.parametriccadeditor.boceto.2d.a48b0e");
  if (feature.kind === "extrude") return uiText("ui.sketchforgeparametriceditor.extrusion.f1a195");
  if (feature.kind === "hole") return uiText("operation.hole");
  return uiText("toolbar.fillet");
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
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  return (
    <label className="pcad-number-field">
      <span>{label}</span>
      <span className="pcad-input-wrap">
        <input
          aria-label={label}
          type="text"
          inputMode="text"
          min={min}
          max={max}
          step={step}
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            const parsed = parseNumericExpression(draft, suffix);
            if (!validateNumericExpression(event.currentTarget, parsed)) return;
            const next = Math.min(max, Math.max(min, parsed));
            setDraft(String(next)); setEditing(false); onChange(next);
          }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

export function ParametricCadEditor() {
  const starter = useMemo(() => createEmptyDocument(), []);
  const [history, setHistory] = useState<HistoryState>({ entries: [starter], index: 0 });
  const document = history.entries[history.index];
  const [selectedId, setSelectedId] = useState<string | null>(starter.features[0]?.id ?? null);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectRecords: [], operationContext: null, completedFeatureIds: [], failedFeatureId: null, warning: null });
  const [kernelState, setKernelState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<CameraView>({ name: "home", token: 0 });
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showLesson, setShowLesson] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const buildVersion = useRef(0);
  const geometryFingerprint = useMemo(() => parametricGeometryFingerprint(document), [document]);
  const objectColorFingerprint = useMemo(() => parametricObjectColorFingerprint(document), [document]);
  const objectColors = useMemo(() => objectColorsFromFingerprint(objectColorFingerprint), [objectColorFingerprint]);
  const buildDocumentRef = useRef(document);
  buildDocumentRef.current = document;

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
    const buildDocument = buildDocumentRef.current;
    const timer = window.setTimeout(() => {
      buildParametricModel(buildDocument)
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
  }, [geometryFingerprint]);

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
      setNotice({ tone: "info", text: uiText("ui.parametriccadeditor.crea.o.selecciona.un.boceto.antes.de.extruir.bc466e") });
      return;
    }
    const feature = createExtrudeFeature(sketch.id, document.features.filter((item) => item.kind === "extrude").length + 1, documentHasSolid(document.features));
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const addHole = () => {
    if (!documentHasSolid(document.features)) {
      setNotice({ tone: "info", text: uiText("ui.parametriccadeditor.primero.crea.un.solido.con.una.extrusion.96a79a") });
      return;
    }
    const feature = createHoleFeature(document.features.filter((item) => item.kind === "hole").length + 1);
    mutateDocument((draft) => { draft.features.push(feature); });
    setSelectedId(feature.id);
  };

  const addFillet = () => {
    if (!documentHasSolid(document.features)) {
      setNotice({ tone: "info", text: uiText("ui.parametriccadeditor.primero.crea.un.solido.con.una.extrusion.96a79a") });
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
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }), `${safeFileName(document.name)}.kercad.json`);
    setNotice({ tone: "success", text: uiText("ui.parametriccadeditor.documento.parametrico.exportado.320eef") });
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      const blob = await exportParametricStep(document);
      downloadBlob(blob, `${safeFileName(document.name)}.step`);
      setNotice({ tone: "success", text: uiText("ui.parametriccadeditor.step.b.rep.exportado.correctamente.3dfa86") });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : uiText("ui.parametriccadeditor.no.se.pudo.exportar.step.86fba1") });
    } finally {
      setExporting(false);
    }
  };

  const importDocument = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateDocument(parsed)) throw new Error(uiText("ui.parametriccadeditor.el.archivo.no.es.un.documento.kercad.v1.valido.7bbfe3"));
      setHistory({ entries: [parsed], index: 0 });
      setSelectedId(parsed.features[0]?.id ?? null);
      setNotice({ tone: "success", text: uiText("ui.parametriccadeditor.documento.parametrico.abierto.4aad51") });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : uiText("ui.parametriccadeditor.no.se.pudo.abrir.el.archivo.5243e0") });
    }
  };

  const newDocument = () => {
    const next = createEmptyDocument();
    setHistory({ entries: [next], index: 0 });
    setSelectedId(next.features[0]?.id ?? null);
    setNotice({ tone: "info", text: uiText("ui.parametriccadeditor.se.ha.creado.una.pieza.de.ejemplo.nueva.7737d1") });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));

  return (
    <main className="pcad-app">
      <header className="pcad-header">
        <button className="pcad-icon-button pcad-mobile-menu" aria-label={uiText("ui.parametriccadeditor.abrir.menu.256a5c")}><Menu size={20} /></button>
        <div className="pcad-brand" aria-label={uiText("ui.page.kercad.c0bf6d")}>
          <span className="pcad-logo"><Hexagon size={25} strokeWidth={2.4} /><span>e</span></span>
          <strong>edu<span>{uiText("ui.parametriccadeditor.cad.b821b2")}</span></strong>
          <small>{uiText("common.parametric")}</small>
        </div>
        <div className="pcad-project-title">
          <input
            value={document.name}
            aria-label={uiText("ui.parametriccadeditor.nombre.del.proyecto.bcf415")}
            onChange={(event) => mutateDocument((draft) => { draft.name = event.target.value; })}
          />
          <span><Save size={13} /> {uiText("ui.parametriccadeditor.guardado.en.este.navegador.d0f7e7")}</span>
        </div>
        <div className="pcad-header-actions">
          <button onClick={() => setShowLesson(true)} className="pcad-challenge"><GraduationCap size={18} /> {uiText("ui.parametriccadeditor.reto.guiado.f6dee5")}</button>
          <button className="pcad-avatar" aria-label={uiText("ui.parametriccadeditor.perfil.local.354b80")}>P</button>
        </div>
      </header>

      <nav className="pcad-ribbon" aria-label={uiText("ui.parametriccadeditor.herramientas.cad.2b6886")}>
        <div className="pcad-ribbon-group compact">
          <button title={uiText("ui.parametriccadeditor.nueva.pieza.c53d84")} onClick={newDocument}><FileBox size={22} /><span>{uiText("toolbar.newGroup")}</span></button>
          <button title={uiText("ui.parametriccadeditor.importar.documento.a08d0a")} onClick={() => importRef.current?.click()}><Import size={22} /><span>{uiText("common.open")}</span></button>
          <button title={uiText("toolbar.undo")} disabled={history.index === 0} onClick={undo}><Undo2 size={22} /><span>{uiText("toolbar.undo")}</span></button>
          <button title={uiText("toolbar.redo")} disabled={history.index === history.entries.length - 1} onClick={redo}><Redo2 size={22} /><span>{uiText("toolbar.redo")}</span></button>
        </div>
        <div className="pcad-ribbon-group">
          <button onClick={() => addSketch("rectangle")}><Square size={24} /><span>{uiText("ui.parametriccadeditor.boceto.rect.bea8d2")}</span></button>
          <button onClick={() => addSketch("circle")}><CircleDot size={24} /><span>{uiText("ui.parametriccadeditor.boceto.circulo.d29ba0")}</span></button>
          <button onClick={addExtrude}><Box size={24} /><span>{uiText("ui.parametriccadeditor.extruir.b54531")}</span></button>
          <button onClick={addHole}><Grid3X3 size={24} /><span>{uiText("operation.hole")}</span></button>
          <button onClick={addFillet}><Sparkles size={24} /><span>{uiText("ui.parametriccadeditor.redondear.dbcd28")}</span></button>
        </div>
        <div className="pcad-ribbon-spacer" />
        <div className="pcad-ribbon-group export">
          <button onClick={exportDocument}><FileJson size={23} /><span>{uiText("ui.parametriccadeditor.proyecto.cca57b")}</span></button>
          <button onClick={exportStep} disabled={exporting || !build.mesh}>{exporting ? <LoaderCircle className="pcad-spin" size={23} /> : <Download size={23} />}<span>{uiText("ui.parametriccadeditor.step.0c9b85")}</span></button>
        </div>
      </nav>

      <section className="pcad-workspace">
        <aside className="pcad-tree-panel">
          <div className="pcad-panel-heading">
            <span><Shapes size={17} /> {uiText("ui.parametriccadeditor.historial.del.modelo.a88d65")}</span>
            <button aria-label={uiText("ui.parametriccadeditor.opciones.del.historial.55e4a6")}><ChevronDown size={16} /></button>
          </div>
          <div className="pcad-origin-row"><Rotate3D size={16} /><span>{uiText("property.source")}</span><small>{uiText("ui.parametriccadeditor.xy.z.4182ad")}</small></div>
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
            <button onClick={() => moveSelected(-1)} disabled={!selected || document.features[0]?.id === selected.id} title={uiText("ui.parametriccadeditor.subir.operacion.ef6154")}><ArrowUp size={16} /></button>
            <button onClick={() => moveSelected(1)} disabled={!selected || document.features.at(-1)?.id === selected.id} title={uiText("ui.parametriccadeditor.bajar.operacion.f6f830")}><ArrowDown size={16} /></button>
            <button onClick={removeSelected} disabled={!selected} title={uiText("toolbar.deleteOperation")}><Trash2 size={16} /></button>
          </div>
          <div className="pcad-concept-card">
            <span>{uiText("ui.parametriccadeditor.idea.clave.edd8e4")}</span>
            <strong>{uiText("ui.parametriccadeditor.el.orden.importa.7ec9fd")}</strong>
            <p>{uiText("ui.parametriccadeditor.cada.operacion.usa.el.resultado.anterior.arrastr.c0380d")}</p>
          </div>
        </aside>

        <div className="pcad-stage">
          <ParametricViewport mesh={build.mesh} objectRecords={build.objectRecords} objectColors={objectColors} color={document.color} workplane={document.workplane} view={view} />
          <div className="pcad-view-buttons" aria-label={uiText("ui.parametriccadeditor.vistas.de.camara.e6987a")}>
            <button onClick={() => setCamera("top")}>{uiText("ui.parametriccadeditor.sup.92de3a")}</button>
            <button onClick={() => setCamera("front")}>{uiText("ui.parametriccadeditor.fren.fae8a3")}</button>
            <button onClick={() => setCamera("right")}>{uiText("ui.parametriccadeditor.der.8a5f02")}</button>
            <button className="active" onClick={() => setCamera("iso")}>{uiText("ui.parametriccadeditor.iso.4f325d")}</button>
          </div>
          <div className="pcad-navigation-hint"><MousePointer2 size={15} /> {uiText("ui.parametriccadeditor.arrastra.para.orbitar.rueda.para.zoom.arrastra.p.bf02a1")}</div>
          {kernelState === "loading" && <div className="pcad-kernel-status"><LoaderCircle className="pcad-spin" size={17} /> {uiText("ui.parametriccadeditor.reconstruyendo.b.rep.5cd185")}</div>}
          {build.warning && <div className="pcad-build-warning"><strong>{uiText("ui.parametriccadeditor.la.reconstruccion.se.detuvo.31cb52")}</strong><span>{build.warning}</span></div>}
        </div>

        <aside className="pcad-inspector">
          <div className="pcad-panel-heading"><span>{uiText("operation.parameters")}</span><span className="pcad-unit">mm</span></div>
          {selected ? (
            <FeatureInspector
              feature={selected}
              features={document.features}
              onUpdate={(updater) => updateFeature(selected.id, updater)}
              onDelete={removeSelected}
            />
          ) : (
            <div className="pcad-empty-inspector"><MousePointer2 size={28} /><strong>{uiText("ui.parametriccadeditor.selecciona.una.operacion.ba0426")}</strong><span>{uiText("ui.parametriccadeditor.aqui.podras.editar.sus.parametros.26d5b6")}</span></div>
          )}
          {build.mesh && (
            <div className="pcad-metrics">
              <span>{uiText("ui.parametriccadeditor.resultado.exacto.485ce3")}</span>
              <div><small>{uiText("ui.parametriccadeditor.ancho.4fb4e0")}</small><strong>{build.mesh.metrics.width.toFixed(1)} mm</strong></div>
              <div><small>{uiText("ui.parametriccadeditor.fondo.44603f")}</small><strong>{build.mesh.metrics.depth.toFixed(1)} mm</strong></div>
              <div><small>{uiText("ui.parametriccadeditor.alto.f46edd")}</small><strong>{build.mesh.metrics.height.toFixed(1)} mm</strong></div>
              <div><small>{uiText("ui.parametriccadeditor.volumen.9111b3")}</small><strong>{build.mesh.metrics.volume.toFixed(0)} {uiText("ui.parametriccadeditor.mm.44e775")}</strong></div>
            </div>
          )}
        </aside>
      </section>

      <footer className="pcad-statusbar">
        <span className={`pcad-dot ${kernelState}`} />
        <span>{kernelState === "ready" ? uiText("ui.parametriccadeditor.opencascade.listo.14ff2f") : kernelState === "error" ? uiText("ui.parametriccadeditor.error.del.nucleo.95a5a9") : uiText("ui.parametriccadeditor.cargando.nucleo.cad.87b25a")}</span>
        <span className="pcad-status-spacer" />
        <span>{uiText("operation.exactBrep")}</span><span>·</span><span>{uiText("common.operationCount", { count: document.features.length })}</span><span>·</span><span>{uiText("ui.parametriccadeditor.unidades.mm.74c0d1")}</span>
      </footer>

      <input
        ref={importRef}
        type="file"
        accept={".json,.kercad ," + LEGACY_PROJECT_ACCEPT}
        hidden
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDocument(file); event.target.value = ""; }}
      />

      {notice && <div className={`pcad-toast ${notice.tone}`}>{notice.tone === "success" ? <Check size={18} /> : notice.tone === "error" ? <EyeOff size={18} /> : <GraduationCap size={18} />}<span>{notice.text}</span></div>}

      {showLesson && (
        <div className="pcad-modal-backdrop" onMouseDown={() => setShowLesson(false)}>
          <article className="pcad-lesson" onMouseDown={(event) => event.stopPropagation()}>
            <span className="pcad-lesson-badge"><GraduationCap size={18} /> {uiText("ui.parametriccadeditor.reto.01.db5503")}</span>
            <h2>{uiText("ui.parametriccadeditor.convierte.la.placa.en.una.etiqueta.2f686b")}</h2>
            <p>{uiText("ui.parametriccadeditor.edita.parametros.existentes.no.necesitas.empezar.8b1e29")}</p>
            <ol>
              <li>{uiText("ui.parametriccadeditor.cambia.el.11511d")}{" "}<strong>{uiText("ui.parametriccadeditor.ancho.del.boceto.base.a.90.mm.560a53")}</strong>.</li>
              <li>{uiText("ui.parametriccadeditor.pon.los.taladros.en.64a2ef")}{" "}<strong>X = −32 y X = 32</strong>.</li>
              <li>{uiText("ui.parametriccadeditor.reduce.el.redondeo.exterior.a.ed1089")}{" "}<strong>{uiText("ui.kercadaboutcontent.3.mm.a7c82d")}</strong>.</li>
              <li>{uiText("ui.parametriccadeditor.exporta.el.resultado.como.57135c")}{" "}<strong>{uiText("ui.parametriccadeditor.step.0c9b85")}</strong>.</li>
            </ol>
            <button onClick={() => setShowLesson(false)}>{uiText("ui.parametriccadeditor.empezar.el.reto.5d64f1")}</button>
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
        <span><Eye size={16} /> {uiText("ui.parametriccadeditor.operacion.activa.eb57e5")}</span>
        <input type="checkbox" checked={!feature.suppressed} onChange={(event) => patch({ suppressed: !event.target.checked })} />
      </label>

      {feature.kind === "sketch" && (
        <>
          <section className="pcad-property-section"><h3>{uiText("ui.parametriccadeditor.plano.y.posicion.7cc81c")}</h3>
            <label className="pcad-select-field"><span>{uiText("property.plane")}</span><select value={feature.plane} disabled><option>{uiText("ui.parametriccadeditor.xy.034f19")}</option></select></label>
            <div className="pcad-field-grid"><NumberField label={uiText("ui.parametriccadeditor.centro.x.ba4678")} value={feature.x} onChange={(x) => patch({ x })} /><NumberField label={uiText("ui.parametriccadeditor.centro.y.6496a7")} value={feature.y} onChange={(y) => patch({ y })} /></div>
            <NumberField label={uiText("ui.parametriccadeditor.desfase.del.plano.7461f2")} value={feature.offset} onChange={(offset) => patch({ offset })} />
          </section>
          <section className="pcad-property-section"><h3>{uiText("ui.parametriccadeditor.cotas.del.perfil.ab7fbf")}</h3>
            {feature.profile.shape === "rectangle" ? (
              <div className="pcad-field-grid">
                <NumberField label={uiText("ui.parametriccadeditor.ancho.4fb4e0")} value={feature.profile.width} min={0.1} onChange={(width) => patch({ profile: { shape: "rectangle", width, depth: feature.profile.shape === "rectangle" ? feature.profile.depth : 30 } })} />
                <NumberField label={uiText("ui.parametriccadeditor.fondo.44603f")} value={feature.profile.depth} min={0.1} onChange={(depth) => patch({ profile: { shape: "rectangle", width: feature.profile.shape === "rectangle" ? feature.profile.width : 40, depth } })} />
              </div>
            ) : feature.profile.shape === "circle" ? <NumberField label={uiText("property.diameter")} value={feature.profile.diameter} min={0.1} onChange={(diameter) => patch({ profile: { shape: "circle", diameter } })} /> : <p>{uiText("ui.parametriccadeditor.boceto.dibujado.en.el.editor.2d.c7cbf9")}</p>}
            <div className="pcad-constraint-ok"><Check size={14} /> {uiText("ui.parametriccadeditor.boceto.totalmente.acotado.4a69cf")}</div>
          </section>
        </>
      )}

      {feature.kind === "extrude" && (
        <>
          <section className="pcad-property-section"><h3>{uiText("property.reference")}</h3>
            <label className="pcad-select-field"><span>{uiText("operation.sketch")}</span><select value={feature.sketchId} onChange={(event) => patch({ sketchId: event.target.value })}>{features.filter((item) => item.kind === "sketch").map((sketch) => <option key={sketch.id} value={sketch.id}>{sketch.name}</option>)}</select></label>
          </section>
          <section className="pcad-property-section"><h3>{uiText("model.operation")}</h3>
            <label className="pcad-select-field"><span>{uiText("property.result")}</span><select value={feature.operation} onChange={(event) => patch({ operation: event.target.value as "add" | "cut" | "intersect" })}><option value="add">{uiText("model.add")}</option><option value="cut">{uiText("ui.parametriccadeditor.sustraer.dc08cc")}</option><option value="intersect">{uiText("ui.parametriccadeditor.interseccion.c8c96c")}</option></select></label>
            <NumberField label={uiText("property.distance")} value={feature.distance} min={0.1} onChange={(distance) => patch({ distance })} />
            <label className="pcad-toggle-row inset"><span>{uiText("ui.parametriccadeditor.simetrica.al.plano.7ba27c")}</span><input type="checkbox" checked={feature.symmetric} onChange={(event) => patch({ symmetric: event.target.checked })} /></label>
          </section>
        </>
      )}

      {feature.kind === "hole" && (
        <>
          <section className="pcad-property-section"><h3>{uiText("ui.parametriccadeditor.posicion.del.centro.2258b2")}</h3><div className="pcad-field-grid"><NumberField label="X" value={feature.x} onChange={(x) => patch({ x })} /><NumberField label="Y" value={feature.y} onChange={(y) => patch({ y })} /></div></section>
          <section className="pcad-property-section"><h3>{uiText("operation.hole")}</h3>
            <NumberField label={uiText("property.diameter")} value={feature.diameter} min={0.1} onChange={(diameter) => patch({ diameter })} />
            <label className="pcad-select-field"><span>{uiText("property.termination")}</span><select value={feature.termination} onChange={(event) => patch({ termination: event.target.value as "through-all" | "blind" })}><option value="through-all">{uiText("value.throughAll")}</option><option value="blind">{uiText("property.depth")}</option></select></label>
            {feature.termination === "blind" && <NumberField label={uiText("property.depth")} value={feature.depth} min={0.1} onChange={(depth) => patch({ depth })} />}
          </section>
        </>
      )}

      {feature.kind === "fillet" && (
        <section className="pcad-property-section"><h3>{uiText("toolbar.fillet")}</h3>
          <NumberField label={uiText("property.radius")} value={feature.radius} min={0.1} step={0.5} onChange={(radius) => patch({ radius })} />
          <label className="pcad-select-field"><span>{uiText("property.edges")}</span><select value={feature.edges} onChange={(event) => patch({ edges: event.target.value as "vertical" | "all" })}><option value="vertical">{uiText("ui.parametriccadeditor.solo.verticales.c03a43")}</option><option value="all">{uiText("ui.parametriccadeditor.todas.las.aristas.3ae805")}</option></select></label>
        </section>
      )}
      <button className="pcad-delete-feature" onClick={onDelete}><Trash2 size={16} /> {uiText("toolbar.deleteOperation")}</button>
    </div>
  );
}
