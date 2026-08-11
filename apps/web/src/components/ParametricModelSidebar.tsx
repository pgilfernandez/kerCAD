"use client";

import {
  Box,
  ChevronDown,
  ChevronRight,
  CircleDot,
  DraftingCompass,
  Layers3,
  Radius,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parametricObjectTree, sketchForExtrude } from "@/lib/parametricObjects";
import type { ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";

export type ModelSelectionKind = "object" | "feature";

type Props = {
  document: ParametricDocument;
  selectedId: string | null;
  selectionKind: ModelSelectionKind;
  completedFeatureIds: string[];
  treeOpen: boolean;
  onSelect: (id: string, kind: ModelSelectionKind) => void;
  onUpdateObject: (id: string, update: (object: ParametricObject) => void) => void;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
  onDeleteFeature: (id: string) => void;
};

export function ParametricModelSidebar({
  document,
  selectedId,
  selectionKind,
  completedFeatureIds,
  treeOpen,
  onSelect,
  onUpdateObject,
  onUpdateFeature,
  onDeleteFeature,
}: Props) {
  const objects = parametricObjectTree(document);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(objects.map((object) => object.id)));
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

  return (
    <aside className="educad-model-sidebar" aria-label="Modelo paramétrico">
      {treeOpen ? (
        <section className="educad-model-tree">
          <header>
            <div><Layers3 size={18} /><strong>Modelo</strong></div>
            <span>{objects.length} {objects.length === 1 ? "objeto" : "objetos"}</span>
          </header>
          <div className="educad-model-origin"><DraftingCompass size={15} /><span>Origen</span><small>Plano XY</small></div>
          <div ref={objectListRef} className="educad-object-list">
            {objects.map((object) => {
              const isExpanded = expanded.has(object.id);
              const objectSelected = selectionKind === "object" && selectedId === object.id;
              return (
                <div className="educad-object-node" key={object.id}>
                  <div className={`educad-object-row ${objectSelected ? "selected" : ""}`}>
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
                    <button className="educad-object-select" onClick={() => onSelect(object.id, "object")}>
                      <Box size={17} />
                      <span><strong>{object.name}</strong><small>Contenedor</small></span>
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="educad-operation-list" role="group" aria-label={`Operaciones de ${object.name}`}>
                      {object.operations.map((feature, operationIndex) => (
                        <button
                          key={feature.id}
                          className={`${selectionKind === "feature" && selectedId === feature.id ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""}`}
                          onClick={() => onSelect(feature.id, "feature")}
                        >
                          <span className="educad-tree-branch" aria-hidden="true" />
                          <FeatureIcon document={document} feature={feature} />
                          <span className="educad-operation-name">
                            <strong>{feature.name}</strong>
                            <small>{operationIndex + 1}. {featureLabel(feature)}</small>
                          </span>
                          <i title={completedFeatureIds.includes(feature.id) ? "Reconstruida" : "Pendiente"}>
                            {completedFeatureIds.includes(feature.id) ? "✓" : "·"}
                          </i>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="educad-sidebar-editor">
        {selectedObject ? (
          <ParametricObjectInspector object={selectedObject} onUpdate={(update) => onUpdateObject(selectedObject.id, update)} />
        ) : selectedFeature ? (
          <ParametricFeatureInspector
            document={document}
            feature={selectedFeature}
            onUpdateFeature={onUpdateFeature}
            onDelete={() => onDeleteFeature(selectedFeature.id)}
          />
        ) : (
          <div className="educad-no-selection"><Layers3 size={28} /><strong>Selecciona un objeto u operación</strong><span>Despliega el árbol para editar el historial CAD.</span></div>
        )}
      </section>
    </aside>
  );
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  if (feature.kind === "sketch") return <DraftingCompass className="sketch" size={16} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    return sketch?.profile.shape === "circle" ? <CircleDot className={feature.operation === "cut" ? "cut" : "extrude"} size={16} /> : <Box className={feature.operation === "cut" ? "cut" : "extrude"} size={16} />;
  }
  if (feature.kind === "hole") return <CircleDot className="cut" size={16} />;
  return <Radius className="fillet" size={16} />;
}

function featureLabel(feature: ParametricFeature) {
  if (feature.kind === "sketch") return `Boceto ${feature.profile.shape === "rectangle" ? "rectangular" : "circular"}`;
  if (feature.kind === "extrude") {
    return feature.operation === "cut" ? "Operación sustractiva" : feature.operation === "intersect" ? "Intersección" : "Operación aditiva";
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
  return (
    <div className="educad-feature-inspector educad-object-inspector">
      <header><Box size={18} /><div><strong>{object.name}</strong><span>Contenedor de operaciones</span></div></header>
      <TransformGroup label="Posición" values={object.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.position[axis] = value; })} />
      <TransformGroup label="Rotación" values={object.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.rotation[axis] = value; })} />
      <TransformGroup label="Escala" values={object.transform.scale} unit="×" min={0.01} onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.scale[axis] = Math.max(0.01, value); })} />
      <p className="educad-feature-note">El objeto solo transforma el resultado de sus operaciones. La geometría se edita desplegando el árbol.</p>
    </div>
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
  onDelete,
}: {
  document: ParametricDocument;
  feature: ParametricFeature;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
  onDelete: () => void;
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
      <div className="educad-feature-card">
        <label><span>Nombre</span><input value={feature.name} onChange={(event) => onUpdate((draft) => { draft.name = event.target.value; })} /></label>
        <label className="educad-feature-check"><span>Suprimida</span><input type="checkbox" checked={feature.suppressed} onChange={(event) => onUpdate((draft) => { draft.suppressed = event.target.checked; })} /></label>
      </div>

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
          <TransformGroup label="Posición" values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.position[axis] = value; })} />
          <TransformGroup label="Rotación" values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.rotation[axis] = value; })} />
          <div className="educad-feature-card">
            <h3>{primitiveSketch?.profile.shape === "circle" ? "Cilindro" : "Caja"}</h3>
            {primitiveSketch?.profile.shape === "rectangle" ? (
              <>
                <NumberField label="Anchura" value={primitiveSketch.profile.width} min={0.01} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
                <NumberField label="Profundidad" value={primitiveSketch.profile.depth} min={0.01} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
              </>
            ) : primitiveSketch?.profile.shape === "circle" ? (
              <NumberField label="Diámetro" value={primitiveSketch.profile.diameter} min={0.01} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />
            ) : null}
            <NumberField label="Altura" value={feature.distance} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.distance = Math.max(0.01, value); })} />
            <label><span>Operación</span><select value={feature.operation} onChange={(event) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = event.target.value as typeof draft.operation; })}><option value="add">Añadir</option><option value="cut">Sustraer</option><option value="intersect">Intersección</option></select></label>
          </div>
        </>
      ) : null}

      {feature.kind === "hole" ? (
        <div className="educad-feature-card">
          <h3>Taladro</h3>
          <NumberField label="Posición X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.x = value; })} />
          <NumberField label="Posición Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.y = value; })} />
          <NumberField label="Diámetro" value={feature.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.diameter = Math.max(0.01, value); })} />
          <label><span>Final</span><select value={feature.termination} onChange={(event) => onUpdate((draft) => { if (draft.kind === "hole") draft.termination = event.target.value as typeof draft.termination; })}><option value="through-all">Pasante</option><option value="blind">Ciego</option></select></label>
          {feature.termination === "blind" ? <NumberField label="Profundidad" value={feature.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.depth = Math.max(0.01, value); })} /> : null}
        </div>
      ) : null}

      {feature.kind === "fillet" ? (
        <div className="educad-feature-card">
          <h3>Redondeo</h3>
          <NumberField label="Radio" value={feature.radius} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "fillet") draft.radius = Math.max(0.01, value); })} />
          <label><span>Aristas</span><select value={feature.edges} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.edges = event.target.value as typeof draft.edges; })}><option value="vertical">Verticales</option><option value="all">Todas</option></select></label>
        </div>
      ) : null}

      {(feature.kind === "hole" || feature.kind === "fillet") ? <button className="educad-delete-operation" onClick={onDelete}><Trash2 size={16} />Eliminar operación</button> : <p className="educad-feature-note">Esta es la operación base del objeto. Elimínala borrando el contenedor completo.</p>}
    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    return <label><span>{label}</span><span className="educad-number-input"><input type="number" value={value} min={min} step="0.01" onChange={(event) => setNumber(event.target.value, onChange)} /><small>mm</small></span></label>;
  }
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <label><span>{label}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
