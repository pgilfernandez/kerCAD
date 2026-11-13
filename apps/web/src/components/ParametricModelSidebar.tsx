"use client";

import { CylinderProfileButtons } from "@/components/CylinderProfileButtons";
import { normalizeGeneratedPath, spiralTypes } from "@/lib/parametricPaths";
import { PlatonicTypeButtons } from "@/components/PlatonicTypeButtons";
import { setSphereEllipsoidal } from "@/lib/parametricObjects";
import type { GeneratedPath, SpiralType } from "@/types/parametric";

import { OperationTreeIcon } from "@/components/OperationTreeIcon";
import { AnnotationIcon } from "@/components/AnnotationIcon";
import { ShellCornerButtons } from "@/components/ShellCornerButtons";
import { ReferenceDisplayButtons } from "@/components/ReferenceDisplayButtons";
import { enableToolbarMouseScroll } from "@/lib/toolbarScroll";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Layers3,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { createContext, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { ANNOTATIONS_GROUP_ID, canReorderAnnotation, canReorderParametricSelection, canResetParametricFeature, OBJECT_COLOR_PALETTE, parametricObjectTree, sketchForExtrude, updateParametricTreeSelection, type ParametricTreeSelection } from "@/lib/parametricObjects";
import { localizedParametricOperationDefinition, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import { parametricTextFontNames, updateParametricTextSketch } from "@/lib/parametricText";
import { textFontNames } from "@/lib/textFonts";
import { AnnotationEndSelector } from "@/components/AnnotationEndSelector";
import { annotationEnding, setAnnotationEnding } from "@/lib/annotationEndings";
import { requiresAddOperation } from "@/lib/parametricOperationModes";
import { ToolbarBooleanModeIcon, ToolbarChamferIcon, ToolbarFilletIcon } from "@/components/icons";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { displayLengthToMillimeters, displayUnitLabel, millimetersToDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { parseNumericExpression, validateNumericExpression } from "@/lib/numericExpression";
import { kercadTranslate, type KercadLocale, type KercadTranslationKey } from "@/lib/kercadI18n";
import type { ParametricAnnotation, ParametricDocument, ParametricFeature, ParametricObject } from "@/types/parametric";
import { annotationAngleGeometry, annotationPosition, type AnnotationPoint } from "@/lib/annotationGeometry";
import { uiText, translateSourceText } from "@/lib/kercadI18n";

export type ModelSelectionKind = "object" | "feature";
export type ModelSidebarMode = "normal" | "simplified";
export type ModelTreeSelection = ParametricTreeSelection;

const NumericStepContext = createContext({ input: 0.5, slider: 0.1, displayUnit: "mm" as ParametricDisplayUnit });
const LocaleContext = createContext<KercadLocale>("en");
const useSidebarTranslation = () => {
  const locale = useContext(LocaleContext);
  return (key: KercadTranslationKey) => kercadTranslate(locale, key);
};



function localizedSidebarLiteral(locale: KercadLocale, text: string) {
  return translateSourceText(text, locale);
}

function useLocalizedSidebarLiteral(text: string) {
  return localizedSidebarLiteral(useContext(LocaleContext), text);
}

type Props = {
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onUpdateAnnotation?: (id: string, update: (annotation: ParametricAnnotation) => void) => void;
  onUpdateAnnotationGroup?: (update: Partial<{ expanded: boolean; position: number; visible: boolean }>) => void;
  document: ParametricDocument;
  selection: ModelTreeSelection[];
  mode: ModelSidebarMode;
  editingOriginObjectId: string | null;
  failedFeatureId?: string | null;
  gridStep: number;
  displayUnit?: ParametricDisplayUnit;
  locale?: KercadLocale;
  onSelectionChange: (selection: ModelTreeSelection[]) => void;
  alignmentReference?: ModelTreeSelection | null;
  onAlignmentSelect?: (node: ModelTreeSelection) => void;
  onReorderSelection: (direction: "up" | "down") => void;
  onRenameSelection: (name: string) => void;
  onResetFeature: (featureId: string) => void;
  onDeleteSelection: () => void;
  onToggleOriginEdit: (objectId: string) => void;
  onEditFeatureSelection: (featureId: string) => void;
  onEditSketch: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  onEditShellSelection: (featureId: string) => void;
  onEditRevolveFace: (featureId: string) => void;
  onEditRevolveAxis: (featureId: string) => void;
  onEditMirrorPlane: (featureId: string) => void;
  edgeTreatmentDraft: { treatment: "fillet" | "chamfer"; radius: number; faceCount: number; edgeCount: number; editing: boolean } | null;
  onEdgeTreatmentDraftChange: (update: Partial<{ treatment: "fillet" | "chamfer"; radius: number }>) => void;
  onAcceptEdgeTreatment: () => void;
  onCancelEdgeTreatment: () => void;
  faceExtrudeDraft: { operation: "add" | "cut"; distance: number; faceCount: number; editing: boolean } | null;
  onFaceExtrudeDraftChange: (update: Partial<{ operation: "add" | "cut"; distance: number }>) => void;
  onAcceptFaceExtrude: () => void;
  onCancelFaceExtrude: () => void;
  shellDraft: { thickness: number; cornerType?: "rounded" | "sharp"; faceCount: number; editing: boolean } | null;
  onShellCornerTypeChange: (cornerType: "rounded" | "sharp") => void;
  onShellDraftChange: (thickness: number) => void;
  onAcceptShell: () => void;
  onCancelShell: () => void;
  revolveDraft: { operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge"; faceCount: number; edgeCount: number; editing: boolean } | null;
  onRevolveDraftChange: (update: Partial<{ operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge" }>) => void;
  onAcceptRevolve: () => void;
  onCancelRevolve: () => void;
  onUpdateObject: (id: string, update: (object: ParametricObject) => void) => void;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
};

export function ParametricModelSidebar({
  selectedAnnotationId = null,
  onSelectAnnotation,
  onUpdateAnnotation,
  onUpdateAnnotationGroup,
  document,
  selection,
  mode,
  editingOriginObjectId,
  failedFeatureId = null,
  gridStep,
  displayUnit = "mm",
  locale = "es",
  onSelectionChange,
  alignmentReference,
  onAlignmentSelect,
  onReorderSelection,
  onRenameSelection,
  onResetFeature,
  onDeleteSelection,
  onToggleOriginEdit,
  onEditFeatureSelection,
  onEditSketch,
  onEditFaceExtrudeSelection,
  onEditShellSelection,
  onEditRevolveFace,
  onEditRevolveAxis,
  onEditMirrorPlane,
  edgeTreatmentDraft,
  onEdgeTreatmentDraftChange,
  onAcceptEdgeTreatment,
  onCancelEdgeTreatment,
  faceExtrudeDraft,
  onFaceExtrudeDraftChange,
  onAcceptFaceExtrude,
  onCancelFaceExtrude,
  shellDraft,
  onShellDraftChange,
  onShellCornerTypeChange,
  onAcceptShell,
  onCancelShell,
  revolveDraft,
  onRevolveDraftChange,
  onAcceptRevolve,
  onCancelRevolve,
  onUpdateObject,
  onUpdateFeature,
}: Props) {
  const objects = parametricObjectTree(document);
  const annotationsExpanded = document.annotationGroup?.expanded !== false;
  const annotationsVisible = document.annotationGroup?.visible !== false;
  const annotationGroupSelected = selectedAnnotationId === ANNOTATIONS_GROUP_ID;
  const reorderSelection: ModelTreeSelection[] = annotationGroupSelected ? [{ id: ANNOTATIONS_GROUP_ID, kind: "object" }] : selection;
  const rootNodes: Array<(typeof objects)[number] | null> = [...objects];
  if (document.annotations?.length) rootNodes.splice(document.annotationGroup?.position ?? 0, 0, null);
  const selectedAnnotation = document.annotations?.find((annotation) => annotation.id === selectedAnnotationId);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const objectListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = objectListRef.current;
    if (mode === "simplified" && list) return enableToolbarMouseScroll(list, true);
  }, [mode, document.objects, document.annotations]);
  const rangeAnchorRef = useRef<ModelTreeSelection | null>(null);
  const primarySelection = selection.at(-1) ?? null;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const t = (key: KercadTranslationKey) => kercadTranslate(locale, key);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      objectListRef.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document.objects, selectedId, selectionKind, selection.length]);

  useEffect(() => {
    if (!renameOpen) return;
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renameOpen]);

  const visibleNodes: ModelTreeSelection[] = objects.flatMap((object) => [
    { id: object.id, kind: "object" as const },
    ...(object.object.expanded ? object.operations.map((feature) => ({ id: feature.id, kind: "feature" as const })) : []),
  ]);
  const selectNode = (node: ModelTreeSelection, event: MouseEvent) => {
    if (onAlignmentSelect) { onAlignmentSelect(node); return; }
    onSelectionChange(updateParametricTreeSelection(selection, node, visibleNodes, rangeAnchorRef.current ?? primarySelection, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
    if (!event.shiftKey) rangeAnchorRef.current = node;
  };

  const alignmentClass = (id: string, kind: ModelTreeSelection["kind"]) => {
    if (!alignmentReference || !selection.some(item => item.id === id && item.kind === kind)) return "";
    return alignmentReference.id === id && alignmentReference.kind === kind ? "alignment-reference" : "alignment-moving";
  };

  const selectedFeature = selection.length === 1 && selectionKind === "feature"
    ? document.features.find((feature) => feature.id === selectedId) ?? null
    : null;
  const selectedObject = selection.length === 1 && selectionKind === "object"
    ? document.objects.find((object) => object.id === selectedId) ?? null
    : null;

  const beginRename = () => {
    if (selectedAnnotation) {
      setRenameDraft(selectedAnnotation.name);
      setRenameOpen(true);
      return;
    }
    if (selection.length === 0) return;
    const names = selection.flatMap((item) => {
      const entry = item.kind === "object"
        ? document.objects.find((object) => object.id === item.id)
        : document.features.find((feature) => feature.id === item.id);
      return entry ? [entry.name] : [];
    });
    setRenameDraft(names.length > 0 && names.every((name) => name === names[0]) ? names[0] : "");
    setRenameOpen(true);
  };

  const closeRename = () => {
    setRenameOpen(false);
    setRenameDraft("");
  };

  const commitRename = () => {
    if (!renameOpen) return;
    const name = renameDraft.trim();
    if (!name) return;
    if (selectedAnnotation) onUpdateAnnotation?.(selectedAnnotation.id, (annotation) => { annotation.name = name; });
    else onRenameSelection(name);
    closeRename();
  };
  const renameDialogRef = useAccessibleDialog<HTMLFormElement>(renameOpen, closeRename, renameInputRef);

  return (
    <LocaleContext.Provider value={locale}><NumericStepContext.Provider value={{ input: Math.max(0.0001, gridStep / 2), slider: Math.max(0.0001, gridStep / 10), displayUnit }}><>
    <aside className={`kercad-model-sidebar ${mode}`} aria-label={kercadTranslate(locale, "model.label")}>
        <section className="kercad-model-tree">
          <div ref={objectListRef} className="kercad-object-list">
            {rootNodes.map((object) => {
              if (!object) return (
                <div className="kercad-object-node" key={ANNOTATIONS_GROUP_ID}>
                  <div className={`kercad-object-row ${annotationGroupSelected ? "selected" : ""} ${annotationsVisible ? "" : "hidden"}`}>
                    <button className="kercad-tree-toggle" aria-label={t("annotation.group")} aria-expanded={annotationsExpanded} onClick={() => onUpdateAnnotationGroup?.({ expanded: !annotationsExpanded })}><OperationTreeIcon file={annotationsExpanded ? "expanded" : "collapsed"} size={16} /></button>
                    <button className="kercad-object-select" title={t("annotation.group")} aria-pressed={annotationGroupSelected} aria-expanded={mode === "simplified" ? annotationsExpanded : undefined} onClick={() => {
                      if (mode === "simplified" && annotationGroupSelected) onUpdateAnnotationGroup?.({ expanded: !annotationsExpanded });
                      else onSelectAnnotation?.(ANNOTATIONS_GROUP_ID);
                    }}><AnnotationIcon kind="group" /><span><strong>{t("annotation.group")}</strong></span></button>
                    <div className="kercad-tree-actions"><button title={annotationsVisible ? t("model.hide") : t("model.show")} aria-label={`${annotationsVisible ? t("model.hide") : t("model.show")} ${t("annotation.group")}`} aria-pressed={!annotationsVisible} onClick={() => onUpdateAnnotationGroup?.({ visible: !annotationsVisible })}><OperationTreeIcon file={annotationsVisible ? "visible" : "hidden"} size={15} /></button></div>
                  </div>
                  {annotationsExpanded && <div className="kercad-operation-list" role="group" aria-label={t("annotation.group")}>
                    {document.annotations?.map((annotation) => <div key={annotation.id} className={`kercad-operation-row ${selectedAnnotationId === annotation.id ? "selected" : ""} ${annotation.visible ? "" : "hidden"}`}>
                      <button className="kercad-operation-select" title={annotation.name} aria-pressed={selectedAnnotationId === annotation.id} onClick={() => onSelectAnnotation?.(annotation.id)}><span className="kercad-tree-branch" aria-hidden="true" /><AnnotationIcon kind={annotation.kind} /><span className="kercad-operation-name"><strong>{annotation.name}</strong></span></button>
                      <div className="kercad-tree-actions"><button aria-pressed={!annotation.visible} title={annotation.visible ? t("model.hide") : t("model.show")} aria-label={annotation.visible ? t("model.hide") : t("model.show")} onClick={() => onUpdateAnnotation?.(annotation.id, (draft) => { draft.visible = !draft.visible; })}><OperationTreeIcon file={annotation.visible ? "visible" : "hidden"} size={15} /></button></div>
                    </div>)}
                  </div>}
                </div>
              );
              const isImage = Boolean(object.object.referenceMesh?.image);
              const isExpanded = !isImage && object.object.expanded;
              const objectSelected = selection.some((candidate) => candidate.kind === "object" && candidate.id === object.id);
              return (
                <div className="kercad-object-node" key={object.id}>
                  <div className={`kercad-object-row ${alignmentClass(object.id, "object")} ${objectSelected ? "selected" : ""} ${object.object.visible ? "" : "hidden"} ${object.object.locked ? "locked" : ""}`} style={{ "--object-color": object.object.color } as CSSProperties}>
                    {isImage ? <span className="kercad-tree-toggle-spacer" aria-hidden="true" /> : <button
                      className="kercad-tree-toggle"
                      aria-label={`${isExpanded ? t("model.collapse") : t("model.expand")} ${object.name}`}
                      aria-expanded={isExpanded}
                      onClick={() => onUpdateObject(object.id, (draft) => { draft.expanded = !draft.expanded; })}
                    >
                      {isExpanded ? <OperationTreeIcon file="expanded" size={16} /> : <OperationTreeIcon file="collapsed" size={16} />}
                    </button>}
                    <button className="kercad-object-select" title={object.name} aria-pressed={objectSelected} aria-expanded={mode === "simplified" && !isImage ? isExpanded : undefined} onClick={(event) => {
                      if (mode === "simplified" && objectSelected && !isImage && !onAlignmentSelect && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                        onUpdateObject(object.id, (draft) => { draft.expanded = !draft.expanded; });
                      } else selectNode({ id: object.id, kind: "object" }, event);
                    }}>
                      {isImage ? <OperationTreeIcon file="imported-img" size={17} /> : object.object.referenceMesh ? <OperationTreeIcon file="imported-step" size={17} /> : <OperationTreeIcon file="box" className="kercad-object-color-icon" size={17} />}
                      <span><strong>{object.name}</strong></span>
                    </button>
                    <div className="kercad-tree-actions">
                      <button aria-label={`${object.object.visible ? t("model.hide") : t("model.show")} ${object.name}`} title={object.object.visible ? t("model.hide") : t("model.show")} aria-pressed={!object.object.visible} onClick={() => onUpdateObject(object.id, (draft) => { draft.visible = !draft.visible; })}>{object.object.visible ? <OperationTreeIcon file="visible" size={15} /> : <OperationTreeIcon file="hidden" size={15} />}</button>
                      <button aria-label={`${object.object.locked ? t("model.unlock") : t("model.lock")} ${object.name}`} title={object.object.locked ? t("model.unlock") : t("model.lock")} aria-pressed={object.object.locked} onClick={() => onUpdateObject(object.id, (draft) => { draft.locked = !draft.locked; })}>{object.object.locked ? <OperationTreeIcon file="locked" size={15} /> : <OperationTreeIcon file="unlocked" size={15} />}</button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="kercad-operation-list" role="group" aria-label={`${t("model.operationsFor")} ${object.name}`}>
                      {object.operations.map((feature) => (
                        <div key={feature.id} aria-invalid={feature.id === failedFeatureId || undefined} className={`kercad-operation-row ${alignmentClass(feature.id, "feature")} ${selection.some((candidate) => candidate.kind === "feature" && candidate.id === feature.id) ? "selected" : ""} ${feature.id === failedFeatureId ? "rebuild-failed" : ""} ${feature.suppressed ? "suppressed" : ""} ${feature.kind === "sketch" && !feature.visible ? "hidden" : ""} ${operationClass(feature)}`}>
                          <button className="kercad-operation-select" title={feature.name} aria-pressed={selection.some((candidate) => candidate.kind === "feature" && candidate.id === feature.id)} onClick={(event) => selectNode({ id: feature.id, kind: "feature" }, event)}>
                            <span className="kercad-tree-branch" aria-hidden="true" />
                            <FeatureIcon document={document} feature={feature} />
                            <span className="kercad-operation-name"><strong>{feature.name}</strong></span>
                          </button>
                          <div className="kercad-tree-actions">
                            {feature.kind === "sketch" ? <button aria-label={`${feature.visible ? t("model.hide") : t("model.show")} ${feature.name}`} title={feature.generatedPath ? t(feature.visible ? "model.hide" : "model.show") : feature.visible ? t("model.hideSketch") : t("model.showSketch")} aria-pressed={!feature.visible} onClick={() => onUpdateFeature(feature.id, (draft) => { if (draft.kind === "sketch") draft.visible = !draft.visible; })}>{feature.visible ? <OperationTreeIcon file="visible" size={15} /> : <OperationTreeIcon file="hidden" size={15} />}</button> : null}
                            <button aria-label={`${feature.suppressed ? t("model.activate") : t("model.suppress")} ${feature.name}`} title={feature.suppressed ? t("model.activate") : t("model.suppress")} aria-pressed={feature.suppressed} onClick={() => onUpdateFeature(feature.id, (draft) => { draft.suppressed = !draft.suppressed; })}><OperationTreeIcon file="suppressed" size={15} /></button>
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

      {mode === "normal" ? <div className="kercad-tree-toolbar" role="toolbar" aria-label={t("model.treeActions")}>
        <button disabled={!(selectedAnnotation ? canReorderAnnotation(document, selectedAnnotation.id, "up") : canReorderParametricSelection(document, reorderSelection, "up"))} aria-label={t("model.moveUp")} title={t("model.moveUp")} onClick={() => onReorderSelection("up")}><ArrowUp size={16} /></button>
        <button disabled={!(selectedAnnotation ? canReorderAnnotation(document, selectedAnnotation.id, "down") : canReorderParametricSelection(document, reorderSelection, "down"))} aria-label={t("model.moveDown")} title={t("model.moveDown")} onClick={() => onReorderSelection("down")}><ArrowDown size={16} /></button>
        <span className="kercad-tree-toolbar-separator" aria-hidden="true" />
        <button disabled={selection.length === 0 && !selectedAnnotation} aria-label={t("common.rename")} title={t("common.rename")} onClick={beginRename}><Pencil size={15} /></button>
        <button disabled={!selectedFeature || !canResetParametricFeature(selectedFeature)} aria-label={t("operation.reset")} title={t("operation.reset")} onClick={() => selectedFeature && onResetFeature(selectedFeature.id)}><RotateCcw size={16} /></button>
        <button className="kercad-origin-tree-button" disabled={!selectedObject || selectedObject.locked} aria-label={t("model.editOrigin")} title={t("model.editOrigin")} aria-pressed={Boolean(selectedObject && editingOriginObjectId === selectedObject.id)} onClick={() => selectedObject && onToggleOriginEdit(selectedObject.id)}><Crosshair size={16} /></button>
        <span className="kercad-tree-toolbar-separator" aria-hidden="true" />
        <button className="danger" disabled={selection.length === 0 && !selectedAnnotation && !annotationGroupSelected} aria-label={t("common.delete")} title={t("common.delete")} onClick={onDeleteSelection}><Trash2 size={16} /></button>
      </div> : null}

      {mode === "normal" ? <section className="kercad-sidebar-editor">
        {selectedAnnotation ? <AnnotationProperties annotation={selectedAnnotation} onUpdate={(update) => onUpdateAnnotation?.(selectedAnnotation.id, update)} /> : revolveDraft ? (
          <div className="kercad-feature-inspector kercad-edge-treatment-draft" aria-label={t("operation.previewRevolve")}>
            <div className="kercad-feature-card"><h3>{revolveDraft.editing ? t("operation.edit") : t("operation.new")}</h3><label><span>{t("property.type")}</span><select value={revolveDraft.operation} onChange={(event) => onRevolveDraftChange({ operation: event.target.value as typeof revolveDraft.operation })}><option value="add">{t("model.add")}</option><option value="cut">{t("model.hole")}</option><option value="intersect">{t("model.common")}</option></select></label><label><span>{t("property.axis")}</span><select value={revolveDraft.axis} onChange={(event) => onRevolveDraftChange({ axis: event.target.value as typeof revolveDraft.axis })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option><option value="edge" disabled={revolveDraft.edgeCount !== 1}>{t("operation.selectedEdge")}</option></select></label><BoundedNumberField label={t("property.angle")} value={revolveDraft.angle} min={-360} max={360} step={1} unit="°" onChange={(angle) => onRevolveDraftChange({ angle: Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle })} /></div>
            <div className="kercad-topology-selection-actions"><button type="button" onClick={onCancelRevolve}>{t("common.cancel")}</button><button type="button" className="primary" disabled={revolveDraft.faceCount !== 1 || (revolveDraft.axis === "edge" && revolveDraft.edgeCount !== 1)} onClick={onAcceptRevolve}>{t("common.accept")}</button></div><p className="kercad-topology-selection-count">{t("operation.faceAxis")}: {revolveDraft.faceCount} / {revolveDraft.edgeCount}</p>
          </div>
        ) : shellDraft ? (
          <div className="kercad-feature-inspector kercad-edge-treatment-draft" aria-label={t("operation.previewShell")}>
            <div className="kercad-feature-card"><h3>{shellDraft.editing ? t("operation.edit") : t("operation.new")}</h3><div className="kercad-operation-mode-property"><div className="kercad-operation-mode-buttons"><ShellCornerButtons value={shellDraft.cornerType} locale={locale} onChange={onShellCornerTypeChange} /></div></div><BoundedNumberField label={t("property.thickness")} value={shellDraft.thickness} min={0.01} max={50} onChange={onShellDraftChange} /></div>
            <div className="kercad-topology-selection-actions"><button type="button" onClick={onCancelShell}>{t("common.cancel")}</button><button type="button" className="primary" disabled={shellDraft.faceCount === 0} onClick={onAcceptShell}>{t("common.accept")}</button></div>
            <p className="kercad-topology-selection-count">{t("operation.openFaces")}: {shellDraft.faceCount}</p>
          </div>
        ) : faceExtrudeDraft ? (
          <div className="kercad-feature-inspector kercad-edge-treatment-draft" aria-label={t("operation.previewFaceExtrude")}>
            <div className="kercad-feature-card"><h3>{faceExtrudeDraft.editing ? t("operation.edit") : t("operation.new")}</h3><label><span>{t("property.type")}</span><select value={faceExtrudeDraft.operation} onChange={(event) => onFaceExtrudeDraftChange({ operation: event.target.value as "add" | "cut" })}><option value="add">{t("model.add")}</option><option value="cut">{t("model.hole")}</option></select></label><BoundedNumberField label={t("property.length")} value={faceExtrudeDraft.distance} min={0.01} max={200} onChange={(distance) => onFaceExtrudeDraftChange({ distance })} /></div>
            <div className="kercad-topology-selection-actions"><button type="button" onClick={onCancelFaceExtrude}>{t("common.cancel")}</button><button type="button" className="primary" disabled={faceExtrudeDraft.faceCount !== 1} onClick={onAcceptFaceExtrude}>{t("common.accept")}</button></div>
          </div>
        ) : edgeTreatmentDraft ? (
          <div className="kercad-feature-inspector kercad-edge-treatment-draft" aria-label={t("operation.previewTopology")}>
            <div className="kercad-feature-card"><h3>{edgeTreatmentDraft.editing ? t("operation.edit") : t("operation.new")}</h3><EdgeTreatmentButtons value={edgeTreatmentDraft.treatment} onChange={(treatment) => onEdgeTreatmentDraftChange({ treatment })} /><BoundedNumberField label={edgeTreatmentDraft.treatment === "chamfer" ? t("property.distance") : t("property.radius")} value={edgeTreatmentDraft.radius} min={0.01} max={50} onChange={(radius) => onEdgeTreatmentDraftChange({ radius })} /></div>
            <div className="kercad-topology-selection-actions"><button type="button" onClick={onCancelEdgeTreatment}>{t("common.cancel")}</button><button type="button" className="primary" disabled={edgeTreatmentDraft.faceCount + edgeTreatmentDraft.edgeCount === 0} onClick={onAcceptEdgeTreatment}>{t("common.accept")}</button></div>
            <p className="kercad-topology-selection-count">{t("operation.facesEdges")}: {edgeTreatmentDraft.faceCount} / {edgeTreatmentDraft.edgeCount}</p>
          </div>
        ) : selection.length > 1 ? (
          <div className="kercad-no-selection kercad-multi-selection"><Layers3 size={28} /><strong>{selection.length} {t("model.selected")}</strong><span>{selection.filter((item) => item.kind === "object").length} {t("model.objects")} · {selection.filter((item) => item.kind === "feature").length} {t("model.operations")}</span><small>{t("model.multiSelectionHint")}</small></div>
        ) : selectedObject ? (
          <ParametricObjectInspector object={selectedObject} onUpdate={(update) => onUpdateObject(selectedObject.id, update)} />
        ) : selectedFeature ? (
          <ParametricFeatureInspector
            document={document}
            feature={selectedFeature}
            onUpdateFeature={onUpdateFeature}
          onEditSelection={onEditFeatureSelection}
          onEditSketch={onEditSketch}
            onEditFaceExtrudeSelection={onEditFaceExtrudeSelection}
            onEditShellSelection={onEditShellSelection}
            onEditRevolveFace={onEditRevolveFace}
            onEditRevolveAxis={onEditRevolveAxis}
            onEditMirrorPlane={onEditMirrorPlane}
          />
        ) : (
          <div className="kercad-no-selection"><Layers3 size={28} /><strong>{t("model.noSelection")}</strong><span>{t("model.noSelectionHint")}</span></div>
        )}
      </section> : null}
    </aside>
    {renameOpen ? (
      <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={closeRename}>
        <form ref={renameDialogRef} className="kercad-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-rename-title" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitRename(); }}>
          <header><strong id="kercad-rename-title">{t("model.renameTitle")}</strong><button type="button" aria-label={t("common.cancel")} onClick={closeRename}><X size={18} /></button></header>
          <label><span>{selection.length > 1 ? t("model.commonName") : t("model.name")}</span><input ref={renameInputRef} autoFocus value={renameDraft} maxLength={80} placeholder={selection.length > 1 ? t("model.applyCommonName") : undefined} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") closeRename(); }} /></label>
          <footer><button type="button" onClick={closeRename}>{t("common.cancel")}</button><button className="primary" type="submit" disabled={!renameDraft.trim()}>{t("common.accept")}</button></footer>
        </form>
      </div>
    ) : null}
    </></NumericStepContext.Provider></LocaleContext.Provider>
  );
}

function AnnotationProperties({ annotation, onUpdate }: { annotation: ParametricAnnotation; onUpdate: (update: (annotation: ParametricAnnotation) => void) => void }) {
  const t = useSidebarTranslation();
  const locale = useContext(LocaleContext);
  const steps = useContext(NumericStepContext);
  const position = (key: "position" | AnnotationPoint, title: string) => {
    const point = annotationPosition(annotation, key === "position" ? null : key);
    if (!point) return null;
    return <details className="kercad-transform-section"><summary><ChevronRight size={16} /><span>{title}</span></summary><div><TransformGroup label={title} showHeading={false} values={point} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { const target = annotationPosition(draft, key === "position" ? null : key); if (target) target[axis] = value; })} /></div></details>;
  };
  return <div className="kercad-feature-inspector kercad-annotation-properties">
    {annotation.kind === "dimension" && <AnnotationColorPicker color={annotation.color ?? "#233c52"} onChange={(color) => onUpdate((draft) => { if (draft.kind === "dimension") draft.color = color; })} />}
    <div className="kercad-feature-card">
    {annotation.kind !== "text" && (annotation.kind !== "circle" && annotation.kind !== "rectangle") && <label><span>{t("annotation.size")}</span><DeferredNumberInput value={annotation.size ?? 3} min={0.1} max={1000} step={steps.input} unit="mm" onCommit={(value) => onUpdate((draft) => { if (draft.kind !== "text" && (draft.kind !== "circle" && draft.kind !== "rectangle")) draft.size = value; })} /></label>}
    {(annotation.kind === "circle" || annotation.kind === "rectangle") && <>
      <AnnotationColorPicker color={annotation.color} onChange={(color) => onUpdate((draft) => { if ((draft.kind === "circle" || draft.kind === "rectangle")) draft.color = color; })} />
      <label><span>{t("annotation.mode")}</span><select value={annotation.mode} onChange={(event) => onUpdate((draft) => { if ((draft.kind === "circle" || draft.kind === "rectangle")) draft.mode = event.target.value as "billboard" | "planar"; })}><option value="billboard">{t("annotation.billboard")}</option><option value="planar">{t("annotation.planar")}</option></select></label>
      <label><span>{t(annotation.kind === "rectangle" ? "property.width" : "property.radius")}</span><DeferredNumberInput value={annotation.radius * (annotation.kind === "rectangle" ? 2 : 1)} min={0.1} max={20000} step={steps.input} unit="mm" onCommit={(value) => onUpdate((draft) => { if (draft.kind === "circle" || draft.kind === "rectangle") draft.radius = value / (draft.kind === "rectangle" ? 2 : 1); })} /></label>
      {annotation.kind === "rectangle" && <label><span>{t("property.height")}</span><DeferredNumberInput value={annotation.height ?? annotation.radius * 1.4} min={0.1} max={20000} step={steps.input} unit="mm" onCommit={(value) => onUpdate((draft) => { if (draft.kind === "rectangle") draft.height = value; })} /></label>}
      <label><span>{t("annotation.lineWidth")}</span><DeferredNumberInput value={annotation.lineWidth} min={0.5} max={20} step={0.5} unit="px" onCommit={(width) => onUpdate((draft) => { if ((draft.kind === "circle" || draft.kind === "rectangle")) draft.lineWidth = width; })} /></label>
    </>}
    {annotation.kind === "angle" && <AnnotationColorPicker color={annotation.color ?? "#233c52"} onChange={(color) => onUpdate((draft) => { if (draft.kind === "angle") draft.color = color; })} />}
    {annotation.kind === "dimension" && <>
      <div className="sketch-annotation-context-toolbar embedded kercad-annotation-dimension-controls" role="group" aria-label={t("annotation.dimension")}>
        <AnnotationEndSelector side="start" value={annotationEnding(annotation, "start")} locale={locale} onChange={(value) => onUpdate((draft) => setAnnotationEnding(draft, "start", value))} />
        <AnnotationEndSelector side="end" value={annotationEnding(annotation, "end")} locale={locale} onChange={(value) => onUpdate((draft) => setAnnotationEnding(draft, "end", value))} />
        <button type="button" className={annotation.lineStyle === "dashed" ? "active" : ""} aria-pressed={annotation.lineStyle === "dashed"} title={t("annotation.dashed")} aria-label={t("annotation.dashed")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.lineStyle = draft.lineStyle === "dashed" ? "solid" : "dashed"; })}><AnnotationIcon size={34} kind="dashedLine" /></button>
        <button type="button" className={annotation.showLength !== false ? "active" : ""} aria-pressed={annotation.showLength !== false} title={t("annotation.showLength")} aria-label={t("annotation.showLength")} onClick={() => onUpdate((draft) => { if (draft.kind === "dimension") draft.showLength = draft.showLength === false; })}><AnnotationIcon size={34} kind="length" /></button>
      </div>
    </>}
    {annotation.kind === "text" ? <>
      <label><span>{t("annotation.text")}</span><textarea value={annotation.text} maxLength={2000} onChange={(event) => onUpdate((draft) => { if (draft.kind === "text") draft.text = event.target.value; })} /></label>
      <label><span>{t("annotation.font")}</span><select value={textFontNames.includes(annotation.font as typeof textFontNames[number]) ? annotation.font : "Sans"} onChange={(event) => onUpdate((draft) => { if (draft.kind === "text") draft.font = event.target.value; })}>{textFontNames.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
      <label><span>{t("annotation.size")}</span><DeferredNumberInput value={annotation.size} min={0.1} max={1000} step={steps.input} unit="mm" onCommit={(value) => onUpdate((draft) => { if (draft.kind === "text") draft.size = value; })} /></label>
      <label><span>{t("annotation.alignment")}</span><select value={annotation.alignment} onChange={(event) => onUpdate((draft) => { if (draft.kind === "text") draft.alignment = event.target.value as "left" | "center" | "right"; })}>{(["left", "center", "right"] as const).map((alignment) => <option key={alignment} value={alignment}>{t(`annotation.${alignment}`)}</option>)}</select></label>
    </> : annotation.kind === "angle" ? <ReadOnlyField label={t("annotation.angle")} value={annotationAngleGeometry(annotation)?.degrees.toFixed(2).concat("°") ?? "—"} /> : null}
    </div>
    <TransformSection description="">
      {annotation.kind === "text" || (annotation.kind === "circle" || annotation.kind === "rectangle") ? position("position", t("annotation.position")) : <>
        {position("start", t("annotation.start"))}
        {annotation.kind === "angle" && position("center", t("annotation.vertex"))}
        {position("end", t("annotation.end"))}
      </>}
      {(annotation.kind === "circle" || annotation.kind === "rectangle") && <TransformGroup label={t("property.rotation")} values={annotation.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if ((draft.kind === "circle" || draft.kind === "rectangle")) draft.rotation[axis] = value; })} />}
    </TransformSection>
  </div>;
}

function AnnotationColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useSidebarTranslation();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.document.addEventListener("pointerdown", closeOutside);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => { window.document.removeEventListener("pointerdown", closeOutside); window.document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  return <div ref={panel} className="kercad-feature-card kercad-object-appearance">
    <button className="kercad-color-trigger" aria-label={t("property.color")} aria-expanded={open} title={t("property.color")} onClick={() => setOpen(!open)}><span>{t("property.color")}</span><span className="kercad-color-preview" style={{ "--object-color": color } as CSSProperties} /><strong>{color.toUpperCase()}</strong><ChevronDown size={15} /></button>
    {open && <div className="kercad-color-palette">
      {OBJECT_COLOR_PALETTE.map((entry) => <button key={entry} className={color.toLowerCase() === entry ? "selected" : ""} aria-label={`${t("property.color")} ${entry}`} title={entry.toUpperCase()} style={{ "--object-color": entry } as CSSProperties} onClick={() => { onChange(entry); setOpen(false); }} />)}
      <label className="kercad-custom-color" title={t("property.customColor")}><input type="color" aria-label={t("property.customColor")} value={color} onChange={(event) => onChange(event.target.value)} /><span aria-hidden="true">+</span></label>
    </div>}
  </div>;
}

function FeatureIcon({ document, feature }: { document: ParametricDocument; feature: ParametricFeature }) {
  const locale = useContext(LocaleContext);
  const t = (key: KercadTranslationKey) => kercadTranslate(locale, key);
  if (feature.kind === "sketch" && feature.generatedPath) return <OperationTreeIcon file={feature.generatedPath.kind} src={`/assets/kercad/toolbar-3d/shapes/${feature.generatedPath.kind}.svg`} size={17} role="img" aria-label={t(feature.generatedPath.kind === "spiral" ? "path.spiral" : "path.helix")} />;
  if (feature.kind === "sketch") return <OperationTreeIcon file="sketch" className="sketch" size={16} role="img" aria-label={t("operation.sketch")} />;
  if (feature.kind === "extrude") {
    const sketch = sketchForExtrude(document, feature);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    const label = feature.operation === "cut" ? t("model.hole") : feature.operation === "intersect" ? t("model.common") : t("model.add");
    const generatedText = sketch?.profile.shape === "drawn" && sketch.profile.geometry.generator?.kind === "text";
    const shapeName = generatedText ? t("sketch.text") : localizedParametricOperationDefinition(sketch?.profile.shape === "circle" ? "cylinder" : "box", locale).name;
    return <span className={`kercad-operation-icon ${role}`} role="img" aria-label={`${shapeName}: ${label}`}>{generatedText ? <OperationTreeIcon file="text" size={17} /> : sketch?.profile.shape === "circle" ? <OperationTreeIcon file="cylinder" size={17} /> : <OperationTreeIcon file="box" size={17} />}<small aria-hidden="true"><OperationTreeIcon file={role === "add" ? "add" : role === "hole" ? "cut" : "common"} size={8} /></small></span>;
  }
  if (feature.kind === "primitive") {
    const definition = localizedParametricOperationDefinition(feature.primitive, locale);
    const role = feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add";
    return <span className={`kercad-operation-icon ${role}`} role="img" aria-label={`${definition.name}: ${definition.roles[feature.operation].label}`}><OperationTreeIcon file="circle" src={feature.primitive === "platonic" ? "/assets/kercad/toolbar-3d/shapes/platonic.svg" : undefined} size={17} /><small aria-hidden="true"><OperationTreeIcon file={role === "add" ? "add" : role === "hole" ? "cut" : "common"} size={8} /></small></span>;
  }
  if (feature.kind === "importedStep") return <OperationTreeIcon file="imported-step" className="imported-step" size={16} role="img" aria-label={t("operation.importedStep")} />;
  if (feature.kind === "hole") return <OperationTreeIcon file="hole" className="drill-hole" size={16} role="img" aria-label={t("operation.hole")} />;
  if (feature.kind === "faceExtrude") return <span className={`kercad-operation-icon ${feature.operation === "cut" ? "hole" : "add"}`} role="img" aria-label={feature.operation === "cut" ? t("operation.facePocket") : t("operation.faceExtrude")}><OperationTreeIcon file="box" size={17} /><small aria-hidden="true"><OperationTreeIcon file={feature.operation === "cut" ? "cut" : "add"} size={8} /></small></span>;
  if (feature.kind === "shell") return <img className="kercad-operation-asset-icon" src="/assets/kercad/operations-tree/shell.svg" alt={t("toolbar.shell")} />;
  if (feature.kind === "revolve") return <img className="kercad-operation-asset-icon" src="/assets/kercad/operations-tree/revolve.svg" alt={t("operation.revolve")} />;
  if (feature.kind === "mirror") return <OperationTreeIcon file="mirror" className="mirror" size={16} role="img" aria-label={t("operation.mirror")} />;
  if (feature.kind === "linearPattern") return <OperationTreeIcon file="linear-pattern" className="linear-pattern" size={16} role="img" aria-label={t("operation.linearPattern")} />;
  if (feature.kind === "polarPattern") return <OperationTreeIcon file="polar-pattern" className="polar-pattern" size={16} role="img" aria-label={t("operation.polarPattern")} />;
  if (feature.kind === "objectBoolean") return <OperationTreeIcon file="boolean" className="object-boolean" size={16} role="img" aria-label={t("toolbar.objectBoolean")} />;
  return feature.treatment === "chamfer" ? <OperationTreeIcon file="chamfer" className="chamfer" size={16} role="img" aria-label={t("operation.chamfer")} /> : <OperationTreeIcon file="fillet" className="fillet" size={16} role="img" aria-label={t("operation.fillet")} />;
}

function operationClass(feature: ParametricFeature) {
  if (feature.kind !== "extrude" && feature.kind !== "primitive") return `operation-${feature.kind}`;
  return `operation-${feature.operation === "cut" ? "hole" : feature.operation === "intersect" ? "common" : "add"}`;
}

function ParametricObjectInspector({
  object,
  onUpdate,
}: {
  object: ParametricObject;
  onUpdate: (update: (object: ParametricObject) => void) => void;
}) {
  const t = useSidebarTranslation();
  const locale = useContext(LocaleContext);
  const [colorOpen, setColorOpen] = useState(false);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colorOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !colorPanelRef.current?.contains(event.target)) setColorOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOutside);
    return () => window.document.removeEventListener("pointerdown", closeOutside);
  }, [colorOpen]);
  return (
    <div className="kercad-feature-inspector kercad-object-inspector">
      {object.referenceMesh ? <div className="kercad-feature-card">
        <div className="kercad-reference-display-controls" role="group" aria-label={t("property.display")}><ReferenceDisplayButtons value={object.referenceMesh.displayMode} locale={locale} onChange={(mode) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.displayMode = mode; })} /></div>
        <label><span>{t("property.opacity")}</span><DeferredNumberInput value={object.referenceMesh.opacity * 100} min={5} max={100} step={1} unit="%" onCommit={(value) => onUpdate((draft) => { if (draft.referenceMesh) draft.referenceMesh.opacity = value / 100; })} /></label>
      </div> : null}
      {!object.referenceMesh?.image && <div ref={colorPanelRef} className="kercad-feature-card kercad-object-appearance">
        <button className="kercad-color-trigger" aria-label={t("property.objectColor")} aria-expanded={colorOpen} onClick={() => setColorOpen((value) => !value)}>
          <span>{t("property.color")}</span><span className="kercad-color-preview" style={{ "--object-color": object.color } as CSSProperties} /><strong>{object.color.toUpperCase()}</strong><ChevronDown size={15} />
        </button>
        {colorOpen ? <div className="kercad-color-palette" role="group" aria-label={t("property.objectColor")}>
          {OBJECT_COLOR_PALETTE.map((color) => <button key={color} className={object.color.toLowerCase() === color ? "selected" : ""} aria-label={`${t("property.color")} ${color}`} title={color.toUpperCase()} style={{ "--object-color": color } as CSSProperties} onClick={() => { onUpdate((draft) => { draft.color = color; }); setColorOpen(false); }} />)}
          <label className="kercad-custom-color" title={t("property.customColor")}><input type="color" aria-label={t("property.customColor")} value={object.color} onChange={(event) => onUpdate((draft) => { draft.color = event.target.value; })} /><span aria-hidden="true">+</span></label>
        </div> : null}
      </div>}
      <TransformSection>
        <TransformGroup label={t("property.position")} values={object.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.position[axis] = value; })} />
        <TransformGroup label={t("property.rotation")} values={object.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.rotation[axis] = value; })} />
        <TransformGroup label={t("property.scale")} values={object.transform.scale} unit="×" min={0.01} onUpdate={(axis, value) => onUpdate((draft) => { draft.transform.scale[axis] = Math.max(0.01, value); })} />
      </TransformSection>
    </div>
  );
}

function TransformSection({ children, description = uiText("sidebar.position.rotation.scale") }: { children: ReactNode; description?: string }) {
  const t = useSidebarTranslation();
  const localizedDescription = useLocalizedSidebarLiteral(description);
  return (
    <details className="kercad-transform-section">
      <summary><ChevronRight size={16} /><span>{t("model.transform")}</span><small>{localizedDescription}</small></summary>
      <div>{children}</div>
    </details>
  );
}

function ShapeParametersSection({ children }: { children: ReactNode }) {
  const t = useSidebarTranslation();
  return <details className="kercad-transform-section kercad-shape-parameters" open><summary><ChevronRight size={16} /><span>{t("model.shapeParameters")}</span></summary><div><div className="kercad-feature-card">{children}</div></div></details>;
}

function GeneratedPathFields({ path, onChange }: { path: GeneratedPath; onChange: (path: GeneratedPath) => void }) {
  const t = useSidebarTranslation();
  const update = (next: GeneratedPath) => onChange(normalizeGeneratedPath(next));
  return <>
    {path.kind === "spiral" ? <>
      <label><span>{t("path.spiralType")}</span><select value={path.spiralType} onChange={(event) => update({ ...path, spiralType: event.target.value as SpiralType })}>{spiralTypes.map((type) => <option key={type} value={type}>{t(`path.type.${type}`)}</option>)}</select></label>
      {path.spiralType !== "fibonacci" && <BoundedNumberField label={t("path.innerRadius")} value={path.innerRadius} min={.1} max={9999} onChange={(innerRadius) => update({ ...path, innerRadius })} />}
      <BoundedNumberField label={t("path.outerRadius")} value={path.outerRadius} min={path.spiralType === "fibonacci" ? .1 : path.innerRadius + .1} max={10000} onChange={(outerRadius) => update({ ...path, outerRadius })} />
    </> : <>
      <BoundedNumberField label={t("property.radius")} value={path.radius} min={.1} max={10000} onChange={(radius) => update({ ...path, radius })} />
      <BoundedNumberField label={t("path.pitch")} value={path.pitch} min={.1} max={10000} onChange={(pitch) => update({ ...path, pitch })} />
    </>}
    <BoundedNumberField label={t("path.turns")} value={path.turns} min={path.kind === "spiral" ? .25 : .1} max={path.kind === "helix" ? 100 : path.spiralType === "fibonacci" ? 4 : 20} step={.25} unit="" onChange={(turns) => update({ ...path, turns })} />
    <label><span>{t("path.direction")}</span><select value={path.clockwise ? "clockwise" : "counterclockwise"} onChange={(event) => update({ ...path, clockwise: event.target.value === "clockwise" })}><option value="counterclockwise">{t("path.counterclockwise")}</option><option value="clockwise">{t("path.clockwise")}</option></select></label>
  </>;
}

function TransformGroup({
  label,
  showHeading = true,
  values,
  unit,
  min,
  onUpdate,
}: {
  label: string;
  showHeading?: boolean;
  values: { x: number; y: number; z: number };
  unit: string;
  min?: number;
  onUpdate: (axis: "x" | "y" | "z", value: number) => void;
}) {
  const { input: inputStep } = useContext(NumericStepContext);
  const localizedLabel = useLocalizedSidebarLiteral(label);
  return (
    <div className="kercad-feature-card kercad-transform-card">
      {showHeading && <h3>{localizedLabel}</h3>}
      {(["x", "y", "z"] as const).map((axis) => (
        <label key={axis}>
          <span className={`kercad-axis-label ${axis}`}>{axis.toUpperCase()}</span>
          <DeferredNumberInput value={values[axis]} min={min} step={inputStep} unit={unit} onCommit={(value) => onUpdate(axis, value)} />
        </label>
      ))}
    </div>
  );
}

function ParametricFeatureInspector({
  document,
  feature,
  onUpdateFeature,
  onEditSelection,
  onEditSketch,
  onEditFaceExtrudeSelection,
  onEditShellSelection,
  onEditRevolveFace,
  onEditRevolveAxis,
  onEditMirrorPlane,
}: {
  document: ParametricDocument;
  feature: ParametricFeature;
  onUpdateFeature: (id: string, update: (feature: ParametricFeature) => void) => void;
  onEditSelection: (featureId: string) => void;
  onEditSketch: (featureId: string) => void;
  onEditFaceExtrudeSelection: (featureId: string) => void;
  onEditShellSelection: (featureId: string) => void;
  onEditRevolveFace: (featureId: string) => void;
  onEditRevolveAxis: (featureId: string) => void;
  onEditMirrorPlane: (featureId: string) => void;
}) {
  const t = useSidebarTranslation();
  const locale = useContext(LocaleContext);
  const onUpdate = (update: (feature: ParametricFeature) => void) => onUpdateFeature(feature.id, update);
  const primitiveSketch = feature.kind === "extrude" ? sketchForExtrude(document, feature) : null;
  const textGenerator = primitiveSketch?.profile.shape === "drawn" && primitiveSketch.profile.geometry.generator?.kind === "text" ? primitiveSketch.profile.geometry.generator : null;
  const scribbleGenerator = primitiveSketch?.profile.shape === "drawn" && primitiveSketch.profile.geometry.generator?.kind === "scribble" ? primitiveSketch.profile.geometry.generator : null;
  const revolveSketch = feature.kind === "revolve" && feature.source === "sketch" ? document.features.find((candidate): candidate is Extract<ParametricFeature, { kind: "sketch" }> => candidate.kind === "sketch" && candidate.id === feature.sketchId) ?? null : null;
  const revolveSketchAxes = revolveSketch?.profile.shape === "drawn"
    ? revolveSketch.profile.geometry.segments.filter((segment) => segment.kind === "line" || segment.kind === undefined)
    : [];
  const linearPatternSources = feature.kind === "linearPattern"
    ? document.features.slice(0, document.features.findIndex((candidate) => candidate.id === feature.id)).filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch")
    : [];
  const polarPatternSources = feature.kind === "polarPattern"
    ? document.features.slice(0, document.features.findIndex((candidate) => candidate.id === feature.id)).filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch")
    : [];
  const treatmentReferences = feature.kind === "fillet"
    ? (feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? []).map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter(Boolean)
    : [];
  const treatmentFaceCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "face").length;
  const treatmentEdgeCount = treatmentReferences.filter((reference) => reference?.reference.hint.entityType === "edge").length;
  return (
    <div className="kercad-feature-inspector" aria-label={`${uiText("ui.parametricmodelsidebar.properties.of.6bbb0a", {}, locale)} ${feature.name}`}>

      {feature.kind === "sketch" ? (
        <>
          {!feature.generatedPath && <div className="kercad-feature-card"><button className="kercad-edit-topology-selection" type="button" onClick={() => onEditSketch(feature.id)}>{t("operation.editSketch")}</button></div>}
          {feature.generatedPath ? <ShapeParametersSection><GeneratedPathFields path={feature.generatedPath} onChange={(path) => onUpdate((draft) => { if (draft.kind === "sketch") draft.generatedPath = path; })} /></ShapeParametersSection> : feature.profile.shape === "drawn" ? <>
            
          </> : <ShapeParametersSection>
            <ReadOnlyField label={t("property.profile")} value={feature.profile.shape === "rectangle" ? t("value.rectangle") : t("value.circle")} />
            {feature.profile.shape === "rectangle" ? <><NumberField label={t("property.width")} value={feature.profile.width} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><NumberField label={t("property.depth")} value={feature.profile.depth} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <NumberField label={t("property.diameter")} value={feature.profile.diameter} min={0.01} onChange={(value) => onUpdate((draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value); })} />}
          </ShapeParametersSection>}
          <TransformSection>
            <TransformGroup label={t("property.position")} values={{ x: feature.x, y: feature.y, z: feature.offset }} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind !== "sketch") return; if (axis === "x") draft.x = value; else if (axis === "y") draft.y = value; else draft.offset = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "sketch") draft.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "extrude" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons addOnly={requiresAddOperation(document, feature)} value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "extrude") draft.operation = operation; })} />
          </div>
          <ShapeParametersSection>
            {feature.pathSketchId ? <>
              <ReadOnlyField label={t("sweep.path")} value={document.features.find((item) => item.id === feature.pathSketchId)?.name ?? "—"} />
              <ReadOnlyField label={t("sweep.profile")} value={feature.profileFaceReferenceId ? document.topologyReferences.find((item) => item.id === feature.profileFaceReferenceId)?.name ?? "—" : primitiveSketch?.name ?? "—"} />
            </> : feature.endSketchId ? <>
              <ReadOnlyField label={t("loft.startProfile")} value={primitiveSketch?.name ?? "—"} />
              <ReadOnlyField label={t("loft.endProfile")} value={document.features.find((item) => item.id === feature.endSketchId)?.name ?? "—"} />
            </> : <>
            {primitiveSketch?.purpose !== "user" && primitiveSketch?.profile.shape === "circle" && <CylinderProfileButtons locale={locale} elliptical={Boolean(primitiveSketch.profile.elliptical)} onChange={(elliptical) => onUpdateFeature(primitiveSketch.id, (draft) => {
              if (draft.kind === "sketch" && draft.profile.shape === "circle") {
                if (elliptical && !draft.profile.elliptical) draft.profile.radius2 = draft.profile.diameter / 2;
                draft.profile.elliptical = elliptical;
              }
            })} />}
            {textGenerator && primitiveSketch ? <>
              <label><span>{localizedSidebarLiteral(locale, uiText("toolbar.text", {}, locale))}</span><DeferredTextInput value={textGenerator.text} maxLength={40} onCommit={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { text: value }); })} /></label>
              <label><span>{localizedSidebarLiteral(locale, uiText("sidebar.web.font", {}, locale))}</span><select value={textGenerator.font ?? "Sans"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { font: event.target.value as typeof textGenerator.font }); })}>{parametricTextFontNames.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
              <BoundedNumberField label={t("property.size")} value={textGenerator.size} min={1} max={200} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { size: value }); })} />
              <BoundedNumberField label={t("property.spacing")} value={textGenerator.spacing} min={0} max={100} unit="mm" onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { spacing: value }); })} />
              <label><span>{localizedSidebarLiteral(locale, uiText("annotation.alignment", {}, locale))}</span><select value={textGenerator.align} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { align: event.target.value as typeof textGenerator.align }); })}><option value="left">{uiText("annotation.left", {}, locale)}</option><option value="center">{uiText("align.center", {}, locale)}</option><option value="right">{uiText("annotation.right", {}, locale)}</option></select></label>
              <label><span>{localizedSidebarLiteral(locale, uiText("sidebar.vertical.alignment", {}, locale))}</span><select value={textGenerator.verticalAlign ?? "center"} onChange={(event) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch") updateParametricTextSketch(draft, { verticalAlign: event.target.value as typeof textGenerator.verticalAlign }); })}><option value="bottom">{uiText("ui.parametricmodelsidebar.bottom.cce7f2", {}, locale)}</option><option value="center">{uiText("align.center", {}, locale)}</option><option value="top">{uiText("ui.parametricmodelsidebar.top.cae043", {}, locale)}</option></select></label>
            </> : scribbleGenerator && primitiveSketch ? <button className="kercad-edit-topology-selection" type="button" onClick={() => onEditSketch(primitiveSketch.id)}>{t("operation.editScribble")}</button> : primitiveSketch?.profile.shape === "rectangle" ? (
              <>
                <BoundedNumberField label={t("property.width")} value={primitiveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} />
                <BoundedNumberField label={t("property.depth")} value={primitiveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} />
              </>
            ) : primitiveSketch?.profile.shape === "circle" ? (
              <>
                <BoundedNumberField label={t("property.radius")} value={primitiveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") { if (draft.profile.elliptical) draft.profile.radius2 ??= draft.profile.diameter / 2; draft.profile.diameter = Math.max(0.01, value * 2); } })} />
                {primitiveSketch.profile.elliptical && <BoundedNumberField label={t("cylinder.radius2")} value={primitiveSketch.profile.radius2 ?? primitiveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(primitiveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.radius2 = Math.max(0.01, value); })} />}
              </>
            ) : null}
            <BoundedNumberField label={t("property.height")} value={feature.distance} min={-200} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "extrude" && Math.abs(value) >= 0.01) draft.distance = value; })} />
            </>}
          </ShapeParametersSection>
          <TransformSection description={uiText("sidebar.position.rotation", {}, locale)}>
            <TransformGroup label={t("property.position")} values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.position[axis] = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "extrude") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "primitive" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons addOnly={requiresAddOperation(document, feature)} value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "primitive") draft.operation = operation; })} />
          </div>
          <ShapeParametersSection>
            {feature.primitive === "platonic" && <PlatonicTypeButtons value={feature.platonicType ?? "tetrahedron"} locale={locale} onChange={(type) => onUpdate((draft) => { if (draft.kind === "primitive") draft.platonicType = type; })} />}
            {feature.primitive === "sphere" && <CylinderProfileButtons sphere locale={locale} elliptical={Boolean(feature.ellipsoidal)} onChange={(enabled) => onUpdate((draft) => { if (draft.kind === "primitive") setSphereEllipsoidal(draft, enabled); })} />}
            {localizedParametricOperationDefinition(feature.primitive, locale).parameters.map((parameter) => (
              <BoundedNumberField
                key={parameter.key}
                label={parameter.label}
                value={parameter.key === "radius" || parameter.key === "baseRadius" || parameter.key === "outerRadius"
                  ? feature.width / 2
                  : parameter.key === "majorRadius"
                    ? feature.majorRadius ?? 12
                  : parameter.key === "tubeRadius"
                      ? feature.tubeRadius ?? 4
                    : parameter.key === "cornerRadius"
                      ? feature.cornerRadius ?? 3
                    : parameter.key === "sides"
                      ? feature.sides ?? 6
                    : parameter.key === "teeth"
                      ? feature.teeth ?? 12
                    : parameter.key === "toothDepth"
                      ? feature.toothDepth ?? 2.5
                    : parameter.key === "boreRadius"
                      ? feature.boreRadius ?? 3
                  : parameter.key === "topRadius"
                    ? feature.topRadius ?? 0
                    : parameter.key === "innerRadius"
                      ? feature.innerRadius ?? 6
                    : parameter.key === "thickness"
                      ? Math.max(0.1, feature.width / 2 - (feature.innerRadius ?? 6))
                    : feature[parameter.key as "width" | "depth" | "height"]}
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                unit={parameter.unit}
                onChange={(value) => onUpdate((draft) => {
                  if (draft.kind !== "primitive") return;
                  if (draft.primitive === "platonic") { draft.width = value; draft.depth = value; draft.height = value; return; }
                  if (parameter.key === "radius") {
                    draft.width = value * 2;
                    if (draft.primitive !== "sphere" || !draft.ellipsoidal) draft.depth = value * 2;
                    if (draft.primitive === "sphere" && !draft.ellipsoidal) draft.height = value * 2;
                  } else if (parameter.key === "baseRadius") {
                    draft.width = value * 2;
                    draft.depth = value * 2;
                  } else if (parameter.key === "topRadius") {
                    draft.topRadius = Math.max(0, value);
                  } else if (parameter.key === "outerRadius") {
                    const radius = draft.primitive === "gear"
                      ? Math.max((draft.toothDepth ?? 2.5) + (draft.boreRadius ?? 3) + 0.1, value)
                      : Math.max(0.2, value);
                    const thickness = draft.primitive === "tube" ? Math.max(0.1, draft.width / 2 - (draft.innerRadius ?? 6)) : 0;
                    draft.width = radius * 2;
                    draft.depth = radius * 2;
                    if (draft.primitive === "tube") draft.innerRadius = Math.max(0.1, radius - Math.min(thickness, radius - 0.1));
                  } else if (parameter.key === "innerRadius") {
                    const thickness = Math.max(0.1, draft.width / 2 - (draft.innerRadius ?? 6));
                    draft.innerRadius = Math.max(0.1, value);
                    draft.width = (draft.innerRadius + thickness) * 2;
                    draft.depth = draft.width;
                  } else if (parameter.key === "thickness") {
                    const outerRadius = draft.width / 2;
                    draft.innerRadius = Math.max(0.1, outerRadius - Math.min(Math.max(0.1, value), outerRadius - 0.1));
                  } else if (parameter.key === "majorRadius") {
                    draft.majorRadius = Math.max((draft.tubeRadius ?? 4) + 0.1, value);
                    draft.width = (draft.majorRadius + (draft.tubeRadius ?? 4)) * 2;
                    draft.depth = draft.width;
                  } else if (parameter.key === "tubeRadius") {
                    draft.tubeRadius = Math.min((draft.majorRadius ?? 12) - 0.1, Math.max(0.1, value));
                    draft.width = ((draft.majorRadius ?? 12) + draft.tubeRadius) * 2;
                    draft.depth = draft.width;
                    draft.height = draft.tubeRadius * 2;
                  } else if (parameter.key === "cornerRadius") {
                    draft.cornerRadius = Math.min(draft.width / 2 - 0.1, draft.depth / 2 - 0.1, Math.max(0.1, value));
                  } else if ((parameter.key === "width" || parameter.key === "depth") && draft.primitive === "roundedBox") {
                    draft[parameter.key] = Math.max(parameter.min, value);
                    draft.cornerRadius = Math.min(draft.cornerRadius ?? 3, draft.width / 2 - 0.1, draft.depth / 2 - 0.1);
                  } else if (parameter.key === "sides") {
                    draft.sides = Math.min(32, Math.max(3, Math.round(value)));
                  } else if (parameter.key === "teeth") {
                    draft.teeth = Math.min(64, Math.max(6, Math.round(value)));
                  } else if (parameter.key === "toothDepth") {
                    draft.toothDepth = Math.min(draft.width / 2 - 0.2, Math.max(0.2, value));
                  } else if (parameter.key === "boreRadius") {
                    draft.boreRadius = Math.max(0, Math.min(draft.width / 2 - (draft.toothDepth ?? 2.5) - 0.1, Math.max(0, value)));
                  } else if (parameter.key !== "diameter") draft[parameter.key] = Math.max(parameter.min, value);
                })}
              />
            ))}
            {feature.primitive === "sphere" && feature.ellipsoidal && <>
              <BoundedNumberField label={t("cylinder.radius2")} value={feature.depth / 2} min={.1} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.depth = value * 2; })} />
              <BoundedNumberField label={t("sphere.radius3")} value={feature.height / 2} min={.1} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.height = value * 2; })} />
            </>}
          </ShapeParametersSection>
          <TransformSection description={uiText("sidebar.position.rotation", {}, locale)}>
            <TransformGroup label={t("property.position")} values={feature.transform.position} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.position[axis] = value; })} />
            <TransformGroup label={t("property.rotation")} values={feature.transform.rotation} unit="°" onUpdate={(axis, value) => onUpdate((draft) => { if (draft.kind === "primitive") draft.transform.rotation[axis] = value; })} />
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "importedStep" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("operation.importedStep")} /><ReadOnlyField label={t("property.file")} value={feature.sourceName} /><ReadOnlyField label={t("property.geometry")} value={t("operation.exactBrep")} /></div>
          <TransformSection description={uiText("sidebar.container.object.transform", {}, locale)}><p className="kercad-transform-empty">{t("help.importedBase")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "hole" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("operation.hole")} /><label><span>{t("property.termination")}</span><select value={feature.termination} onChange={(event) => onUpdate((draft) => { if (draft.kind === "hole") draft.termination = event.target.value as typeof draft.termination; })}><option value="through-all">{t("value.throughAll")}</option><option value="blind">{t("value.blind")}</option></select></label></div>
          <ShapeParametersSection><BoundedNumberField label={t("property.diameter")} value={feature.diameter} min={0.01} max={100} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.diameter = Math.max(0.01, value); })} />{feature.termination === "blind" ? <BoundedNumberField label={t("property.depth")} value={feature.depth} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.depth = Math.max(0.01, value); })} /> : null}</ShapeParametersSection>
          <TransformSection description={uiText("annotation.position", {}, locale)}>
            <div className="kercad-feature-card kercad-transform-card"><h3>{t("property.position")}</h3><NumberField label="X" value={feature.x} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.x = value; })} /><NumberField label="Y" value={feature.y} onChange={(value) => onUpdate((draft) => { if (draft.kind === "hole") draft.y = value; })} /></div>
          </TransformSection>
        </>
      ) : null}

      {feature.kind === "fillet" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><EdgeTreatmentButtons value={feature.treatment} onChange={(treatment) => onUpdate((draft) => { if (draft.kind === "fillet") draft.treatment = treatment; })} /><BoundedNumberField label={feature.treatment === "chamfer" ? t("property.distance") : t("property.radius")} value={feature.radius} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "fillet") draft.radius = Math.max(0.01, value); })} />{!(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <label><span>{t("property.edges")}</span><select value={feature.edges} onChange={(event) => onUpdate((draft) => { if (draft.kind === "fillet") draft.edges = event.target.value as typeof draft.edges; })}><option value="vertical">{t("value.vertical")}</option><option value="all">{t("value.all")}</option></select></label> : null}</div>
          {(feature.selectionReferenceIds?.length ?? feature.edgeReferenceIds?.length) ? <><button className="kercad-edit-topology-selection" type="button" onClick={() => onEditSelection(feature.id)}>{t("operation.editSelection")}</button></> : null}
          <TransformSection description={uiText("sidebar.no.independent.transform", {}, locale)}><p className="kercad-transform-empty">{t("help.previousResult")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "faceExtrude" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><OperationModeButtons addOnly={requiresAddOperation(document, feature)} value={feature.operation} includeCommon={false} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "faceExtrude" && operation !== "intersect") draft.operation = operation; })} /><BoundedNumberField label={t("property.length")} value={feature.distance} min={0.01} max={200} onChange={(value) => onUpdate((draft) => { if (draft.kind === "faceExtrude") draft.distance = Math.max(0.01, value); })} /></div>
          <button className="kercad-edit-topology-selection" type="button" onClick={() => onEditFaceExtrudeSelection(feature.id)}>{t("operation.editFace")}</button>
          <TransformSection description={uiText("sidebar.direction.normal.to.face", {}, locale)}><p className="kercad-transform-empty">{t("help.faceExtrude")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "shell" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><ReadOnlyField label={t("property.type")} value={t("toolbar.shell")} /><div className="kercad-operation-mode-property"><div className="kercad-operation-mode-buttons"><ShellCornerButtons value={feature.cornerType} locale={locale} onChange={(cornerType) => onUpdate((draft) => { if (draft.kind === "shell") draft.cornerType = cornerType; })} /></div></div><BoundedNumberField label={t("property.thickness")} value={feature.thickness} min={0.01} max={50} onChange={(value) => onUpdate((draft) => { if (draft.kind === "shell") draft.thickness = Math.max(0.01, value); })} /></div>
          <button className="kercad-edit-topology-selection" type="button" onClick={() => onEditShellSelection(feature.id)}>{t("operation.editOpenFaces")}</button>
        </>
      ) : null}

      {feature.kind === "revolve" ? (
        <>
          <div className="kercad-feature-card"><h3>{t("model.operation")}</h3><OperationModeButtons addOnly={requiresAddOperation(document, feature)} value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "revolve") draft.operation = operation; })} /><label><span>{t("property.axis")}</span><select value={feature.axis === "edge" && feature.source === "sketch" ? `sketch-edge:${feature.sketchAxisSegmentId ?? ""}` : feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind !== "revolve") return; const value = event.target.value; if (value.startsWith("sketch-edge:")) { draft.axis = "edge"; draft.sketchAxisSegmentId = value.slice("sketch-edge:".length); draft.axisReferenceId = undefined; } else { draft.axis = value as "x" | "y" | "z" | "edge"; draft.sketchAxisSegmentId = undefined; } })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option>{feature.source === "sketch" ? revolveSketchAxes.map((segment, index) => <option key={segment.id} value={`sketch-edge:${segment.id}`}>{t("operation.selectedEdge")} {index + 1}</option>) : feature.axis === "edge" ? <option value="edge">{t("operation.selectedEdge")}</option> : null}</select></label><BoundedNumberField label={t("property.angle")} value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "revolve") draft.angle = Math.abs(value) < 1 ? (value < 0 ? -1 : 1) : Math.min(360, Math.max(-360, value)); })} /></div>
          {revolveSketch && revolveSketch.profile.shape !== "drawn" ? <div className="kercad-feature-card"><h3>{t("operation.sketchProfile")}</h3><ReadOnlyField label={t("property.shape")} value={revolveSketch.profile.shape === "rectangle" ? t("value.rectangle") : t("value.circle")} />{revolveSketch.profile.shape === "rectangle" ? <><BoundedNumberField label={t("property.width")} value={revolveSketch.profile.width} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.width = Math.max(0.01, value); })} /><BoundedNumberField label={t("property.depth")} value={revolveSketch.profile.depth} min={0.01} max={200} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "rectangle") draft.profile.depth = Math.max(0.01, value); })} /></> : <BoundedNumberField label={t("property.radius")} value={revolveSketch.profile.diameter / 2} min={0.01} max={100} onChange={(value) => onUpdateFeature(revolveSketch.id, (draft) => { if (draft.kind === "sketch" && draft.profile.shape === "circle") draft.profile.diameter = Math.max(0.01, value * 2); })} />}</div> : null}
          {feature.source === "face" ? <div className="kercad-topology-selection-actions"><button className="kercad-edit-topology-selection" type="button" onClick={() => onEditRevolveFace(feature.id)}>{t("operation.editFace")}</button><button className="kercad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>{t("operation.editAxis")}</button></div> : <button className="kercad-edit-topology-selection" type="button" onClick={() => onEditRevolveAxis(feature.id)}>{t("operation.editAxis")}</button>}
          <TransformSection description={uiText("sidebar.object.local.axis", {}, locale)}><p className="kercad-transform-empty">{t("help.revolve")}</p></TransformSection>
        </>
      ) : null}

      {feature.kind === "mirror" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <div className="kercad-operation-mode-buttons kercad-mirror-result-buttons">
              <button type="button" className={feature.duplicate ? "active" : ""} aria-pressed={feature.duplicate} onClick={() => onUpdate((draft) => { if (draft.kind === "mirror") draft.duplicate = true; })}>{t("value.duplicate")}</button>
              <button type="button" className={!feature.duplicate ? "active" : ""} aria-pressed={!feature.duplicate} onClick={() => onUpdate((draft) => { if (draft.kind === "mirror") draft.duplicate = false; })}>{t("value.transformOnly")}</button>
            </div>
          </div>
          <button className="kercad-edit-topology-selection" type="button" onClick={() => onEditMirrorPlane(feature.id)}>{t("mirror.choosePlane")}</button>
        </>
      ) : null}

      {feature.kind === "linearPattern" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <label><span>{t("property.source")}</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
              if (draft.kind !== "linearPattern") return;
              if (event.target.value === "body") {
                draft.source = "body";
                draft.sourceFeatureId = undefined;
                draft.dependencies = undefined;
              } else {
                draft.source = "feature";
                draft.sourceFeatureId = event.target.value;
                draft.dependencies = [{ type: "feature", id: event.target.value }];
              }
            })}><option value="body">{t("value.fullBody")}</option>{linearPatternSources.map((source) => <option key={source.id} value={source.id}>{t("value.previousOperation")} · {source.name}</option>)}</select></label>
            <label><span>{t("property.axis")}</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option></select></label>
          </div>
          <div className="kercad-feature-card">
            <h3>{t("operation.parameters")}</h3>
            <BoundedNumberField label={t("property.count")} value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label={t("property.spacing")} value={feature.spacing} min={-1000} max={1000} unit="mm" onChange={(value) => onUpdate((draft) => { if (draft.kind === "linearPattern") draft.spacing = Math.abs(value) < 0.01 ? (value < 0 ? -0.01 : 0.01) : value; })} />
          </div>
        </>
      ) : null}

      {feature.kind === "polarPattern" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <label><span>{t("property.source")}</span><select value={feature.source === "feature" ? feature.sourceFeatureId ?? "body" : "body"} onChange={(event) => onUpdate((draft) => {
              if (draft.kind !== "polarPattern") return;
              if (event.target.value === "body") {
                draft.source = "body";
                draft.sourceFeatureId = undefined;
                draft.dependencies = undefined;
              } else {
                draft.source = "feature";
                draft.sourceFeatureId = event.target.value;
                draft.dependencies = [{ type: "feature", id: event.target.value }];
              }
            })}><option value="body">{t("value.fullBody")}</option>{polarPatternSources.map((source) => <option key={source.id} value={source.id}>{t("value.previousOperation")} · {source.name}</option>)}</select></label>
            <label><span>{t("property.axis")}</span><select value={feature.axis} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.axis = event.target.value as typeof draft.axis; })}><option value="x">{t("value.localX")}</option><option value="y">{t("value.localY")}</option><option value="z">{t("value.localZ")}</option></select></label>
            <label><span>{t("property.uniformDistribution")}</span><input type="checkbox" checked={feature.equalSpacing} onChange={(event) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.equalSpacing = event.target.checked; })} /></label>
          </div>
          <div className="kercad-feature-card">
            <h3>{t("operation.parameters")}</h3>
            <BoundedNumberField label={t("property.count")} value={feature.count} min={2} max={50} step={1} onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.count = Math.min(50, Math.max(2, Math.round(value))); })} />
            <BoundedNumberField label={feature.equalSpacing ? t("property.totalAngle") : t("property.angularStep")} value={feature.angle} min={-360} max={360} step={1} unit="°" onChange={(value) => onUpdate((draft) => { if (draft.kind === "polarPattern") draft.angle = Math.abs(value) < 0.1 ? (value < 0 ? -0.1 : 0.1) : value; })} />
          </div>
          <details className="kercad-transform-section"><summary><ChevronRight size={16} /><span>{t("property.rotationCenter")}</span></summary><div>
            <TransformGroup label={t("property.rotationCenter")} showHeading={false} values={feature.center ?? { x: 0, y: 0, z: 0 }} unit="mm" onUpdate={(axis, value) => onUpdate((draft) => {
              if (draft.kind === "polarPattern") (draft.center ??= { x: 0, y: 0, z: 0 })[axis] = value;
            })} />
          </div></details>
        </>
      ) : null}

      {feature.kind === "objectBoolean" ? (
        <>
          <div className="kercad-feature-card">
            <h3>{t("model.operation")}</h3>
            <OperationModeButtons addOnly={requiresAddOperation(document, feature)} value={feature.operation} onChange={(operation) => onUpdate((draft) => { if (draft.kind === "objectBoolean") draft.operation = operation; })} />
            <label><span>{t("property.object")}</span><select value={feature.sourceObjectId} onChange={(event) => onUpdate((draft) => { if (draft.kind !== "objectBoolean") return; draft.sourceObjectId = event.target.value; draft.dependencies = [{ type: "object", id: event.target.value }]; })}>{document.objects.filter((object) => object.id !== feature.objectId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
          </div>
        </>
      ) : null}

    </div>
  );

  function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
    const { input: inputStep } = useContext(NumericStepContext);
    const localizedLabel = useLocalizedSidebarLiteral(label);
    return <label><span>{localizedLabel}</span><DeferredNumberInput value={value} min={min} step={inputStep} unit="mm" onCommit={onChange} /></label>;
  }
}

function OperationModeButtons({ value: storedValue, addOnly = false, includeCommon = true, onChange }: { addOnly?: boolean; value: "add" | "cut" | "intersect"; includeCommon?: boolean; onChange: (value: "add" | "cut" | "intersect") => void }) {
  const value = addOnly ? "add" : storedValue;
  const t = useSidebarTranslation();
  const modes = includeCommon ? (["add", "cut", "intersect"] as const) : (["add", "cut"] as const);
  return <div className="kercad-operation-mode-property">
    <div className="kercad-operation-mode-buttons">
      {modes.map((mode) => {
        const label = mode === "add" ? t("model.add") : mode === "cut" ? t("model.hole") : t("model.common");
        return <button key={mode} type="button" disabled={addOnly && mode !== "add"} className={`mode-${mode} ${value === mode ? "active" : ""}`} title={label} aria-label={label} aria-pressed={value === mode} onClick={() => onChange(mode)}><ToolbarBooleanModeIcon mode={mode === "cut" ? "hole" : mode === "intersect" ? "common" : "add"} /></button>;
      })}
    </div>
  </div>;
}

function EdgeTreatmentButtons({ value, onChange }: { value: "fillet" | "chamfer"; onChange: (value: "fillet" | "chamfer") => void }) {
  const t = useSidebarTranslation();
  return <div className="kercad-operation-mode-property">
    <div className="kercad-operation-mode-buttons kercad-edge-treatment-mode-buttons">
      <button type="button" className={`mode-fillet ${value === "fillet" ? "active" : ""}`} title={t("operation.fillet")} aria-label={t("operation.fillet")} aria-pressed={value === "fillet"} onClick={() => onChange("fillet")}><ToolbarFilletIcon /></button>
      <button type="button" className={`mode-chamfer ${value === "chamfer" ? "active" : ""}`} title={t("operation.chamfer")} aria-label={t("operation.chamfer")} aria-pressed={value === "chamfer"} onClick={() => onChange("chamfer")}><ToolbarChamferIcon /></button>
    </div>
  </div>;
}

function DeferredTextInput({ value, maxLength, onCommit }: { value: string; maxLength: number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(value); }, [editing, value]);
  const commit = () => {
    const next = draft.trim() || value;
    setDraft(next);
    setEditing(false);
    if (next !== value) onCommit(next);
  };
  return <input value={draft} maxLength={maxLength} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); } }} />;
}

function DeferredNumberInput({ value, min, max, step, unit, onCommit }: { value: number; min?: number; max?: number; step: number; unit?: string; onCommit: (value: number) => void }) {
  const t = useSidebarTranslation();
  const { displayUnit } = useContext(NumericStepContext);
  const isLength = unit === "mm";
  const toDisplay = (next: number) => isLength ? millimetersToDisplayLength(next, displayUnit) : next;
  const toInternal = (next: number) => isLength ? displayLengthToMillimeters(next, displayUnit) : next;
  const displayValue = toDisplay(value);
  const displayMin = min === undefined ? undefined : toDisplay(min);
  const displayMax = max === undefined ? undefined : toDisplay(max);
  const displayStep = toDisplay(step);
  const [draft, setDraft] = useState(String(displayValue));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setDraft(String(displayValue)); }, [displayUnit, displayValue, editing]);
  const steppedValue = (direction: 1 | -1) => {
    const parsed = parseNumericExpression(draft, isLength ? displayUnit : unit);
    const base = Number.isFinite(parsed) ? parsed : displayValue;
    const next = Math.round((base + direction * displayStep) * 1e10) / 1e10;
    return Math.min(displayMax ?? Number.POSITIVE_INFINITY, Math.max(displayMin ?? Number.NEGATIVE_INFINITY, next));
  };
  const nudge = (direction: 1 | -1) => {
    setEditing(true);
    setDraft(String(steppedValue(direction)));
    inputRef.current?.focus();
  };
  const commit = () => {
    const parsed = parseNumericExpression(draft, isLength ? displayUnit : unit);
    if (inputRef.current && !validateNumericExpression(inputRef.current, parsed)) return;
    setEditing(false);
    const nextDisplay = Math.min(displayMax ?? Number.POSITIVE_INFINITY, Math.max(displayMin ?? Number.NEGATIVE_INFINITY, parsed));
    const next = toInternal(nextDisplay);
    setDraft(String(nextDisplay));
    if (Math.abs(next - value) > 1e-10) onCommit(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      setDraft(String(displayValue));
      event.currentTarget.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      nudge(event.key === "ArrowUp" ? 1 : -1);
    }
  };
  const visibleUnit = isLength ? displayUnitLabel(displayUnit) : unit;
  return <span className="kercad-number-input" onWheel={(event) => { event.preventDefault(); nudge(event.deltaY < 0 ? 1 : -1); }}><input ref={inputRef} type="text" inputMode="text" value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={handleKeyDown} />{visibleUnit ? <small>{visibleUnit}</small> : null}<span className="kercad-number-steppers"><button type="button" tabIndex={-1} aria-label={t("input.increment")} title={t("input.increment")} onPointerDown={(event) => { event.preventDefault(); nudge(1); }}>▲</button><button type="button" tabIndex={-1} aria-label={t("input.decrement")} title={t("input.decrement")} onPointerDown={(event) => { event.preventDefault(); nudge(-1); }}>▼</button></span></span>;
}

function BoundedNumberField({ label, value, min, max, step, unit = step === undefined ? "mm" : "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  const steps = useContext(NumericStepContext);
  const localizedLabel = useLocalizedSidebarLiteral(label);
  const clampedValue = Math.min(max, Math.max(min, value));
  return (
    <label className="kercad-compact-number-property">
      <span>{localizedLabel}</span><DeferredNumberInput value={clampedValue} min={min} max={max} step={step ?? steps.input} unit={unit} onCommit={(next) => onChange(Math.min(max, Math.max(min, next)))} />
    </label>
  );
}

function ReadOnlyField({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  const localizedLabel = useLocalizedSidebarLiteral(label);
  return <label><span>{localizedLabel}</span><output className={compact ? "compact" : ""}>{value}</output></label>;
}
