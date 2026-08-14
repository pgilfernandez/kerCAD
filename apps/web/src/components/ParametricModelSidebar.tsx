"use client";

import {
  Box,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleOff,
  DraftingCompass,
  Eye,
  EyeOff,
  Layers3,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Radius,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { parametricObjectTree, sketchForExtrude } from "@/lib/parametricObjects";
import type { ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";

export type ModelSelectionKind = "object" | "feature";
export type ModelSidebarMode = "normal" | "simplified";

const OBJECT_COLORS = [
  "#d41721", "#ff7a1a", "#f2cf10", "#33983d", "#18b99a", "#0098c7", "#3b82f6",
  "#294c93", "#6e2786", "#c9009a", "#8a5a2b", "#ffffff", "#cfd8df", "#8a98a6", "#4b5563", "#111111",
];

type Props = {
  document: ParametricDocument;
  selectedId: string | null;
  selectionKind: ModelSelectionKind;
  mode: ModelSidebarMode;
  onSelect: (id: string, kind: ModelSelectionKind) => void;
  onUpdateObject: (id: string, update: (object: ParametricObject) => void) => void;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
};

export function ParametricModelSidebar({
  document,
  selectedId,
  selectionKind,
  mode,
  onSelect,
  onUpdateObject,
  onUpdateFeature,
}: Props) {
  const objects = parametricObjectTree(document);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(objects.map((object) => object.id)));
  const [renameTarget, setRenameTarget] = useState<{ id: string; kind: ModelSelectionKind; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const objectListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const object of objects) next.add(object.id);
      return next;
    });
  }, [document.features.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      objectListRef.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, selectedId, selectionKind]);

  const selectedFeature = selectionKind === "feature"
    ? document.features.find((feature) => feature.id === selectedId) ?? null
    : null;
  const selectedObject = selectionKind === "object"
    ? document.objects.find((object) => object.id === selectedId) ?? null
    : null;

  const beginRename = (id: string, kind: ModelSelectionKind, name: string) => {
    setRenameTarget({ id, kind, name });
    setRenameDraft(name);
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameDraft("");
  };

  const commitRename = () => {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) return;
    if (renameTarget.kind === "object") onUpdateObject(renameTarget.id, (object) => { object.name = name; });
    else onUpdateFeature(renameTarget.id, (feature) => { feature.name = name; });
    closeRename();
  };

  return (
    <>
    <aside className={`educad-model-sidebar ${mode}`} aria-label="Modelo paramétrico">
        <section className="educad-model-tree">
          <div ref={objectListRef} className="educad-object-list">
            {objects.map((object) => {
              const isExpanded = expanded.has(object.id);
              const objectSelected = selectionKind === "object" && selectedId === object.id;
              return (
                <div className="educad-object-node" key={object.id}>
                  <div className={`educad-object-row ${objectSelected ? "selected" : ""} ${object.object.visible ? "" : "hidden"} ${object.object.locked ? "locked" : ""}`} style={{ "--object-color": object.object.color } as CSSProperties}>
                    <button
                      className="educad-tree-toggle"
                      aria-label={isExpanded ? `Contraer ${object.name}` : `Desplegar ${object.name}`}
                      aria-expanded={isExpanded}
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(object.id)) next.delete(object.id); else next.add(object.id);
                        return next;
                      })}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <button className="educad-object-select" title={object.name} onClick={() => onSelect(object.id, "object")}>
                      <Box size={17} />
                      <span><strong>{object.name}</strong></span>
                    </button>
                    <div className="educad-tree-actions">
                      <button aria-label={`Renombrar ${object.name}`} title="Renombrar" onClick={() => beginRename(object.id, "object", object.name)}><Pencil size={14} /></button>
                      <button aria-label={object.object.visible ? `Ocultar ${object.name}` : `Mostrar ${object.name}`} title={object.object.visible ? "Ocultar" : "Mostrar"} aria-pressed={!object.object.visible} onClick={() => onUpdateObject(object.id, (draft) => { draft.visible = !draft.visible; })}>{object.object.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                      <button aria-label={object.object.locked ? `Desbloquear ${object.name}` : `Bloquear ${object.name}`} title={object.object.locked ? "Desbloquear" : "Bloquear"} aria-pressed={object.object.locked} onClick={() => onUpdateObject(object.id, (draft) => { draft.locked = !draft.locked; })}>{object.object.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}</button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="educad-operation-list" role="group" aria-label={`Operaciones de ${object.name}`}>
                      {object.operations.map((feature) => (
                        <div key={feature.id} className={`educad-operation-row ${selectionKind === "feature" && selectedId === feature.id ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""} ${operationClass(feature)}`}>
                          <button className="educad-operation-select" title={feature.name} onClick={() => onSelect(feature.id, "feature")}>
                            <span className="educad-tree-branch" aria-hidden="true" />
                            <FeatureIcon document={document} feature={feature} />
                            <span className="educad-operation-name"><strong>{feature.name}</strong></span>
                          </button>
                          <div className="educad-tree-actions">
                            <button aria-label={`Renombrar ${feature.name}`} title="Renombrar" onClick={() => beginRename(feature.id, "feature", feature.name)}><Pencil size={14} /></button>
                            <button aria-label={feature.suppressed ? `Activar ${feature.name}` : `Suprimir ${feature.name}`} title={feature.suppressed ? "Activar" : "Suprimir"} aria-pressed={feature.suppressed} onClick={() => onUpdateFeature(feature.id, (draft) => { draft.suppressed = !draft.suppressed; })}><CircleOff size={15} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

      {mode === "normal" ? <section className="educad-sidebar-editor">
        {selectedObject ? (
          <ParametricObjectInspector object={selectedObject} onUpdate={(update) => onUpdateObject(selectedObject.id, update)} />
        ) : selectedFeature ? (
          <ParametricFeatureInspector
            document={document}
            feature={selectedFeature}
            onUpdateFeature={onUpdateFeature}
          />
        ) : (
          <div className="educad-no-selection"><Layers3 size={28} /><strong>Selecciona un objeto u operación</strong><span>Despliega el árbol para editar el historial CAD.</span></div>
        )}
      </section> : null}
    </aside>
    {renameTarget ? (
      <div className="educad-dialog-backdrop" role="presentation" onPointerDown={closeRename}>
        <form className="educad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="educad-rename-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
          <header><strong id="educad-rename-title">Renombrar {renameTarget.kind === "object" ? "objeto" : "operación"}</strong><button type="button" aria-label="Cancelar" onClick={closeRename}><X size={18} /></button></header>
          <label><span>Nombre</span><input autoFocus value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") closeRename(); }} /></label>
          <footer><button type="button" onClick={closeRename}>Cancelar</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>OK</button></footer>
        </form>
      </div>
    ) : null}
    </>
  );
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  if (feature.kind === "sketch") return <DraftingCompass className="sketch" size={16} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    const label = feature.operation === "cut" ? "Hueco" : feature.operation === "intersect" ? "Común" : "Añadir";
    return <span className={`educad-operation-icon ${role}`} role="img" aria-label={`${sketch?.profile.shape === "circle" ? "Cilindro" : "Caja"}: ${label}`}>{sketch?.profile.shape === "circle" ? <CircleDot size={17} /> : <Box size={17} />}<small aria-hidden="true">{role === "add" ? "+" : role === "hole" ? "−" : "∩"}</small></span>;
  }
  if (feature.kind === "hole") return <CircleDot className="drill-hole" size={16} />;
  return <Radius className="fillet" size={16} />;
}

function operationClass(feature: ParametricFeature) {
  if (feature.kind !== "extrude") return `operation-${feature.kind}`;
  return `operation-${feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add"}`;
}

function featureLabel(feature: ParametricFeature) {
  if (feature.kind === "sketch") return `Boceto ${feature.profile.shape === "rectangle" ? "rectangular" : "circular"}`;
  if (feature.kind === "extrude") {
    return feature.operation === "cut" ? "Hueco" : feature.operation === "intersect" ? "Común" : "Añadir";
  }
  if (feature.kind === "hole") return "Taladro";
  return "Redondeo";
}

function ParametricObjectInspector({
  object,
  onUpdate,
}: {
  object: ParametricObject;
  onUpdate: (update: (object: ParametricObject) => void) => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <div className="educad-feature-inspector educad-object-inspector">
      <header><Box size={18} /><div><strong>{object.name}</strong><span>Contenedor de operaciones</span></div></header>
      <TransformSection>
        <TransformGroup label="Posición" values={object.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.position[axis] = value; })} />
        <TransformGroup label="Rotación" values={object.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.rotation[axis] = value; })} />
        <TransformGroup label="Escala" values={object.transform.scale} unit="×" min={0.01} onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.scale[axis] = Math.max(0.01, value); })} />
      </TransformSection>
      <div className="educad-feature-card educad-object-appearance">
        <button className="educad-color-trigger" aria-expanded={colorOpen} onClick={() => setColorOpen((value) => !value)}>
          <span>Color</span><span className="educad-color-preview" style={{ "--object-color": object.color } as CSSProperties} /><strong>{object.color.toUpperCase()}</strong><ChevronDown size={15} />
        </button>
        {colorOpen ? <div className="educad-color-palette" role="group" aria-label="Color del objeto">
          {OBJECT_COLORS.map((color) => <button key={color} className={object.color.toLowerCase() === color ? "selected" : ""} aria-label={`Color ${color}`} title={color.toUpperCase()} style={{ "--object-color": color } as CSSProperties} onClick={() => { onUpdate((draft) => { draft.color = color; }); setColorOpen(false); }} />)}
          <label className="educad-custom-color" title="Color personalizado"><input type="color" value={object.color} onChange={(event) => onUpdate((draft) => { draft.color = event.target.value; })} /><span>+</span></label>
        </div> : null}
      </div>
      <p className="educad-feature-note">El objeto solo transforma el resultado de sus operaciones. La geometría se edita desplegando el árbol.</p>
    </div>
  );
}

function TransformSection({ children, description = "Posición · rotación · escala" }: { children: ReactNode; description?: string }) {
  return (
    <details className="educad-transform-section">
      <summary><ChevronRight size={16} /><span>Transformación</span><small>{description}</small></summary>
      <div>{children}</div>
    </details>
  );
}

function TransformGroup({
  label,
  values,
  unit,
  min,
  onUpdate,
}: {
  label: string;
  values: { x: number; y: number; z: number };
  unit: string;
  min?: number;
  onUpdate: (axis: "x" | "y" | "z", value: number) => void;
}) {
  return (
    <div className="educad-feature-card educad-transform-card">
      <h3>{label}</h3>
      {(["x", "y", "z"] as const).map((axis) => (
        <label key={axis}>
          <span className={`educad-axis-label ${axis}`}>{axis.toUpperCase()}</span>
          <span className="educad-number-input"><input type="number" value={values[axis]} min={min} step="0.01" onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) onUpdate(axis, value); }} /><small>{unit}</small></span>
        </label>
      ))}
    </div>
  );
}

function ParametricFeatureInspector({
  document,
  feature,
  onUpdateFeature,
}: {
  document: ParametricDocument;
  feature: ParametricFeature;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
}) {
  const onUpdate = (update: (feature: ParametricFeature) => void) => onUpdateFeature(feature.id, update);
  const primitiveSketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  const setNumber = (value: string, apply: (value: number) => void) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) apply(parsed);
  };

  return (
    <div className="educad-feature-inspector">
      <header>
        <FeatureIcon document={document} feature={feature} />
        <div><strong>{feature.name}</strong><span>{featureLabel(feature)}</span></div>
      </header>

      {feature.kind === "sketch" ? (
        <div className="educad-feature-card">
          <h3>Boceto</h3>
          <ReadOnlyField label="Plano" value={feature.plane} />
          <ReadOnlyField label="Perfil" value={feature.profile.shape === "rectangle" ? "Rectángulo" : "Círculo"} />
          <NumberField label="Posición X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.x = value; })} />
          <NumberField label="Posición Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.y = value; })} />
          <NumberField label="Desfase Z" value={feature.offset} min={0} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.offset = value; })} />
          {feature.profile.shape === "rectangle" ? (
            <>
              <NumberField label="Anchura" value={feature.profile.width} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
              <NumberField label="Profundidad" value={feature.profile.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
            </>
          ) : (
            <NumberField label="Diámetro" value={feature.profile.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />
          )}
        </div>
      ) : null}

      {feature.kind === "extrude" ? (
        <>
          <TransformSection description="Posición · rotación">
            <TransformGroup label="Posición" values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.position[axis] = value; })} />
            <TransformGroup label="Rotación" values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
          <div className="educad-feature-card">
            <h3>{primitiveSketch?.profile.shape === "circle" ? "Cilindro" : "Caja"}</h3>
            {primitiveSketch?.profile.shape === "rectangle" ? (
              <>
                <BoundedNumberField label="Anchura" value={primitiveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
                <BoundedNumberField label="Profundidad" value={primitiveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
              </>
            ) : primitiveSketch?.profile.shape === "circle" ? (
              <BoundedNumberField label="Diámetro" value={primitiveSketch.profile.diameter} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />
            ) : null}
            <BoundedNumberField label="Altura" value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.distance = Math.max(0.01, value); })} />
            <label><span>Operación</span><select value={feature.operation} onChange={(event) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = event.target.value as typeof draft.operation; })}><option value="add">Añadir</option><option value="cut">Hueco</option><option value="intersect">Común</option></select></label>
          </div>
        </>
      ) : null}

      {feature.kind === "hole" ? (
        <div className="educad-feature-card">
          <h3>Taladro</h3>
          <NumberField label="Posición X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.x = value; })} />
          <NumberField label="Posición Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.y = value; })} />
          <BoundedNumberField label="Diámetro" value={feature.diameter} min={0.01} max={100} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.diameter = Math.max(0.01, value); })} />
          <label><span>Final</span><select value={feature.termination} onChange={(event) => onUpdate((draft) => { if (draft.kind === "hole") draft.termination = event.target.value as typeof draft.termination; })}><option value="through-all">Pasante</option><option value="blind">Ciego</option></select></label>
          {feature.termination === "blind" ? <BoundedNumberField label="Profundidad" value={feature.depth} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.depth = Math.max(0.01, value); })} /> : null}
        </div>
      ) : null}

      {feature.kind === "fillet" ? (
        <div className="educad-feature-card">
          <h3>Redondeo</h3>
          <BoundedNumberField label="Radio" value={feature.radius} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "fillet") draft.radius = Math.max(0.01, value); })} />
          <label><span>Aristas</span><select value={feature.edges} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.edges = event.target.value as typeof draft.edges; })}><option value="vertical">Verticales</option><option value="all">Todas</option></select></label>
        </div>
      ) : null}

    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    return <label><span>{label}</span><span className="educad-number-input"><input type="number" value={value} min={min} step="0.01" onChange={(event) => setNumber(event.target.value, onChange)} /><small>mm</small></span></label>;
  }
}

function BoundedNumberField({ label, value, min, max, step = 0.01, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const clampedValue = Math.min(max, Math.max(min, value));
  const [draft, setDraft] = useState(clampedValue);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setDraft(clampedValue);
  }, [clampedValue, dragging]);
  const percent = ((draft - min) / Math.max(Number.EPSILON, max - min)) * 100;
  const commit = () => {
    setDragging(false);
    const next = Math.min(max, Math.max(min, draft));
    setDraft(next);
    if (next !== value) onChange(next);
  };
  return (
    <label className="educad-range-property" style={{ "--slider-pos": `${percent}%` } as CSSProperties}>
      <span className="educad-range-header"><span>{label}</span><span className="educad-number-input"><input type="number" value={draft} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setDraft(next); }} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(clampedValue); event.currentTarget.blur(); } }} /><small>mm</small></span></span>
      <span className="educad-range-control"><input type="range" aria-label={label} value={draft} min={min} max={max} step={step} onPointerDown={() => setDragging(true)} onPointerUp={commit} onPointerCancel={commit} onChange={(event) => setDraft(Number(event.target.value))} onBlur={commit} /></span>
    </label>
  );
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <label><span>{label}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
