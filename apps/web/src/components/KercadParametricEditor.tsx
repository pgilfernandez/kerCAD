"use client";

import { AdvancedNumberFields, AdvancedNumberInput } from "@/components/AdvancedNumberFields";

import { ChallengeIcon } from "@/components/ChallengeIcon";
import { CylinderProfileButtons } from "@/components/CylinderProfileButtons";
import { reportUsage } from "@/lib/usageMetrics";
import { PopupPointer } from "@/components/PopupPointer";
import { updateAutoSmoothNodes } from "@/lib/sketchAutoSmooth";
import { ToolbarSweepIcon } from "@/components/icons";
import { ThemedToolbarImage } from "@/components/ThemedToolbarImage";
import { sketchOverlayPositions } from "@/lib/sketchOverlayGeometry";
import { adjacentSweepSketchPair } from "@/lib/sweepInputSelection";
import { setSphereEllipsoidal, setTorusElliptical, setTubeElliptical } from "@/lib/parametricObjects";
import { PlatonicTypeButtons } from "@/components/PlatonicTypeButtons";

import { DashboardBrandLogo } from "@/components/DashboardBrandLogo";

import { PROJECT_FILE_PATTERN, LEGACY_PROJECT_ACCEPT } from "@/lib/legacyBrand";
import { Camera, RotateCcw, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Focus, Home, Maximize2, Minus, Plus, Trash2, X } from "lucide-react";
import { ChallengeEditor, type ChallengeDock } from "@/components/ChallengeEditor";
import { captureChallengeParameters } from "@/lib/challengeParameterCapture";
import { ChallengePlayer } from "@/components/ChallengePlayer";
import type { KercadChallenge } from "@/lib/challengeLibrary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { workplaneGeometryBounds } from "@/lib/workplaneGeometryBounds";
import { alignmentGroupBounds, sameAlignmentItem, translateAlignmentTargets, type AlignmentTarget } from "@/lib/parametricAlignment";
import { ParametricModelSidebar, type ModelSidebarMode, type ModelTreeSelection } from "@/components/ParametricModelSidebar";
import { ParametricViewport, type CameraOrientation, type CameraProjection, type CameraView, type TopologyEdgePick, type TopologyFacePick, type ViewportDisplayMode, type ViewportShadingMode } from "@/components/ParametricViewport";
import { SketchWorkspace, type SketchMeasurement, type SketchSceneReference, type SketchSelection, type SketchTool } from "@/components/SketchWorkspace";
import { SketchToolMenu } from "@/components/SketchToolMenu";
import { EditorGettingStarted, resetStartupTutorials } from "@/components/EditorGettingStarted";
import { ProjectLoadingDialog } from "@/components/ProjectLoadingDialog";
import type { ParametricBuildProgress } from "@/lib/parametricBuildProgress";
import { nextAnnotationName } from "@/lib/annotationNames";
import { SECTION_PLANE_ID, type VisualSection } from "@/lib/visualSection";
import type { CaptureCrop } from "@/lib/viewportCapture";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { ImportDesignDialog } from "@/components/ImportDesignDialog";
import { ReferenceDisplayButtons } from "@/components/ReferenceDisplayButtons";
import { ViewportFloatingNumberInput } from "@/components/ViewportFloatingNumberInput";
import {
  ToolbarAlignIcon,
  ToolbarChamferIcon,
  ToolbarCopyIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarDuplicateIcon,
  ToolbarExtrudeIcon,
  ToolbarSectionViewIcon,
  ViewToolbarIcon,
  GridControlIcon,
  ToolbarFilletIcon,
  ToolbarImportIcon,
  ToolbarMirrorIcon,
  ToolbarLinearPatternIcon,
  ToolbarPolarPatternIcon,
  ToolbarObjectBooleanIcon,
  ToolbarOrthographicIcon,
  ToolbarParameterManipulatorIcon,
  ToolbarPasteIcon,
  ToolbarPositionManipulatorIcon,
  ToolbarScaleManipulatorIcon,
  ToolbarEditOperationIcon,
  ToolbarPerspectiveIcon,
  ToolbarRedoIcon,
  ToolbarRotationManipulatorIcon,
  ToolbarRevolveIcon,
  ToolbarSettingsIcon,
  ToolbarShellIcon,
  SketchConstraintIcon,
  SketchToolbarIcon,
  ToolbarShapeAddIcon,
  ToolbarSketchIcon,
  ToolbarSnapGridIcon,
  ToolbarTrashIcon,
  ToolbarUndoIcon,
  ToolbarVectorExportIcon,
  ToolbarWorkplaneIcon,
  ToolbarResetWorkplaneIcon,
} from "@/components/icons";
import { cloneDocument, createDrawnSketchFeature, createEmptyDocument, createExtrudeFeature, createFaceExtrudeFeature, createFilletFeature, createLinearPatternFeature, createMirrorFeature, createObjectBooleanFeature, createPolarPatternFeature, createRevolveFeature, createShellFeature, normalizeParametricDocument, validateDocument } from "@/lib/parametricDocument";
import { createLocalId } from "@/lib/localIds";
import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { assertValidParametricTopology, parametricTopologyEditingSourceFeature, parametricTopologySelectionsMatch, recoverParametricTopologyReferenceInRecords, transformParametricObjectTopologyHints } from "@/lib/parametricTopology";
import { objectColorsFromFingerprint, parametricGeometryFingerprint, parametricObjectColorFingerprint, parametricObjectGeometryFingerprint } from "@/lib/parametricBuildState";
import { buildParametricStlMeshes, exportParametricStep, type StlTessellationQuality } from "@/lib/parametricKernel";
import { ParametricBuildWorkerClient } from "@/lib/parametricBuildWorker";
import { binaryStlFromRenderMeshes } from "@/lib/stlExport";
import { sketchProfileFromSvg } from "@/lib/svgImport";
import { importSvgAsParametricExtrusion } from "@/lib/svgParametricImport";
import { addParametricText } from "@/lib/parametricText";
import { appendScribbleContour } from "@/lib/parametricScribble";
import { KERCAD_PACKAGE_LIMITS, KERCAD_PACKAGE_MEDIA_TYPE, exportKercadProject, importKercadProject } from "@/lib/kercadProject";
import { mergeParametricProjects } from "@/lib/parametricProjectMerge";
import { importStepAsParametricObject } from "@/lib/parametricStepImport";
import { importReferenceImage, importReferenceMesh, parametricReferenceRenderRecords } from "@/lib/parametricReferenceImport";
import { assertImportByteLimit } from "@/lib/parametricImportLimits";
import { displayLengthToMillimeters, displayUnitLabel, displayUnitWorkspace, millimetersToDisplayLength, normalizeDisplayUnit } from "@/lib/parametricUnits";
import { AnnotationIcon } from "@/components/AnnotationIcon";
import { SketchAnnotationToolbar } from "@/components/SketchAnnotationToolbar";
import { annotationDimensionPreset, type AnnotationTool } from "@/lib/annotationPresets";
import { annotationPosition, rotatedCircleAnnotation, setAnnotationPosition, type AnnotationPoint } from "@/lib/annotationGeometry";
import { kercadTranslate, type KercadLocale, type KercadTranslationKey } from "@/lib/kercadI18n";
import { parametricRebuildSuggestion } from "@/lib/parametricRebuildDiagnostics";
import { hasPreviousSolidOperation } from "@/lib/parametricOperationModes";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { arcSketchPointId, circleSketchPointId, SKETCH_REFERENCE_AXES, sketchConstraintConflict, sketchConstraintPoint, sketchConstraintUsesPoint, sketchConstraintUsesSegment, sketchReferenceAxis, solveSketchConstraints } from "@/lib/sketchConstraints";
import { copySketchSelection, pasteSketchSelection } from "@/lib/sketchClipboard";
import { enableToolbarMouseScroll } from "@/lib/toolbarScroll";
import { EditorHeaderActions } from "@/components/EditorHeaderActions";
import { analyzeSketchConstraints } from "@/lib/sketchConstraintAnalysis";
import { isOpenSketchProfile, validateDrawnSketchProfile } from "@/lib/sketchProfileValidation";
import { trimSketchGeometry } from "@/lib/sketchTrim";
import {
  beginHistoryTransaction,
  cancelHistoryTransaction,
  commitHistoryDocument,
  createParametricHistory,
  currentHistoryDocument,
  finishHistoryTransaction,
  redoParametricHistory,
  undoParametricHistory,
  type ParametricHistoryState,
} from "@/lib/parametricHistory";
import {
  addPrimitiveToSelection,
  addParametricObject,
  applyParametricSelectionWorldDelta,
  parametricSelectionSnapPosition,
  snapParametricSelectionToGrid,
  applyParametricSelectionWorkplaneRotation,
  rotateParametricObjectAroundLocalAxis,
  applyWorkplanePatch,
  deleteParametricObject,
  deleteParametricFeature,
  deleteParametricSelection,
  duplicateParametricObject,
  duplicateParametricFeature,
  duplicateParametricSelection,
  lastOperationForObject,
  moveParametricObjectOrigin,
  objectIdForFeature,
  canReorderParametricSelection,
  canReorderAnnotation,
  reorderAnnotation,
  ANNOTATIONS_GROUP_ID,
  renameParametricSelection,
  resetParametricFeature,
  reorderParametricSelection,
  updateParametricShapeParameter,
  viewportSelectionForFeature,
  viewportSelectionForObject,
  viewportPlacementForSketchFeature,
  workplaneShapeForObject,
  type ParametricAlignmentAnchor,
  type ParametricAlignmentAxis,
  type SupportedPrimitive,
} from "@/lib/parametricObjects";
import { globalParametricWorkplanePlacement, objectPlacementForWorkplane, operationPlacementForWorkplane, parametricTransformMatrix, parametricWorkplaneFromFace, parametricWorkplaneIsGlobal } from "@/lib/parametricWorkplane";
import { patternHandlePlacement } from "@/lib/parametricPatternHandles";
import { applyParametricScale, createParametricScaleTarget } from "@/lib/parametricScaleManipulator";
import { localizedParametricOperationDefinition, parametricShapeMenuOrder, parametricOperationDefinition } from "@/lib/parametricOperationCatalog";
import type { ViewportRenderQuality } from "@/lib/viewportPerformance";
import type { BuildResult, ExtrudeFeature, ParametricAnnotation, ParametricDocument, ParametricFeature, ParametricObject, ParametricObjectRenderRecord, ParametricTopologyReference, PrimitiveFeature, RevolveFeature, SketchFeature } from "@/types/parametric";
import type { GridSize, SketchConstraint, SketchPoint, SketchProfile, WorkplaneShape } from "@/types/workplane";
import { uiText } from "@/lib/kercadI18n";
import { useAppLocale } from "@/lib/useAppLocale";

const RENDER_QUALITY_STORAGE_KEY = "kercad.viewport.render-mode";
const FPS_VISIBLE_STORAGE_KEY = "kercad.viewport.show-fps";
const POSITION_TRIAD_VISIBLE_STORAGE_KEY = "kercad.viewport.position-triad";
const ROTATION_TRIAD_VISIBLE_STORAGE_KEY = "kercad.viewport.rotation-triad";
const PARAMETER_HANDLES_VISIBLE_STORAGE_KEY = "kercad.viewport.parameter-handles";
const SCALE_MANIPULATOR_VISIBLE_STORAGE_KEY = "kercad.viewport.scale-manipulator";
const DISPLAY_MODE_STORAGE_KEY = "kercad.viewport.display-mode";
const SHADING_MODE_STORAGE_KEY = "kercad.viewport.shading-mode";

function localizeNewDocumentEntries(previous: ParametricDocument, next: ParametricDocument, locale: KercadLocale) {
  const previousObjectIds = new Set(previous.objects.map((object) => object.id));
  next.objects.filter((object) => !previousObjectIds.has(object.id)).forEach((object, index) => { object.name = `${uiText("sidebar.object", {}, locale)} ${previous.objects.length + index + 1}`; });
  const previousFeatureIds = new Set(previous.features.map((feature) => feature.id));
  next.features.filter((feature) => !previousFeatureIds.has(feature.id)).forEach((feature) => {
    const index = next.features.filter((candidate) => candidate.kind === feature.kind).findIndex((candidate) => candidate.id === feature.id) + 1;
    if (feature.kind === "primitive") feature.name = localizedParametricOperationDefinition(feature.primitive, locale).name;
    else if (feature.kind === "sketch") {
      if (feature.generatedPath) {
        const pathIndex = next.features.filter((candidate) => candidate.kind === "sketch" && candidate.generatedPath?.kind === feature.generatedPath?.kind).findIndex((candidate) => candidate.id === feature.id) + 1;
        feature.name = `${uiText(feature.generatedPath.kind === "spiral" ? "path.spiral" : "path.helix", {}, locale)} ${pathIndex}`;
        return;
      }
      const generator = feature.profile.shape === "drawn" ? feature.profile.geometry.generator?.kind : null;
      feature.name = generator === "text" ? (uiText("ui.kercadparametriceditor.text.profile.879b35", {}, locale)) : generator === "scribble" ? uiText("operation.scribbleProfile", {}, locale) : `${uiText("operation.sketch", {}, locale)} ${index}`;
    } else if (feature.kind === "extrude") {
      const sketch = next.features.find((candidate) => candidate.kind === "sketch" && candidate.id === feature.sketchId);
      if (!feature.pathSketchId && !feature.endSketchId && sketch?.kind === "sketch" && sketch.purpose === "primitive" && (sketch.profile.shape === "circle" || sketch.profile.shape === "rectangle")) {
        feature.name = localizedParametricOperationDefinition(sketch.profile.shape === "circle" ? "cylinder" : "box", locale).name;
        return;
      }
      const generator = sketch?.kind === "sketch" && sketch.profile.shape === "drawn" ? sketch.profile.geometry.generator?.kind : null;
      feature.name = generator === "text" ? (uiText("sidebar.text", {}, locale)) : generator === "scribble" ? uiText("operation.scribble", {}, locale) : `${uiText("ui.kercadparametriceditor.extrusion.f1a195", {}, locale)} ${index}`;
    }
    else if (feature.kind === "hole") feature.name = `${uiText("operation.hole", {}, locale)} ${index}`;
    else if (feature.kind === "fillet") feature.name = `${feature.treatment === "chamfer" ? (uiText("operation.chamfer", {}, locale)) : (uiText("operation.fillet", {}, locale))} ${index}`;
    else if (feature.kind === "faceExtrude") feature.name = `${feature.operation === "cut" ? (uiText("ui.kercadparametriceditor.face.cut.4c1acc", {}, locale)) : (uiText("operation.faceExtrude", {}, locale))} ${index}`;
    else if (feature.kind === "shell") feature.name = `${uiText("toolbar.shell", {}, locale)} ${index}`;
    else if (feature.kind === "revolve") feature.name = `${uiText("ui.kercadparametriceditor.revolution.726830", {}, locale)} ${index}`;
    else if (feature.kind === "mirror") feature.name = `${uiText("operation.mirror", {}, locale)} ${index}`;
    else if (feature.kind === "linearPattern") feature.name = `${uiText("operation.linearPattern", {}, locale)} ${index}`;
    else if (feature.kind === "polarPattern") feature.name = `${uiText("operation.polarPattern", {}, locale)} ${index}`;
    else if (feature.kind === "objectBoolean") feature.name = `${uiText("ui.kercadparametriceditor.object.boolean.0bf5b3", {}, locale)} ${index}`;
  });
}
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
  return value.trim().replace(/\.(?:kercad\.json|json|step|stp|stl)$/i, "").toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, "-").replace(/^-|-$/g, "") || "model";
}

function emptySketchProfile(): SketchProfile {
  return { points: [], segments: [], circles: [], images: [], texts: [], constraints: [] };
}

function cloneSketchProfile(profile: SketchProfile): SketchProfile {
  return {
    points: profile.points.map((point) => ({ ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined })),
    segments: profile.segments.map((segment) => ({ ...segment })),
    circles: (profile.circles ?? []).map((circle) => ({ ...circle })),
    images: (profile.images ?? []).map((image) => ({ ...image })),
    texts: (profile.texts ?? []).map((text) => ({ ...text })),
    constraints: (profile.constraints ?? []).map((constraint) => ({ ...constraint })),
  };
}

function orderedSketchPaths(profile: SketchProfile) {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchProfile["segments"][number] }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const validSegments = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId) || segment.startId === segment.endId) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(validSegments.map((segment) => segment.id));
  const paths: Array<{ points: SketchPoint[]; closed: boolean }> = [];
  while (unvisited.size) {
    const seed = validSegments.find((segment) => segment.id === unvisited.values().next().value);
    if (!seed) break;
    const componentIds = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length) {
      const id = queue.pop();
      if (!id || componentIds.has(id)) continue;
      componentIds.add(id);
      adjacency.get(id)?.forEach((entry) => queue.push(entry.pointId));
    }
    const startId = [...componentIds].find((id) => (adjacency.get(id)?.filter((entry) => unvisited.has(entry.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) { unvisited.delete(seed.id); continue; }
    const points = [first];
    let currentId = startId;
    for (let guard = 0; guard <= validSegments.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((entry) => unvisited.has(entry.segment.id));
      if (!edge) break;
      const to = pointById.get(edge.pointId);
      if (!to) break;
      unvisited.delete(edge.segment.id);
      currentId = to.id;
      if (currentId === startId) break;
      points.push(to);
    }
    paths.push({ points, closed: currentId === startId && points.length >= 2 });
  }
  return paths;
}

function sketchEntityId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function closestSketchGrid(step: number, enabled: boolean): GridSize {
  if (!enabled) return "Off";
  const options: Array<[number, GridSize]> = [[0.1, "0.1 mm"], [0.25, "0.25 mm"], [0.5, "0.5 mm"], [1, "1.0 mm"], [2, "2.0 mm"], [5, "5.0 mm"]];
  return options.reduce((closest, candidate) => Math.abs(candidate[0] - step) < Math.abs(closest[0] - step) ? candidate : closest, options[0])[1];
}

function withSmoothSketchHandles(profile: SketchProfile) {
  const next = cloneSketchProfile(profile);
  const points = new Map(next.points.map((point) => [point.id, point]));
  next.points.forEach((point) => {
    if (point.mode === "split" && point.handleIn && point.handleOut) return;
    const incoming = next.segments.find((segment) => segment.endId === point.id);
    const outgoing = next.segments.find((segment) => segment.startId === point.id);
    const previous = incoming ? points.get(incoming.startId) : null;
    const following = outgoing ? points.get(outgoing.endId) : null;
    if (!previous && !following) return;
    const tangent = previous && following
      ? { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 }
      : previous
        ? { x: (point.x - previous.x) / 6, z: (point.z - previous.z) / 6 }
        : { x: (following!.x - point.x) / 6, z: (following!.z - point.z) / 6 };
    point.handleIn = { x: point.x - tangent.x, z: point.z - tangent.z };
    point.handleOut = { x: point.x + tangent.x, z: point.z + tangent.z };
    point.mode = "smooth";
  });
  return next;
}

type KercadParametricEditorProps = {
  initialProject?: ParametricDocument;
  sharedFileName?: string;
  onSaveShared?: (document: ParametricDocument, fileName: string, author: string) => Promise<void>;
  onProjectChange?: (document: ParametricDocument) => void;
  onProjectThumbnail?: (dataUrl: string, document?: ParametricDocument) => void;
  onExitToProjects?: (document: ParametricDocument) => void;
  challenge?: KercadChallenge | null;
  challengeEditor?: KercadChallenge | null;
  onSaveChallenge?: (challenge: KercadChallenge, document: ParametricDocument) => void;
  onCancelChallengeEdit?: () => void;
};

export function KercadParametricEditor({ initialProject, sharedFileName, onSaveShared, onProjectChange, onProjectThumbnail, onExitToProjects, challenge, challengeEditor, onSaveChallenge, onCancelChallengeEdit }: KercadParametricEditorProps = {}) {
  const reportedOpen = useRef(false);
  useEffect(() => {
    if (reportedOpen.current) return;
    reportedOpen.current = true;
    reportUsage(challenge || challengeEditor ? "challenge" : "project");
  }, [challenge, challengeEditor]);
  const initialDocument = useMemo(() => initialProject ? normalizeParametricDocument(structuredClone(initialProject)) : createEmptyDocument(), [initialProject]);
  const latestProjectThumbnailRef = useRef<string | undefined>(undefined);
  const [history, setHistory] = useState<ParametricHistoryState>(() => createParametricHistory(initialDocument));
  const document = currentHistoryDocument(history);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationEndpoint, setAnnotationEndpoint] = useState<AnnotationPoint | null>(null);
  const selectedAnnotation = document.annotations?.find((annotation) => annotation.id === selectedAnnotationId);
  const selectedAnnotationPoint = selectedAnnotation?.visible && document.annotationGroup?.visible !== false
    ? annotationPosition(selectedAnnotation, annotationEndpoint)
    : null;
  useEffect(() => setAnnotationEndpoint(null), [selectedAnnotationId]);
  const latestDocumentRef = useRef(document);
  latestDocumentRef.current = document;
  const [modelSelection, setModelSelection] = useState<ModelTreeSelection[]>(initialDocument.objects[0] ? [{ id: initialDocument.objects[0].id, kind: "object" }] : []);
  useEffect(() => { if (modelSelection.length) { setSelectedAnnotationId(null); setAnnotationTool(null); } }, [modelSelection]);
  useEffect(() => { if (selectedAnnotationId !== editingAnnotationId) setEditingAnnotationId(null); }, [selectedAnnotationId, editingAnnotationId]);
  useEffect(() => {
    if (selectedAnnotationId && (selectedAnnotationId === ANNOTATIONS_GROUP_ID
      ? !document.annotations?.length
      : !document.annotations?.some((annotation) => annotation.id === selectedAnnotationId))) setSelectedAnnotationId(null);
  }, [document.annotations, selectedAnnotationId]);
  const [build, setBuild] = useState<BuildResult>({ mesh: null, objectRecords: [], operationContext: null, completedFeatureIds: [], failedFeatureId: null, warning: null });
  const [operationContext, setOperationContext] = useState<BuildResult["operationContext"]>(null);
  const renderedGeometryFingerprintRef = useRef<string | null>(null);
  const [kernelBusy, setKernelBusy] = useState(true);
  const [initialModelSettled, setInitialModelSettled] = useState(false);
  const initialModelSettledRef = useRef(false);
  const [initialLoadProgress, setInitialLoadProgress] = useState<ParametricBuildProgress | null>(null);
  const [showProjectLoading, setShowProjectLoading] = useState(true);
  const finishProjectLoading = useCallback(() => setShowProjectLoading(false), []);
  const [contextBusy, setContextBusy] = useState(false);
  const [topologyPreviewBusy, setTopologyPreviewBusy] = useState(false);
  const [topologySelectionBusy, setTopologySelectionBusy] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [shapeMenuPosition, setShapeMenuPosition] = useState({ top: 0, left: 10 });
  const shapeMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [modelSidebarMode, setModelSidebarMode] = useState<ModelSidebarMode | "hidden">("normal");
  const sidebarModeBeforeSketchRef = useRef<ModelSidebarMode | "hidden">("normal");
  const [compactSketchToolbar, setCompactSketchToolbar] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState(document.name);
  const [exportScope, setExportScope] = useState<"project" | "selection">("project");
  const [stlExportScope, setStlExportScope] = useState<"project" | "selection">("project");
  useEffect(() => { if (exportOpen) setStlExportScope("project"); }, [exportOpen]);
  const [stlQuality, setStlQuality] = useState<StlTessellationQuality>("medium");
  const [stlExporting, setStlExporting] = useState(false);
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [projectRenameOpen, setProjectRenameOpen] = useState(false);
  const [projectRenameDraft, setProjectRenameDraft] = useState("");
  const [projectAuthorDraft, setProjectAuthorDraft] = useState("");
  const projectRenameDialogRef = useAccessibleDialog<HTMLFormElement>(projectRenameOpen, () => setProjectRenameOpen(false));
  const openProjectRename = () => {
    setProjectRenameDraft(document.name);
    setProjectAuthorDraft(document.author ?? document.creator ?? "");
    setProjectRenameOpen(true);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [workplaneOpen, setWorkplaneOpen] = useState(false);
  const [snapSpacingOpen, setSnapSpacingOpen] = useState(false);
  const [pendingSweepPathId, setPendingSweepPathId] = useState<string | null>(null);
  const focusSnapSpacingRef = useRef(false);
  const [workplaneDraft, setWorkplaneDraft] = useState(document.workplane);
  const [placingWorkplane, setPlacingWorkplane] = useState(false);
  const [editingMirrorPlaneId, setEditingMirrorPlaneId] = useState<string | null>(null);
  const [selectingTopologyFaces, setSelectingTopologyFaces] = useState(false);
  const [selectedTopologyFaces, setSelectedTopologyFaces] = useState<ParametricTopologyReference[]>([]);
  const [selectingTopologyEdges, setSelectingTopologyEdges] = useState(false);
  const [selectedTopologyEdges, setSelectedTopologyEdges] = useState<ParametricTopologyReference[]>([]);
  const [pendingEdgeTreatment, setPendingEdgeTreatment] = useState<"fillet" | "chamfer" | null>(null);
  const [editingEdgeTreatmentId, setEditingEdgeTreatmentId] = useState<string | null>(null);
  const [edgeTreatmentRadius, setEdgeTreatmentRadius] = useState(2);
  const [pendingFaceExtrude, setPendingFaceExtrude] = useState<{ operation: "add" | "cut"; distance: number; taperAngle: number } | null>(null);
  const [editingFaceExtrudeId, setEditingFaceExtrudeId] = useState<string | null>(null);
  const [pendingShell, setPendingShell] = useState<{ thickness: number; cornerType: "rounded" | "sharp" } | null>(null);
  const [editingShellId, setEditingShellId] = useState<string | null>(null);
  const [pendingRevolve, setPendingRevolve] = useState<{ operation: "add" | "cut" | "intersect"; angle: number; axis: "x" | "y" | "z" | "edge" } | null>(null);
  const [editingRevolveId, setEditingRevolveId] = useState<string | null>(null);
  const [topologySelectionBuild, setTopologySelectionBuild] = useState<BuildResult | null>(null);
  const [topologyPreviewContext, setTopologyPreviewContext] = useState<BuildResult["operationContext"]>(null);
  const [view, setView] = useState<CameraView>({ name: "home", token: 0 });
  const [projection, setProjection] = useState<CameraProjection>("orthographic");
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionSelected, setSectionSelected] = useState(false);
  const editingSection = sectionEnabled && sectionSelected;
  useEffect(() => { if (modelSelection.length || selectedAnnotationId) setSectionSelected(false); }, [modelSelection, selectedAnnotationId]);
  const [placingSection, setPlacingSection] = useState(false);
  const [sectionPose, setSectionPose] = useState<VisualSection>({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
  const [sectionPositionVisible, setSectionPositionVisible] = useState(true);
  const [sectionRotationVisible, setSectionRotationVisible] = useState(true);
  useEffect(() => { setSectionEnabled(false); setSectionSelected(false); setPlacingSection(false); }, [document.id]);
  const [renderQuality, setRenderQuality] = useState<ViewportRenderQuality>("normal");
  const [displayMode, setDisplayMode] = useState<ViewportDisplayMode>("solid");
  const [shadingMode, setShadingMode] = useState<ViewportShadingMode>("shadows");
  const displayUnit = normalizeDisplayUnit(document.displayUnit);
  const [locale, setLocale] = useAppLocale();
  const [showFps, setShowFps] = useState(false);
  const [showPositionTriad, setShowPositionTriad] = useState(true);
  const [showRotationTriad, setShowRotationTriad] = useState(false);
  const [showParameterHandles, setShowParameterHandles] = useState(true);
  const [showScaleManipulator, setShowScaleManipulator] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(Boolean(challenge || challengeEditor));
  const [challengeDock, setChallengeDock] = useState<ChallengeDock>(() => {
    if (typeof window === "undefined") return "left";
    const saved = window.localStorage.getItem("kercad.challenge-dock");
    return saved === "floating" || saved === "left" || saved === "right" ? saved : "left";
  });
  const [challengeCaptureToken, setChallengeCaptureToken] = useState(0);
  const [pendingChallengeCapture, setPendingChallengeCapture] = useState<string | null>(null);
  const [pendingProjectCapture, setPendingProjectCapture] = useState(false);
  const projectCaptureRequestRef = useRef(false);
  const [challengeCaptureCrop, setChallengeCaptureCrop] = useState<CaptureCrop | undefined>(undefined);
  useEffect(() => setPendingChallengeCapture(null), [challengeEditor?.id]);
  const [challengeCapture, setChallengeCapture] = useState<{ stepId: string; dataUrl: string; token: number } | null>(null);
  const challengeCaptureStepRef = useRef<string | null>(null);
  const [originEditObjectId, setOriginEditObjectId] = useState<string | null>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const [alignmentMode, setAlignmentMode] = useState<"reference" | "group">("reference");
  const [alignmentHelpHovered, setAlignmentHelpHovered] = useState(false);
  const [alignmentGeometry, setAlignmentGeometry] = useState<{ document: ParametricDocument; groupKey: string; targets: AlignmentTarget[]; complete?: boolean } | null>(null);
  const alignmentGeometryRef = useRef(alignmentGeometry);
  alignmentGeometryRef.current = alignmentGeometry;
  const alignmentHistoryCache = useRef(new WeakMap<ParametricDocument, { document: ParametricDocument; groupKey: string; targets: AlignmentTarget[]; complete?: boolean }>());
  if (alignmentGeometry && alignmentGeometry.complete !== false) alignmentHistoryCache.current.set(alignmentGeometry.document, alignmentGeometry);
  const alignmentGroupKey = JSON.stringify(modelSelection.map(item => ({ id: item.id, kind: item.kind })).sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind)));
  const currentAlignmentGeometry = alignmentGeometry?.document === document ? alignmentGeometry : alignmentHistoryCache.current.get(document);
  const alignmentTargets = alignOpen && currentAlignmentGeometry?.groupKey === alignmentGroupKey ? currentAlignmentGeometry.targets : [];
  const alignmentBusy = !currentAlignmentGeometry || currentAlignmentGeometry.groupKey !== alignmentGroupKey || currentAlignmentGeometry.complete === false;
  const alignmentReference = alignOpen ? modelSelection.at(-1) ?? null : null;
  const alignmentGroupTarget = useMemo(() => alignmentMode === "group" ? alignmentGroupBounds(alignmentTargets) : null, [alignmentMode, alignmentTargets]);
  const alignmentDisplayTargets = useMemo(() => alignmentGroupTarget ? [...alignmentTargets, alignmentGroupTarget] : alignmentTargets, [alignmentTargets, alignmentGroupTarget]);
  const alignmentDisplayReference = alignmentGroupTarget ?? alignmentReference;
  const alignmentPriorityRef = useRef(alignmentReference);
  alignmentPriorityRef.current = alignmentReference;
  useEffect(() => {
    if (!alignOpen) return;
    if (alignmentGeometryRef.current?.document === document && alignmentGeometryRef.current.groupKey === alignmentGroupKey && alignmentGeometryRef.current.complete !== false) return;
    const cached = alignmentHistoryCache.current.get(document);
    if (cached?.groupKey === alignmentGroupKey) {
      setAlignmentGeometry(cached);
      return;
    }
    const group: ModelTreeSelection[] = JSON.parse(alignmentGroupKey);
    const priority = alignmentPriorityRef.current;
    if (priority) group.sort((a, b) => Number(sameAlignmentItem(b, priority)) - Number(sameAlignmentItem(a, priority)));
    if (group.length < 2) { setAlignOpen(false); return; }
    // The reference object is already tessellated for the viewport. Reuse it
    // immediately so its bbox and face buttons do not wait for the CAD worker.
    // The viewport can still contain the previous build after an alignment or
    // undo. Never promote that stale mesh into the new alignment cache.
    const previewRecord = priority?.kind === "object" ? viewportObjectRecords.find(record => record.objectId === priority.id
      && (record.reference || record.geometryFingerprint === parametricObjectGeometryFingerprint(document, priority.id))) : undefined;
    const previewObject = priority?.kind === "object" ? document.objects.find(object => object.id === priority.id) : undefined;
    const seededTargets: AlignmentTarget[] = previewRecord && previewObject && priority ? (() => {
      const min = { x: Infinity, y: Infinity, z: Infinity };
      const max = { x: -Infinity, y: -Infinity, z: -Infinity };
      const positions = previewRecord.mesh.positions;
      for (let index = 0; index < positions.length; index += 3) {
        min.x = Math.min(min.x, positions[index]); min.y = Math.min(min.y, positions[index + 1]); min.z = Math.min(min.z, positions[index + 2]);
        max.x = Math.max(max.x, positions[index]); max.y = Math.max(max.y, positions[index + 1]); max.z = Math.max(max.z, positions[index + 2]);
      }
      return Number.isFinite(min.x) ? [{ ...priority, objectId: previewObject.id, movable: !previewObject.locked, min, max, mesh: previewRecord.mesh }] : [];
    })() : [];
    const pendingGroup = seededTargets.length ? group.filter(item => !sameAlignmentItem(item, seededTargets[0])) : group;
    if (seededTargets.length) setAlignmentGeometry({ document, groupKey: alignmentGroupKey, targets: seededTargets, complete: false });
    const worker = new Worker(new URL("../workers/parametricAlignment.worker.ts", import.meta.url), { type: "module" });
    let cancelled = false;
    const fail = (message: string) => {
      if (cancelled) return;
      setAlignOpen(false);
      setNotice({ type: "error", text: message });
      worker.terminate();
    };
    const targets: AlignmentTarget[] = [...seededTargets];
    worker.onmessage = event => {
      if (cancelled) return;
      if (event.data.error) { fail(event.data.error); return; }
      if (event.data.target) {
        const index = targets.findIndex(target => sameAlignmentItem(target, event.data.target));
        if (index < 0) targets.push(event.data.target);
        else targets[index] = event.data.target;
        setAlignmentGeometry({ document, groupKey: alignmentGroupKey, targets: [...targets], complete: false });
        return;
      }
      if (!event.data.complete) return;
      if (targets.length !== group.length) {
        fail(uiText("ui.kercadparametriceditor.alignment.requires.visible.active.geometry.for.t.12128c", {}, locale));
        return;
      }
      setAlignmentGeometry({ document, groupKey: alignmentGroupKey, targets, complete: true });
      worker.terminate();
    };
    worker.onerror = event => fail(event.message || uiText("notice.alignmentPrepareFailed", {}, locale));
    worker.onmessageerror = () => fail(uiText("notice.alignmentReceiveFailed", {}, locale));
    worker.postMessage({ document, selection: pendingGroup });
    return () => { cancelled = true; worker.terminate(); };
  }, [alignOpen, alignmentGroupKey, document, locale]);

  const selectAlignmentReference = (node: ModelTreeSelection | null) => {
    if (!node || !modelSelection.some(item => sameAlignmentItem(item, node))) {
      setAlignOpen(false);
      setModelSelection([]);
      return;
    }
    setModelSelection(items => [...items.filter(item => !sameAlignmentItem(item, node)), node]);
  };
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>({ azimuth: -Math.PI / 4, polar: 1.02 });
  const [clipboardId, setClipboardId] = useState<string | null>(null);
  const [annotationClipboard, setAnnotationClipboard] = useState<ParametricAnnotation[] | null>(null);
  const [sketchSession, setSketchSession] = useState<{ featureId: string | null; objectId: string | null; profile: SketchProfile; annotations: ParametricAnnotation[]; mode: "sketch" | "scribble"; revolveAxisFeatureId?: string } | null>(null);
  const sketchSessionRef = useRef(sketchSession); sketchSessionRef.current = sketchSession;
  const [sketchAnnotationTool, setSketchAnnotationTool] = useState<AnnotationTool | null>(null);
  const [selectedSketchAnnotationId, setSelectedSketchAnnotationId] = useState<string | null>(null);
  const selectedSketchAnnotation = sketchSession?.annotations.find((annotation) => annotation.id === selectedSketchAnnotationId) ?? null;
  const [sketchAnnotationClipboard, setSketchAnnotationClipboard] = useState<ParametricAnnotation | null>(null);
  const [sketchTool, setSketchTool] = useState<SketchTool>("line");
  const toolbarScrollRef = useRef<HTMLDivElement>(null);
  const constraintsScrollRef = useRef<HTMLElement>(null);
  const cameraControlsScrollRef = useRef<HTMLDivElement>(null);
  const [sketchPolygonSides, setSketchPolygonSides] = useState(6);
  const [polygonMenuPosition, setPolygonMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const polygonMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const polygonMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!polygonMenuPosition) return;
    const closeOutside = (event: PointerEvent) => {
      if (!polygonMenuRef.current?.contains(event.target as Node) && !polygonMenuTriggerRef.current?.contains(event.target as Node)) setPolygonMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPolygonMenuPosition(null); };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("pointerdown", closeOutside); window.removeEventListener("keydown", closeOnEscape); };
  }, [polygonMenuPosition]);
  const [sketchActivePointId, setSketchActivePointId] = useState<string | null>(null);
  const [sketchSelection, setSketchSelection] = useState<SketchSelection>(null);
  const [sketchClipboard, setSketchClipboard] = useState<SketchProfile | null>(null);
  const sketchPasteCountRef = useRef(0);
  const [sketchMeasurement, setSketchMeasurement] = useState<SketchMeasurement>(null);
  const [sketchMeasureStart, setSketchMeasureStart] = useState<SketchPoint | null>(null);
  const sketchHistoryRef = useRef<SketchProfile[]>([]);
  const sketchAnnotationHistoryRef = useRef<ParametricAnnotation[][]>([]);
  const sketchHistoryIndexRef = useRef(-1);
  const [sketchHistoryIndex, setSketchHistoryIndex] = useState(-1);
  const activeSketchProfileValidation = useMemo(() => {
    if (!sketchSession) return null;
    const profile = sketchSession.profile;
    const hasGeometry = profile.points.length > 0
      || profile.segments.length > 0
      || (profile.circles?.length ?? 0) > 0
      || (profile.texts?.length ?? 0) > 0
      || (profile.images?.length ?? 0) > 0;
    return hasGeometry ? validateDrawnSketchProfile(profile) : null;
  }, [sketchSession]);
  const t = useCallback((key: KercadTranslationKey) => kercadTranslate(locale, key), [locale]);

  useEffect(() => {
    const preferredDock = challengeDock;
    if (preferredDock === "floating" || preferredDock === "left" || preferredDock === "right") window.localStorage.setItem("kercad.challenge-dock", preferredDock);
  }, [challengeDock]);

  useEffect(() => {
    const closePopoversOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const popup = target?.closest<HTMLElement>("[data-kercad-popup]")?.dataset.kercadPopup ?? null;
      if (popup !== "shapes") setShapesOpen(false);
      if (popup !== "snap-spacing") setSnapSpacingOpen(false);
      if (popup !== "grid") {
        const activeElement = window.document.activeElement;
        if (activeElement instanceof HTMLInputElement && activeElement.closest('[data-kercad-popup="grid"]')) activeElement.blur();
        setWorkplaneOpen(false);
      }
      if (popup !== "export") setExportOpen(false);
      if (popup !== "settings") setSettingsOpen(false);
    };
    window.document.addEventListener("pointerdown", closePopoversOutside);
    return () => window.document.removeEventListener("pointerdown", closePopoversOutside);
  }, []);

  useEffect(() => {
    if (!shapesOpen) return;
    const positionMenu = () => {
      const trigger = shapeMenuTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const menuWidth = Math.min(488, window.innerWidth - 20);
      setShapeMenuPosition({
        top: bounds.bottom,
        left: Math.max(10, Math.min(bounds.left, window.innerWidth - menuWidth - 10)),
      });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [shapesOpen]);

  useEffect(() => {
    if (!placingWorkplane && !editingMirrorPlaneId && !selectingTopologyFaces && !selectingTopologyEdges) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPlacingWorkplane(false);
      setEditingMirrorPlaneId(null);
      setSelectingTopologyFaces(false);
      setSelectingTopologyEdges(false);
      setSelectedTopologyFaces([]);
      setSelectedTopologyEdges([]);
      setPendingEdgeTreatment(null);
      setEditingEdgeTreatmentId(null);
      setPendingFaceExtrude(null);
      setEditingFaceExtrudeId(null);
      setPendingShell(null);
      setEditingShellId(null);
      setPendingRevolve(null);
      setEditingRevolveId(null);
      setPendingSweepPathId(null);
      setNotice({ type: "info", text: placingWorkplane || editingMirrorPlaneId ? t("notice.workplaneCancelled") : t("notice.topologyCancelled") });
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [editingMirrorPlaneId, placingWorkplane, selectingTopologyEdges, selectingTopologyFaces, t]);
  const [exporting, setExporting] = useState(false);
  const [projectExporting, setProjectExporting] = useState(false);
  const [sharedSaveOpen, setSharedSaveOpen] = useState(false);
  const [sharedSaving, setSharedSaving] = useState(false);
  const [sharedName, setSharedName] = useState(sharedFileName?.replace(PROJECT_FILE_PATTERN, "") ?? initialDocument.name);
  const [sharedAuthor, setSharedAuthor] = useState("");
  const [authorPreferenceLoaded, setAuthorPreferenceLoaded] = useState(false);
  const [sharedSaveMessage, setSharedSaveMessage] = useState("");
  useEffect(() => {
    let author = initialDocument.author ?? initialDocument.creator ?? "";
    if (!author) {
      try { author = localStorage.getItem("kercad.shared-author") ?? ""; } catch {}
    }
    setSharedAuthor(author);
    setAuthorPreferenceLoaded(true);
  }, []);
  useEffect(() => {
    if (!authorPreferenceLoaded) return;
    try { localStorage.setItem("kercad.shared-author", sharedAuthor.trim()); } catch {}
  }, [sharedAuthor, authorPreferenceLoaded]);
  const publishShared = async () => {
    if (!onSaveShared || sharedSaving || !sharedName.trim() || !sharedAuthor.trim()) return;
    setSharedSaving(true); setSharedSaveMessage("");
    try {
      const saved = structuredClone(latestDocumentRef.current);
      saved.creator = saved.creator || saved.author || sharedAuthor.trim();
      saved.author = sharedAuthor.trim();
      await onSaveShared(saved, `${sharedName.trim().replace(PROJECT_FILE_PATTERN, "")}.kercad`, sharedAuthor.trim());
      commit(saved);
      try { localStorage.setItem("kercad.shared-author", sharedAuthor.trim()); } catch {}
      setSharedSaveMessage(uiText("ui.kercadparametriceditor.project.saved.to.shared.616ada", {}, locale));
    } catch (error) { setSharedSaveMessage(error instanceof Error ? error.message : uiText("notice.sharedSaveFailed", {}, locale)); }
    finally { setSharedSaving(false); }
  };
  const [pendingProjectImport, setPendingProjectImport] = useState<{ document: ParametricDocument; assetCount: number; fileName: string } | null>(null);
  const newDocumentDialogRef = useAccessibleDialog(newDocumentOpen, () => setNewDocumentOpen(false));
  const importProjectDialogRef = useAccessibleDialog(Boolean(pendingProjectImport), () => setPendingProjectImport(null));
  const [hydrated, setHydrated] = useState(false);
  const [tutorialLaunchRequest, setTutorialLaunchRequest] = useState(0);
  useEffect(() => {
    const toolbar = toolbarScrollRef.current;
    if (toolbar) return enableToolbarMouseScroll(toolbar);
  }, [hydrated, Boolean(sketchSession)]);
  const [buildWorkersReady, setBuildWorkersReady] = useState(false);
  useEffect(() => {
    const panel = cameraControlsScrollRef.current;
    if (!sketchSession && panel) return enableToolbarMouseScroll(panel, true);
  }, [hydrated, Boolean(sketchSession)]);
  useEffect(() => {
    const panel = constraintsScrollRef.current;
    if (panel) return enableToolbarMouseScroll(panel, true);
  }, [hydrated, Boolean(sketchSession)]);
  const importRef = useRef<HTMLInputElement>(null);
  const sketchSvgImportRef = useRef<HTMLInputElement>(null);
  const buildCounter = useRef(0);
  const contextBuildCounter = useRef(0);
  const buildWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const contextWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const topologySelectionWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const topologyPreviewWorkerRef = useRef<ParametricBuildWorkerClient | null>(null);
  const topologyPreviewQueueRef = useRef<Promise<void>>(Promise.resolve());
  const geometryFingerprint = useMemo(() => parametricGeometryFingerprint(document), [document]);
  const objectColorFingerprint = useMemo(() => parametricObjectColorFingerprint(document), [document]);
  const objectColors = useMemo(() => objectColorsFromFingerprint(objectColorFingerprint), [objectColorFingerprint]);
  const buildDocumentRef = useRef(document);
  buildDocumentRef.current = document;
  const selectedOperationTimeline = useMemo(() => {
    if (modelSelection.length !== 1 || modelSelection[0]?.kind !== "feature") return null;
    const buildDocument = buildDocumentRef.current;
    const feature = buildDocument.features.find((candidate) => candidate.id === modelSelection[0]?.id);
    if ((feature?.kind !== "extrude" && feature?.kind !== "primitive" && feature?.kind !== "fillet" && feature?.kind !== "faceExtrude" && feature?.kind !== "shell" && feature?.kind !== "revolve" && feature?.kind !== "mirror" && feature?.kind !== "linearPattern" && feature?.kind !== "polarPattern" && feature?.kind !== "objectBoolean") || !feature.objectId) return null;
    const operations = buildDocument.features.filter((candidate) => candidate.objectId === feature.objectId && candidate.kind !== "sketch");
    const index = operations.findIndex((candidate) => candidate.id === feature.id);
    return index < 0 ? null : { featureId: feature.id, objectId: feature.objectId, index, count: operations.length };
  }, [geometryFingerprint, modelSelection]);
  const viewportOperationContext = useMemo(() => operationContext ? {
    ...operationContext,
    color: objectColors[operationContext.objectId] ?? operationContext.color,
    opacity: selectedOperationTimeline && selectedOperationTimeline.index === selectedOperationTimeline.count - 1 ? 0 : 0.4,
  } : null, [objectColors, operationContext, selectedOperationTimeline]);
  const viewportTopologyPreviewContext = useMemo(() => topologyPreviewContext ? {
    ...topologyPreviewContext,
    color: objectColors[topologyPreviewContext.objectId] ?? topologyPreviewContext.color,
    opacity: 0,
  } : null, [objectColors, topologyPreviewContext]);
  const storedHistoricalTopologyReferences = useMemo(() => {
    if (!selectedOperationTimeline || selectedOperationTimeline.index >= selectedOperationTimeline.count - 1) return [];
    const feature = document.features.find((candidate) => candidate.id === selectedOperationTimeline.featureId);
    const ids = feature?.kind === "fillet" ? feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? [] : feature?.kind === "faceExtrude" || feature?.kind === "revolve" ? [feature.faceReferenceId] : feature?.kind === "shell" ? feature.faceReferenceIds : [];
    return ids.map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
  }, [document, selectedOperationTimeline]);
  const historicalTopologyRecords = useMemo<ParametricObjectRenderRecord[]>(() => {
    if (!operationContext?.selectionMesh) return [];
    const object = document.objects.find((candidate) => candidate.id === operationContext.objectId);
    if (!object) return [];
    return [{ objectId: object.id, renderId: `${operationContext.featureId}:selection-source`, geometryFingerprint: `${geometryFingerprint}:selection-source:${operationContext.featureId}`, color: object.color, worldTransform: object.transform, mesh: operationContext.selectionMesh }];
  }, [document.objects, geometryFingerprint, operationContext]);
  const historicalTopologyReferences = useMemo(() => storedHistoricalTopologyReferences
    .map((reference) => recoverParametricTopologyReferenceInRecords(reference, historicalTopologyRecords))
    .filter((reference): reference is ParametricTopologyReference => Boolean(reference)), [historicalTopologyRecords, storedHistoricalTopologyReferences]);

  useEffect(() => {
    try {
      const storedQuality = localStorage.getItem(RENDER_QUALITY_STORAGE_KEY);
      if (storedQuality === "normal" || storedQuality === "optimized") setRenderQuality(storedQuality);
      const storedDisplayMode = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
      if (storedDisplayMode === "solid" || storedDisplayMode === "wireframe") setDisplayMode(storedDisplayMode);
      const storedShadingMode = localStorage.getItem(SHADING_MODE_STORAGE_KEY);
      if (storedShadingMode === "shadows" || storedShadingMode === "basic" || storedShadingMode === "noShadows") setShadingMode(storedShadingMode);
      else if (storedShadingMode === "unlit") setShadingMode("noShadows");
      setShowFps(localStorage.getItem(FPS_VISIBLE_STORAGE_KEY) === "true");
      setShowPositionTriad(localStorage.getItem(POSITION_TRIAD_VISIBLE_STORAGE_KEY) !== "false");
      setShowRotationTriad(localStorage.getItem(ROTATION_TRIAD_VISIBLE_STORAGE_KEY) === "true");
      setShowParameterHandles(localStorage.getItem(PARAMETER_HANDLES_VISIBLE_STORAGE_KEY) !== "false");
      setShowScaleManipulator(localStorage.getItem(SCALE_MANIPULATOR_VISIBLE_STORAGE_KEY) === "true");
    } catch {}
    setHydrated(true);
  }, [initialProject]);

  useEffect(() => {
    if (hydrated) onProjectChange?.(document);
  }, [document, hydrated, onProjectChange]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, renderQuality);
  }, [hydrated, renderQuality]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(SHADING_MODE_STORAGE_KEY, shadingMode);
  }, [hydrated, shadingMode]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(FPS_VISIBLE_STORAGE_KEY, String(showFps));
  }, [hydrated, showFps]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(POSITION_TRIAD_VISIBLE_STORAGE_KEY, String(showPositionTriad));
  }, [hydrated, showPositionTriad]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(ROTATION_TRIAD_VISIBLE_STORAGE_KEY, String(showRotationTriad));
  }, [hydrated, showRotationTriad]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(PARAMETER_HANDLES_VISIBLE_STORAGE_KEY, String(showParameterHandles));
  }, [hydrated, showParameterHandles]);
  useEffect(() => {
    if (hydrated) localStorage.setItem(SCALE_MANIPULATOR_VISIBLE_STORAGE_KEY, String(showScaleManipulator));
  }, [hydrated, showScaleManipulator]);

  useEffect(() => {
    const createWorker = () => new Worker(new URL("../workers/parametricBuild.worker.ts", import.meta.url), { type: "module" });
    const buildWorker = new ParametricBuildWorkerClient(createWorker);
    const contextWorker = new ParametricBuildWorkerClient(createWorker);
    const topologySelectionWorker = new ParametricBuildWorkerClient(createWorker);
    const topologyPreviewWorker = new ParametricBuildWorkerClient(createWorker);
    buildWorkerRef.current = buildWorker;
    contextWorkerRef.current = contextWorker;
    topologySelectionWorkerRef.current = topologySelectionWorker;
    topologyPreviewWorkerRef.current = topologyPreviewWorker;
    setBuildWorkersReady(true);
    return () => {
      setBuildWorkersReady(false);
      buildWorker.dispose();
      contextWorker.dispose();
      topologySelectionWorker.dispose();
      topologyPreviewWorker.dispose();
      buildWorkerRef.current = null;
      contextWorkerRef.current = null;
      topologySelectionWorkerRef.current = null;
      topologyPreviewWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setTopologyPreviewContext(null);
    setTopologyPreviewBusy(false);
    const references = [...selectedTopologyFaces, ...selectedTopologyEdges];
    if ((!pendingEdgeTreatment && !pendingFaceExtrude && !pendingShell && !pendingRevolve) || references.length === 0 || ((pendingFaceExtrude || pendingRevolve) && selectedTopologyFaces.length !== 1)) return;
    if (pendingRevolve?.axis === "edge" && selectedTopologyEdges.length !== 1) return;
    const preview = cloneDocument(document);
    let featureId = "";
    if (pendingEdgeTreatment) {
      const existing = editingEdgeTreatmentId ? preview.features.find((feature) => feature.id === editingEdgeTreatmentId && feature.kind === "fillet") : null;
      const feature = existing?.kind === "fillet" ? existing : createFilletFeature(preview.features.filter((candidate) => candidate.kind === "fillet").length + 1, pendingEdgeTreatment);
      const oldIds = new Set(feature.kind === "fillet" ? [...(feature.selectionReferenceIds ?? []), ...(feature.edgeReferenceIds ?? [])] : []);
      preview.topologyReferences = preview.topologyReferences.filter((reference) => !oldIds.has(reference.id));
      const stored = references.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:preview:${index + 1}` }));
      feature.objectId = references[0].objectId;
      feature.treatment = pendingEdgeTreatment;
      feature.radius = edgeTreatmentRadius;
      feature.selectionReferenceIds = stored.map((reference) => reference.id);
      feature.edgeReferenceIds = undefined;
      preview.topologyReferences.push(...stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingFaceExtrude) {
      const reference = selectedTopologyFaces[0];
      const existing = editingFaceExtrudeId ? preview.features.find((feature) => feature.id === editingFaceExtrudeId && feature.kind === "faceExtrude") : null;
      const feature = existing?.kind === "faceExtrude" ? existing : createFaceExtrudeFeature(preview.features.filter((candidate) => candidate.kind === "faceExtrude").length + 1, pendingFaceExtrude.operation);
      if (existing?.kind === "faceExtrude") preview.topologyReferences = preview.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId);
      const stored = { ...structuredClone(reference), id: `${feature.id}:preview-face` };
      feature.objectId = reference.objectId;
      feature.operation = pendingFaceExtrude.operation;
      feature.distance = pendingFaceExtrude.distance;
      feature.taperAngle = pendingFaceExtrude.taperAngle;
      feature.faceReferenceId = stored.id;
      preview.topologyReferences.push(stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingShell) {
      const existing = editingShellId ? preview.features.find((feature) => feature.id === editingShellId && feature.kind === "shell") : null;
      const feature = existing?.kind === "shell" ? existing : createShellFeature(preview.features.filter((candidate) => candidate.kind === "shell").length + 1);
      if (existing?.kind === "shell") preview.topologyReferences = preview.topologyReferences.filter((reference) => !existing.faceReferenceIds.includes(reference.id));
      const stored = selectedTopologyFaces.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:preview-face:${index + 1}` }));
      feature.objectId = selectedTopologyFaces[0].objectId;
      feature.thickness = pendingShell.thickness;
      feature.cornerType = pendingShell.cornerType;
      feature.faceReferenceIds = stored.map((reference) => reference.id);
      preview.topologyReferences.push(...stored);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    } else if (pendingRevolve) {
      const reference = selectedTopologyFaces[0];
      const existing = editingRevolveId ? preview.features.find((feature) => feature.id === editingRevolveId && feature.kind === "revolve") : null;
      const feature = existing?.kind === "revolve" ? existing : createRevolveFeature(preview.features.filter((candidate) => candidate.kind === "revolve").length + 1, pendingRevolve.operation);
      if (existing?.kind === "revolve") preview.topologyReferences = preview.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId && candidate.id !== existing.axisReferenceId);
      const stored = { ...structuredClone(reference), id: `${feature.id}:preview-face` };
      const storedAxis = pendingRevolve.axis === "edge" && selectedTopologyEdges[0] ? { ...structuredClone(selectedTopologyEdges[0]), id: `${feature.id}:preview-axis` } : null;
      feature.objectId = reference.objectId;
      feature.source = "face";
      feature.operation = pendingRevolve.operation;
      feature.angle = pendingRevolve.angle;
      feature.axis = pendingRevolve.axis;
      feature.faceReferenceId = stored.id;
      preview.topologyReferences.push(stored);
      feature.axisReferenceId = storedAxis?.id;
      if (storedAxis) preview.topologyReferences.push(storedAxis);
      if (!existing) preview.features.push(feature);
      featureId = feature.id;
    }
    if (!featureId) return;
    let active = true;
    setTopologyPreviewBusy(true);
    const timeout = window.setTimeout(() => {
      // Let the active kernel call finish instead of restarting WASM on every
      // selection change. Only the latest still-active request is then built.
      topologyPreviewQueueRef.current = topologyPreviewQueueRef.current.catch(() => {}).then(async () => {
        if (!active) return;
        try {
          const result = await topologyPreviewWorkerRef.current?.buildContext(preview, featureId);
          if (active) setTopologyPreviewContext(result ?? null);
        } catch {
          if (active) setTopologyPreviewContext(null);
        } finally {
          if (active) setTopologyPreviewBusy(false);
        }
      });
    }, 80);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [document, edgeTreatmentRadius, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, pendingEdgeTreatment, pendingFaceExtrude, pendingRevolve, pendingShell, selectedTopologyEdges, selectedTopologyFaces]);

  useEffect(() => {
    setTopologySelectionBuild(null);
    setTopologySelectionBusy(false);
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    if (!editingFeatureId) return;
    const target = document.features.find((feature) => feature.id === editingFeatureId);
    if (!target?.objectId) return;
    const previousFeature = parametricTopologyEditingSourceFeature(document, editingFeatureId);
    if (!previousFeature) return;
    let active = true;
    setTopologySelectionBusy(true);
    topologySelectionWorkerRef.current?.buildContext(document, previousFeature.id).then((context) => {
      if (!active) return;
      if (!context) {
        setTopologySelectionBuild(null);
        setTopologySelectionBusy(false);
        return;
      }
      const object = document.objects.find((candidate) => candidate.id === target.objectId);
      const currentRecord = build.objectRecords.find((record) => record.objectId === target.objectId);
      if (!object) {
        setTopologySelectionBuild(null);
        setTopologySelectionBusy(false);
        return;
      }
      const previousRecord: ParametricObjectRenderRecord = {
        objectId: object.id,
        renderId: currentRecord?.renderId ?? `object:${object.id}`,
        geometryFingerprint: `${geometryFingerprint}:before:${editingFeatureId}`,
        color: object.color,
        worldTransform: object.transform,
        mesh: context.mesh,
      };
      const objectRecords = currentRecord
        ? build.objectRecords.map((record) => record.objectId === object.id ? previousRecord : record)
        : [...build.objectRecords, previousRecord];
      setTopologySelectionBuild({
        mesh: null,
        objectRecords,
        operationContext: null,
        completedFeatureIds: [],
        failedFeatureId: null,
        warning: null,
      });
      setTopologySelectionBusy(false);
    }).catch(() => { if (active) { setTopologySelectionBuild(null); setTopologySelectionBusy(false); } });
    return () => { active = false; topologySelectionWorkerRef.current?.cancel(); setTopologySelectionBusy(false); };
  }, [build.objectRecords, document, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, geometryFingerprint]);

  useEffect(() => {
    if (!hydrated || !buildWorkersReady || !buildWorkerRef.current) return;
    const counter = ++buildCounter.current;
    setKernelBusy(true);
    const buildDocument = buildDocumentRef.current;
    const timeout = window.setTimeout(() => {
      buildWorkerRef.current!.buildModel(buildDocument, !initialModelSettledRef.current ? (progress) => {
        if (counter === buildCounter.current) setInitialLoadProgress(progress);
      } : undefined).then((result) => {
        if (counter !== buildCounter.current) return;
        renderedGeometryFingerprintRef.current = geometryFingerprint;
        setBuild(result);
        initialModelSettledRef.current = true;
        setInitialModelSettled(true);
        if (result.failedFeatureId && buildDocument.features.some((feature) => feature.id === result.failedFeatureId)) {
          setModelSelection([{ id: result.failedFeatureId, kind: "feature" }]);
          setModelSidebarMode("normal");
        }
        setKernelBusy(false);
      }).catch((error: unknown) => {
        if (counter !== buildCounter.current) return;
        setBuild((current) => ({ ...current, warning: error instanceof Error ? error.message : String(error) }));
        initialModelSettledRef.current = true;
        setInitialModelSettled(true);
        setKernelBusy(false);
      });
    }, 140);
    return () => {
      window.clearTimeout(timeout);
      buildWorkerRef.current?.cancel();
    };
  }, [buildWorkersReady, geometryFingerprint, hydrated]);

  useEffect(() => {
    const counter = ++contextBuildCounter.current;
    setOperationContext(null);
    setContextBusy(false);
    if (!selectedOperationTimeline) return;
    const buildDocument = buildDocumentRef.current;
    setContextBusy(true);
    const timeout = window.setTimeout(() => {
      contextWorkerRef.current?.buildContext(buildDocument, selectedOperationTimeline.featureId).then((result) => {
        if (counter === contextBuildCounter.current) { setOperationContext(result); setContextBusy(false); }
      }).catch(() => {
        if (counter === contextBuildCounter.current) { setOperationContext(null); setContextBusy(false); }
      });
    }, 80);
    return () => {
      window.clearTimeout(timeout);
      contextWorkerRef.current?.cancel();
      setContextBusy(false);
    };
  }, [geometryFingerprint, selectedOperationTimeline]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (selectedTopologyFaces.length === 0 && selectedTopologyEdges.length === 0) return;
    const editingTopology = Boolean(editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId);
    if (editingTopology && !topologySelectionBuild) return;
    const topologyRecords = editingTopology ? topologySelectionBuild?.objectRecords ?? [] : build.objectRecords;
    const availableFaces = selectedTopologyFaces.map((reference) => recoverParametricTopologyReferenceInRecords(reference, topologyRecords)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const availableEdges = selectedTopologyEdges.map((reference) => recoverParametricTopologyReferenceInRecords(reference, topologyRecords)).filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const removed = selectedTopologyFaces.length - availableFaces.length + selectedTopologyEdges.length - availableEdges.length;
    const changed = availableFaces.some((reference, index) => reference !== selectedTopologyFaces[index]) || availableEdges.some((reference, index) => reference !== selectedTopologyEdges[index]);
    if (removed === 0 && !changed) return;
    setSelectedTopologyFaces(availableFaces);
    setSelectedTopologyEdges(availableEdges);
    if (removed === 0) return;
    setNotice({ type: "error", text: `${removed} ${t(removed === 1 ? "notice.topologyReferenceRemoved" : "notice.topologyReferencesRemoved")}` });
  }, [build.objectRecords, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, selectedTopologyEdges, selectedTopologyFaces, topologySelectionBuild]);

  const commit = useCallback((next: ParametricDocument, authorOverride?: string) => {
    if (!next.annotations?.length) delete next.annotationGroup;
    next.updatedAt = Date.now();
    const author = authorOverride ?? sharedAuthor.trim();
    if (author) {
      next.creator = next.creator || next.author || author;
      next.author = author;
    }
    // Keep the newest committed document available synchronously. A numeric
    // field commits on blur immediately before the brand button's click, so a
    // render-based closure can otherwise still contain the preceding value.
    latestDocumentRef.current = next;
    setHistory((current) => commitHistoryDocument(current, next));
  }, [sharedAuthor]);

  const beginTransaction = useCallback(() => setHistory(beginHistoryTransaction), []);
  const finishTransaction = useCallback(() => setHistory((current) => finishHistoryTransaction(current)), []);
  const cancelTransaction = useCallback(() => setHistory(cancelHistoryTransaction), []);

  const mutate = useCallback((mutator: (draft: ParametricDocument) => void, authorOverride?: string) => {
    const next = cloneDocument(document);
    try {
      mutator(next);
      localizeNewDocumentEntries(document, next, locale);
      assertValidParametricDependencies(next);
      assertValidParametricTopology(next);
      commit(next, authorOverride);
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.invalidDependency") });
      return false;
    }
  }, [commit, document, locale]);

  const saveProjectDetails = () => {
    const name = projectRenameDraft.trim();
    const author = projectAuthorDraft.trim();
    if (!name) return false;
    if (name !== document.name || author !== (document.author ?? "")) {
      if (!mutate((draft) => {
        draft.name = name;
        draft.creator = draft.creator || draft.author || author || undefined;
        draft.author = author || undefined;
      }, author)) return false;
    }
    setSharedAuthor(author);
    return true;
  };

  useEffect(() => {
    if (pendingSweepPathId && (pendingEdgeTreatment || pendingFaceExtrude || pendingShell || pendingRevolve || placingWorkplane || editingMirrorPlaneId || sketchSession)) setPendingSweepPathId(null);
  }, [pendingSweepPathId, pendingEdgeTreatment, pendingFaceExtrude, pendingShell, pendingRevolve, placingWorkplane, editingMirrorPlaneId, sketchSession]);
  const primarySelection = modelSelection.at(-1) ?? null;
  const challengeSelectionParameters = useMemo(() => challengeEditor && modelSelection.length === 1 ? captureChallengeParameters(document, primarySelection, locale) : [], [challengeEditor, document, modelSelection, locale]);
  // A selected operation exports its owning object's final body, never a
  // truncated operation history. Several operations can belong to one object.
  const exportSelectedObjectIds = [...new Set(modelSelection.map((item) =>
    item.kind === "object" ? item.id : objectIdForFeature(document, item.id)
  ).filter((id): id is string => Boolean(id) && document.objects.some((object) => object.id === id)))];
  const exportObjectIds = exportScope === "selection" ? exportSelectedObjectIds : undefined;
  const selectedId = primarySelection?.id ?? null;
  const selectionKind = primarySelection?.kind ?? "object";
  const selectedObjectId = objectIdForFeature(document, selectedId);
  const selectedFeature = selectionKind === "feature" ? document.features.find((feature) => feature.id === selectedId) ?? null : null;
  const selectedSketches = modelSelection.flatMap((item) => {
    const feature = item.kind === "feature" ? document.features.find((candidate) => candidate.id === item.id) : null;
    return feature?.kind === "sketch" ? [feature] : [];
  });
  const selectedEdgeTreatmentFeature = selectedFeature?.kind === "fillet" ? selectedFeature : null;
  const selectedOperationId = selectionKind === "feature" && document.features.some((feature) => feature.id === selectedId && (feature.kind === "extrude" || feature.kind === "primitive")) ? selectedId : null;
  const selectedOperation = selectedOperationId ? document.features.find((feature): feature is ExtrudeFeature | PrimitiveFeature => feature.id === selectedOperationId && (feature.kind === "extrude" || feature.kind === "primitive")) : null;
  const selectedSketchId = selectedFeature?.kind === "sketch" && selectedFeature.purpose === "user" ? selectedFeature.id : null;
  const selectedTransformOperationId = selectedOperationId ?? selectedSketchId;
  const selectedShape = useMemo(() => workplaneShapeForObject(document, selectedObjectId), [document, selectedObjectId]);
  const selectedBox = useMemo(() => modelSelection.length === 1 ? (selectionKind === "feature" ? viewportSelectionForFeature(document, selectedId) : viewportSelectionForObject(document, selectedObjectId)) : null, [document, modelSelection.length, selectedObjectId, selectedId, selectionKind]);
  const scaleTarget = useMemo(() => {
    if (!selectedId || modelSelection.length !== 1 || (selectionKind !== "object" && selectionKind !== "feature")) return null;
    const record = selectionKind === "object" ? build.objectRecords.find((entry) => entry.objectId === selectedId) : undefined;
    const positions = record?.geometryFingerprint === parametricObjectGeometryFingerprint(document, selectedId) ? record?.mesh.positions : undefined;
    return createParametricScaleTarget(document, { id: selectedId, kind: selectionKind }, positions);
  }, [build.objectRecords, document, modelSelection.length, selectedId, selectionKind]);
  const selectedSketchPlacement = useMemo(() => selectedSketchId ? viewportPlacementForSketchFeature(document, selectedSketchId) : null, [document, selectedSketchId]);
  const selectedOriginObjectId = modelSelection.length === 1 && selectionKind === "object" ? selectedObjectId : null;
  const selectedReferenceObject = selectedOriginObjectId ? document.objects.find((object) => object.id === selectedOriginObjectId && object.referenceMesh) : undefined;
  const selectedOperationOriginId = modelSelection.length === 1 ? selectedFeature?.kind === "polarPattern" ? selectedFeature.id : selectedTransformOperationId : null;
  const selectedObjectVisible = Boolean(selectedObjectId && document.objects.find((object) => object.id === selectedObjectId)?.visible);
  const viewportSelectedObjectIds = useMemo(() => [...new Set(modelSelection.flatMap((item) => {
    const objectId = objectIdForFeature(document, item.id);
    return objectId ? [objectId] : [];
  }))], [document, modelSelection]);
  const viewportObjectOrigins = useMemo(() => [...document.objects.map((object) => ({
    objectId: object.id,
    visible: object.visible !== false && object.id === selectedOriginObjectId && (showPositionTriad || showRotationTriad || object.id === originEditObjectId),
    position: object.transform.position,
    rotation: object.transform.rotation,
    positionVisible: showPositionTriad || object.id === originEditObjectId,
    rotationEditable: object.id === selectedOriginObjectId && showRotationTriad,
  })), ...(selectedAnnotation && selectedAnnotationPoint ? [{
    objectId: selectedAnnotation.id,
    visible: selectedAnnotation.visible && document.annotationGroup?.visible !== false && (showPositionTriad || (selectedAnnotation.kind === "circle" || selectedAnnotation.kind === "rectangle") && selectedAnnotation.mode === "planar" && showRotationTriad),
    position: selectedAnnotationPoint,
    rotation: (selectedAnnotation.kind === "circle" || selectedAnnotation.kind === "rectangle") ? selectedAnnotation.rotation : { x: 0, y: 0, z: 0 },
    positionVisible: showPositionTriad,
    rotationEditable: (selectedAnnotation.kind === "circle" || selectedAnnotation.kind === "rectangle") && selectedAnnotation.mode === "planar" && showRotationTriad,
  }] : [])], [document.objects, document.annotationGroup?.visible, selectedAnnotation, annotationEndpoint, originEditObjectId, selectedOriginObjectId, showPositionTriad, showRotationTriad]);
  const referenceObjectRecords = useMemo(() => parametricReferenceRenderRecords(document), [document]);
  const projectWorkplaneBounds = useMemo(() => workplaneGeometryBounds([
    ...build.objectRecords.map((record) => record.mesh),
    ...referenceObjectRecords.map((record) => record.mesh),
  ]), [build.objectRecords, referenceObjectRecords]);
  const viewportObjectRecords = useMemo(() => {
    const visibleObjectIds = new Set(document.objects.filter((object) => object.visible !== false).map((object) => object.id));
    return [
      ...((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).objectRecords,
      ...referenceObjectRecords,
    ].filter((record) => visibleObjectIds.has(record.objectId));
  }, [build, document.objects, editingEdgeTreatmentId, editingFaceExtrudeId, editingRevolveId, editingShellId, referenceObjectRecords, topologySelectionBuild]);
  const selectedOperationVisible = selectedFeature?.kind !== "sketch" || selectedFeature.visible;
  const viewportOperationOrigins = useMemo(() => {
    if (selectedFeature?.kind === "polarPattern" && selectedObjectVisible && selectedOperationOriginId) {
      const object = document.objects.find((candidate) => candidate.id === selectedFeature.objectId);
      if (!object) return [];
      return [{ featureId: selectedFeature.id, visible: showPositionTriad, position: patternHandlePlacement(object, selectedFeature.axis, selectedFeature.center).origin, rotation: object.transform.rotation, positionVisible: showPositionTriad, rotationEditable: false }];
    }
    return selectedObjectVisible && selectedOperationVisible && selectedOperationOriginId && (selectedBox || selectedSketchPlacement) ? [{
      featureId: selectedOperationOriginId,
      visible: showPositionTriad || showRotationTriad,
      position: selectedSketchPlacement?.position ?? selectedBox?.origin ?? { x: selectedBox?.x ?? 0, y: selectedBox?.y ?? 0, z: selectedBox?.baseZ ?? 0 },
      rotation: selectedSketchPlacement?.rotation ?? selectedBox?.rotation3d ?? { x: 0, y: 0, z: selectedBox?.rotation ?? 0 },
      positionVisible: showPositionTriad,
      rotationEditable: showRotationTriad,
    }] : [];
  }, [document.objects, selectedFeature, selectedBox, selectedObjectVisible, selectedOperationVisible, selectedOperationOriginId, selectedSketchPlacement, showPositionTriad, showRotationTriad]);
  // Camera orientation updates must not recreate GPU manipulator resources.
  const activeViewportObjectOrigins = useMemo(() => editingSection
    ? [{ objectId: SECTION_PLANE_ID, visible: true, position: sectionPose.position, rotation: sectionPose.rotation, positionVisible: sectionPositionVisible, rotationEditable: sectionRotationVisible }]
    : alignOpen ? [] : viewportObjectOrigins,
  [editingSection, sectionPose, sectionPositionVisible, sectionRotationVisible, alignOpen, viewportObjectOrigins]);
  const activeViewportOperationOrigins = useMemo(() => editingSection || alignOpen ? [] : viewportOperationOrigins,
    [editingSection, alignOpen, viewportOperationOrigins]);
  const viewportSketchOverlays = useMemo(() => document.features.flatMap((feature) => {
    if (feature.kind !== "sketch" || feature.purpose !== "user" || feature.suppressed || !feature.visible) return [];
    const object = feature.objectId ? document.objects.find((candidate) => candidate.id === feature.objectId) ?? null : null;
    if (object?.visible === false) return [];
    return [{ feature, object, selected: modelSelection.some((item) => item.kind === "feature" && item.id === feature.id) }];
  }), [document.features, document.objects, modelSelection]);
  const edgeTreatmentHandle = useMemo(() => {
    const editingReferences = [...selectedTopologyFaces, ...selectedTopologyEdges];
    const feature = selectedEdgeTreatmentFeature;
    const useDraft = Boolean(pendingEdgeTreatment && editingReferences.length > 0);
    if (!useDraft && !feature) return null;
    const references = useDraft
      ? editingReferences
      : (feature?.selectionReferenceIds ?? feature?.edgeReferenceIds ?? [])
          .map((id) => document.topologyReferences.find((reference) => reference.id === id))
          .filter((reference): reference is ParametricTopologyReference => Boolean(reference));
    const objectId = references[0]?.objectId ?? feature?.objectId ?? null;
    const object = objectId ? document.objects.find((candidate) => candidate.id === objectId) ?? null : null;
    if (!object || object.visible === false) return null;
    const points = references.flatMap((reference) => {
      const hint = reference.reference.hint;
      const point = hint.entityType === "edge" ? hint.midpoint : hint.centroid;
      return point ? [new THREE.Vector3(...point)] : [];
    });
    const origin = points.length > 0
      ? points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
      : new THREE.Vector3(object.transform.position.x, object.transform.position.y, object.transform.position.z);
    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      radius: useDraft ? edgeTreatmentRadius : feature!.radius,
      treatment: useDraft ? pendingEdgeTreatment! : feature!.treatment,
    };
  }, [document.objects, document.topologyReferences, edgeTreatmentRadius, pendingEdgeTreatment, selectedEdgeTreatmentFeature, selectedTopologyEdges, selectedTopologyFaces]);
  const sketchSceneReference = useMemo<SketchSceneReference | null>(() => {
    if (!sketchSession) return null;
    const feature = sketchSession.featureId
      ? document.features.find((candidate): candidate is SketchFeature => candidate.id === sketchSession.featureId && candidate.kind === "sketch") ?? null
      : null;
    const objectId = feature?.objectId ?? sketchSession.objectId;
    const object = objectId ? document.objects.find((candidate) => candidate.id === objectId) ?? null : null;
    const sketchWorldPlacement = feature
      ? (object ? parametricTransformMatrix(object.transform) : new THREE.Matrix4()).multiply(parametricTransformMatrix({
          position: { x: feature.x, y: feature.y, z: feature.offset },
          rotation: feature.rotation,
        }))
      : parametricTransformMatrix(objectPlacementForWorkplane(document.workplane));
    const worldToSketch = sketchWorldPlacement.invert();
    const transformPositions = (source: Float32Array) => {
      const transformed = new Float32Array(source.length);
      const point = new THREE.Vector3();
      for (let index = 0; index + 2 < source.length; index += 3) {
        point.set(source[index], source[index + 1], source[index + 2]).applyMatrix4(worldToSketch);
        transformed[index] = point.x;
        transformed[index + 1] = point.y;
        transformed[index + 2] = point.z;
      }
      return transformed;
    };
    const visibleIds = new Set(document.objects.filter((object) => object.visible !== false).map((object) => object.id));
    const records = [...build.objectRecords, ...referenceObjectRecords].filter((record) => visibleIds.has(record.objectId));
    const meshes = records.filter((record) => !record.reference?.image).map((record) => record.mesh);
    const sketchEdges = document.features.flatMap((candidate) => {
      if (candidate.kind !== "sketch" || candidate.id === sketchSession.featureId || candidate.purpose !== "user" || candidate.suppressed || !candidate.visible) return [];
      const owner = document.objects.find((item) => item.id === candidate.objectId);
      if (owner?.visible === false) return [];
      const placement = worldToSketch.clone()
        .multiply(owner ? parametricTransformMatrix(owner.transform) : new THREE.Matrix4())
        .multiply(parametricTransformMatrix({ position: { x: candidate.x, y: candidate.y, z: candidate.offset }, rotation: candidate.rotation }));
      const source = sketchOverlayPositions(candidate, 0);
      const point = new THREE.Vector3();
      for (let i = 0; i + 2 < source.length; i += 3) {
        point.set(source[i], source[i + 1], source[i + 2]).applyMatrix4(placement);
        source[i] = point.x; source[i + 1] = point.y; source[i + 2] = point.z;
      }
      return source;
    });
    const positions = new Float32Array(meshes.reduce((count, mesh) => count + mesh.positions.length, 0));
    const indices = new Uint32Array(meshes.reduce((count, mesh) => count + mesh.indices.length, 0));
    const edges = new Float32Array(meshes.reduce((count, mesh) => count + mesh.edges.length, 0) + sketchEdges.length);
    let positionOffset = 0, indexOffset = 0, edgeOffset = 0;
    for (const mesh of meshes) {
      positions.set(transformPositions(mesh.positions), positionOffset);
      for (let index = 0; index < mesh.indices.length; index += 1) indices[indexOffset + index] = mesh.indices[index] + positionOffset / 3;
      edges.set(transformPositions(mesh.edges), edgeOffset);
      positionOffset += mesh.positions.length;
      indexOffset += mesh.indices.length;
      edgeOffset += mesh.edges.length;
    }
    edges.set(sketchEdges, edgeOffset);
    const images: NonNullable<SketchSceneReference["images"]> = [];
    for (const record of records) {
      const image = record.reference?.image;
      if (!image || record.mesh.positions.length < 18) continue;
      const corners = transformPositions(record.mesh.positions);
      // Image UV corners are top-left (vertex 5), top-right (2), bottom-left
      // (0). Project the transformed quad into sketch coordinates, not world XY.
      const x = corners[15], y = corners[16];
      images.push({ id: record.objectId, dataUrl: image.dataUrl, opacity: .2 * (record.reference?.opacity ?? 1), transform: `matrix(${corners[6] - x} ${corners[7] - y} ${corners[0] - x} ${corners[1] - y} ${x} ${y})` });
    }
    return { positions, indices, edges, images };
  }, [build.objectRecords, referenceObjectRecords, document.features, document.objects, document.workplane, sketchSession?.featureId, sketchSession?.objectId]);
  const snapAmount = document.workplane.snapToGrid ? document.workplane.snapSpacing : 0.01;
  const viewportOverlayRightOffset = sketchSession ? 12 : modelSidebarMode === "normal" ? 302 : modelSidebarMode === "simplified" ? 80 : 12;
  const alignmentCalculating = alignOpen && (alignmentBusy || !alignmentDisplayTargets.some(target => alignmentDisplayReference && sameAlignmentItem(target, alignmentDisplayReference)));
  const backgroundProcessLabel = stlExporting
    ? `${t("dialog.exporting")} STL…`
    : exporting
    ? t("status.exportingStep")
    : alignmentCalculating
      ? (uiText("ui.kercadparametriceditor.calculating.c57377", {}, locale))
    : kernelBusy
      ? t("status.regenerating")
      : topologyPreviewBusy || topologySelectionBusy || contextBusy
        ? t("status.updatingView")
        : null;
  const failedFeature = build.failedFeatureId ? document.features.find((feature) => feature.id === build.failedFeatureId) ?? null : null;
  const rebuildSuggestion = build.warning ? t(parametricRebuildSuggestion(failedFeature, build.warning)) : null;

  const beginSketch = (featureId: string | null = null) => {
    if (featureId && document.features.some((item) => item.id === featureId && item.kind === "sketch" && item.generatedPath)) {
      setModelSidebarMode("normal");
      setNotice({ type: "info", text: t("path.editParameters") });
      return;
    }
    if (!sketchSession) sidebarModeBeforeSketchRef.current = modelSidebarMode;
    setCompactSketchToolbar(modelSidebarMode !== "normal");
    const feature = featureId ? document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === featureId && candidate.profile.shape === "drawn") : null;
    const profile = feature?.profile.shape === "drawn" ? cloneSketchProfile(feature.profile.geometry) : emptySketchProfile();
    const mode = feature?.profile.shape === "drawn" && feature.profile.geometry.generator?.kind === "scribble" ? "scribble" : "sketch";
    const annotations = structuredClone(feature?.annotations ?? []);
    setSketchSession({ featureId: feature?.id ?? null, objectId: feature?.objectId ?? selectedObjectId, profile, annotations, mode });
    sketchAnnotationHistoryRef.current = [annotations]; setSketchAnnotationTool(null); setSelectedSketchAnnotationId(null);
    sketchHistoryRef.current = [cloneSketchProfile(profile)];
    sketchHistoryIndexRef.current = 0;
    setSketchHistoryIndex(0);
    setSketchTool(mode === "scribble" ? "freehand" : feature ? "select" : "line");
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    setModelSidebarMode("hidden");
    setNotice({ type: "info", text: feature ? t("notice.editingSketch") : t("notice.drawClosedContour") });
  };

  const cancelSketch = () => {
    sketchSessionRef.current = null;
    sketchAnnotationHistoryRef.current = [];
    setSketchSession(null);
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    sketchHistoryRef.current = [];
    sketchHistoryIndexRef.current = -1;
    setSketchHistoryIndex(-1);
    setModelSidebarMode(sidebarModeBeforeSketchRef.current);
    setNotice({ type: "info", text: t("notice.sketchCancelled") });
  };

  const importSvgIntoSketch = async (file: File) => {
    if (!sketchSession) return;
    try {
      assertImportByteLimit("SVG", file.size);
      const imported = sketchProfileFromSvg(await file.text());
      const pointIds = imported.points.map((point) => point.id);
      const segmentIds = imported.segments.map((segment) => segment.id);
      const circleIds = (imported.circles ?? []).map((circle) => circle.id);
      setSketchProfile((profile) => ({
        ...profile,
        points: [...profile.points, ...imported.points],
        segments: [...profile.segments, ...imported.segments],
        circles: [...(profile.circles ?? []), ...(imported.circles ?? [])],
      }));
      setSketchSelection({ kind: "multiple", pointIds, segmentIds, circleIds, imageIds: [] });
      setSketchActivePointId(null);
      setSketchTool("select");
      setNotice({ type: "ok", text: `${t("notice.svgSketchImported")} · ${segmentIds.length} / ${circleIds.length}` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.svgSketchFailed") });
    }
  };

  const acceptSketch = () => {
    const sketchSession = sketchSessionRef.current;
    const validation = sketchSession ? validateDrawnSketchProfile(sketchSession.profile) : null;
    const annotationsOnly = Boolean(sketchSession?.annotations.length && !sketchSession.profile.segments.length && !(sketchSession.profile.circles?.length));
    const openSketch = sketchSession?.mode !== "scribble" && isOpenSketchProfile(validation);
    if (!sketchSession || !validation?.valid && !annotationsOnly && !openSketch) {
      setNotice({ type: "error", text: validation?.diagnostics[0]?.message ?? t("notice.closeContours") });
      return;
    }
    if (sketchSession.revolveAxisFeatureId) {
      const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
      const axisSegment = segmentIds.length === 1 ? sketchSession.profile.segments.find((segment) => segment.id === segmentIds[0]) : null;
      if (!axisSegment || (axisSegment.kind !== "line" && axisSegment.kind !== undefined)) {
        setNotice({ type: "error", text: uiText("ui.kercadparametriceditor.select.one.straight.sketch.edge.as.the.axis.c89db6", {}, locale) });
        return;
      }
      const revolveFeatureId = sketchSession.revolveAxisFeatureId;
      const changed = mutate((draft) => {
        const sketch = draft.features.find((candidate): candidate is SketchFeature => candidate.id === sketchSession.featureId && candidate.kind === "sketch");
        const revolve = draft.features.find((candidate): candidate is RevolveFeature => candidate.id === revolveFeatureId && candidate.kind === "revolve");
        if (!sketch || sketch.profile.shape !== "drawn" || !revolve || revolve.source !== "sketch") return;
        sketch.profile.geometry = structuredClone(sketchSession.profile);
        sketch.annotations = structuredClone(sketchSession.annotations);
        revolve.axis = "edge";
        revolve.sketchAxisSegmentId = axisSegment.id;
        revolve.axisReferenceId = undefined;
      });
      if (!changed) return;
      sketchSessionRef.current = null; sketchAnnotationHistoryRef.current = [];
      setSketchSession(null);
      setSketchSelection(null);
      setSketchActivePointId(null);
      sketchHistoryRef.current = [];
      sketchHistoryIndexRef.current = -1;
      setSketchHistoryIndex(-1);
      setModelSidebarMode(sidebarModeBeforeSketchRef.current);
      setModelSelection([{ id: revolveFeatureId, kind: "feature" }]);
      setNotice({ type: "ok", text: uiText("ui.kercadparametriceditor.revolve.axis.updated.d60835", {}, locale) });
      return;
    }
    let featureId = sketchSession.featureId ?? "";
    let selectedFeatureId = featureId;
    let objectId = sketchSession.objectId;
    const changed = mutate((draft) => {
      if (featureId) {
        const feature = draft.features.find((candidate) => candidate.id === featureId);
        if (feature?.kind === "sketch" && feature.profile.shape === "drawn") { feature.profile.geometry = structuredClone(sketchSession.profile); feature.annotations = structuredClone(sketchSession.annotations); }
        return;
      }
      const usesExistingObject = Boolean(objectId && draft.objects.some((object) => object.id === objectId));
      if (!usesExistingObject) {
        objectId = addParametricObject(draft, draft.workplane.origin);
        const object = draft.objects.find((candidate) => candidate.id === objectId);
        if (object) {
          const placement = objectPlacementForWorkplane(draft.workplane);
          object.transform.position = placement.position;
          object.transform.rotation = placement.rotation;
        }
      }
      const feature = createDrawnSketchFeature(draft.features.filter((candidate) => candidate.kind === "sketch" && candidate.purpose === "user").length + 1, sketchSession.profile);
      feature.annotations = structuredClone(sketchSession.annotations);
      feature.name = `${uiText("operation.sketch", {}, locale)} ${draft.features.filter((candidate) => candidate.kind === "sketch" && candidate.purpose === "user").length + 1}`;
      feature.objectId = objectId ?? undefined;
      if (usesExistingObject && objectId) {
        const object = draft.objects.find((candidate) => candidate.id === objectId);
        if (object) {
          const placement = operationPlacementForWorkplane(draft.workplane, object);
          feature.x = placement.position.x;
          feature.y = placement.position.y;
          feature.offset = placement.position.z;
          feature.rotation = placement.rotation;
        }
      }
      if (sketchSession.mode === "scribble") {
        feature.name = uiText("ui.kercadparametriceditor.scribble.profile.7be30c", {}, locale);
        feature.purpose = "primitive";
        feature.visible = false;
      }
      featureId = feature.id;
      draft.features.push(feature);
      if (sketchSession.mode === "scribble") {
        const extrusion = createExtrudeFeature(feature.id, draft.features.filter((candidate) => candidate.kind === "extrude").length + 1, false);
        extrusion.objectId = objectId ?? undefined;
        extrusion.name = uiText("operation.scribble", {}, locale);
        extrusion.distance = 4;
        extrusion.dependencies = [{ type: "feature", id: feature.id }];
        draft.features.push(extrusion);
        selectedFeatureId = extrusion.id;
      } else selectedFeatureId = feature.id;
    });
    if (!changed || !featureId) return;
    sketchSessionRef.current = null; sketchAnnotationHistoryRef.current = [];
    setSketchSession(null);
    sketchHistoryRef.current = [];
    sketchHistoryIndexRef.current = -1;
    setSketchHistoryIndex(-1);
    setModelSidebarMode(sidebarModeBeforeSketchRef.current);
    if (sketchSession.featureId && sketchSession.mode === "scribble") selectedFeatureId = document.features.find((candidate) => candidate.kind === "extrude" && candidate.sketchId === sketchSession.featureId)?.id ?? sketchSession.featureId;
    setModelSelection([{ id: selectedFeatureId || featureId, kind: "feature" }]);
    setNotice({ type: "ok", text: sketchSession.mode === "scribble" ? (sketchSession.featureId ? t("notice.scribbleUpdated") : t("notice.scribbleAdded")) : sketchSession.featureId ? t("notice.sketchUpdated") : t("notice.sketchAdded") });
  };

  const setSketchProfile = (update: (profile: SketchProfile) => SketchProfile) => {
    const sketchSession = sketchSessionRef.current;
    if (!sketchSession) return;
    const nextProfile = updateAutoSmoothNodes(update(cloneSketchProfile(sketchSession.profile)));
    if (JSON.stringify(nextProfile) === JSON.stringify(sketchSession.profile)) return;
    const nextHistory = [...sketchHistoryRef.current.slice(0, sketchHistoryIndexRef.current + 1), cloneSketchProfile(nextProfile)];
    sketchAnnotationHistoryRef.current = [...sketchAnnotationHistoryRef.current.slice(0, sketchHistoryIndexRef.current + 1), structuredClone(sketchSession.annotations)];
    sketchHistoryRef.current = nextHistory;
    sketchHistoryIndexRef.current = nextHistory.length - 1;
    setSketchHistoryIndex(sketchHistoryIndexRef.current);
    const next = { ...sketchSession, profile: nextProfile }; sketchSessionRef.current = next; setSketchSession(next);
  };

  const setSketchAnnotations = (update: (annotations: ParametricAnnotation[]) => void) => {
    const session = sketchSessionRef.current; if (!session) return;
    const annotations = structuredClone(session.annotations); update(annotations);
    if (JSON.stringify(annotations) === JSON.stringify(session.annotations)) return;
    sketchHistoryRef.current = [...sketchHistoryRef.current.slice(0, sketchHistoryIndexRef.current + 1), cloneSketchProfile(session.profile)];
    sketchAnnotationHistoryRef.current = [...sketchAnnotationHistoryRef.current.slice(0, sketchHistoryIndexRef.current + 1), annotations];
    sketchHistoryIndexRef.current = sketchHistoryRef.current.length - 1; setSketchHistoryIndex(sketchHistoryIndexRef.current);
    const next = { ...session, annotations }; sketchSessionRef.current = next; setSketchSession(next);
  };

  const pasteSketchAnnotation = (source: ParametricAnnotation) => {
    const annotation = structuredClone(source); annotation.id = createLocalId("annotation");
    setSketchAnnotations((annotations) => { annotation.name = nextAnnotationName(annotations, t(`annotation.${annotation.kind}`)); annotations.push(annotation); });
    setSketchSelection(null); setSelectedSketchAnnotationId(annotation.id); setSketchAnnotationTool(null);
  };

  const sketchUndo = () => {
    if (sketchHistoryIndexRef.current <= 0) return;
    const index = sketchHistoryIndexRef.current - 1;
    sketchHistoryIndexRef.current = index;
    setSketchHistoryIndex(index);
    const current = sketchSessionRef.current;
    if (current) { const next = { ...current, profile: cloneSketchProfile(sketchHistoryRef.current[index]), annotations: structuredClone(sketchAnnotationHistoryRef.current[index] ?? []) }; sketchSessionRef.current = next; setSketchSession(next); }
    setSelectedSketchAnnotationId(null); setSketchAnnotationTool(null);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const sketchRedo = () => {
    if (sketchHistoryIndexRef.current >= sketchHistoryRef.current.length - 1) return;
    const index = sketchHistoryIndexRef.current + 1;
    sketchHistoryIndexRef.current = index;
    setSketchHistoryIndex(index);
    const current = sketchSessionRef.current;
    if (current) { const next = { ...current, profile: cloneSketchProfile(sketchHistoryRef.current[index]), annotations: structuredClone(sketchAnnotationHistoryRef.current[index] ?? []) }; sketchSessionRef.current = next; setSketchSession(next); }
    setSelectedSketchAnnotationId(null); setSketchAnnotationTool(null);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const chooseAnnotationTool = (tool: AnnotationTool) => {
    const next = annotationTool === tool ? null : tool;
    if (next && latestDocumentRef.current.annotationGroup?.visible === false) {
      mutate((draft) => { draft.annotationGroup = { expanded: true, position: 0, ...draft.annotationGroup, visible: true }; });
    }
    setAnnotationTool(next);
    setEditingAnnotationId(null); setModelSelection([]); setSelectedAnnotationId(null);
  };

  const chooseSketchTool = (tool: SketchTool) => {
    setSketchAnnotationTool(null); setSelectedSketchAnnotationId(null);
    setSketchTool(tool);
    setSketchActivePointId(null);
    setSketchSelection(null);
    if (tool !== "measure") setSketchMeasureStart(null);
  };

  const sketchCopyableSelection = useMemo(() => sketchSession ? copySketchSelection(sketchSession.profile, sketchSelection) : null, [sketchSession, sketchSelection]);
  const copyCurrentSketchSelection = () => {
    if (selectedSketchAnnotation) { setSketchAnnotationClipboard(structuredClone(selectedSketchAnnotation)); setSketchClipboard(null); return; }
    if (!sketchCopyableSelection) return;
    setSketchClipboard(sketchCopyableSelection);
    setSketchAnnotationClipboard(null);
    sketchPasteCountRef.current = 0;
  };
  const pasteSketchGeometry = (source: SketchProfile, count = 1) => {
    const added = pasteSketchSelection(source, sketchEntityId, Math.max(1, document.workplane.snapSpacing) * 5 * count);
    setSketchProfile((profile) => ({ ...profile, points: [...profile.points, ...added.points], segments: [...profile.segments, ...added.segments], circles: [...(profile.circles ?? []), ...(added.circles ?? [])], images: [...(profile.images ?? []), ...(added.images ?? [])], constraints: [...(profile.constraints ?? []), ...(added.constraints ?? [])] }));
    chooseSketchTool("select");
    setSketchSelection({ kind: "multiple", pointIds: added.points.map((point) => point.id), segmentIds: added.segments.map((segment) => segment.id), circleIds: added.circles?.map((circle) => circle.id), imageIds: added.images?.map((image) => image.id) });
  };

  const selectedConstructionIds = useMemo(() => {
    if (!sketchSession || !sketchSelection) return { segmentIds: [] as string[], circleIds: [] as string[], allConstruction: false };
    const segmentIds = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "point" ? sketchSession.profile.segments.filter((segment) => segment.startId === sketchSelection.id || segment.endId === sketchSelection.id).map((segment) => segment.id)
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection.kind === "circle" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const entities = [...sketchSession.profile.segments.filter((segment) => segmentIds.includes(segment.id)), ...(sketchSession.profile.circles ?? []).filter((circle) => circleIds.includes(circle.id))];
    return { segmentIds, circleIds, allConstruction: entities.length > 0 && entities.every((entity) => entity.construction) };
  }, [sketchSelection, sketchSession]);

  const toggleSketchConstruction = () => {
    if (!selectedConstructionIds.segmentIds.length && !selectedConstructionIds.circleIds.length) return;
    const construction = !selectedConstructionIds.allConstruction;
    setSketchProfile((profile) => ({
      ...profile,
      segments: profile.segments.map((segment) => selectedConstructionIds.segmentIds.includes(segment.id) ? { ...segment, construction } : segment),
      circles: (profile.circles ?? []).map((circle) => selectedConstructionIds.circleIds.includes(circle.id) ? { ...circle, construction } : circle),
    }));
  };

  const selectedConstraintSegments = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds
      : [];
    return [...sketchSession.profile.segments, ...SKETCH_REFERENCE_AXES].filter((segment) => ids.includes(segment.id) && segment.kind === "line");
  }, [sketchSelection, sketchSession]);

  const selectedConstraintKind = (kind: "horizontal" | "vertical") => selectedConstraintSegments.length > 0
    && selectedConstraintSegments.every((segment) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.segmentId === segment.id));

  const toggleSketchConstraint = (kind: "horizontal" | "vertical") => {
    if (!selectedConstraintSegments.length) return;
    const segmentIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
    const remove = selectedConstraintKind(kind);
    if (!remove && sketchSession) {
      for (const segment of selectedConstraintSegments) {
        const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind, segmentId: segment.id });
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if ((constraint.kind === "horizontal" || constraint.kind === "vertical") && segmentIds.has(constraint.segmentId)) return false;
        return true;
      });
      const constraints = remove ? retained : [
        ...retained,
        ...selectedConstraintSegments.map((segment) => ({ id: sketchEntityId("constraint"), kind, segmentId: segment.id } as const)),
      ];
      return solveSketchConstraints({ ...profile, constraints });
    });
  };

  const selectedLinePair = selectedConstraintSegments.length === 2 ? selectedConstraintSegments as [typeof selectedConstraintSegments[number], typeof selectedConstraintSegments[number]] : null;
  const selectedPairConstraintKind = (kind: "parallel" | "perpendicular") => Boolean(selectedLinePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.segmentIds.every((id) => selectedLinePair.some((segment) => segment.id === id))));

  const toggleSketchPairConstraint = (kind: "parallel" | "perpendicular") => {
    if (!selectedLinePair || !sketchSession) return;
    const segmentIds: [string, string] = [selectedLinePair[0].id, selectedLinePair[1].id];
    const remove = selectedPairConstraintKind(kind);
    if (!remove) {
      const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind, segmentIds });
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== kind || !constraint.segmentIds.every((id) => segmentIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: remove ? retained : [...retained, { id: sketchEntityId("constraint"), kind, segmentIds }] });
    });
  };

  const selectedConstraintCircles = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "circle" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? []
      : [];
    return (sketchSession.profile.circles ?? []).filter((circle) => ids.includes(circle.id));
  }, [sketchSelection, sketchSession]);
  const selectedConstraintArcs = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "segment" ? [sketchSelection.id]
      : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds
      : [];
    return sketchSession.profile.segments.filter((segment) => ids.includes(segment.id) && segment.kind === "arc" && segment.center);
  }, [sketchSelection, sketchSession]);
  const selectedCirclePair = selectedConstraintCircles.length === 2 ? selectedConstraintCircles as [typeof selectedConstraintCircles[number], typeof selectedConstraintCircles[number]] : null;
  const selectedConcentricActive = Boolean(selectedCirclePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "concentric" && constraint.circleIds.every((id) => selectedCirclePair.some((circle) => circle.id === id))));
  const selectedEqualLinePairs = selectedConstraintSegments.length >= 2
    ? selectedConstraintSegments.slice(1).map((segment) => [selectedConstraintSegments[0].id, segment.id] as [string, string])
    : [];
  const selectedLinesEqual = selectedEqualLinePairs.length > 0 && selectedEqualLinePairs.every((pair) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "equalLength" && constraint.segmentIds.every((id) => pair.includes(id))));
  const selectedEqualActive = Boolean(
    selectedLinesEqual
    || (selectedCirclePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "equalRadius" && constraint.circleIds.every((id) => selectedCirclePair.some((circle) => circle.id === id)))),
  );

  const toggleSketchConcentric = () => {
    if (!selectedCirclePair || !sketchSession) return;
    const circleIds: [string, string] = [selectedCirclePair[0].id, selectedCirclePair[1].id];
    if (!selectedConcentricActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind: "concentric", circleIds });
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "concentric" || !constraint.circleIds.every((id) => circleIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: selectedConcentricActive ? retained : [...retained, { id: sketchEntityId("constraint"), kind: "concentric", circleIds }] });
    });
  };

  const toggleSketchEqual = () => {
    if (!sketchSession || (!selectedEqualLinePairs.length && !selectedCirclePair)) return;
    const candidates: SketchConstraint[] = selectedEqualLinePairs.length
      ? selectedEqualLinePairs.map((segmentIds, index) => ({ id: `constraint-preview-${index}`, kind: "equalLength", segmentIds }))
      : [{ id: "constraint-preview", kind: "equalRadius", circleIds: [selectedCirclePair![0].id, selectedCirclePair![1].id] }];
    if (!selectedEqualActive) {
      const preview = cloneSketchProfile(sketchSession.profile);
      const selectedLineIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
      const selectedCircleIds = new Set(selectedConstraintCircles.map((circle) => circle.id));
      preview.constraints = (preview.constraints ?? []).filter((constraint) => {
        if (constraint.kind === "equalLength") return !constraint.segmentIds.every((id) => selectedLineIds.has(id));
        if (constraint.kind === "equalRadius") return !constraint.circleIds.every((id) => selectedCircleIds.has(id));
        return true;
      });
      for (const candidate of candidates) {
        const conflict = sketchConstraintConflict(preview, candidate);
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
        preview.constraints = [...(preview.constraints ?? []), candidate];
      }
    }
    setSketchProfile((profile) => {
      const selectedLineIds = new Set(selectedConstraintSegments.map((segment) => segment.id));
      const selectedCircleIds = new Set(selectedConstraintCircles.map((circle) => circle.id));
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if (constraint.kind === "equalLength") return !constraint.segmentIds.every((id) => selectedLineIds.has(id));
        if (constraint.kind === "equalRadius") return !constraint.circleIds.every((id) => selectedCircleIds.has(id));
        return true;
      });
      return solveSketchConstraints({ ...profile, constraints: selectedEqualActive ? retained : [...retained, ...candidates.map((candidate) => ({ ...candidate, id: sketchEntityId("constraint") }))] });
    });
  };

  const selectedConstraintPoints = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "point" ? [sketchSelection.id]
      : sketchSelection.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection.kind === "multiple" ? sketchSelection.pointIds
      : [];
    return ids.map((id) => sketchConstraintPoint(sketchSession.profile, id)).filter((point): point is SketchPoint => Boolean(point));
  }, [sketchSelection, sketchSession]);

  const selectedPointLinePair = selectedConstraintPoints.length === 1 && selectedConstraintSegments.length === 1
    ? { point: selectedConstraintPoints[0], segment: selectedConstraintSegments[0] }
    : null;
  const selectedPointLineActive = (kind: "midpoint" | "pointOnObject") => Boolean(selectedPointLinePair && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === kind && constraint.pointId === selectedPointLinePair.point.id && constraint.segmentId === selectedPointLinePair.segment.id));

  const toggleSketchPointLineConstraint = (kind: "midpoint" | "pointOnObject") => {
    if (!selectedPointLinePair || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", kind, pointId: selectedPointLinePair.point.id, segmentId: selectedPointLinePair.segment.id };
    const remove = selectedPointLineActive(kind);
    const withoutPairRelations = (sketchSession.profile.constraints ?? []).filter((constraint) => (constraint.kind !== "midpoint" && constraint.kind !== "pointOnObject") || constraint.pointId !== candidate.pointId || constraint.segmentId !== candidate.segmentId);
    if (!remove) {
      const conflict = sketchConstraintConflict({ ...sketchSession.profile, constraints: withoutPairRelations }, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => (constraint.kind !== "midpoint" && constraint.kind !== "pointOnObject") || constraint.pointId !== candidate.pointId || constraint.segmentId !== candidate.segmentId);
      return solveSketchConstraints({ ...profile, constraints: remove ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedPointGeometryConstraint: Extract<SketchConstraint, { kind: "pointOnCircle" | "pointOnArc" }> | null = selectedConstraintPoints.length === 1 && selectedConstraintCircles.length === 1 && selectedConstraintArcs.length === 0
    ? { id: "constraint-preview", kind: "pointOnCircle", pointId: selectedConstraintPoints[0].id, circleId: selectedConstraintCircles[0].id }
    : selectedConstraintPoints.length === 1 && selectedConstraintArcs.length === 1 && selectedConstraintCircles.length === 0
      ? { id: "constraint-preview", kind: "pointOnArc", pointId: selectedConstraintPoints[0].id, arcId: selectedConstraintArcs[0].id }
      : null;
  const selectedPointGeometryActive = Boolean(selectedPointGeometryConstraint && sketchSession?.profile.constraints?.some((constraint) =>
    selectedPointGeometryConstraint.kind === "pointOnCircle"
      ? constraint.kind === "pointOnCircle" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.circleId === selectedPointGeometryConstraint.circleId
      : constraint.kind === "pointOnArc" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.arcId === selectedPointGeometryConstraint.arcId));
  const toggleSketchPointOnGeometry = () => {
    if (selectedPointLinePair) { toggleSketchPointLineConstraint("pointOnObject"); return; }
    if (!selectedPointGeometryConstraint || !sketchSession) return;
    if (!selectedPointGeometryActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, selectedPointGeometryConstraint);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.id !== selectedPointGeometryConstraint.id && !(
        selectedPointGeometryConstraint.kind === "pointOnCircle"
          ? constraint.kind === "pointOnCircle" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.circleId === selectedPointGeometryConstraint.circleId
          : constraint.kind === "pointOnArc" && constraint.pointId === selectedPointGeometryConstraint.pointId && constraint.arcId === selectedPointGeometryConstraint.arcId
      ));
      return solveSketchConstraints({ ...profile, constraints: selectedPointGeometryActive ? retained : [...retained, { ...selectedPointGeometryConstraint, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedTangentConstraint = selectedConstraintSegments.length === 1 && selectedConstraintCircles.length === 1
    ? { kind: "tangentLineCircle" as const, segmentId: selectedConstraintSegments[0].id, circleId: selectedConstraintCircles[0].id }
    : selectedConstraintSegments.length === 1 && selectedConstraintArcs.length === 1 && selectedConstraintCircles.length === 0
      ? { kind: "tangentLineArc" as const, lineId: selectedConstraintSegments[0].id, arcId: selectedConstraintArcs[0].id }
    : selectedConstraintSegments.length === 0 && selectedConstraintCircles.length === 2
      ? { kind: "tangentCircles" as const, circleIds: [selectedConstraintCircles[0].id, selectedConstraintCircles[1].id] as [string, string] }
      : null;
  const selectedTangentActive = Boolean(selectedTangentConstraint && sketchSession?.profile.constraints?.some((constraint) => {
    if (selectedTangentConstraint.kind === "tangentLineCircle" && constraint.kind === "tangentLineCircle") return constraint.segmentId === selectedTangentConstraint.segmentId && constraint.circleId === selectedTangentConstraint.circleId;
    if (selectedTangentConstraint.kind === "tangentLineArc" && constraint.kind === "tangentLineArc") return constraint.lineId === selectedTangentConstraint.lineId && constraint.arcId === selectedTangentConstraint.arcId;
    return selectedTangentConstraint.kind === "tangentCircles" && constraint.kind === "tangentCircles" && constraint.circleIds.every((id) => selectedTangentConstraint.circleIds.includes(id));
  }));
  const toggleSketchTangent = () => {
    if (!selectedTangentConstraint || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", ...selectedTangentConstraint };
    if (!selectedTangentActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        if (candidate.kind === "tangentLineCircle" && constraint.kind === "tangentLineCircle") return constraint.segmentId !== candidate.segmentId || constraint.circleId !== candidate.circleId;
        if (candidate.kind === "tangentLineArc" && constraint.kind === "tangentLineArc") return constraint.lineId !== candidate.lineId || constraint.arcId !== candidate.arcId;
        if (candidate.kind === "tangentCircles" && constraint.kind === "tangentCircles") return !constraint.circleIds.every((id) => candidate.circleIds.includes(id));
        return true;
      });
      return solveSketchConstraints({ ...profile, constraints: selectedTangentActive ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectedSymmetrySet = selectedConstraintPoints.length === 2 && selectedConstraintSegments.length === 1
    ? { pointIds: [selectedConstraintPoints[0].id, selectedConstraintPoints[1].id] as [string, string], segmentId: selectedConstraintSegments[0].id }
    : null;
  const selectedSymmetryActive = Boolean(selectedSymmetrySet && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "symmetric" && constraint.segmentId === selectedSymmetrySet.segmentId && constraint.pointIds.every((id) => selectedSymmetrySet.pointIds.includes(id))));
  const toggleSketchSymmetry = () => {
    if (!selectedSymmetrySet || !sketchSession) return;
    const candidate: SketchConstraint = { id: "constraint-preview", kind: "symmetric", ...selectedSymmetrySet };
    if (!selectedSymmetryActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "symmetric" || constraint.segmentId !== candidate.segmentId || !constraint.pointIds.every((id) => candidate.pointIds.includes(id)));
      return solveSketchConstraints({ ...profile, constraints: selectedSymmetryActive ? retained : [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const selectSketchCirclePoint = (circleId: string, point: "center" | "radius", additive: boolean) => {
    const id = circleSketchPointId(circleId, point);
    if (!additive || !sketchSelection) {
      setSketchSelection({ kind: "circlePoint", circleId, point });
      setSketchActivePointId(null);
      return;
    }
    if (sketchSelection.kind === "circlePoint" && sketchSelection.circleId === circleId && sketchSelection.point === point) {
      setSketchSelection(null);
      setSketchActivePointId(null);
      return;
    }
    const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
      : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds
      : [];
    const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
    setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
    setSketchActivePointId(null);
  };

  const selectSketchArcPoint = (segmentId: string, additive: boolean) => {
    const id = arcSketchPointId(segmentId);
    if (!additive || !sketchSelection) {
      setSketchSelection({ kind: "arcPoint", segmentId });
      setSketchActivePointId(null);
      return;
    }
    if (sketchSelection.kind === "arcPoint" && sketchSelection.segmentId === segmentId) {
      setSketchSelection(null);
      setSketchActivePointId(null);
      return;
    }
    const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
      : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
      : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
      : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
    const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
    const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
    setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
    setSketchActivePointId(null);
  };

  const selectedPointsFixed = selectedConstraintPoints.length > 0 && selectedConstraintPoints.every((point) => sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "fixed" && constraint.pointId === point.id));

  const selectedPointsCoincident = useMemo(() => {
    if (!sketchSession || selectedConstraintPoints.length < 2) return false;
    const selectedIds = new Set(selectedConstraintPoints.map((point) => point.id));
    const reached = new Set<string>();
    const pending = [selectedConstraintPoints[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (!id || reached.has(id)) continue;
      reached.add(id);
      for (const constraint of sketchSession.profile.constraints ?? []) {
        if (constraint.kind !== "coincident" || !constraint.pointIds.includes(id)) continue;
        pending.push(constraint.pointIds[0] === id ? constraint.pointIds[1] : constraint.pointIds[0]);
      }
    }
    return [...selectedIds].every((id) => reached.has(id));
  }, [selectedConstraintPoints, sketchSession]);

  const toggleFixedSketchPoints = () => {
    if (!selectedConstraintPoints.length) return;
    const ids = new Set(selectedConstraintPoints.map((point) => point.id));
    if (!selectedPointsFixed && sketchSession) {
      const preview = cloneSketchProfile(sketchSession.profile);
      for (const point of selectedConstraintPoints) {
        const candidate = { id: sketchEntityId("constraint"), kind: "fixed" as const, pointId: point.id, x: point.x, z: point.z };
        const conflict = sketchConstraintConflict(preview, candidate);
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
        preview.constraints = [...(preview.constraints ?? []), candidate];
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "fixed" || !ids.has(constraint.pointId));
      const constraints = selectedPointsFixed ? retained : [...retained, ...selectedConstraintPoints.map((point) => ({ id: sketchEntityId("constraint"), kind: "fixed" as const, pointId: point.id, x: point.x, z: point.z }))];
      return solveSketchConstraints({ ...profile, constraints });
    });
  };

  const toggleCoincidentSketchPoints = () => {
    if (selectedConstraintPoints.length < 2) return;
    const ids = new Set(selectedConstraintPoints.map((point) => point.id));
    if (!selectedPointsCoincident && sketchSession) {
      const anchor = selectedConstraintPoints[0];
      for (const point of selectedConstraintPoints.slice(1)) {
        const conflict = sketchConstraintConflict(sketchSession.profile, { id: "constraint-preview", kind: "coincident", pointIds: [anchor.id, point.id] });
        if (conflict) { setNotice({ type: "error", text: conflict }); return; }
      }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "coincident" || !constraint.pointIds.every((id) => ids.has(id)));
      if (selectedPointsCoincident) return { ...profile, constraints: retained };
      const anchor = selectedConstraintPoints[0];
      const constraints = [
        ...retained,
        ...selectedConstraintPoints.slice(1).map((point) => ({ id: sketchEntityId("constraint"), kind: "coincident" as const, pointIds: [anchor.id, point.id] as [string, string] })),
      ];
      return solveSketchConstraints({ ...profile, constraints }, anchor.id);
    });
  };

  const sketchConstraintStatus = useMemo(() => {
    if (!sketchSession) return { kind: "under", label: uiText("ui.kercadparametriceditor.free.sketch.03f859", {}, locale) };
    const analysis = analyzeSketchConstraints(sketchSession.profile);
    if (analysis.status === "over") return { kind: "over", label: `${uiText("ui.kercadparametriceditor.conflict.39f7b0", {}, locale)} · ${analysis.conflictingConstraintIds.length}` };
    if (analysis.status === "full") return { kind: "full", label: uiText("ui.kercadparametriceditor.fully.constrained.e8eddf", {}, locale) };
    return { kind: "under", label: `${analysis.degreesOfFreedom} ${uiText("ui.kercadparametriceditor.dof.4ffdb6", {}, locale)}` };
  }, [locale, sketchSession]);

  const selectedDimensionSegment = selectedConstraintSegments.length === 1 && !sketchReferenceAxis(selectedConstraintSegments[0].id) ? selectedConstraintSegments[0] : null;
  const selectedDimensionCircle = sketchSession && sketchSelection?.kind === "circle"
    ? sketchSession.profile.circles?.find((circle) => circle.id === sketchSelection.id) ?? null
    : null;
  const selectedDimensionArcId = sketchSelection?.kind === "segment"
    ? sketchSelection.id
    : sketchSelection?.kind === "multiple" && sketchSelection.segmentIds.length === 1
      ? sketchSelection.segmentIds[0]
      : null;
  const selectedDimensionArc = sketchSession && selectedDimensionArcId
    ? sketchSession.profile.segments.find((segment) => segment.id === selectedDimensionArcId && segment.kind === "arc" && segment.center) ?? null
    : null;
  const selectedArcStart = selectedDimensionArc && sketchSession ? sketchSession.profile.points.find((point) => point.id === selectedDimensionArc.startId) ?? null : null;
  const selectedArcEnd = selectedDimensionArc && sketchSession ? sketchSession.profile.points.find((point) => point.id === selectedDimensionArc.endId) ?? null : null;
  const selectedArcRadius = selectedDimensionArc?.center && selectedArcStart ? Math.hypot(selectedArcStart.x - selectedDimensionArc.center.x, selectedArcStart.z - selectedDimensionArc.center.z) : null;
  const selectedDimensionActive = (axis: "aligned" | "x" | "z") => Boolean(selectedDimensionSegment && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "distance" && constraint.segmentId === selectedDimensionSegment.id && constraint.axis === axis));
  const selectedRadiusActive = Boolean(
    selectedDimensionCircle
      ? sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "radius" && constraint.circleId === selectedDimensionCircle.id)
      : selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcRadius" && constraint.segmentId === selectedDimensionArc.id),
  );
  const selectedDiameterActive = Boolean(
    selectedDimensionCircle
      ? sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "diameter" && constraint.circleId === selectedDimensionCircle.id)
      : selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcDiameter" && constraint.segmentId === selectedDimensionArc.id),
  );
  const selectedArcAngleActive = Boolean(selectedDimensionArc && sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "arcAngle" && constraint.segmentId === selectedDimensionArc.id));
  const selectedAngleSegments = selectedConstraintSegments.length >= 1 && selectedConstraintSegments.length <= 2 ? selectedConstraintSegments : [];
  const selectedAngleActive = selectedAngleSegments.length > 0 && Boolean(sketchSession?.profile.constraints?.some((constraint) => constraint.kind === "angle" && constraint.segmentIds.length === selectedAngleSegments.length && constraint.segmentIds.every((id, index) => id === selectedAngleSegments[index].id)));

  const toggleSketchDimension = (axis: "aligned" | "x" | "z") => {
    if (!selectedDimensionSegment || !sketchSession) return;
    const start = sketchSession.profile.points.find((point) => point.id === selectedDimensionSegment.startId);
    const end = sketchSession.profile.points.find((point) => point.id === selectedDimensionSegment.endId);
    if (!start || !end) return;
    const active = selectedDimensionActive(axis);
    const value = axis === "x" ? Math.abs(end.x - start.x) : axis === "z" ? Math.abs(end.z - start.z) : Math.hypot(end.x - start.x, end.z - start.z);
    const candidate = { id: "constraint-preview", kind: "distance" as const, segmentId: selectedDimensionSegment.id, axis, value: Math.max(0.001, value) };
    if (!active) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => {
        return constraint.kind !== "distance" || constraint.segmentId !== selectedDimensionSegment.id || constraint.axis !== axis;
      });
      if (active) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchRadius = () => {
    if ((!selectedDimensionCircle && (!selectedDimensionArc || selectedArcRadius === null)) || !sketchSession) return;
    const candidate: SketchConstraint = selectedDimensionCircle
      ? { id: "constraint-preview", kind: "radius", circleId: selectedDimensionCircle.id, value: selectedDimensionCircle.radius }
      : { id: "constraint-preview", kind: "arcRadius", segmentId: selectedDimensionArc!.id, value: selectedArcRadius! };
    if (!selectedRadiusActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => selectedDimensionCircle
        ? constraint.kind !== "radius" || constraint.circleId !== selectedDimensionCircle.id
        : constraint.kind !== "arcRadius" || constraint.segmentId !== selectedDimensionArc!.id);
      if (selectedRadiusActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchDiameter = () => {
    if ((!selectedDimensionCircle && (!selectedDimensionArc || selectedArcRadius === null)) || !sketchSession) return;
    const candidate: SketchConstraint = selectedDimensionCircle
      ? { id: "constraint-preview", kind: "diameter", circleId: selectedDimensionCircle.id, value: selectedDimensionCircle.radius * 2 }
      : { id: "constraint-preview", kind: "arcDiameter", segmentId: selectedDimensionArc!.id, value: selectedArcRadius! * 2 };
    if (!selectedDiameterActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => selectedDimensionCircle
        ? constraint.kind !== "diameter" || constraint.circleId !== selectedDimensionCircle.id
        : constraint.kind !== "arcDiameter" || constraint.segmentId !== selectedDimensionArc!.id);
      if (selectedDiameterActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchArcAngle = () => {
    if (!selectedDimensionArc?.center || !selectedArcStart || !selectedArcEnd || !sketchSession) return;
    const startAngle = Math.atan2(selectedArcStart.z - selectedDimensionArc.center.z, selectedArcStart.x - selectedDimensionArc.center.x);
    const endAngle = Math.atan2(selectedArcEnd.z - selectedDimensionArc.center.z, selectedArcEnd.x - selectedDimensionArc.center.x);
    const sweep = selectedDimensionArc.clockwise !== false
      ? (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2)
      : (startAngle - endAngle + Math.PI * 2) % (Math.PI * 2);
    const candidate: SketchConstraint = { id: "constraint-preview", kind: "arcAngle", segmentId: selectedDimensionArc.id, value: Math.max(0.001, sweep * 180 / Math.PI) };
    if (!selectedArcAngleActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "arcAngle" || constraint.segmentId !== selectedDimensionArc.id);
      if (selectedArcAngleActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const toggleSketchAngle = () => {
    if (!sketchSession || !selectedAngleSegments.length) return;
    const segmentAngle = (segment: typeof selectedAngleSegments[number]) => {
      const start = sketchConstraintPoint(sketchSession.profile, segment.startId);
      const end = sketchConstraintPoint(sketchSession.profile, segment.endId);
      return start && end ? Math.atan2(end.z - start.z, end.x - start.x) * 180 / Math.PI : 0;
    };
    let value = segmentAngle(selectedAngleSegments[selectedAngleSegments.length - 1]) - (selectedAngleSegments.length === 2 ? segmentAngle(selectedAngleSegments[0]) : 0);
    value = ((value + 180) % 360 + 360) % 360 - 180;
    const candidate = { id: "constraint-preview", kind: "angle" as const, segmentIds: selectedAngleSegments.map((segment) => segment.id) as [string] | [string, string], value };
    if (!selectedAngleActive) {
      const conflict = sketchConstraintConflict(sketchSession.profile, candidate);
      if (conflict) { setNotice({ type: "error", text: conflict }); return; }
    }
    setSketchProfile((profile) => {
      const retained = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "angle" || constraint.segmentIds.length !== candidate.segmentIds.length || !constraint.segmentIds.every((id, index) => id === candidate.segmentIds[index]));
      if (selectedAngleActive) return { ...profile, constraints: retained };
      return solveSketchConstraints({ ...profile, constraints: [...retained, { ...candidate, id: sketchEntityId("constraint") }] });
    });
  };

  const updateSketchConstraintValue = (constraintId: string, value: number) => {
    const constraint = sketchSession?.profile.constraints?.find((candidate) => candidate.id === constraintId);
    const signed = constraint?.kind === "angle";
    if (constraint?.kind === "arcAngle" && (!Number.isFinite(value) || value <= 0 || value >= 360)) { setNotice({ type: "error", text: t("notice.invalidArcAngle") }); return; }
    if (!Number.isFinite(value) || (!signed && value <= 0)) { setNotice({ type: "error", text: signed ? t("notice.invalidAngle") : t("notice.positiveDimension") }); return; }
    setSketchProfile((profile) => solveSketchConstraints({
      ...profile,
      constraints: (profile.constraints ?? []).map((constraint) => constraint.id === constraintId && (constraint.kind === "distance" || constraint.kind === "radius" || constraint.kind === "diameter" || constraint.kind === "arcRadius" || constraint.kind === "arcDiameter" || constraint.kind === "arcAngle" || constraint.kind === "angle") ? { ...constraint, value } : constraint),
    }));
  };

  const deleteSketchConstraint = (constraintId: string) => {
    setSketchProfile((profile) => ({ ...profile, constraints: (profile.constraints ?? []).filter((constraint) => constraint.id !== constraintId) }));
    setNotice({ type: "info", text: t("notice.constraintDeleted") });
  };

  const connectSketchPoint = (pointId: string) => {
    if (!sketchSession || !["line", "bezier", "smooth"].includes(sketchTool)) return;
    if (!sketchActivePointId) {
      setSketchActivePointId(pointId);
      setSketchSelection({ kind: "point", id: pointId });
      return;
    }
    if (sketchActivePointId === pointId) return;
    const duplicate = sketchSession.profile.segments.some((segment) => (segment.kind ?? "line") === sketchTool && ((segment.startId === sketchActivePointId && segment.endId === pointId) || (segment.startId === pointId && segment.endId === sketchActivePointId)));
    let closed = false;
    if (!duplicate) setSketchProfile((profile) => {
      const next = { ...profile, segments: [...profile.segments, { id: sketchEntityId("segment"), startId: sketchActivePointId, endId: pointId, kind: sketchTool as "line" | "bezier" | "smooth" }] };
      const prepared = sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
      closed = orderedSketchPaths(prepared).some((path) => path.closed && path.points.some((point) => point.id === sketchActivePointId) && path.points.some((point) => point.id === pointId));
      return prepared;
    });
    setSketchActivePointId(closed ? null : pointId);
    setSketchSelection({ kind: "point", id: pointId });
    if (closed) setSketchTool("select");
  };

  const addSketchPoint = (position: { x: number; z: number }, handles?: { handleIn: { x: number; z: number }; handleOut: { x: number; z: number } }) => {
    if (!sketchSession) return;
    if (sketchTool === "measure") {
      const point = { id: "measure", ...position };
      if (sketchMeasureStart) { setSketchMeasurement({ start: sketchMeasureStart, end: point }); setSketchMeasureStart(null); }
      else { setSketchMeasureStart(point); setSketchMeasurement(null); }
      return;
    }
    if (!["line", "bezier", "smooth"].includes(sketchTool)) return;
    const existing = sketchSession.profile.points.find((point) => Math.hypot(point.x - position.x, point.z - position.z) < 0.0001);
    if (existing) { connectSketchPoint(existing.id); return; }
    const point: SketchPoint = { id: sketchEntityId("point"), ...position, ...handles, mode: sketchTool === "line" ? "corner" : "smooth" };
    setSketchProfile((profile) => {
      const next = { ...profile, points: [...profile.points, point], segments: sketchActivePointId ? [...profile.segments, { id: sketchEntityId("segment"), startId: sketchActivePointId, endId: point.id, kind: sketchTool as "line" | "bezier" | "smooth" }] : profile.segments };
      return sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
    });
    setSketchActivePointId(point.id);
    setSketchSelection({ kind: "point", id: point.id });
  };

  const pressSketchPoint = (id: string, additive = false) => {
    const point = sketchSession ? sketchConstraintPoint(sketchSession.profile, id) : null;
    if (!point) return;
    if (sketchTool === "connect") {
      if (!sketchSession?.profile.points.some((candidate) => candidate.id === id)) return;
      if (sketchActivePointId && sketchActivePointId !== id) addEdgeBetweenSketchNodes(sketchActivePointId, id);
      else { setSketchActivePointId(id); setSketchSelection({ kind: "point", id }); }
    } else if (sketchTool === "measure") {
      if (sketchMeasureStart) { setSketchMeasurement({ start: sketchMeasureStart, end: point }); setSketchMeasureStart(null); }
      else { setSketchMeasureStart(point); setSketchMeasurement(null); }
    } else if (sketchTool === "select") {
      if (!additive || !sketchSelection) setSketchSelection({ kind: "point", id });
      else if (sketchSelection.kind === "point" && sketchSelection.id === id) setSketchSelection(null);
      else {
        const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
          : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
          : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
          : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds
          : [];
        const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
        const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
        const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
        const nextPointIds = pointIds.includes(id) ? pointIds.filter((candidate) => candidate !== id) : [...pointIds, id];
        setSketchSelection(nextPointIds.length || segmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds: nextPointIds, segmentIds, circleIds, imageIds } : null);
      }
      setSketchActivePointId(null);
    }
    else connectSketchPoint(id);
  };

  const deleteSketchPoint = (id: string) => {
    setSketchProfile((profile) => {
      const connected = profile.segments.filter((segment) => segment.startId === id || segment.endId === id);
      const neighborIds = connected.map((segment) => segment.startId === id ? segment.endId : segment.startId);
      const remaining = profile.segments.filter((segment) => segment.startId !== id && segment.endId !== id);
      if (neighborIds.length === 2 && neighborIds[0] !== neighborIds[1] && !remaining.some((segment) => (segment.startId === neighborIds[0] && segment.endId === neighborIds[1]) || (segment.startId === neighborIds[1] && segment.endId === neighborIds[0]))) {
        remaining.push({ id: sketchEntityId("segment"), startId: neighborIds[0], endId: neighborIds[1], kind: connected.every((segment) => segment.kind === "line") ? "line" : connected.some((segment) => segment.kind === "smooth") ? "smooth" : "bezier" });
      }
      const remainingIds = new Set(remaining.map((segment) => segment.id));
      const next = { ...profile, points: profile.points.filter((point) => point.id !== id), segments: remaining, constraints: (profile.constraints ?? []).filter((constraint) => {
        if (sketchConstraintUsesPoint(constraint, id)) return false;
        if (profile.segments.some((segment) => !remainingIds.has(segment.id) && sketchConstraintUsesSegment(constraint, segment.id))) return false;
        if (constraint.kind === "angle") return constraint.segmentIds.every((segmentId) => remainingIds.has(segmentId));
        if (constraint.kind === "horizontal" || constraint.kind === "vertical" || constraint.kind === "distance") return remainingIds.has(constraint.segmentId);
        return true;
      }) };
      return next.segments.some((segment) => segment.kind === "smooth") ? withSmoothSketchHandles(next) : next;
    });
    if (sketchActivePointId === id) setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const deleteSketchSegment = (id: string) => {
    setSketchProfile((profile) => ({ ...profile, segments: profile.segments.filter((segment) => segment.id !== id), constraints: (profile.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, id)) }));
    setSketchActivePointId(null);
    setSketchSelection(null);
  };

  const trimSketchEntity = (target: { kind: "segment" | "circle"; id: string }, point: { x: number; z: number }) => {
    if (!sketchSession) return;
    const result = trimSketchGeometry(sketchSession.profile, target, point, sketchEntityId);
    setNotice({ type: result.trimmed ? "ok" : "info", text: result.message });
    if (!result.trimmed) return;
    setSketchProfile(() => result.profile);
    setSketchSelection(null);
    setSketchActivePointId(null);
  };

  const insertSketchPoint = (segmentId: string, position: { x: number; z: number }) => {
    const insertedId = sketchEntityId("point");
    setSketchProfile((profile) => {
      const segment = profile.segments.find((candidate) => candidate.id === segmentId);
      if (!segment) return profile;
      const inserted: SketchPoint = { id: insertedId, ...position, mode: segment.kind === "line" ? "corner" : "smooth" };
      const firstId = sketchEntityId("segment");
      const secondId = sketchEntityId("segment");
      const inherited = (profile.constraints ?? []).filter((constraint): constraint is Extract<NonNullable<SketchProfile["constraints"]>[number], { kind: "horizontal" | "vertical" }> => (constraint.kind === "horizontal" || constraint.kind === "vertical") && constraint.segmentId === segmentId);
      const next = {
        ...profile,
        points: [...profile.points, inserted],
        segments: profile.segments.flatMap((candidate) => candidate.id === segmentId ? [{ ...candidate, id: firstId, endId: inserted.id }, { ...candidate, id: secondId, startId: inserted.id }] : [candidate]),
        constraints: [
          ...(profile.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, segmentId)),
          ...inherited.flatMap((constraint) => [
            { ...constraint, id: sketchEntityId("constraint"), segmentId: firstId },
            { ...constraint, id: sketchEntityId("constraint"), segmentId: secondId },
          ]),
        ],
      };
      return segment.kind === "smooth" ? withSmoothSketchHandles(next) : next;
    });
    setSketchSelection({ kind: "point", id: insertedId });
    setSketchTool("select");
  };

  const addEdgeBetweenSketchNodes = (startId: string, endId: string) => {
    if (!sketchSession || startId === endId) return;
    if (!sketchSession.profile.points.some((point) => point.id === startId) || !sketchSession.profile.points.some((point) => point.id === endId)) return;
    const existing = sketchSession.profile.segments.find((segment) => (segment.kind ?? "line") === "line" && ((segment.startId === startId && segment.endId === endId) || (segment.startId === endId && segment.endId === startId)));
    const id = existing?.id ?? sketchEntityId("segment");
    if (!existing) setSketchProfile((profile) => ({ ...profile, segments: [...profile.segments, { id, startId, endId, kind: "line" }] }));
    chooseSketchTool("select");
    setSketchSelection({ kind: "segment", id });
  };
  const connectSelectedSketchNodes = () => {
    if (selectedSketchPoints.length === 2) addEdgeBetweenSketchNodes(selectedSketchPoints[0].id, selectedSketchPoints[1].id);
    else {
      const first = selectedSketchPoints.length === 1 ? selectedSketchPoints[0] : null;
      chooseSketchTool("connect");
      if (first) { setSketchActivePointId(first.id); setSketchSelection({ kind: "point", id: first.id }); }
    }
  };

  const refineSketchSelection = () => {
    if (!sketchSession || !sketchSelection) { chooseSketchTool("refine"); return; }
    const pointIds = new Set(sketchSelection.kind === "point" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.pointIds : []);
    const segmentIds = new Set(sketchSelection.kind === "segment" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds : []);
    const targets = sketchSession.profile.segments.filter((segment) => segmentIds.has(segment.id) || (pointIds.has(segment.startId) && pointIds.has(segment.endId)));
    if (!targets.length) return;
    const insertedIds: string[] = [];
    setSketchProfile((profile) => {
      const next = cloneSketchProfile(profile);
      const midpoint = (a: { x: number; z: number }, b: { x: number; z: number }) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      for (const target of targets) {
        const segment = next.segments.find((candidate) => candidate.id === target.id);
        if (!segment) continue;
        const start = next.points.find((point) => point.id === segment.startId);
        const end = next.points.find((point) => point.id === segment.endId);
        if (!start || !end) continue;
        const inserted: SketchPoint = { id: sketchEntityId("point"), ...midpoint(start, end), mode: "corner" };
        if (segment.kind === "arc" && segment.center) {
          const startAngle = Math.atan2(start.z - segment.center.z, start.x - segment.center.x);
          const endAngle = Math.atan2(end.z - segment.center.z, end.x - segment.center.x);
          const positive = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
          const sweep = segment.clockwise !== false ? positive : positive - Math.PI * 2;
          const radius = Math.hypot(start.x - segment.center.x, start.z - segment.center.z);
          inserted.x = segment.center.x + Math.cos(startAngle + sweep / 2) * radius;
          inserted.z = segment.center.z + Math.sin(startAngle + sweep / 2) * radius;
        } else if (segment.kind === "bezier" || segment.kind === "smooth") {
          const a = midpoint(start, start.handleOut ?? start);
          const b = midpoint(start.handleOut ?? start, end.handleIn ?? end);
          const c = midpoint(end.handleIn ?? end, end);
          const left = midpoint(a, b);
          const right = midpoint(b, c);
          Object.assign(inserted, midpoint(left, right), { mode: "smooth", handleIn: left, handleOut: right });
          start.handleOut = a;
          end.handleIn = c;
        }
        const first = { ...segment, id: sketchEntityId("segment"), endId: inserted.id };
        const second = { ...segment, id: sketchEntityId("segment"), startId: inserted.id };
        const inherited = (next.constraints ?? []).filter((constraint) => (constraint.kind === "horizontal" || constraint.kind === "vertical") && constraint.segmentId === segment.id);
        next.constraints = (next.constraints ?? []).filter((constraint) => !sketchConstraintUsesSegment(constraint, segment.id));
        for (const constraint of inherited) if (constraint.kind === "horizontal" || constraint.kind === "vertical") {
          next.constraints.push({ ...constraint, id: sketchEntityId("constraint"), segmentId: first.id }, { ...constraint, id: sketchEntityId("constraint"), segmentId: second.id });
        }
        next.points.push(inserted);
        next.segments = next.segments.flatMap((candidate) => candidate.id === segment.id ? [first, second] : [candidate]);
        insertedIds.push(inserted.id);
      }
      return next;
    });
    chooseSketchTool("select");
    setSketchSelection({ kind: "multiple", pointIds: insertedIds, segmentIds: [] });
  };

  const moveSketchHandle = (id: string, handle: "in" | "out", position: { x: number; z: number }) => setSketchProfile((profile) => {
    const next = cloneSketchProfile(profile);
    const point = next.points.find((candidate) => candidate.id === id);
    if (!point) return profile;
    if (point.mode === "autoSmooth") point.mode = "smooth";
    if (handle === "in") point.handleIn = { ...position };
    else point.handleOut = { ...position };
    if (point.mode === "smooth") {
      const opposite = { x: point.x * 2 - position.x, z: point.z * 2 - position.z };
      if (handle === "in") point.handleOut = opposite;
      else point.handleIn = opposite;
    }
    return next;
  });

  const setSketchPointModes = (ids: string[], mode: "corner" | "smooth" | "autoSmooth" | "split") => setSketchProfile((profile) => {
    let next = cloneSketchProfile(profile);
    const selectedIds = new Set(ids);
    for (const id of selectedIds) {
    const point = next.points.find((candidate) => candidate.id === id);
    if (!point) continue;
    point.mode = mode;
    if (mode === "corner") {
      point.handleIn = undefined;
      point.handleOut = undefined;
      next.segments = next.segments.map((segment) => (segment.startId === id || segment.endId === id) && segment.kind !== "arc" ? { ...segment, kind: "line" as const } : segment);
    } else {
      const convertedIds = new Set(next.segments.filter((segment) => (segment.startId === id || segment.endId === id) && segment.kind !== "arc").map((segment) => segment.id));
      next.segments = next.segments.map((segment) => convertedIds.has(segment.id) ? { ...segment, kind: "bezier" as const } : segment);
      next.constraints = (next.constraints ?? []).filter((constraint) => ![...convertedIds].some((segmentId) => sketchConstraintUsesSegment(constraint, segmentId)));
      const points = new Map(next.points.map((candidate) => [candidate.id, candidate]));
      const incoming = next.segments.find((segment) => segment.endId === id);
      const outgoing = next.segments.find((segment) => segment.startId === id);
      const previous = incoming ? points.get(incoming.startId) : null;
      const following = outgoing ? points.get(outgoing.endId) : null;
      const tangent = previous && following
        ? { x: (following.x - previous.x) / 6, z: (following.z - previous.z) / 6 }
        : previous
          ? { x: (point.x - previous.x) / 6, z: (point.z - previous.z) / 6 }
          : following
            ? { x: (following.x - point.x) / 6, z: (following.z - point.z) / 6 }
            : { x: 0, z: 0 };
      point.handleIn = { x: point.x - tangent.x, z: point.z - tangent.z };
      point.handleOut = { x: point.x + tangent.x, z: point.z + tangent.z };
      for (const segment of next.segments.filter((candidate) => convertedIds.has(candidate.id))) {
        const other = points.get(segment.startId === id ? segment.endId : segment.startId);
        if (!other || selectedIds.has(other.id)) continue;
        const control = { x: other.x + (point.x - other.x) / 3, z: other.z + (point.z - other.z) / 3 };
        if (segment.startId === id) other.handleIn = control;
        else other.handleOut = control;
      }
      point.mode = mode;
    }
    }
    return next;
  });
  const setSketchPointMode = (id: string, mode: "corner" | "smooth" | "autoSmooth" | "split") => setSketchPointModes([id], mode);

  const selectedSketchPoints = sketchSession ? sketchSession.profile.points.filter((point) =>
    sketchSelection?.kind === "point" ? point.id === sketchSelection.id
      : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds.includes(point.id) : false) : [];
  const separableSketchPoints = selectedSketchPoints.filter((point) => sketchSession?.profile.segments.filter((segment) => segment.startId === point.id || segment.endId === point.id).length === 2);
  const separateSelectedSketchNodes = () => {
    const ids = new Set(separableSketchPoints.map((point) => point.id));
    const resultingIds: string[] = [];
    setSketchProfile((profile) => {
      const next = cloneSketchProfile(profile);
      const changedSegments = new Set<string>();
      for (const id of ids) {
        const point = next.points.find((candidate) => candidate.id === id);
        const incident = next.segments.filter((segment) => segment.startId === id || segment.endId === id);
        if (!point || incident.length !== 2) continue;
        const copy = { ...point, id: sketchEntityId("point"), mode: "split" as const, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined };
        // Each open end retains only the tangent used by its own edge.
        const retained = incident[0], detached = incident[1];
        point.mode = "split";
        if (retained.startId === id) point.handleIn = undefined;
        else point.handleOut = undefined;
        if (detached.startId === id) { copy.handleIn = undefined; detached.startId = copy.id; }
        else { copy.handleOut = undefined; detached.endId = copy.id; }
        next.points.push(copy);
        incident.forEach((segment) => changedSegments.add(segment.id));
        resultingIds.push(id, copy.id);
      }
      next.constraints = (next.constraints ?? []).filter((constraint) => {
        if ([...ids].some((id) => sketchConstraintUsesPoint(constraint, id))) return false;
        // Tangency/continuity constraints must not reconnect the two new ends.
        return !("kind" in constraint && constraint.kind.startsWith("tangent") && [...changedSegments].some((id) => sketchConstraintUsesSegment(constraint, id)));
      });
      return next;
    });
    setSketchSelection(resultingIds.length ? { kind: "multiple", pointIds: resultingIds, segmentIds: [] } : null);
    setSketchActivePointId(null);
  };
  const deleteSelectedSketchNodes = () => {
    const ids = new Set(selectedSketchPoints.map((point) => point.id));
    setSketchProfile((profile) => {
      const next = cloneSketchProfile(profile);
      const removedPoints = new Set<string>(), removedSegments = new Set<string>();
      for (const id of ids) {
        const incident = next.segments.filter((segment) => segment.startId === id || segment.endId === id);
        if (incident.length > 2) continue;
        let replacement: SketchProfile["segments"][number] | undefined;
        if (incident.length === 2) {
          const [first, second] = incident;
          const startId = first.startId === id ? first.endId : first.startId;
          const endId = second.startId === id ? second.endId : second.startId;
          if (startId !== endId) {
            const curved = incident.some((segment) => segment.kind === "bezier" || segment.kind === "smooth");
            replacement = { id: sketchEntityId("segment"), startId, endId, kind: curved ? "bezier" : "line", construction: incident.every((segment) => segment.construction) };
            const start = next.points.find((point) => point.id === startId), end = next.points.find((point) => point.id === endId);
            if (curved && start && end) {
              start.handleOut = (first.endId === startId ? start.handleIn : start.handleOut) ?? { x: start.x + (end.x - start.x) / 3, z: start.z + (end.z - start.z) / 3 };
              end.handleIn = (second.startId === endId ? end.handleOut : end.handleIn) ?? { x: end.x + (start.x - end.x) / 3, z: end.z + (start.z - end.z) / 3 };
            }
            if (first.kind === "arc" && second.kind === "arc" && first.center && second.center && Math.hypot(first.center.x - second.center.x, first.center.z - second.center.z) < 1e-7) {
              replacement = { ...replacement, kind: "arc", center: { ...first.center }, clockwise: first.startId === startId ? first.clockwise !== false : first.clockwise === false };
            }
          }
        }
        for (const segment of incident) removedSegments.add(segment.id);
        next.segments = next.segments.filter((segment) => !incident.includes(segment));
        if (replacement) next.segments.push(replacement);
        next.points = next.points.filter((point) => point.id !== id);
        removedPoints.add(id);
      }
      next.constraints = (next.constraints ?? []).filter((constraint) => ![...removedPoints].some((id) => sketchConstraintUsesPoint(constraint, id)) && ![...removedSegments].some((id) => sketchConstraintUsesSegment(constraint, id)));
      return next;
    });
    setSketchSelection(null);
    setSketchActivePointId(null);
  };
  const selectedPointMode = (mode: "corner" | "smooth" | "autoSmooth" | "split") => selectedSketchPoints.length > 0
    && selectedSketchPoints.every((point) => (point.mode ?? "corner") === mode);

  const mergeableSketchPointIds = useMemo(() => {
    if (!sketchSession || !sketchSelection) return [];
    const ids = sketchSelection.kind === "point" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.pointIds : [];
    return ids.filter((id) => sketchSession.profile.points.some((point) => point.id === id)
      && sketchSession.profile.segments.filter((segment) => segment.startId === id || segment.endId === id).length === 1);
  }, [sketchSelection, sketchSession]);

  const mergeSelectedSketchPoints = () => {
    if (!sketchSession || mergeableSketchPointIds.length !== 2) return;
    const incidentSegments = mergeableSketchPointIds.map((id) => sketchSession.profile.segments.find((segment) => segment.startId === id || segment.endId === id));
    if (!incidentSegments[0] || !incidentSegments[1] || incidentSegments[0].id === incidentSegments[1].id) {
      setNotice({ type: "error", text: t("notice.mergeDistinctEdges") });
      return;
    }
    const anchorId = mergeableSketchPointIds[0];
    setSketchProfile((profile) => {
      const next = cloneSketchProfile(profile);
      const selectedPoints = next.points.filter((point) => mergeableSketchPointIds.includes(point.id));
      if (selectedPoints.length < 2) return profile;
      const removedIds = new Set(selectedPoints.filter((point) => point.id !== anchorId).map((point) => point.id));
      const anchor = next.points.find((point) => point.id === anchorId);
      if (!anchor) return profile;
      anchor.x = selectedPoints.reduce((sum, point) => sum + point.x, 0) / selectedPoints.length;
      anchor.z = selectedPoints.reduce((sum, point) => sum + point.z, 0) / selectedPoints.length;
      const remap = (id: string) => removedIds.has(id) ? anchorId : id;
      next.points = next.points.filter((point) => !removedIds.has(point.id));
      next.segments = next.segments
        .map((segment) => ({ ...segment, startId: remap(segment.startId), endId: remap(segment.endId) }))
        .filter((segment) => segment.startId !== segment.endId);
      let joinedSegments = next.segments.filter((segment) => segment.startId === anchorId || segment.endId === anchorId);
      if (joinedSegments.length === 2 && (joinedSegments[0].startId === anchorId) === (joinedSegments[1].startId === anchorId)) {
        const reverseId = joinedSegments[1].id;
        next.segments = next.segments.map((segment) => segment.id !== reverseId ? segment : {
          ...segment,
          startId: segment.endId,
          endId: segment.startId,
          ...(segment.kind === "arc" ? { clockwise: segment.clockwise === false } : {}),
        });
        joinedSegments = next.segments.filter((segment) => segment.startId === anchorId || segment.endId === anchorId);
      }
      if (joinedSegments.length === 2 && joinedSegments.some((segment) => segment.kind !== "line" && segment.kind !== "arc")) {
        anchor.handleIn = undefined;
        anchor.handleOut = undefined;
        anchor.mode = "smooth";
        const smoothed = withSmoothSketchHandles(next);
        Object.assign(next, smoothed);
      } else {
        anchor.handleIn = undefined;
        anchor.handleOut = undefined;
        anchor.mode = "corner";
      }
      const validSegments = new Set(next.segments.map((segment) => segment.id));
      next.constraints = (next.constraints ?? []).flatMap((constraint): SketchConstraint[] => {
        let updated = constraint;
        if (constraint.kind === "coincident") {
          const pointIds = constraint.pointIds.map(remap) as [string, string];
          if (pointIds[0] === pointIds[1]) return [];
          updated = { ...constraint, pointIds };
        } else if (constraint.kind === "symmetric") updated = { ...constraint, pointIds: constraint.pointIds.map(remap) as [string, string] };
        else if (constraint.kind === "fixed" || constraint.kind === "midpoint" || constraint.kind === "pointOnObject" || constraint.kind === "pointOnCircle" || constraint.kind === "pointOnArc") updated = { ...constraint, pointId: remap(constraint.pointId) };
        if ("segmentId" in updated && !validSegments.has(updated.segmentId)) return [];
        if ("segmentIds" in updated && !updated.segmentIds.every((id) => validSegments.has(id))) return [];
        return [updated];
      });
      return solveSketchConstraints(next, anchorId);
    });
    setSketchSelection({ kind: "point", id: anchorId });
    setSketchActivePointId(null);
  };

  const deleteCurrentSketchSelection = () => {
    if (selectedSketchAnnotationId) {
      setSketchAnnotations((annotations) => { const index = annotations.findIndex((annotation) => annotation.id === selectedSketchAnnotationId); if (index >= 0) annotations.splice(index, 1); });
      setSelectedSketchAnnotationId(null); return true;
    }
    if (!sketchSelection) return false;
    const selectedPointIds = sketchSelection.kind === "point" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.pointIds : [];
    const pointIds = selectedPointIds.filter((id) => sketchSession?.profile.points.some((point) => point.id === id));
    const segmentIds = sketchSelection.kind === "segment" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.segmentIds : [];
    const imageIds = sketchSelection.kind === "image" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
    const circleIds = sketchSelection.kind === "circle" ? [sketchSelection.id] : sketchSelection.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
    if (!pointIds.length && !segmentIds.length && !imageIds.length && !circleIds.length) return false;
    setSketchProfile((profile) => ({
      ...profile,
      points: profile.points.filter((point) => !pointIds.includes(point.id)),
      segments: profile.segments.filter((segment) => !segmentIds.includes(segment.id) && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId)),
      circles: (profile.circles ?? []).filter((circle) => !circleIds.includes(circle.id)),
      images: (profile.images ?? []).filter((image) => !imageIds.includes(image.id)),
      constraints: (profile.constraints ?? []).filter((constraint) => {
        if ((constraint.kind === "radius" || constraint.kind === "diameter") && circleIds.includes(constraint.circleId)) return false;
        if ((constraint.kind === "concentric" || constraint.kind === "equalRadius") && constraint.circleIds.some((circleId) => circleIds.includes(circleId))) return false;
        if (circleIds.some((circleId) => sketchConstraintUsesPoint(constraint, circleSketchPointId(circleId, "center")) || sketchConstraintUsesPoint(constraint, circleSketchPointId(circleId, "radius")))) return false;
        if (pointIds.some((id) => sketchConstraintUsesPoint(constraint, id))) return false;
        if (profile.segments.some((segment) => (segmentIds.includes(segment.id) || pointIds.includes(segment.startId) || pointIds.includes(segment.endId)) && sketchConstraintUsesSegment(constraint, segment.id))) return false;
        if (constraint.kind === "angle") return constraint.segmentIds.every((segmentId) => {
          if (segmentIds.includes(segmentId)) return false;
          const segment = profile.segments.find((candidate) => candidate.id === segmentId);
          return Boolean(segment && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId));
        });
        if (constraint.kind !== "horizontal" && constraint.kind !== "vertical" && constraint.kind !== "distance") return true;
        if (segmentIds.includes(constraint.segmentId)) return false;
        const segment = profile.segments.find((candidate) => candidate.id === constraint.segmentId);
        return Boolean(segment && !pointIds.includes(segment.startId) && !pointIds.includes(segment.endId));
      }),
    }));
    setSketchActivePointId(null);
    setSketchSelection(null);
    return true;
  };

  const addExtrudeFromSketch = (sketch: SketchFeature, endSketch?: SketchFeature) => {
    for (const profile of endSketch ? [sketch, endSketch] : [sketch]) {
      if (profile.generatedPath) { setNotice({ type: "info", text: t("path.onlyPath") }); return; }
      if (profile.profile.shape !== "drawn") continue;
      const validation = validateDrawnSketchProfile(profile.profile.geometry);
      if (!validation.valid) { setNotice({ type: "error", text: `${t("notice.cannotExtrude")}: ${validation.diagnostics[0]?.message ?? t("notice.invalidProfile")}` }); return; }
    }
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createExtrudeFeature(sketch.id, draft.features.filter((candidate) => candidate.kind === "extrude").length + 1, false);
      feature.objectId = sketch.objectId;
      feature.endSketchId = endSketch?.id;
      feature.dependencies = (endSketch ? [sketch, endSketch] : [sketch]).map((profile) => ({ type: "feature" as const, id: profile.id }));
      if (endSketch) feature.name = `${t("operation.loft")} ${draft.features.filter((candidate) => candidate.kind === "extrude" && candidate.endSketchId).length + 1}`;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: t("notice.sketchExtruded") }); }
  };

  const createSweep = (path: SketchFeature, profile?: SketchFeature, face?: ParametricTopologyReference) => {
    if (profile?.generatedPath) { setNotice({ type: "info", text: t("path.onlyPath") }); return; }
    if (profile?.profile.shape === "drawn") {
      const validation = validateDrawnSketchProfile(profile.profile.geometry);
      if (!validation.valid) { setNotice({ type: "error", text: t("sweep.singleProfile") }); return; }
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const objectId = face?.objectId ?? profile?.objectId ?? path.objectId;
      if (!objectId || draft.objects.find((object) => object.id === objectId)?.locked) return;
      const feature = createExtrudeFeature(profile?.id ?? path.id, draft.features.filter((item) => item.kind === "extrude").length + 1, false);
      feature.objectId = objectId;
      feature.pathSketchId = path.id;
      feature.name = `${t("operation.sweep")} ${draft.features.filter((item) => item.kind === "extrude" && item.pathSketchId).length + 1}`;
      feature.dependencies = [{ type: "feature", id: path.id }, { type: "feature", id: profile?.id ?? face!.sourceFeatureId }];
      if (face) {
        const stored = { ...structuredClone(face), id: `${feature.id}:profile` };
        draft.topologyReferences.push(stored);
        feature.profileFaceReferenceId = stored.id;
      }
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setPendingSweepPathId(null);
      setSelectingTopologyFaces(false);
      setSelectedTopologyFaces([]);
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("sweep.created") });
    }
  };
  const beginSweep = () => {
    if (pendingSweepPathId) { setPendingSweepPathId(null); setSelectingTopologyFaces(false); setSelectedTopologyFaces([]); return; }
    setPendingEdgeTreatment(null); setPendingFaceExtrude(null); setPendingShell(null); setPendingRevolve(null);
    setEditingEdgeTreatmentId(null); setEditingFaceExtrudeId(null); setEditingShellId(null); setEditingRevolveId(null);
    setSelectingTopologyEdges(false); setSelectedTopologyEdges([]); setSelectedTopologyFaces([]);
    setPlacingWorkplane(false); setEditingMirrorPlaneId(null); setOriginEditObjectId(null);
    if (modelSelection.length === 1 && selectedSketches.length === 1) {
      const pair = adjacentSweepSketchPair(document, selectedSketches[0]);
      if (pair) {
        setSelectingTopologyFaces(false);
        createSweep(pair.path, pair.profile);
        return;
      }
      setPendingSweepPathId(selectedSketches[0].id);
      setSelectingTopologyFaces(true);
      setNotice({ type: "info", text: t("sweep.selectFace") });
      return;
    }
    const candidates = modelSelection.length === 2 && selectedSketches.length === 2
      ? selectedSketches
      : document.features.filter((item) => item.objectId === selectedObjectId && (item.kind !== "sketch" || item.purpose === "user")).slice(-2);
    const ordered = [...candidates].sort((a, b) => document.features.indexOf(a) - document.features.indexOf(b));
    if (ordered.length !== 2 || ordered[0].kind !== "sketch" || ordered[1].kind !== "sketch") {
      setNotice({ type: "info", text: t("sweep.chooseInputs") });
      return;
    }
    setSelectingTopologyFaces(false);
    createSweep(ordered[0], ordered[1]);
  };

  const addRevolveFromSketch = (sketch: SketchFeature) => {
    if (sketch.profile.shape !== "drawn") return;
    const validation = validateDrawnSketchProfile(sketch.profile.geometry);
    if (!validation.valid) { setNotice({ type: "error", text: `${t("notice.cannotRevolve")}: ${validation.diagnostics[0]?.message ?? t("notice.invalidProfile")}` }); return; }
    let featureId = "";
    const changed = mutate((draft) => {
      if (!sketch.objectId) return;
      const feature = createRevolveFeature(draft.features.filter((candidate) => candidate.kind === "revolve").length + 1, "add");
      feature.objectId = sketch.objectId;
      feature.source = "sketch";
      feature.sketchId = sketch.id;
      feature.faceReferenceId = undefined;
      const constructionAxes = sketch.profile.shape === "drawn"
        ? sketch.profile.geometry.segments.filter((segment) => segment.construction && (segment.kind === "line" || segment.kind === undefined))
        : [];
      feature.axis = constructionAxes.length === 1 ? "edge" : "y";
      feature.sketchAxisSegmentId = constructionAxes.length === 1 ? constructionAxes[0].id : undefined;
      feature.dependencies = [{ type: "feature", id: sketch.id }];
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) { setModelSelection([{ id: featureId, kind: "feature" }]); setNotice({ type: "ok", text: t("notice.sketchRevolved") }); }
  };
  const addMirrorOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createMirrorFeature(draft.features.filter((candidate) => candidate.kind === "mirror").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.mirrorCreated") });
    }
  };
  const addLinearPatternOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createLinearPatternFeature(draft.features.filter((candidate) => candidate.kind === "linearPattern").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.linearPatternCreated") });
    }
  };
  const addPolarPatternOperation = () => {
    if (!selectedObjectId) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const hasResult = draft.features.some((feature) => feature.objectId === selectedObjectId && feature.kind !== "sketch" && !feature.suppressed);
      if (!hasResult) return;
      const feature = createPolarPatternFeature(draft.features.filter((candidate) => candidate.kind === "polarPattern").length + 1);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.polarPatternCreated") });
    }
  };
  const addObjectBooleanOperation = () => {
    if (!selectedObjectId) return;
    const sourceObject = document.objects.find((object) => object.id !== selectedObjectId);
    if (!sourceObject) return;
    let featureId = "";
    const changed = mutate((draft) => {
      const feature = createObjectBooleanFeature(draft.features.filter((candidate) => candidate.kind === "objectBoolean").length + 1, sourceObject.id);
      feature.objectId = selectedObjectId;
      featureId = feature.id;
      draft.features.push(feature);
    });
    if (changed && featureId) {
      setModelSelection([{ id: featureId, kind: "feature" }]);
      setNotice({ type: "ok", text: t("notice.objectBooleanCreated") });
    }
  };
  const faceExtrudeHandle = useMemo(() => {
    const pendingReference = pendingFaceExtrude ? selectedTopologyFaces[0] : null;
    const selectedFeature = !pendingFaceExtrude && modelSelection.length === 1 && modelSelection[0]?.kind === "feature"
      ? document.features.find((feature) => feature.id === modelSelection[0]?.id && feature.kind === "faceExtrude")
      : null;
    const reference = pendingReference ?? (selectedFeature?.kind === "faceExtrude" ? document.topologyReferences.find((candidate) => candidate.id === selectedFeature.faceReferenceId) : null);
    const hint = reference?.reference.hint;
    if (!hint || hint.entityType !== "face" || !hint.centroid || !hint.normal) return null;
    return {
      origin: { x: hint.centroid[0], y: hint.centroid[1], z: hint.centroid[2] },
      normal: { x: hint.normal[0], y: hint.normal[1], z: hint.normal[2] },
      distance: pendingFaceExtrude?.distance ?? (selectedFeature?.kind === "faceExtrude" ? selectedFeature.distance : 0),
      taperAngle: pendingFaceExtrude?.taperAngle ?? (selectedFeature?.kind === "faceExtrude" ? selectedFeature.taperAngle : 0),
      operation: pendingFaceExtrude?.operation ?? (selectedFeature?.kind === "faceExtrude" ? selectedFeature.operation : "add" as const),
      featureId: selectedFeature?.kind === "faceExtrude" ? selectedFeature.id : null,
    };
  }, [document, modelSelection, pendingFaceExtrude, selectedTopologyFaces]);
  const revolveHandle = useMemo(() => {
    if ((selectedFeature?.kind !== "revolve" && selectedFeature?.kind !== "polarPattern" && !(selectedFeature?.kind === "primitive" && selectedFeature.primitive === "torus")) || !selectedFeature.objectId) return null;
    const object = document.objects.find((candidate) => candidate.id === selectedFeature.objectId);
    if (!object || object.visible === false) return null;
    if (selectedFeature.kind === "primitive") {
      const matrix = parametricTransformMatrix(object.transform).multiply(parametricTransformMatrix(selectedFeature.transform));
      const origin = new THREE.Vector3().applyMatrix4(matrix), axis = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
      const reference = new THREE.Vector3(1, 0, 0).transformDirection(matrix);
      const radius = new THREE.Vector3(selectedFeature.majorRadius ?? 12, 0, 0).applyMatrix4(matrix).distanceTo(origin);
      return { origin, axis, referenceDirection: reference, angle: selectedFeature.angle ?? 360, radius, minAngle: 0, maxAngle: 360 };
    }
    if (selectedFeature.kind === "polarPattern") {
      const placement = patternHandlePlacement(object, selectedFeature.axis, selectedFeature.center);
      return { origin: placement.origin, axis: placement.direction, angle: selectedFeature.angle, radius: 25 };
    }
    const objectMatrix = parametricTransformMatrix(object.transform);
    let origin = new THREE.Vector3().applyMatrix4(objectMatrix);
    let axis = new THREE.Vector3(selectedFeature.axis === "x" ? 1 : 0, selectedFeature.axis === "y" ? 1 : 0, selectedFeature.axis === "z" ? 1 : 0);
    if (selectedFeature.axis === "edge") {
      if (selectedFeature.source === "sketch" && selectedFeature.sketchId && selectedFeature.sketchAxisSegmentId) {
        const sketch = document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === selectedFeature.sketchId);
        if (sketch?.profile.shape === "drawn") {
          const segment = sketch.profile.geometry.segments.find((candidate) => candidate.id === selectedFeature.sketchAxisSegmentId);
          const start = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.startId) : null;
          const end = segment ? sketch.profile.geometry.points.find((point) => point.id === segment.endId) : null;
          if (start && end) {
            const sketchMatrix = objectMatrix.clone().multiply(parametricTransformMatrix({ position: { x: sketch.x, y: sketch.y, z: sketch.offset }, rotation: sketch.rotation }));
            origin = new THREE.Vector3(start.x, start.z, 0).applyMatrix4(sketchMatrix);
            axis = new THREE.Vector3(end.x - start.x, end.z - start.z, 0).transformDirection(sketchMatrix);
          }
        }
      } else if (selectedFeature.axisReferenceId) {
        const reference = document.topologyReferences.find((candidate) => candidate.id === selectedFeature.axisReferenceId);
        const hint = reference?.reference.hint;
        if (hint?.entityType === "edge" && hint.midpoint && hint.direction) {
          origin = new THREE.Vector3(...hint.midpoint);
          axis = new THREE.Vector3(...hint.direction);
        }
      }
    } else {
      axis.transformDirection(objectMatrix);
    }
    if (axis.lengthSq() < 1e-8) return null;
    const radius = Math.max(8, Math.min(40, Math.max(selectedBox?.width ?? 0, selectedBox?.depth ?? 0, selectedBox?.height ?? 0) * 0.6));
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, axis: { x: axis.x, y: axis.y, z: axis.z }, angle: selectedFeature.angle, radius };
  }, [document.features, document.objects, document.topologyReferences, selectedBox, selectedFeature]);
  const distanceHandle = useMemo(() => {
    if ((selectedFeature?.kind !== "shell" && selectedFeature?.kind !== "linearPattern") || !selectedFeature.objectId) return null;
    const object = document.objects.find((candidate) => candidate.id === selectedFeature.objectId);
    if (!object || object.visible === false) return null;
    if (selectedFeature.kind === "linearPattern") {
      return { ...patternHandlePlacement(object, selectedFeature.axis), value: selectedFeature.spacing, min: -1000, max: 1000, offset: 0 };
    }
    const reference = selectedFeature.faceReferenceIds
      .map((id) => document.topologyReferences.find((candidate) => candidate.id === id))
      .find((candidate) => candidate?.reference.hint.entityType === "face" && candidate.reference.hint.centroid && candidate.reference.hint.normal);
    const hint = reference?.reference.hint;
    if (!hint || hint.entityType !== "face" || !hint.centroid || !hint.normal) return null;
    return {
      origin: { x: hint.centroid[0], y: hint.centroid[1], z: hint.centroid[2] },
      direction: { x: -hint.normal[0], y: -hint.normal[1], z: -hint.normal[2] },
      value: selectedFeature.thickness,
    };
  }, [document.objects, document.topologyReferences, selectedFeature]);
  const selectedExtrudeProfileId = selectedFeature?.kind === "extrude" ? selectedFeature.sketchId : null;
  const selectedExtrudeProfile = selectedExtrudeProfileId
    ? document.features.find((feature) => feature.id === selectedExtrudeProfileId)
    : null;
  const isBoxOrCylinder = selectedExtrudeProfile?.kind === "sketch"
    && selectedExtrudeProfile.purpose !== "user"
    && (selectedExtrudeProfile.profile.shape === "rectangle" || selectedExtrudeProfile.profile.shape === "circle");
  const viewportFloatingFeature = !sketchSession && !pendingEdgeTreatment && !pendingFaceExtrude && !pendingShell && !pendingRevolve && !editingMirrorPlaneId && modelSelection.length === 1 && selectedFeature && selectedObjectVisible && (
    (selectedFeature.kind === "sketch" && selectedFeature.purpose === "user" && selectedFeature.profile.shape === "drawn")
    || selectedFeature.kind === "fillet"
    || selectedFeature.kind === "faceExtrude"
    || (selectedFeature.kind === "extrude" && !isBoxOrCylinder)
    || selectedFeature.kind === "revolve"
    || selectedFeature.kind === "shell"
    || selectedFeature.kind === "objectBoolean"
    || selectedFeature.kind === "mirror"
    || selectedFeature.kind === "linearPattern"
    || selectedFeature.kind === "polarPattern"
  ) ? selectedFeature : null;
  const patternSources = viewportFloatingFeature?.kind === "polarPattern"
    ? document.features.slice(0, document.features.findIndex((feature) => feature.id === viewportFloatingFeature.id)).filter((feature) => feature.objectId === viewportFloatingFeature.objectId && feature.kind !== "sketch")
    : [];
  const hasActiveWorkplane = !parametricWorkplaneIsGlobal(document.workplane);
  const beginMirrorPlaneSelection = (featureId: string) => {
    setEditingMirrorPlaneId(featureId);
    setPlacingWorkplane(false);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "info", text: t("notice.selectMirrorPlane") });
  };
  const toggleWorkplanePlacement = () => {
    setPlacingSection(false);
    if (hasActiveWorkplane) {
      mutate((draft) => { Object.assign(draft.workplane, globalParametricWorkplanePlacement()); });
      setPlacingWorkplane(false);
      setSelectingTopologyFaces(false);
      setSelectingTopologyEdges(false);
      setSelectedTopologyFaces([]);
      setSelectedTopologyEdges([]);
      setNotice({ type: "ok", text: t("notice.workplaneRestored") });
      return;
    }
    setPlacingWorkplane((current) => !current);
    setEditingMirrorPlaneId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setWorkplaneOpen(false);
    setNotice({ type: "info", text: placingWorkplane ? t("notice.placementCancelled") : t("notice.workplanePlaceHint") });
  };
  const updateGridSettings = (patch: Partial<Pick<ParametricDocument["workplane"], "width" | "depth" | "gridStep" | "sketchGridStep" | "snapSpacing" | "gridVisible">>) => {
    setWorkplaneDraft((current) => ({ ...current, ...patch }));
    mutate((draft) => { Object.assign(draft.workplane, patch); });
  };

  useEffect(() => {
    if (!originEditObjectId) return;
    const selectedObject = modelSelection.length === 1 && selectionKind === "object" && selectedId === originEditObjectId;
    const originAvailable = document.objects.some((object) => object.id === originEditObjectId && !object.locked);
    if (!selectedObject || !originAvailable) setOriginEditObjectId(null);
  }, [document.objects, modelSelection.length, originEditObjectId, selectedId, selectionKind]);

  useEffect(() => {
    if (modelSelection.length < 2) setAlignOpen(false);
  }, [modelSelection.length]);

  const toggleShapeMenu = () => {
    if (!shapesOpen) {
      const bounds = shapeMenuTriggerRef.current?.getBoundingClientRect();
      if (bounds) {
        const menuWidth = Math.min(264, window.innerWidth - 20);
        setShapeMenuPosition({
          top: bounds.bottom,
          left: Math.max(10, Math.min(bounds.left, window.innerWidth - menuWidth - 10)),
        });
      }
    }
    setShapesOpen((value) => !value);
  };

  const addPathShape = (kind: "spiral" | "helix") => {
    let featureId = "";
    mutate((draft) => {
      let object = draft.objects.find((item) => item.id === selectedObjectId && item.visible && !item.locked);
      if (!object) {
        const id = addParametricObject(draft, draft.workplane.origin);
        object = draft.objects.find((item) => item.id === id)!;
        const placement = objectPlacementForWorkplane(draft.workplane);
        object.transform.position = placement.position;
        object.transform.rotation = placement.rotation;
      }
      const count = draft.features.filter((item) => item.kind === "sketch" && item.generatedPath?.kind === kind).length + 1;
      const sketch = createDrawnSketchFeature(draft.features.filter((item) => item.kind === "sketch").length + 1);
      sketch.name = `${t(kind === "spiral" ? "path.spiral" : "path.helix")} ${count}`;
      sketch.objectId = object.id;
      const placement = operationPlacementForWorkplane(draft.workplane, object);
      sketch.x = placement.position.x; sketch.y = placement.position.y; sketch.offset = placement.position.z;
      sketch.rotation = placement.rotation;
      sketch.generatedPath = kind === "spiral"
        ? { kind: "spiral", spiralType: "archimedean", innerRadius: 3, outerRadius: 30, turns: 2, clockwise: false }
        : { kind: "helix", radius: 15, pitch: 10, turns: 3, clockwise: false };
      featureId = sketch.id;
      draft.features.push(sketch);
    });
    if (featureId) setModelSelection([{ id: featureId, kind: "feature" }]);
    setShapesOpen(false);
  };

  const addShape = (kind: SupportedPrimitive) => {
    let result: ReturnType<typeof addPrimitiveToSelection> = { objectId: "", featureId: null, createdObject: false };
    mutate((draft) => {
      result = addPrimitiveToSelection(draft, selectedObjectId, kind);
      const feature = draft.features.find((candidate) => candidate.id === result.featureId);
      if (feature) feature.name = localizedParametricOperationDefinition(kind, locale).name;
    });
    if (result.featureId) {
      setModelSelection([{ id: result.featureId, kind: "feature" }]);
    }
    setShapesOpen(false);
    setNotice({ type: "ok", text: `${localizedParametricOperationDefinition(kind, locale).name} ${result.createdObject ? t("notice.createdInNewObject") : t("notice.addedToActiveObject")}` });
  };

  const addText = () => {
    let result: ReturnType<typeof addParametricText> | null = null;
    const changed = mutate((draft) => { result = addParametricText(draft, selectedObjectId); });
    const completed = result as ReturnType<typeof addParametricText> | null;
    if (!changed || !completed) return;
    setModelSelection([{ id: completed.extrusionId, kind: "feature" }]);
    setShapesOpen(false);
    setNotice({ type: "ok", text: selectedObjectId ? t("notice.textAdded") : t("notice.textCreated") });
  };

  const removeSelected = useCallback(() => {
    if (!selectedObjectId) return;
    const ids = document.objects.map((object) => object.id);
    const index = ids.indexOf(selectedObjectId);
    if (!mutate((draft) => deleteParametricObject(draft, selectedObjectId))) return;
    const nextId = ids[index - 1] ?? ids[index + 1] ?? null;
    setModelSelection(nextId ? [{ id: nextId, kind: "object" }] : []);
  }, [document, mutate, selectedObjectId]);

  const pasteAnnotations = useCallback((sources: ParametricAnnotation[]) => {
    const copies = structuredClone(sources);
    const changed = mutate((draft) => {
      draft.annotations ??= [];
      for (const annotation of copies) {
        annotation.id = createLocalId("annotation");
        annotation.name = nextAnnotationName(draft.annotations, t(`annotation.${annotation.kind}`));
        draft.annotations.push(annotation);
      }
      draft.annotationGroup = { expanded: true, position: 0, ...draft.annotationGroup, visible: true };
    });
    if (!changed) return;
    setModelSelection([]);
    setAnnotationTool(null);
    setEditingAnnotationId(null);
    setAnnotationEndpoint(null);
    setSelectedAnnotationId(copies.length === 1 ? copies[0].id : ANNOTATIONS_GROUP_ID);
  }, [mutate, t]);

  const copyCurrentSelection = () => {
    const annotations = selectedAnnotationId === ANNOTATIONS_GROUP_ID
      ? document.annotations ?? [] : selectedAnnotation ? [selectedAnnotation] : [];
    if (annotations.length) {
      setAnnotationClipboard(structuredClone(annotations));
      setClipboardId(null);
    } else {
      setAnnotationClipboard(null);
      setClipboardId(selectedId);
      setNotice({ type: "info", text: selectionKind === "feature" ? uiText("ui.kercadparametriceditor.operation.copied.3dbb82", {}, locale) : t("notice.objectCopied") });
    }
  };

  const duplicateSelected = useCallback((sourceId?: string | null) => {
    if (!sourceId && selectedAnnotationId) {
      const annotations = selectedAnnotationId === ANNOTATIONS_GROUP_ID
        ? document.annotations ?? [] : document.annotations?.filter((item) => item.id === selectedAnnotationId) ?? [];
      if (annotations.length) pasteAnnotations(annotations);
      return;
    }
    if (sourceId) {
      let nextId: string | null = null;
      const sourceIsFeature = document.features.some((feature) => feature.id === sourceId);
      const changed = mutate((draft) => {
        nextId = sourceIsFeature
          ? duplicateParametricFeature(draft, sourceId, selectedObjectId ?? undefined)
          : duplicateParametricObject(draft, sourceId);
      });
      if (changed && nextId) {
        setModelSelection([{ id: nextId, kind: sourceIsFeature ? "feature" : "object" }]);
        setNotice({ type: "ok", text: t("notice.shapeDuplicated") });
      }
      return;
    }
    if (modelSelection.length === 0) return;
    let duplicated: ModelTreeSelection[] = [];
    const changed = mutate((draft) => { duplicated = duplicateParametricSelection(draft, modelSelection); });
    if (changed && duplicated.length > 0) {
      setModelSelection(duplicated);
      setNotice({ type: "ok", text: t("notice.shapeDuplicated") });
    }
  }, [document.features, document.annotations, modelSelection, mutate, selectedObjectId, selectedAnnotationId, pasteAnnotations]);

  const deleteFeature = useCallback((id: string) => {
    let result: ReturnType<typeof deleteParametricFeature> = { objectId: null, nextId: null };
    const deleted = mutate((draft) => {
      result = deleteParametricFeature(draft, id);
    });
    if (!deleted) return;
    const nextId = result.nextId ?? result.objectId;
    setModelSelection(nextId ? [{ id: nextId, kind: result.nextId && result.nextId !== result.objectId ? "feature" : "object" }] : []);
    setNotice({ type: "ok", text: t("notice.operationDeleted") });
  }, [mutate]);

  const deleteCurrentSelection = useCallback(() => {
    if (selectedAnnotationId === ANNOTATIONS_GROUP_ID) {
      if (!mutate((draft) => { draft.annotations = []; })) return;
      setSelectedAnnotationId(null);
      setEditingAnnotationId(null);
      setAnnotationTool(null);
      return;
    }
    if (selectedAnnotationId) {
      mutate((draft) => { draft.annotations = draft.annotations?.filter((annotation) => annotation.id !== selectedAnnotationId); });
      setSelectedAnnotationId(null);
      return;
    }
    if (modelSelection.length === 0) return;
    if (modelSelection.length === 1) {
      const item = modelSelection[0];
      if (item.kind === "feature") deleteFeature(item.id);
      else removeSelected();
      return;
    }
    if (!mutate((draft) => deleteParametricSelection(draft, modelSelection))) return;
    setModelSelection([]);
    setNotice({ type: "ok", text: `${modelSelection.length} ${t("notice.itemsDeleted")}` });
  }, [deleteFeature, modelSelection, mutate, removeSelected, selectedAnnotationId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (sketchSession) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) sketchRedo();
          else sketchUndo();
          return;
        }
        if (event.key === "Escape") { if (sketchAnnotationTool) setSketchAnnotationTool(null); else cancelSketch(); }
        if (event.key === "Delete" || event.key === "Backspace") {
          if (deleteCurrentSketchSelection()) event.preventDefault();
        }
        return;
      }
      if (event.key === "Escape") {
        setPlacingSection(false);
        setSectionSelected(false);
        setSelectedAnnotationId(null);
        setAlignOpen(false);
        setModelSelection([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedAnnotationId)) {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }
      if (!selectedObjectId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? snapAmount * 5 : snapAmount;
      const x = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const y = event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0;
      const plane = document.workplane;
      mutate((draft) => applyParametricSelectionWorldDelta(draft, selectedId!, selectionKind, {
        x: plane.xAxis.x * x + plane.yAxis.x * y,
        y: plane.xAxis.y * x + plane.yAxis.y * y,
        z: plane.xAxis.z * x + plane.yAxis.z * y,
      }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteCurrentSelection, document.workplane, mutate, selectedId, selectedAnnotationId, selectedObjectId, selectionKind, sketchSelection, sketchSession, selectedSketchAnnotationId, sketchAnnotationTool, snapAmount]);

  const [droppingToWorkplane, setDroppingToWorkplane] = useState(false);
  const dropWorkerRef = useRef<Worker | null>(null);
  useEffect(() => () => dropWorkerRef.current?.terminate(), []);
  const adjustAnnotationPoint = (action: "snap" | "drop") => {
    if (!selectedAnnotationPoint || !selectedAnnotationId) return;
    mutate((draft) => {
      const annotation = draft.annotations?.find((item) => item.id === selectedAnnotationId);
      if (!annotation) return;
      const point = annotationPosition(annotation, annotationEndpoint);
      if (!point) return;
      const plane = draft.workplane;
      const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
      const delta = new THREE.Vector3(point.x, point.y, point.z).sub(origin);
      const axes = [plane.xAxis, plane.yAxis, plane.normal].map((axis) => new THREE.Vector3(axis.x, axis.y, axis.z));
      const position = origin.clone();
      axes.forEach((axis, index) => {
        const coordinate = delta.dot(axis);
        position.addScaledVector(axis, action === "drop" && index === 2 ? 0 : action === "snap" && index < 2 ? Math.round(coordinate / plane.snapSpacing) * plane.snapSpacing : coordinate);
      });
      Object.assign(point, { x: position.x, y: position.y, z: position.z });
    });
  };
  const dropToWorkplane = async () => {
    if (selectedAnnotationPoint) { adjustAnnotationPoint("drop"); return; }
    if (droppingToWorkplane || kernelBusy || !modelSelection.length) return;
    const source = latestDocumentRef.current;
    setDroppingToWorkplane(true);
    const worker = new Worker(new URL("../workers/parametricDrop.worker.ts", import.meta.url), { type: "module" });
    dropWorkerRef.current = worker;
    try {
      const deltas = await new Promise<Array<{ id: string; kind: "object" | "feature"; delta: { x: number; y: number; z: number } }>>((resolve, reject) => {
        worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.deltas);
        worker.onerror = event => reject(new Error(event.message || uiText("notice.boundingBoxFailed", {}, locale)));
        worker.onmessageerror = () => reject(new Error(uiText("ui.kercadparametriceditor.could.not.receive.the.bounding.box.a6dd7a", {}, locale)));
        worker.postMessage({ document: structuredClone(source), selection: modelSelection });
      });
      if (latestDocumentRef.current !== source) throw new Error(uiText("ui.kercadparametriceditor.the.design.changed.run.drop.to.workplane.again.61b42c", {}, locale));
      if (deltas.length && !mutate(draft => { for (const item of deltas) applyParametricSelectionWorldDelta(draft, item.id, item.kind, item.delta); })) return;
      setNotice({ type: "ok", text: uiText("ui.kercadparametriceditor.selection.placed.on.the.workplane.545c8f", {}, locale) });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : uiText("ui.kercadparametriceditor.could.not.drop.the.selection.864b49", {}, locale) }); }
    finally { worker.terminate(); dropWorkerRef.current = null; setDroppingToWorkplane(false); }
  };

  const updateSelected = (patch: Partial<WorkplaneShape>) => {
    if (!selectedObjectId) return;
    mutate((draft) => applyWorkplanePatch(draft, selectedObjectId, patch));
  };

  const updateFeature = (id: string, update: (feature: ParametricFeature) => void) => {
    mutate((draft) => {
      const feature = draft.features.find((candidate) => candidate.id === id);
      if (feature) update(feature);
    });
  };

  const setSelectedOperationMode = (operation: "add" | "cut" | "intersect") => {
    if (!selectedOperationId || !selectedOperation || selectedOperation.operation === operation) return;
    if (operation !== "add" && !hasPreviousSolidOperation(document, selectedOperationId)) return;
    updateFeature(selectedOperationId, (feature) => {
      if (feature.kind === "extrude" || feature.kind === "primitive") feature.operation = operation;
    });
  };

  const updateObject = (id: string, update: (object: ParametricObject) => void) => {
    mutate((draft) => {
      const object = draft.objects.find((candidate) => candidate.id === id);
      if (object) {
        const previousTransform = structuredClone(object.transform);
        update(object);
        transformParametricObjectTopologyHints(draft, id, previousTransform);
      }
    });
  };

  const toggleOriginEdit = (objectId: string) => {
    if (originEditObjectId === objectId) {
      setOriginEditObjectId(null);
      return;
    }
    const object = document.objects.find((candidate) => candidate.id === objectId);
    if (!object || object.locked) return;
    setModelSelection([{ id: objectId, kind: "object" }]);
    setOriginEditObjectId(objectId);
  };

  const reorderSelection = (direction: "up" | "down") => {
    if (selectedAnnotation) {
      if (canReorderAnnotation(document, selectedAnnotation.id, direction)) mutate((draft) => { reorderAnnotation(draft, selectedAnnotation.id, direction); });
      return;
    }
    const nodes: ModelTreeSelection[] = selectedAnnotationId === ANNOTATIONS_GROUP_ID ? [{ id: ANNOTATIONS_GROUP_ID, kind: "object" }] : modelSelection;
    if (!canReorderParametricSelection(document, nodes, direction)) return;
    mutate((draft) => { reorderParametricSelection(draft, nodes, direction); });
  };

  const renameSelection = (name: string) => {
    if (!name.trim() || modelSelection.length === 0) return;
    mutate((draft) => { renameParametricSelection(draft, modelSelection, name); });
  };

  const resetSelectedFeature = (featureId: string) => {
    if (!mutate((draft) => resetParametricFeature(draft, featureId))) return;
    setNotice({ type: "ok", text: t("notice.operationReset") });
  };

  const alignSelection = (axis: ParametricAlignmentAxis, anchor: ParametricAlignmentAnchor) => {
    if (alignmentBusy) return;
    const referenceTarget = alignmentGroupTarget ?? alignmentTargets.find(item => alignmentReference && sameAlignmentItem(item, alignmentReference));
    if (!referenceTarget) return;
    const referenceId = referenceTarget.id;
    const value = (target: AlignmentTarget) => anchor === "center" ? (target.min[axis] + target.max[axis]) / 2 : target[anchor][axis];
    const moves = alignmentTargets.flatMap(target => {
      if (sameAlignmentItem(target, referenceTarget) || !target.movable) return [];
      const distance = value(referenceTarget) - value(target);
      return Math.abs(distance) < 1e-7 ? [] : [{ id: target.id, kind: target.kind, delta: { x: 0, y: 0, z: 0, [axis]: distance } }];
    });
    const moved = moves.length;
    if (moved) {
      const translated = translateAlignmentTargets(document, alignmentTargets, moves);
      if (!mutate(draft => {
        for (const move of moves) applyParametricSelectionWorldDelta(draft, move.id, move.kind, move.delta);
      })) return;
      if (translated) setAlignmentGeometry({ document: latestDocumentRef.current, groupKey: alignmentGroupKey, targets: translated });
    }
    const reference = document.objects.find((object) => object.id === referenceId)
      ?? document.features.find((feature) => feature.id === referenceId);
    setNotice(moved > 0
      ? { type: "ok", text: `${moved} ${t(moved === 1 ? "notice.alignedWithSingle" : "notice.alignedWith")} ${alignmentMode === "group" ? (uiText("ui.kercadparametriceditor.the.group.bd3846", {}, locale)) : reference?.name ?? t("notice.reference")}` }
      : { type: "info", text: t("notice.noMovableAlignment") });
  };

  const setCamera = (name: CameraView["name"]) => setView((current) => ({ name, token: current.token + 1 }));
  const undo = () => setHistory(undoParametricHistory);
  const redo = () => setHistory(redoParametricHistory);

  const newDocument = () => {
    const next = createEmptyDocument();
    localizeNewDocumentEntries({ ...next, objects: [], features: [] }, next, locale);
    next.name = uiText("notice.newDesign", {}, locale);
    setHistory(createParametricHistory(next));
    setModelSelection(next.objects[0] ? [{ id: next.objects[0].id, kind: "object" }] : []);
    setCamera("home");
    setNotice({ type: "info", text: t("notice.newDesign") });
    setNewDocumentOpen(false);
  };

  const openExportFromNewDocumentWarning = () => {
    setNewDocumentOpen(false);
    setExportFileName(document.name);
    setExportScope(exportSelectedObjectIds.length ? "selection" : "project");
    setExportOpen(true);
  };

  const beginEdgeTreatment = (treatment: "fillet" | "chamfer", featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "fillet") : null;
    const savedReferences = feature?.kind === "fillet"
      ? (feature.selectionReferenceIds ?? feature.edgeReferenceIds ?? []).map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference))
      : [];
    setPendingEdgeTreatment(treatment);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setModelSidebarMode("normal");
    setEdgeTreatmentRadius(feature?.kind === "fillet" ? feature.radius : 2);
    setEditingEdgeTreatmentId(featureId);
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(true);
    setSelectedTopologyFaces(savedReferences.filter((reference) => reference.reference.hint.entityType === "face"));
    setSelectedTopologyEdges(savedReferences.filter((reference) => reference.reference.hint.entityType === "edge"));
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: t("notice.topologyHint") });
  };

  const cancelEdgeTreatment = () => {
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setNotice({ type: "info", text: t("notice.temporaryCancelled") });
  };

  const acceptEdgeTreatment = () => {
    const selection = [...selectedTopologyFaces, ...selectedTopologyEdges];
    const objectIds = [...new Set(selection.map((reference) => reference.objectId))];
    if (!pendingEdgeTreatment || selection.length === 0 || objectIds.length !== 1) {
      setNotice({ type: "error", text: t("notice.selectTopologySameObject") });
      return;
    }
    let featureId = "";
    const created = mutate((draft) => {
      const existing = editingEdgeTreatmentId ? draft.features.find((candidate) => candidate.id === editingEdgeTreatmentId && candidate.kind === "fillet") : null;
      const feature = existing && existing.kind === "fillet" ? existing : createFilletFeature(draft.features.filter((candidate) => candidate.kind === "fillet").length + 1, pendingEdgeTreatment);
      const previousIds = new Set(feature.kind === "fillet" ? [...(feature.selectionReferenceIds ?? []), ...(feature.edgeReferenceIds ?? [])] : []);
      draft.topologyReferences = draft.topologyReferences.filter((reference) => !previousIds.has(reference.id));
      feature.treatment = pendingEdgeTreatment;
      feature.radius = Math.max(0.01, edgeTreatmentRadius);
      feature.objectId = objectIds[0];
      featureId = feature.id;
      const references = selection.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:selection:${index + 1}` }));
      feature.selectionReferenceIds = references.map((reference) => reference.id);
      feature.edgeReferenceIds = undefined;
      draft.topologyReferences.push(...references);
      if (!existing) draft.features.push(feature);
    });
    if (!created || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setNotice({ type: "ok", text: `${t(pendingEdgeTreatment === "chamfer" ? "operation.chamfer" : "operation.fillet")} ${t("notice.parametric")} ${t(editingEdgeTreatmentId ? "notice.updated" : "notice.added")} · ${selection.length} ${t(selection.length === 1 ? "notice.element" : "notice.elements")}` });
  };

  const beginFaceExtrude = (operation: "add" | "cut" = "add", featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "faceExtrude") : null;
    const saved = feature?.kind === "faceExtrude" ? document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId) : null;
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setPendingFaceExtrude({ operation: feature?.kind === "faceExtrude" ? feature.operation : operation, distance: feature?.kind === "faceExtrude" ? feature.distance : 10, taperAngle: feature?.kind === "faceExtrude" ? feature.taperAngle ?? 0 : 0 });
    setEditingFaceExtrudeId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces(saved ? [saved] : []);
    setSelectedTopologyEdges([]);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: t("notice.selectPlanarFaceExtrude") });
  };

  const cancelFaceExtrude = () => {
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: t("notice.faceExtrudeCancelled") });
  };

  const acceptFaceExtrude = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingFaceExtrude || !reference) {
      setNotice({ type: "error", text: t("notice.selectPlanarFace") });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingFaceExtrudeId ? draft.features.find((candidate) => candidate.id === editingFaceExtrudeId && candidate.kind === "faceExtrude") : null;
      const feature = existing?.kind === "faceExtrude" ? existing : createFaceExtrudeFeature(draft.features.filter((candidate) => candidate.kind === "faceExtrude").length + 1, pendingFaceExtrude.operation);
      if (existing?.kind === "faceExtrude") draft.topologyReferences = draft.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId);
      feature.objectId = reference.objectId;
      feature.operation = pendingFaceExtrude.operation;
      feature.distance = Math.max(0.01, pendingFaceExtrude.distance);
      feature.taperAngle = pendingFaceExtrude.taperAngle;
      featureId = feature.id;
      const stored = { ...structuredClone(reference), id: `${feature.id}:face` };
      feature.faceReferenceId = stored.id;
      draft.topologyReferences.push(stored);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "ok", text: `${t(pendingFaceExtrude.operation === "cut" ? "operation.facePocket" : "operation.faceExtrude")} ${t(editingFaceExtrudeId ? "notice.updated" : "notice.added")}` });
  };

  const beginShell = (featureId: string | null = null) => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "shell") : null;
    const saved = feature?.kind === "shell" ? feature.faceReferenceIds.map((id) => document.topologyReferences.find((reference) => reference.id === id)).filter((reference): reference is ParametricTopologyReference => Boolean(reference)) : [];
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setPendingShell({ thickness: feature?.kind === "shell" ? feature.thickness : 2, cornerType: feature?.kind === "shell" ? feature.cornerType ?? "rounded" : "rounded" });
    setEditingShellId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(true);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces(saved);
    setSelectedTopologyEdges([]);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: t("notice.selectOpenFaces") });
  };

  const cancelShell = () => {
    setPendingShell(null);
    setEditingShellId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "info", text: t("notice.temporaryCancelled") });
  };

  const acceptShell = () => {
    if (!pendingShell || selectedTopologyFaces.length === 0 || new Set(selectedTopologyFaces.map((reference) => reference.objectId)).size !== 1) {
      setNotice({ type: "error", text: t("notice.selectFacesSameObject") });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingShellId ? draft.features.find((candidate) => candidate.id === editingShellId && candidate.kind === "shell") : null;
      const feature = existing?.kind === "shell" ? existing : createShellFeature(draft.features.filter((candidate) => candidate.kind === "shell").length + 1);
      if (existing?.kind === "shell") draft.topologyReferences = draft.topologyReferences.filter((reference) => !existing.faceReferenceIds.includes(reference.id));
      const stored = selectedTopologyFaces.map((reference, index) => ({ ...structuredClone(reference), id: `${feature.id}:face:${index + 1}` }));
      feature.objectId = selectedTopologyFaces[0].objectId;
      feature.thickness = Math.max(0.01, pendingShell.thickness);
      feature.cornerType = pendingShell.cornerType;
      feature.faceReferenceIds = stored.map((reference) => reference.id);
      featureId = feature.id;
      draft.topologyReferences.push(...stored);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingShell(null);
    setEditingShellId(null);
    setSelectingTopologyFaces(false);
    setSelectedTopologyFaces([]);
    setNotice({ type: "ok", text: `${t("toolbar.shell")} ${t(editingShellId ? "notice.updated" : "notice.added")}` });
  };

  const beginRevolve = (featureId: string | null = null, target: "face" | "axis" | "both" = "both") => {
    const feature = featureId ? document.features.find((candidate) => candidate.id === featureId && candidate.kind === "revolve") : null;
    const saved = feature?.kind === "revolve" ? document.topologyReferences.find((reference) => reference.id === feature.faceReferenceId) : null;
    const savedAxis = feature?.kind === "revolve" && feature.axisReferenceId ? document.topologyReferences.find((reference) => reference.id === feature.axisReferenceId) : null;
    setPendingEdgeTreatment(null);
    setEditingEdgeTreatmentId(null);
    setPendingFaceExtrude(null);
    setEditingFaceExtrudeId(null);
    setPendingShell(null);
    setEditingShellId(null);
    setPendingRevolve({ operation: feature?.kind === "revolve" ? feature.operation : "add", angle: feature?.kind === "revolve" ? feature.angle : 360, axis: target === "axis" ? "edge" : feature?.kind === "revolve" ? feature.axis : "edge" });
    setEditingRevolveId(featureId);
    setModelSidebarMode("normal");
    setSelectingTopologyFaces(target !== "axis");
    setSelectingTopologyEdges(target !== "face");
    setSelectedTopologyFaces(saved ? [saved] : []);
    setSelectedTopologyEdges(savedAxis ? [savedAxis] : []);
    setPlacingWorkplane(false);
    setOriginEditObjectId(null);
    setNotice({ type: "info", text: t(target === "axis" ? "notice.selectRevolveAxis" : "notice.selectPlanarFaceRevolve") });
  };

  const beginRevolveAxisEdit = (featureId: string) => {
    const revolve = document.features.find((candidate): candidate is RevolveFeature => candidate.id === featureId && candidate.kind === "revolve");
    const sketch = revolve?.kind === "revolve" && revolve.source === "sketch"
      ? document.features.find((candidate): candidate is SketchFeature => candidate.kind === "sketch" && candidate.id === revolve.sketchId && candidate.profile.shape === "drawn")
      : null;
    if (!revolve || revolve.source !== "sketch" || !sketch || sketch.profile.shape !== "drawn") {
      beginRevolve(featureId, "axis");
      return;
    }
    const profile = cloneSketchProfile(sketch.profile.geometry);
    const annotations = structuredClone(sketch.annotations ?? []);
    setSketchSession({ featureId: sketch.id, objectId: sketch.objectId ?? null, profile, annotations, mode: "sketch", revolveAxisFeatureId: revolve.id });
    sketchAnnotationHistoryRef.current = [annotations]; setSketchAnnotationTool(null); setSelectedSketchAnnotationId(null);
    sketchHistoryRef.current = [cloneSketchProfile(profile)];
    sketchHistoryIndexRef.current = 0;
    setSketchHistoryIndex(0);
    setSketchTool("select");
    setSketchActivePointId(null);
    setSketchSelection(revolve.sketchAxisSegmentId ? { kind: "segment", id: revolve.sketchAxisSegmentId } : null);
    setSketchMeasurement(null);
    setSketchMeasureStart(null);
    setModelSidebarMode("hidden");
    setNotice({ type: "info", text: uiText("ui.kercadparametriceditor.select.a.straight.sketch.edge.and.accept.6a9434", {}, locale) });
  };

  const cancelRevolve = () => {
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "info", text: t("notice.revolveCancelled") });
  };

  const acceptRevolve = () => {
    const reference = selectedTopologyFaces[0];
    if (!pendingRevolve || !reference || (pendingRevolve.axis === "edge" && selectedTopologyEdges.length !== 1)) {
      setNotice({ type: "error", text: t(pendingRevolve?.axis === "edge" ? "notice.selectPlanarFaceAndAxis" : "notice.selectPlanarFace") });
      return;
    }
    let featureId = "";
    const changed = mutate((draft) => {
      const existing = editingRevolveId ? draft.features.find((candidate) => candidate.id === editingRevolveId && candidate.kind === "revolve") : null;
      const feature = existing?.kind === "revolve" ? existing : createRevolveFeature(draft.features.filter((candidate) => candidate.kind === "revolve").length + 1, pendingRevolve.operation);
      if (existing?.kind === "revolve") draft.topologyReferences = draft.topologyReferences.filter((candidate) => candidate.id !== existing.faceReferenceId && candidate.id !== existing.axisReferenceId);
      feature.objectId = reference.objectId;
      feature.source = "face";
      feature.operation = pendingRevolve.operation;
      feature.angle = Math.abs(pendingRevolve.angle) < 1 ? (pendingRevolve.angle < 0 ? -1 : 1) : Math.min(360, Math.max(-360, pendingRevolve.angle));
      feature.axis = pendingRevolve.axis;
      featureId = feature.id;
      const stored = { ...structuredClone(reference), id: `${feature.id}:face` };
      const storedAxis = pendingRevolve.axis === "edge" && selectedTopologyEdges[0] ? { ...structuredClone(selectedTopologyEdges[0]), id: `${feature.id}:axis` } : null;
      feature.faceReferenceId = stored.id;
      draft.topologyReferences.push(stored);
      feature.axisReferenceId = storedAxis?.id;
      if (storedAxis) draft.topologyReferences.push(storedAxis);
      if (!existing) draft.features.push(feature);
    });
    if (!changed || !featureId) return;
    setModelSelection([{ id: featureId, kind: "feature" }]);
    setPendingRevolve(null);
    setEditingRevolveId(null);
    setSelectingTopologyFaces(false);
    setSelectingTopologyEdges(false);
    setSelectedTopologyFaces([]);
    setSelectedTopologyEdges([]);
    setNotice({ type: "ok", text: `${t("operation.revolve")} ${t(editingRevolveId ? "notice.updatedFeminine" : "notice.addedFeminine")}` });
  };

  const selectTopologyFace = (face: TopologyFacePick) => {
    if ((pendingSweepPathId || pendingFaceExtrude || pendingRevolve) && !face.planar) {
      setNotice({ type: "error", text: pendingRevolve ? t("notice.revolvePlanar") : t("notice.faceExtrudePlanar") });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === face.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, face.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-face-${face.key}`,
      name: `${uiText("ui.kercadparametriceditor.face.of.3c8b36", {}, locale)} ${source.name}`,
      objectId: face.objectId,
      sourceFeatureId: source.id,
      reference: {
        origin: `${source.id}:result`,
        role: `planar:${face.key}`,
        hint: {
          entityType: "face",
          ...(face.faceId === undefined ? { surfaceType: "plane" } : {}),
          normal: [face.normal.x, face.normal.y, face.normal.z],
          centroid: [face.centroid.x, face.centroid.y, face.centroid.z],
          area: face.area,
          ...(face.faceId === undefined ? {} : { topologyId: face.faceId, originId: face.origin }),
        },
      },
    };
    if (pendingSweepPathId) {
      const path = document.features.find((item): item is SketchFeature => item.kind === "sketch" && item.id === pendingSweepPathId);
      if (path) createSweep(path, undefined, reference);
      return;
    }
    if (pendingRevolve) {
      setSelectedTopologyFaces(face.selected ? [reference] : []);
      if (face.selected && pendingRevolve.axis === "edge" && selectedTopologyEdges.length !== 1) setSelectingTopologyEdges(true);
      setNotice({ type: "info", text: t(!face.selected ? "notice.selectPlanarFaceRevolve" : pendingRevolve.axis === "edge" && selectedTopologyEdges.length !== 1 ? "notice.selectRevolveAxis" : "notice.revolveReady") });
      return;
    }
    if (!face.additive) setSelectedTopologyEdges([]);
    setSelectedTopologyFaces((current) => {
      if (!face.additive) return face.selected ? [reference] : [];
      if (!face.selected) return current.filter((candidate) => !parametricTopologySelectionsMatch(candidate, reference));
      return current.some((candidate) => parametricTopologySelectionsMatch(candidate, reference)) ? current : [...current, reference];
    });
  };

  const selectTopologyEdge = (edge: TopologyEdgePick) => {
    if (pendingRevolve && !edge.straight) {
      setNotice({ type: "error", text: t("notice.revolveStraightAxis") });
      return;
    }
    const objectOperations = document.features.filter((feature) => feature.objectId === edge.objectId && feature.kind !== "sketch");
    const editingFeatureId = editingEdgeTreatmentId ?? editingFaceExtrudeId ?? editingShellId ?? editingRevolveId;
    const editingIndex = editingFeatureId ? objectOperations.findIndex((feature) => feature.id === editingFeatureId) : -1;
    const source = editingIndex >= 0 ? objectOperations[editingIndex - 1] ?? null : lastOperationForObject(document, edge.objectId);
    if (!source) return;
    const reference: ParametricTopologyReference = {
      id: `selected-edge-${edge.key}`,
      name: `${uiText("ui.kercadparametriceditor.edge.of.1e9c73", {}, locale)} ${source.name}`,
      objectId: edge.objectId,
      sourceFeatureId: source.id,
      reference: {
        origin: `${source.id}:result`,
        faceRoles: [`edge:${edge.edgeId}:side-a`, `edge:${edge.edgeId}:side-b`],
        hint: {
          entityType: "edge",
          length: edge.length,
          midpoint: [edge.midpoint.x, edge.midpoint.y, edge.midpoint.z],
          direction: [edge.direction.x, edge.direction.y, edge.direction.z],
          topologyId: edge.edgeId,
        },
      },
    };
    if (pendingRevolve) {
      setSelectedTopologyEdges(edge.selected ? [reference] : []);
      if (edge.selected) setPendingRevolve((current) => current ? { ...current, axis: "edge" } : current);
      setNotice({ type: "info", text: t(selectedTopologyFaces.length !== 1 ? "notice.selectPlanarFaceRevolve" : !edge.selected ? "notice.selectRevolveAxis" : "notice.revolveReady") });
      return;
    }
    if (!edge.additive) setSelectedTopologyFaces([]);
    setSelectedTopologyEdges((current) => {
      if (!edge.additive) return edge.selected ? [reference] : [];
      if (!edge.selected) return current.filter((candidate) => !parametricTopologySelectionsMatch(candidate, reference));
      return current.some((candidate) => parametricTopologySelectionsMatch(candidate, reference)) ? current : [...current, reference];
    });
  };

  const exportProject = async () => {
    setProjectExporting(true);
    try {
      const saved = structuredClone(latestDocumentRef.current);
      if (sharedAuthor.trim()) {
        saved.creator = saved.creator || saved.author || sharedAuthor.trim();
        saved.author = sharedAuthor.trim();
      }
      const bytes = await exportKercadProject(saved, [], 6, latestProjectThumbnailRef.current);
      const archive = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      downloadBlob(new Blob([archive], { type: KERCAD_PACKAGE_MEDIA_TYPE }), `${fileName(exportFileName)}.kercad`);
      commit(saved);
      setNotice({ type: "ok", text: t("notice.projectSaved") });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.saveFailed") });
    } finally {
      setProjectExporting(false);
    }
  };

  const exportStep = async () => {
    setExporting(true);
    try {
      downloadBlob(await exportParametricStep(document, exportObjectIds), `${fileName(exportFileName)}.step`);
      setNotice({ type: "ok", text: t("notice.stepExported") });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const exportStl = async () => {
    setStlExporting(true);
    try {
      const meshes = await buildParametricStlMeshes(document, stlQuality, stlExportScope === "selection" ? exportSelectedObjectIds : undefined);
      if (meshes.length === 0) {
        setNotice({ type: "error", text: t("notice.noObjectsToExport") });
        return;
      }
      const buffer = binaryStlFromRenderMeshes(meshes, exportFileName);
      downloadBlob(new Blob([buffer], { type: "model/stl" }), `${fileName(exportFileName)}.stl`);
      setNotice({ type: "ok", text: `${t("notice.binaryStlExported")} · ${meshes.length} ${t(meshes.length === 1 ? "dialog.object" : "dialog.objects")}` });
      setExportOpen(false);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.stlExportFailed") });
    } finally {
      setStlExporting(false);
    }
  };

  const importProject = async (file: File) => {
    try {
      const packagedByName = PROJECT_FILE_PATTERN.test(file.name);
      if (packagedByName ? file.size > KERCAD_PACKAGE_LIMITS.archiveBytes : file.size > KERCAD_PACKAGE_LIMITS.projectBytes) throw new Error(t(packagedByName ? "notice.archiveTooLarge" : "notice.documentTooLarge"));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const packaged = PROJECT_FILE_PATTERN.test(file.name) || bytes[0] === 0x50 && bytes[1] === 0x4b;
      let normalized: ParametricDocument;
      let assetCount = 0;
      if (packaged) {
        const restored = await importKercadProject(bytes);
        normalized = restored.document;
        assetCount = restored.assets.length;
      } else {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (!validateDocument(parsed)) throw new Error(t("notice.incompatibleProject"));
        normalized = normalizeParametricDocument(parsed);
      }
      setPendingProjectImport({ document: normalized, assetCount, fileName: file.name });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.openFailed") });
    }
  };

  const openPendingProject = () => {
    if (!pendingProjectImport) return;
    const opened = pendingProjectImport.document;
    setHistory(createParametricHistory(opened));
    setModelSelection(opened.objects[0] ? [{ id: opened.objects[0].id, kind: "object" }] : []);
    setNotice({ type: "ok", text: pendingProjectImport.assetCount ? `${t("notice.projectOpened")} · ${pendingProjectImport.assetCount} ${t(pendingProjectImport.assetCount === 1 ? "notice.resource" : "notice.resources")}` : t("notice.projectOpened") });
    setPendingProjectImport(null);
  };

  const mergePendingProject = () => {
    if (!pendingProjectImport) return;
    try {
      const merged = mergeParametricProjects(document, pendingProjectImport.document);
      commit(merged.document);
      setModelSelection(merged.importedObjectIds.map((id) => ({ id, kind: "object" as const })));
      setNotice({ type: "ok", text: `${merged.importedObjectIds.length} ${t(merged.importedObjectIds.length === 1 ? "notice.projectAddedSingle" : "notice.projectAdded")}` });
      setPendingProjectImport(null);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.addProjectFailed") });
    }
  };

  const importManagedFile = async (file: File) => {
    if (/\.(?:jpe?g|png)$/i.test(file.name)) {
      try {
        const temporary = cloneDocument(latestDocumentRef.current);
        const id = await importReferenceImage(temporary, file);
        const imported = temporary.objects.find((object) => object.id === id)!;
        const next = cloneDocument(latestDocumentRef.current);
        Object.assign(imported.transform, objectPlacementForWorkplane(next.workplane));
        next.objects.push(imported);
        commit(next);
        setModelSelection([{ id, kind: "object" }]);
        setNotice({ type: "ok", text: uiText("ui.kercadparametriceditor.reference.image.imported.8b70b9", {}, locale) });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.referenceImportFailed") });
      }
      return;
    }
    if (/\.(?:stl|obj)$/i.test(file.name)) {
      try {
        assertImportByteLimit("reference", file.size);
        const draft = cloneDocument(document);
        const objectId = importReferenceMesh(draft, file.name, await file.arrayBuffer());
        commit(draft);
        setModelSelection([{ id: objectId, kind: "object" }]);
        setNotice({ type: "ok", text: `${file.name.toLowerCase().endsWith(".obj") ? uiText("ui.legacyworkplaneeditor.obj.2f1e50", {}, locale) : uiText("ui.legacyworkplaneeditor.stl.735c11", {}, locale)} ${t("notice.referenceImported")}` });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.referenceImportFailed") });
      }
      return;
    }
    if (/\.(?:step|stp)$/i.test(file.name)) {
      try {
        assertImportByteLimit("STEP", file.size);
        setNotice({ type: "info", text: t("notice.importingStep") });
        const draft = cloneDocument(document);
        const imported = await importStepAsParametricObject(draft, file.name, await file.arrayBuffer());
        commit(draft);
        setModelSelection([{ id: imported.featureId, kind: "feature" }]);
        setNotice({ type: "ok", text: t("notice.stepImported") });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.stepImportFailed") });
      }
      return;
    }
    if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
      try {
        assertImportByteLimit("SVG", file.size);
        const awaitSource = await file.text();
        let result: ReturnType<typeof importSvgAsParametricExtrusion> | null = null;
        const changed = mutate((draft) => { result = importSvgAsParametricExtrusion(draft, awaitSource, file.name, selectedObjectId); });
        const completed = result as ReturnType<typeof importSvgAsParametricExtrusion> | null;
        if (!changed || !completed) return;
        setModelSelection([{ id: completed.extrusionId, kind: "feature" }]);
        setNotice({ type: "ok", text: `${t("notice.svgImported")} · ${completed.segmentCount} ${t("notice.segments")} · ${completed.circleCount} ${t("notice.circles")}` });
      } catch (error) {
        setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.svgImportFailed") });
      }
      return;
    }
    await importProject(file);
  };

  if (!hydrated) {
    return <main className="kercad-reference-shell" aria-busy="true"><ProjectLoadingDialog key="project-loading" projectName={document.name} locale={locale} ready={false} progress={initialLoadProgress} onFinished={finishProjectLoading} /></main>;
  }

  return (
    <main inert={showProjectLoading || undefined} aria-busy={showProjectLoading || undefined} className={`kercad-reference-shell sidebar-${modelSidebarMode} ${sketchSession && compactSketchToolbar ? "sketch-toolbar-compact" : ""}`}>
      {showProjectLoading && <ProjectLoadingDialog key="project-loading" projectName={document.name} locale={locale} ready={initialModelSettled} progress={initialLoadProgress} onFinished={finishProjectLoading} />}
      {hydrated && <EditorGettingStarted locale={locale} active={!showProjectLoading && !sketchSession && !challengeEditor} launchRequest={tutorialLaunchRequest} onShowProperties={() => setModelSidebarMode("normal")} />}
      {hydrated && <EditorGettingStarted locale={locale} mode="sketch" active={Boolean(sketchSession) && !challengeEditor} launchRequest={tutorialLaunchRequest} />}
      <div className="secondary-toolbar">
        <div className="toolbar-workspace-tabs kercad-toolbar-titlebar">
          <EditorHeaderActions locale={locale} onLocaleChange={setLocale} onLaunchTutorial={!challengeEditor ? () => { resetStartupTutorials(); setTutorialLaunchRequest((request) => request + 1); } : undefined} />
          {sketchSession ? <div className="kercad-sketch-header-actions"><button className="kercad-toolbar-brand kercad-toolbar-brand-button" type="button" onClick={acceptSketch}><ChevronLeft size={20} aria-hidden="true" />{t("sketch.accept")}</button><button className="kercad-toolbar-brand kercad-toolbar-brand-button" type="button" onClick={cancelSketch}>{t("common.cancel")}</button></div> : onExitToProjects ? <button className="kercad-toolbar-brand kercad-toolbar-brand-button" type="button" onClick={() => onExitToProjects(latestDocumentRef.current)} title={uiText("ui.kercadparametriceditor.back.to.projects.055981", {}, locale)}><ChevronLeft size={20} aria-hidden="true" />{uiText("dashboard.projects.53e890", {}, locale)}</button> : null}
          <div className="kercad-project-name"><div className="kercad-editor-brand"><DashboardBrandLogo /><strong>{uiText("ui.page.kercad.c0bf6d", {}, locale)}</strong></div><span aria-hidden="true">-</span><button type="button" className="kercad-project-rename-trigger" onClick={openProjectRename} title={uiText("dashboard.rename.project.633018", {}, locale)}>{document.name}</button>{sketchSession ? <strong className="kercad-sketcher-badge">{uiText("ui.kercadparametriceditor.sketcher.44752f", {}, locale)}</strong> : null}</div>
        </div>
        {sketchSession ? <div ref={toolbarScrollRef} className="sketch-toolbar-ribbon kercad-parametric-sketch-toolbar" aria-label={t("sketch.tools")}>
          <ToolbarSection label={t("sketch.history")}>
            <Tool label={t("sketch.undo")} enabled={sketchHistoryIndex > 0} onClick={sketchUndo}><ToolbarUndoIcon /></Tool>
            <Tool label={t("sketch.redo")} enabled={sketchHistoryIndex >= 0 && sketchHistoryIndex < sketchHistoryRef.current.length - 1} onClick={sketchRedo}><ToolbarRedoIcon /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("toolbar.clipboard")}>
            <Tool label={t("toolbar.copy")} enabled={Boolean(sketchCopyableSelection || selectedSketchAnnotation)} onClick={copyCurrentSketchSelection}><ToolbarCopyIcon /></Tool>
            <Tool label={t("toolbar.paste")} enabled={Boolean(sketchClipboard || sketchAnnotationClipboard)} onClick={() => { if (sketchAnnotationClipboard) pasteSketchAnnotation(sketchAnnotationClipboard); else if (sketchClipboard) pasteSketchGeometry(sketchClipboard, ++sketchPasteCountRef.current); }}><ToolbarPasteIcon /></Tool>
            <Tool label={t("toolbar.duplicate")} enabled={Boolean(sketchCopyableSelection || selectedSketchAnnotation)} onClick={() => { if (selectedSketchAnnotation) pasteSketchAnnotation(selectedSketchAnnotation); else if (sketchCopyableSelection) pasteSketchGeometry(sketchCopyableSelection); }}><ToolbarDuplicateIcon /></Tool>
            <Tool label={sketchSelection || selectedSketchAnnotation ? t("sketch.eraseSelection") : t("sketch.erase")} active={!sketchSelection && !selectedSketchAnnotation && sketchTool === "erase"} onClick={() => { if (!deleteCurrentSketchSelection()) chooseSketchTool("erase"); }}><ToolbarTrashIcon /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.select")}>
            <Tool label={t("sketch.select")} active={sketchTool === "select"} onClick={() => chooseSketchTool("select")}><SketchToolbarIcon file="select" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.draw")} className="sketch-draw-section">
            <Tool label={t("sketch.line")} active={sketchTool === "line"} onClick={() => chooseSketchTool("line")}><SketchToolbarIcon file="line" /></Tool>
            <Tool label={t("sketch.bezier")} active={sketchTool === "bezier"} onClick={() => chooseSketchTool("bezier")}><SketchToolbarIcon file="bezier" /></Tool>
            <SketchToolMenu initialTool="rectangle" activeTool={sketchTool} onChoose={chooseSketchTool} options={[
              { tool: "rectangle", label: t("sketch.rectangle"), icon: "rectangle" },
              { tool: "centerRectangle", label: t("sketch.centerRectangle"), icon: "center-rectangle" },
              { tool: "roundedRectangle", label: t("sketch.roundedRectangle"), icon: "rounded-rectangle" },
              { tool: "circle", label: t("sketch.circle"), icon: "circle" },
              { tool: "arc", label: t("sketch.centerArc"), icon: "center-arc" },
              { tool: "ellipse", label: t("cylinder.ellipse"), icon: "ellipse" },
            ]} />
            <button ref={polygonMenuTriggerRef} type="button" className={`toolbar-icon ${sketchTool === "polygon" ? "active" : ""}`} aria-label={t("sketch.polygonType")} title={t("sketch.polygonType")} aria-expanded={Boolean(polygonMenuPosition)} aria-controls="sketch-polygon-menu" onClick={() => {
              const bounds = polygonMenuTriggerRef.current?.getBoundingClientRect();
              setPolygonMenuPosition(polygonMenuPosition || !bounds ? null : { top: bounds.bottom + 6, left: Math.max(8, Math.min(bounds.left, window.innerWidth - 208)) });
            }}><SketchToolbarIcon file={`polygon-${sketchPolygonSides}`} /></button>
            <SketchToolMenu initialTool="slot" activeTool={sketchTool} onChoose={chooseSketchTool} options={[
              { tool: "slot", label: t("sketch.slot"), icon: "slot" },
              { tool: "arcSlot", label: t("sketch.arcSlot"), icon: "arc-slot" },
            ]} />
            {/* <Tool label={t("sketch.smoothCurve")} active={sketchTool === "smooth"} onClick={() => chooseSketchTool("smooth")}><SketchToolbarIcon file="smooth-curve" /></Tool> */}
            <SketchToolMenu initialTool="freehandSmooth" activeTool={sketchTool} onChoose={chooseSketchTool} options={[
              { tool: "freehandSmooth", label: t("sketch.smoothFreehand"), icon: "smooth-freehand" },
              { tool: "freehand", label: t("sketch.freehand"), icon: "freehand" },
            ]} />
          </ToolbarSection>
          <ToolbarSection label={t("sketch.point")}>
            <Tool label={t("sketch.corner")} enabled={selectedSketchPoints.length > 0} active={selectedPointMode("corner")} onClick={() => setSketchPointModes(selectedSketchPoints.map((point) => point.id), "corner")}><SketchToolbarIcon file="node-corner" /></Tool>
            <Tool label={t("sketch.splitHandles")} enabled={selectedSketchPoints.length > 0} active={selectedPointMode("split")} onClick={() => setSketchPointModes(selectedSketchPoints.map((point) => point.id), "split")}><SketchToolbarIcon file="node-split" /></Tool>
            <Tool label={t("sketch.smooth")} enabled={selectedSketchPoints.length > 0} active={selectedPointMode("smooth")} onClick={() => setSketchPointModes(selectedSketchPoints.map((point) => point.id), "smooth")}><SketchToolbarIcon file="node-smooth" /></Tool>
            <Tool label={t("sketch.autoSmooth")} enabled={selectedSketchPoints.length > 0} active={selectedPointMode("autoSmooth")} onClick={() => setSketchPointModes(selectedSketchPoints.map((point) => point.id), "autoSmooth")}><SketchToolbarIcon file="node-smooth-auto" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.edit")} className="sketch-edit-section">
            <Tool label={t("sketch.construction")} enabled={selectedConstructionIds.segmentIds.length + selectedConstructionIds.circleIds.length > 0} active={selectedConstructionIds.allConstruction} onClick={toggleSketchConstruction}><SketchToolbarIcon file="construction" /></Tool>
            <Tool label={t("sketch.refine")} active={sketchTool === "refine"} onClick={refineSketchSelection}><SketchToolbarIcon file="nodes-refine" /></Tool>
            <Tool label={t("sketch.connectNodes")} enabled={selectedSketchPoints.length <= 2} active={sketchTool === "connect"} onClick={connectSelectedSketchNodes}><SketchToolbarIcon file="nodes-connect-nodes" /></Tool>
            <Tool label={t("sketch.mergePoints")} enabled={mergeableSketchPointIds.length === 2} onClick={mergeSelectedSketchPoints}><SketchToolbarIcon file="nodes-merge-points" /></Tool>
            <Tool label={t("sketch.deleteNode")} enabled={selectedSketchPoints.length > 0} onClick={deleteSelectedSketchNodes}><SketchToolbarIcon file="nodes-delete" /></Tool>
            <Tool label={t("sketch.separateNode")} enabled={separableSketchPoints.length > 0} onClick={separateSelectedSketchNodes}><SketchToolbarIcon file="nodes-separate" /></Tool>
            {/* Temporarily hidden; keep the trim tool implementation available. */}
            <span hidden><Tool label={t("sketch.trim")} active={sketchTool === "trim"} onClick={() => chooseSketchTool("trim")}><SketchToolbarIcon file="trim" /></Tool></span>
          </ToolbarSection>
          <ToolbarSection label={t("annotation.group")} className="sketch-annotations-section">
            <SketchToolMenu initialTool="dimension" activeTool={sketchAnnotationTool} renderIcon={(option) => <AnnotationIcon kind={option.tool} />} options={(["dimension", "arrow", "dashedLine"] as const).map((tool) => ({ tool, label: t(`annotation.${tool}`), icon: tool }))} onChoose={(kind) => { chooseSketchTool("select"); setSketchAnnotationTool(sketchAnnotationTool === kind ? null : kind); }} />
            {(["angle", "circle", "rectangle"] as const).map((kind) => <Tool key={kind} label={`${t("annotation.group")}: ${t(`annotation.${kind}`)}`} active={sketchAnnotationTool === kind} onClick={() => { chooseSketchTool("select"); setSketchAnnotationTool(sketchAnnotationTool === kind ? null : kind); }}><AnnotationIcon kind={kind} /></Tool>)}
            <Tool label={t("annotation.text")} active={sketchAnnotationTool === "text"} onClick={() => { chooseSketchTool("select"); setSketchAnnotationTool(sketchAnnotationTool === "text" ? null : "text"); }}><AnnotationIcon kind="text" /></Tool>
          </ToolbarSection>
          <ToolbarSection label={t("sketch.import")} className="sketch-import-section">
            <Tool label={t("sketch.importSvg")} onClick={() => sketchSvgImportRef.current?.click()}><SketchToolbarIcon file="import-svg" /></Tool>
          </ToolbarSection>
          <div className="toolbar-spacer" />
        </div> :
        <div ref={toolbarScrollRef} className="toolbar-mode-content geometry">
          <div className="tool-group left">
            <ToolbarSection label={t("toolbar.history")}>
              <Tool label={t("toolbar.undo")} enabled={history.index > 0} onClick={undo}><ToolbarUndoIcon /></Tool>
              <Tool label={t("toolbar.redo")} enabled={history.index < history.entries.length - 1} onClick={redo}><ToolbarRedoIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.clipboard")}>
              <Tool label={t("toolbar.copy")} enabled={Boolean(selectedId || selectedAnnotationId)} onClick={copyCurrentSelection}><ToolbarCopyIcon /></Tool>
              <Tool label={t("toolbar.paste")} enabled={Boolean(clipboardId || annotationClipboard?.length)} onClick={() => { if (annotationClipboard) pasteAnnotations(annotationClipboard); else duplicateSelected(clipboardId); }}><ToolbarPasteIcon /></Tool>
              <Tool label={t("toolbar.duplicate")} enabled={Boolean(selectedObjectId || selectedAnnotationId)} onClick={() => duplicateSelected()}><ToolbarDuplicateIcon /></Tool>
              <Tool label={modelSelection.length > 1 ? t("toolbar.deleteSelection") : selectionKind === "feature" ? t("toolbar.deleteOperation") : t("toolbar.deleteObject")} enabled={modelSelection.length > 0 || Boolean(selectedAnnotation) || selectedAnnotationId === ANNOTATIONS_GROUP_ID} onClick={deleteCurrentSelection}><ToolbarTrashIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.shapes")} className="toolbar-shapes-section">
              <button ref={shapeMenuTriggerRef} data-kercad-popup="shapes" className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`} aria-label={t("toolbar.addShape")} title={t("toolbar.addShape")} aria-expanded={shapesOpen} aria-controls="kercad-shape-menu" onClick={toggleShapeMenu}><ToolbarShapeAddIcon /></button>
              <Tool label={t("toolbar.createSketch")} onClick={() => { setShapesOpen(false); beginSketch(null); }}><ToolbarSketchIcon /></Tool>
            </ToolbarSection>
          </div>
          <div className="toolbar-modeling-groups">
            <ToolbarSection label={t("toolbar.modify")} className="toolbar-modify-section">
              <Tool label={t("toolbar.chamfer")} active={pendingEdgeTreatment === "chamfer"} onClick={() => beginEdgeTreatment("chamfer")}><ToolbarChamferIcon /></Tool>
              <Tool label={t("toolbar.fillet")} active={pendingEdgeTreatment === "fillet"} onClick={() => beginEdgeTreatment("fillet")}><ToolbarFilletIcon /></Tool>
              <Tool label={modelSelection.length === 2 && selectedSketches.length === 2 ? t("operation.loft") : selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? t("toolbar.extrudeSketch") : t("toolbar.extrudeFace")} active={Boolean(pendingFaceExtrude)} onClick={() => modelSelection.length === 2 && selectedSketches.length === 2 ? addExtrudeFromSketch(selectedSketches[0], selectedSketches[1]) : selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addExtrudeFromSketch(selectedFeature) : beginFaceExtrude("add")}><ToolbarExtrudeIcon /></Tool>
              <Tool label={selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? t("toolbar.revolveSketch") : t("toolbar.revolve")} active={Boolean(pendingRevolve)} onClick={() => selectedFeature?.kind === "sketch" && selectedFeature.profile.shape === "drawn" ? addRevolveFromSketch(selectedFeature) : beginRevolve()}><ToolbarRevolveIcon /></Tool>
              <Tool label={t("operation.sweep")} active={Boolean(pendingSweepPathId)} onClick={beginSweep}><ToolbarSweepIcon /></Tool>
              <Tool label={t("toolbar.shell")} active={Boolean(pendingShell)} onClick={() => beginShell()}><ToolbarShellIcon /></Tool>
              <Tool label={t("toolbar.mirror")} enabled={Boolean(selectedObjectId)} onClick={addMirrorOperation}><ToolbarMirrorIcon /></Tool>
              <Tool label={t("toolbar.linearPattern")} enabled={Boolean(selectedObjectId)} onClick={addLinearPatternOperation}><ToolbarLinearPatternIcon /></Tool>
              <Tool label={t("toolbar.polarPattern")} enabled={Boolean(selectedObjectId)} onClick={addPolarPatternOperation}><ToolbarPolarPatternIcon /></Tool>
              <Tool label={t("toolbar.objectBoolean")} enabled={Boolean(selectedObjectId && document.objects.some((object) => object.id !== selectedObjectId))} onClick={addObjectBooleanOperation}><ToolbarObjectBooleanIcon /></Tool>
            </ToolbarSection>
            <ToolbarSection label={t("toolbar.helpers")} className="toolbar-helpers-section">
              <Tool label={t("camera.sectionView")} active={sectionEnabled || placingSection} onClick={() => {
                if (placingSection) { setPlacingSection(false); setNotice(null); return; }
                if (sectionEnabled) { setSectionEnabled(false); setSectionSelected(false); return; }
                setModelSelection([]); setSelectedAnnotationId(null); setOriginEditObjectId(null); setAnnotationTool(null);
                setPlacingWorkplane(false); setEditingMirrorPlaneId(null); setAlignOpen(false);
                setPlacingSection(true); setDisplayMode("solid");
                setNotice({ type: "info", text: t("camera.sectionPickHint") });
              }}><ToolbarSectionViewIcon /></Tool>
              <Tool label={hasActiveWorkplane ? t("toolbar.resetWorkplane") : placingWorkplane ? t("toolbar.cancelWorkplane") : t("toolbar.placeWorkplane")} active={placingWorkplane || hasActiveWorkplane} onClick={toggleWorkplanePlacement}>{hasActiveWorkplane ? <ToolbarResetWorkplaneIcon /> : <ToolbarWorkplaneIcon />}</Tool>
              <Tool label={t("toolbar.snapGrid")} enabled={Boolean(selectedAnnotationPoint || modelSelection.some((item) => parametricSelectionSnapPosition(document, item)))} onClick={() => selectedAnnotationPoint ? adjustAnnotationPoint("snap") : mutate((draft) => snapParametricSelectionToGrid(draft, modelSelection))}><ToolbarSnapGridIcon /></Tool>
              <Tool label={t("toolbar.dropToWorkplane")} enabled={Boolean(selectedAnnotationPoint) || modelSelection.some(item => {
                const feature = item.kind === "feature" ? document.features.find(candidate => candidate.id === item.id) : undefined;
                const object = document.objects.find(candidate => candidate.id === (item.kind === "object" ? item.id : feature?.objectId));
                return object && !object.locked && (item.kind === "object" || feature && !feature.suppressed && (feature.kind === "primitive" || feature.kind === "extrude" || feature.kind === "sketch" && feature.purpose === "user"));
              }) && !kernelBusy && !droppingToWorkplane} onClick={() => void dropToWorkplane()}><ToolbarDropToWorkplaneIcon /></Tool>
              <div data-kercad-popup="align" className="kercad-align-tool" onPointerEnter={() => setAlignmentHelpHovered(true)} onPointerLeave={() => setAlignmentHelpHovered(false)}>
                <Tool label={t("toolbar.align")} enabled={modelSelection.length > 1} active={alignOpen} onClick={() => {
                  if (alignOpen) { setAlignOpen(false); return; }
                  const objects = new Set(modelSelection.filter(item => item.kind === "object").map(item => item.id));
                  const group = modelSelection.map(item => {
                    const parent = item.kind === "feature" ? objectIdForFeature(document, item.id) : null;
                    return parent && objects.has(parent) ? { id: parent, kind: "object" as const } : item;
                  }).filter((item, index, all) => !all.slice(index + 1).some(other => sameAlignmentItem(item, other)));
                  if (group.length < 2) return;
                  setModelSelection(group);
                  setAlignmentGeometry(null);
                  setOriginEditObjectId(null);
                  setAlignOpen(true);
                }}><ToolbarAlignIcon /></Tool>
                {alignmentHelpHovered ? <div className="kercad-align-popover" role="tooltip" aria-label={t("align.title")}>
                  <header><strong>{t("align.action")}</strong><span>{alignmentMode === "group"
                    ? (uiText("ui.kercadparametriceditor.the.blue.box.encloses.the.entire.selection.green.4fa1e2", {}, locale))
                    : (uiText("ui.kercadparametriceditor.blue.reference.green.moving.selection.click.geom.c62fd3", {}, locale))}</span></header>
                  {alignOpen && alignmentTargets.length === 0 ? <p role="status">{uiText("ui.kercadparametriceditor.preparing.geometry.be5809", {}, locale)}</p> : null}
                  <p>{uiText("ui.kercadparametriceditor.use.the.triangles.on.the.box.to.align.the.ends.o.901219", {}, locale)}</p>
                </div> : null}
              </div>
            </ToolbarSection>
            <ToolbarSection label={t("annotation.group")} className="toolbar-annotations-section">
              <SketchToolMenu initialTool="dimension" activeTool={annotationTool} renderIcon={(option) => <AnnotationIcon kind={option.tool} />} options={(["dimension", "arrow", "dashedLine"] as const).map((tool) => ({ tool, label: t(`annotation.${tool}`), icon: tool }))} onChoose={chooseAnnotationTool} />
              {(["angle", "circle", "rectangle"] as const).map((kind) => <Tool key={kind} label={t(`annotation.${kind}`)} active={annotationTool === kind} onClick={() => chooseAnnotationTool(kind)}><AnnotationIcon kind={kind} /></Tool>)}
              <Tool label={t("annotation.text")} active={annotationTool === "text"} onClick={() => chooseAnnotationTool("text")}><AnnotationIcon kind="text" /></Tool>
            </ToolbarSection>
          </div>
          <div className="toolbar-spacer" />
          <ToolbarSection label={t("toolbar.manage")} className="toolbar-actions-section">
            <div className="action-buttons">
              <button className="action-icon-button" aria-label={t("toolbar.import")} title={t("toolbar.import")} onClick={() => setImportOpen(true)}><ToolbarImportIcon /></button>
              <button data-kercad-popup="export" className="action-icon-button" aria-label={t("toolbar.export")} title={t("toolbar.export")} onClick={() => { if (!exportOpen) { setExportFileName(document.name); setExportScope(exportSelectedObjectIds.length ? "selection" : "project"); } setExportOpen((value) => !value); }}><ToolbarVectorExportIcon /></button>
              <button data-kercad-popup="settings" className="action-icon-button" aria-label={t("toolbar.settings")} title={t("toolbar.settings")} onClick={() => setSettingsOpen((value) => !value)}><ToolbarSettingsIcon /></button>
            </div>
          </ToolbarSection>
        </div>}
      </div>


      {sketchSession && polygonMenuPosition ? <div ref={polygonMenuRef} id="sketch-polygon-menu" className="kercad-polygon-menu" style={polygonMenuPosition}>
        {[3, 4, 5, 6, 7, 8].map((sides) => {
          const names = [uiText("ui.kercadparametriceditor.triangle.73d3ae", {}, locale), uiText("ui.kercadparametriceditor.rhombus.95de17", {}, locale), uiText("ui.kercadparametriceditor.pentagon.a21e71", {}, locale), uiText("ui.kercadparametriceditor.hexagon.08596d", {}, locale), uiText("ui.kercadparametriceditor.heptagon.71d314", {}, locale), uiText("ui.kercadparametriceditor.octagon.4fecd7", {}, locale)];
          return <button key={sides} type="button" aria-pressed={sketchTool === "polygon" && sketchPolygonSides === sides} onClick={() => { setSketchPolygonSides(sides); chooseSketchTool("polygon"); setPolygonMenuPosition(null); }}><SketchToolbarIcon file={`polygon-${sides}`} /><span>{names[sides - 3]}</span></button>;
        })}
      </div> : null}
      {shapesOpen ? <div id="kercad-shape-menu" data-kercad-popup="shapes" className="shape-menu-dropdown detached" style={{ top: shapeMenuPosition.top, left: shapeMenuPosition.left }}>
        <div className="shape-menu-list">
          {parametricShapeMenuOrder.map((kind) => {
            if (kind === "text") return <button className="shape-menu-item" key={kind} onClick={addText}><img src="/assets/old/shape-icons-gray/raw/text.png" alt="" /><span>{t("toolbar.text")}</span></button>;
            if (kind === "spiral" || kind === "helix") return <button className="shape-menu-item" key={kind} onClick={() => addPathShape(kind)}><ThemedToolbarImage src={`/assets/kercad/toolbar-3d/shapes/${kind}.svg`} width={40} height={40} alt="" /><span>{t(kind === "spiral" ? "path.spiral" : "path.helix")}</span></button>;
            const asset = parametricOperationDefinition(kind);
            const localized = localizedParametricOperationDefinition(kind, locale);
            return <button className="shape-menu-item" key={kind} onClick={() => addShape(kind)}><img src={asset.menuIcon} alt="" /><span>{localized.name}</span></button>;
          })}
        </div>
      </div> : null}

      <section className={`kercad-workplane-stage ${sketchSession ? "sketch-active" : ""} ${challengeEditor ? "challenge-authoring" : ""} ${(challenge || challengeEditor) && challengeOpen && !sketchSession ? `challenge-docked-${challengeDock}` : ""}`}>
        {showFps ? <FpsCounter sketchMode={Boolean(sketchSession)} /> : null}
        {backgroundProcessLabel ? <BackgroundProcessIndicator label={backgroundProcessLabel} rightOffset={viewportOverlayRightOffset + (showFps ? 90 : 0)} regenerating={!stlExporting && !exporting && !alignmentCalculating && kernelBusy} /> : null}
        {sketchSession ? <SketchWorkspace
          annotations={sketchSession.annotations}
          annotationTool={sketchAnnotationTool}
          selectedAnnotationId={selectedSketchAnnotationId}
          annotationDisplayUnit={displayUnit}
          onAddAnnotation={(annotation) => { setSketchAnnotations((annotations) => { annotation.name = nextAnnotationName(annotations, annotation.name); annotations.push(annotation); }); setSketchAnnotationTool(null); setSketchTool("select"); setSketchSelection(null); setSelectedSketchAnnotationId(annotation.id); }}
          onSelectAnnotation={(id) => { setSketchAnnotationTool(null); setSketchSelection(null); setSketchActivePointId(null); setSelectedSketchAnnotationId(id); }}
          onCommitAnnotation={(annotation) => setSketchAnnotations((annotations) => { const index = annotations.findIndex((entry) => entry.id === annotation.id); if (index >= 0) annotations[index] = annotation; })}
          annotationToolbar={selectedSketchAnnotation ? <SketchAnnotationToolbar key={selectedSketchAnnotation.id} annotation={selectedSketchAnnotation} displayUnit={displayUnit} snap={document.workplane.snapSpacing} locale={locale} onUpdate={(update) => setSketchAnnotations((annotations) => { const annotation = annotations.find((entry) => entry.id === selectedSketchAnnotationId); if (annotation) update(annotation); })} /> : null}
          locale={locale}
          profile={sketchSession.profile}
          profileValidation={activeSketchProfileValidation}
          operation="extrude"
          referenceShapes={[]}
          sceneReference={sketchSceneReference}
          tool={sketchTool}
          activePointId={sketchActivePointId}
          selected={sketchSelection}
          measurement={sketchMeasurement}
          pendingMeasurementStart={sketchMeasureStart}
          onCancelActiveTool={() => chooseSketchTool("select")}
          initialSnap={closestSketchGrid(document.workplane.snapSpacing, document.workplane.snapToGrid)}
          exactSnapStep={document.workplane.snapToGrid ? document.workplane.snapSpacing : 0}
          initialWorkspace={{ ...DEFAULT_WORKPLANE_WORKSPACE, ...displayUnitWorkspace(displayUnit), width: document.workplane.width, depth: document.workplane.depth, sizePreset: `${document.workplane.width} x ${document.workplane.depth} mm`, gridBlockSize: document.workplane.gridStep, gridBlockPreset: `${document.workplane.gridStep} mm`, showGrid: document.workplane.gridVisible }}
          secondaryGridStep={document.workplane.sketchGridStep}
          onPlanePoint={addSketchPoint}
          polygonSides={sketchPolygonSides}
          onAddPolygon={(center, radius, angle) => {
            const circleId = sketchEntityId("circle");
            const points = Array.from({ length: sketchPolygonSides }, (_, index) => ({ id: sketchEntityId("point"), x: center.x + radius * Math.cos(angle + index * 2 * Math.PI / sketchPolygonSides), z: center.z + radius * Math.sin(angle + index * 2 * Math.PI / sketchPolygonSides), mode: "corner" as const }));
            const segments = points.map((point, index) => ({ id: sketchEntityId("segment"), startId: point.id, endId: points[(index + 1) % points.length].id, kind: "line" as const }));
            const constraints: NonNullable<SketchProfile["constraints"]> = [
              ...points.map((point) => ({ id: sketchEntityId("constraint"), kind: "pointOnCircle" as const, pointId: point.id, circleId })),
              ...segments.slice(1).map((segment) => ({ id: sketchEntityId("constraint"), kind: "equalLength" as const, segmentIds: [segments[0].id, segment.id] as [string, string] })),
            ];
            setSketchProfile((profile) => ({ ...profile, points: [...profile.points, ...points], segments: [...profile.segments, ...segments], circles: [...(profile.circles ?? []), { id: circleId, ...center, radius, radiusAngle: angle, construction: true }], constraints: [...(profile.constraints ?? []), ...constraints] }));
            chooseSketchTool("select");
          }}
          onMoveSelection={(profile) => setSketchProfile(() => profile)}
          onAddSlot={(contour) => {
            const ids = new Map(contour.points.map((point) => [point.id, sketchEntityId("point")]));
            const points = contour.points.map((point) => ({ ...point, id: ids.get(point.id)! }));
            const segments = contour.segments.map((segment) => ({ ...segment, id: sketchEntityId("segment"), startId: ids.get(segment.startId)!, endId: ids.get(segment.endId)! }));
            const constraints: NonNullable<SketchProfile["constraints"]> = segments.map((segment, index) => {
              const next = segments[(index + 1) % segments.length];
              if (segment.kind === "arc" && next.kind === "arc") return { id: sketchEntityId("constraint"), kind: "tangentArcs", arcIds: [segment.id, next.id], pointId: segment.endId };
              const line = segment.kind === "line" ? segment : next;
              const arc = segment.kind === "arc" ? segment : next;
              return { id: sketchEntityId("constraint"), kind: "tangentLineArc", lineId: line.id, arcId: arc.id };
            });
            if (segments[0]?.kind === "arc" && segments[2]?.kind === "arc") {
              constraints.push({ id: sketchEntityId("constraint"), kind: "coincident", pointIds: [arcSketchPointId(segments[0].id), arcSketchPointId(segments[2].id)] });
            }
            setSketchProfile((profile) => ({ ...profile, points: [...profile.points, ...points], segments: [...profile.segments, ...segments], constraints: [...(profile.constraints ?? []), ...constraints] }));
            chooseSketchTool("select");
          }}
          onAddRectangleVariant={(contour) => {
            const added = pasteSketchSelection(contour, sketchEntityId, 0);
            setSketchProfile((profile) => ({ ...profile, points: [...profile.points, ...added.points], segments: [...profile.segments, ...added.segments], constraints: [...(profile.constraints ?? []), ...(added.constraints ?? [])] }));
            chooseSketchTool("select");
          }}
          onAddRectangle={(corners) => {
            const points = corners.map((corner) => ({ ...corner, id: sketchEntityId("point"), mode: "corner" as const }));
            const segments = points.map((point, index) => ({ id: sketchEntityId("segment"), startId: point.id, endId: points[(index + 1) % points.length].id, kind: "line" as const }));
            const constraints = segments.map((segment, index) => ({ id: sketchEntityId("constraint"), kind: index % 2 === 0 ? "horizontal" as const : "vertical" as const, segmentId: segment.id }));
            setSketchProfile((profile) => ({ ...profile, points: [...profile.points, ...points], segments: [...profile.segments, ...segments], constraints: [...(profile.constraints ?? []), ...constraints] }));
            chooseSketchTool("select");
          }}
          onFreehandContour={(points, smooth) => {
            try {
              let addedPointIds: string[] = [];
              let addedSegmentIds: string[] = [];
              setSketchProfile((profile) => {
                const next = appendScribbleContour(profile, points, profile.generator?.kind === "scribble" ? profile.generator.smoothing : 0.8, smooth);
                addedPointIds = next.points.slice(profile.points.length).map((point) => point.id);
                addedSegmentIds = next.segments.slice(profile.segments.length).map((segment) => segment.id);
                return next;
              });
              chooseSketchTool("select");
              setSketchSelection({ kind: "multiple", pointIds: addedPointIds, segmentIds: addedSegmentIds });
            } catch (error) {
              setNotice({ type: "error", text: error instanceof Error ? error.message : t("notice.freehandFailed") });
            }
          }}
          onPointPress={pressSketchPoint}
          onSelectSegment={(id, additive = false) => {
            if (!additive || !sketchSelection) setSketchSelection({ kind: "segment", id });
            else if (sketchSelection.kind === "segment" && sketchSelection.id === id) setSketchSelection(null);
            else {
              const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
                : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
                : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
                : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
              const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
              const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
              const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
              const nextSegmentIds = segmentIds.includes(id) ? segmentIds.filter((candidate) => candidate !== id) : [...segmentIds, id];
              setSketchSelection(pointIds.length || nextSegmentIds.length || circleIds.length || imageIds.length ? { kind: "multiple", pointIds, segmentIds: nextSegmentIds, circleIds, imageIds } : null);
            }
            setSketchActivePointId(null);
          }}
          onSelectMany={(pointIds, segmentIds, imageIds, circleIds = []) => setSketchSelection(pointIds.length || segmentIds.length || imageIds.length || circleIds.length ? { kind: "multiple", pointIds, segmentIds, imageIds, circleIds } : null)}
          onAddCircle={(circle) => {
            const id = sketchEntityId("circle");
            setSketchProfile((profile) => ({ ...profile, circles: [...(profile.circles ?? []), { ...circle, id }] }));
            setSketchSelection({ kind: "circle", id });
            setSketchTool("select");
          }}
          onAddArc={({ center, start, end, clockwise }) => {
            const segmentId = sketchEntityId("arc");
            setSketchProfile((profile) => {
              const findOrAddPoint = (position: { x: number; z: number }) => {
                const existing = profile.points.find((point) => Math.hypot(point.x - position.x, point.z - position.z) < 0.0001);
                if (existing) return existing.id;
                const point: SketchPoint = { id: sketchEntityId("point"), ...position, mode: "corner" };
                profile.points.push(point);
                return point.id;
              };
              const startId = findOrAddPoint(start);
              const endId = findOrAddPoint(end);
              return { ...profile, segments: [...profile.segments, { id: segmentId, startId, endId, kind: "arc", center: { ...center }, clockwise }] };
            });
            setSketchSelection({ kind: "segment", id: segmentId });
            setSketchTool("select");
          }}
          onMoveArcCenter={(segmentId, center) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const segment = next.segments.find((candidate) => candidate.id === segmentId && candidate.kind === "arc" && candidate.center);
            if (!segment?.center) return profile;
            const dx = center.x - segment.center.x;
            const dz = center.z - segment.center.z;
            segment.center = { ...center };
            for (const point of next.points) {
              if (point.id !== segment.startId && point.id !== segment.endId) continue;
              point.x += dx;
              point.z += dz;
            }
            return solveSketchConstraints(next, arcSketchPointId(segmentId));
          })}
          onSelectArcPoint={selectSketchArcPoint}
          onSelectCircle={(id, additive = false) => {
            if (!additive || !sketchSelection) setSketchSelection({ kind: "circle", id });
            else if (sketchSelection.kind === "circle" && sketchSelection.id === id) setSketchSelection(null);
            else {
              const pointIds = sketchSelection?.kind === "point" ? [sketchSelection.id]
                : sketchSelection?.kind === "circlePoint" ? [circleSketchPointId(sketchSelection.circleId, sketchSelection.point)]
                : sketchSelection?.kind === "arcPoint" ? [arcSketchPointId(sketchSelection.segmentId)]
                : sketchSelection?.kind === "multiple" ? sketchSelection.pointIds : [];
              const segmentIds = sketchSelection?.kind === "segment" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.segmentIds : [];
              const circleIds = sketchSelection?.kind === "circle" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.circleIds ?? [] : [];
              const imageIds = sketchSelection?.kind === "image" ? [sketchSelection.id] : sketchSelection?.kind === "multiple" ? sketchSelection.imageIds ?? [] : [];
              const nextCircleIds = circleIds.includes(id) ? circleIds.filter((candidate) => candidate !== id) : [...circleIds, id];
              setSketchSelection(pointIds.length || segmentIds.length || nextCircleIds.length || imageIds.length ? { kind: "multiple", pointIds, segmentIds, circleIds: nextCircleIds, imageIds } : null);
            }
            setSketchActivePointId(null);
          }}
          onSelectCirclePoint={selectSketchCirclePoint}
          onDeleteCircle={(id) => { setSketchProfile((profile) => {
            const virtualIds = new Set([circleSketchPointId(id, "center"), circleSketchPointId(id, "radius")]);
            return { ...profile, circles: (profile.circles ?? []).filter((circle) => circle.id !== id), constraints: (profile.constraints ?? []).filter((constraint) => {
              if ((constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === id) return false;
              if ((constraint.kind === "concentric" || constraint.kind === "equalRadius") && constraint.circleIds.includes(id)) return false;
              return ![...virtualIds].some((pointId) => sketchConstraintUsesPoint(constraint, pointId));
            }) };
          }); setSketchSelection(null); }}
          onTrimCircle={(id, point) => trimSketchEntity({ kind: "circle", id }, point)}
          onMoveCircle={(id, center) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const circle = next.circles?.find((candidate) => candidate.id === id);
            if (!circle) return profile;
            Object.assign(circle, center);
            return solveSketchConstraints(next, circleSketchPointId(id, "center"));
          })}
          onResizeCircle={(id, radius, angle) => setSketchProfile((profile) => {
            const value = Math.max(0.01, radius);
            const next = cloneSketchProfile(profile);
            const circle = next.circles?.find((candidate) => candidate.id === id);
            if (!circle) return profile;
            circle.radius = value;
            circle.radiusAngle = angle;
            next.constraints = (next.constraints ?? []).map((constraint) => (constraint.kind === "radius" || constraint.kind === "diameter") && constraint.circleId === id ? { ...constraint, value: constraint.kind === "diameter" ? value * 2 : value } : constraint);
            return solveSketchConstraints(next, circleSketchPointId(id, "radius"));
          })}
          onSelectImage={(id) => setSketchSelection({ kind: "image", id })}
          onUpdateImage={(id, update) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).map((image) => image.id === id ? { ...image, ...update } : image) }))}
          onDeleteImage={(id) => setSketchProfile((profile) => ({ ...profile, images: (profile.images ?? []).filter((image) => image.id !== id) }))}
          onDeletePoint={deleteSketchPoint}
          onDeleteSegment={deleteSketchSegment}
          onTrimSegment={(id, point) => trimSketchEntity({ kind: "segment", id }, point)}
          onMovePoint={(id, position) => setSketchProfile((profile) => {
            const next = cloneSketchProfile(profile);
            const source = next.points.find((point) => point.id === id);
            if (!source) return profile;
            let target = { ...position };
            const endingArc = next.segments.find((segment) => segment.kind === "arc" && segment.center && segment.endId === id);
            if (endingArc?.center) {
              const start = next.points.find((point) => point.id === endingArc.startId);
              if (start) {
                const radius = Math.hypot(start.x - endingArc.center.x, start.z - endingArc.center.z);
                const angle = Math.atan2(target.z - endingArc.center.z, target.x - endingArc.center.x);
                target = { x: endingArc.center.x + Math.cos(angle) * radius, z: endingArc.center.z + Math.sin(angle) * radius };
              }
            }
            const dx = target.x - source.x;
            const dz = target.z - source.z;
            Object.assign(source, target, { handleIn: source.handleIn ? { x: source.handleIn.x + dx, z: source.handleIn.z + dz } : undefined, handleOut: source.handleOut ? { x: source.handleOut.x + dx, z: source.handleOut.z + dz } : undefined });
            for (const arc of next.segments.filter((segment) => segment.kind === "arc" && segment.center && segment.startId === id)) {
              const end = next.points.find((point) => point.id === arc.endId);
              if (!end || !arc.center) continue;
              const radius = Math.hypot(source.x - arc.center.x, source.z - arc.center.z);
              const angle = Math.atan2(end.z - arc.center.z, end.x - arc.center.x);
              end.x = arc.center.x + Math.cos(angle) * radius;
              end.z = arc.center.z + Math.sin(angle) * radius;
            }
            return solveSketchConstraints(next, id);
          })}
          onMoveHandle={moveSketchHandle}
          onInsertPoint={insertSketchPoint}
          onSetPointMode={setSketchPointMode}
          onUpdateConstraintValue={updateSketchConstraintValue}
          onDeleteConstraint={deleteSketchConstraint}
          onClearMeasurement={() => { setSketchMeasurement(null); setSketchMeasureStart(null); }}
          showPointActions={false}
          showGridControls={false}
        /> : <ParametricViewport
          annotations={document.annotations}
          annotationsVisible={document.annotationGroup?.visible !== false}
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationSelect={(id) => { setAnnotationTool(null); setEditingAnnotationId(null); setModelSelection([]); setSelectedAnnotationId(id); }}
          onUpdateAnnotation={(id, update) => { const draft = cloneDocument(latestDocumentRef.current); const annotation = draft.annotations?.find((entry) => entry.id === id); if (annotation) { update(annotation); commit(draft); } }}
          selectedAnnotationEndpoint={annotationEndpoint}
          onSelectAnnotationEndpoint={setAnnotationEndpoint}
          onMoveAnnotationEndpoint={(id, endpoint, position) => mutate((draft) => {
            const annotation = draft.annotations?.find((item) => item.id === id);
            if (annotation) setAnnotationPosition(annotation, endpoint, position);
          })}
          onCircleAnnotationRadius={(id, radius) => mutate((draft) => { const annotation = draft.annotations?.find((item) => item.id === id); if ((annotation?.kind === "circle" || annotation?.kind === "rectangle")) annotation.radius = radius; })}
          annotationTool={annotationTool}
          editingAnnotationId={editingAnnotationId}
          onCancelAnnotationTool={() => setAnnotationTool(null)}
          onEditAnnotation={setEditingAnnotationId}
          onPlaceAnnotation={(kind, start, end, center, rectangle) => {
            const id = createLocalId("annotation");
            mutate((draft) => {
              draft.annotations ??= [];
              const common = { id, name: nextAnnotationName(draft.annotations, t(`annotation.${kind}`)), visible: true };
              draft.annotations.push(kind === "text"
                ? { ...common, kind, position: start, alignment: "center", size: 6, font: "Sans", text: uiText("ui.page.kercad.c0bf6d", {}, locale) }
                : (kind === "circle" || kind === "rectangle") ? { ...common, kind, position: start, rotation: { x: 0, y: 0, z: 0 }, radius: Math.max(0.1, Math.hypot((end?.x ?? start.x) - start.x, (end?.y ?? start.y) - start.y, (end?.z ?? start.z) - start.z)), ...(kind === "rectangle" ? rectangle : {}), mode: "billboard", color: "#233c52", lineWidth: 2 }
                : kind === "angle" ? { ...common, kind, start, center: center ?? start, end: end ?? start, color: "#233c52" }
                : { ...common, kind: "dimension", start, end: end ?? start, ...annotationDimensionPreset(kind) });
            });
            setAnnotationTool(null); setModelSelection([]); setSelectedAnnotationId(id); setModelSidebarMode("normal");
            setEditingAnnotationId(kind === "text" ? id : null);
          }}
          onFinishAnnotation={(id, text, size) => {
            mutate((draft) => { const annotation = draft.annotations?.find((item) => item.id === id); if (annotation && (annotation.kind !== "circle" && annotation.kind !== "rectangle")) { if (annotation.kind === "text") annotation.text = text; annotation.size = size; } });
            setEditingAnnotationId(null);
          }}
          onThumbnail={(dataUrl) => {
            if (projectCaptureRequestRef.current) {
              projectCaptureRequestRef.current = false;
              const next = cloneDocument(latestDocumentRef.current);
              next.thumbnailOverride = dataUrl; commit(next);
              onProjectThumbnail?.(dataUrl, next);
              setNotice({ type: "ok", text: t("project.coverManual") });
              return;
            }
            const stepId = challengeCaptureStepRef.current;
            if (stepId) {
              challengeCaptureStepRef.current = null;
              setChallengeCapture({ stepId, dataUrl, token: challengeCaptureToken });
            } else if (!latestDocumentRef.current.thumbnailOverride && !kernelBusy && renderedGeometryFingerprintRef.current === geometryFingerprint && !build.failedFeatureId && !pendingEdgeTreatment && !pendingFaceExtrude && !pendingShell && !pendingRevolve && !(selectedOperationTimeline && selectedOperationTimeline.index < selectedOperationTimeline.count - 1)) {
              latestProjectThumbnailRef.current = dataUrl;
              onProjectThumbnail?.(dataUrl, document);
            }
          }}
          thumbnailRequestToken={challengeCaptureToken}
          captureFrameActive={Boolean(pendingChallengeCapture) || pendingProjectCapture}
          onCancelCaptureFrame={() => { setPendingChallengeCapture(null); setPendingProjectCapture(false); }}
          onCaptureFrame={(crop) => {
            if (!pendingChallengeCapture && !pendingProjectCapture) return;
            projectCaptureRequestRef.current = pendingProjectCapture;
            challengeCaptureStepRef.current = pendingProjectCapture ? null : pendingChallengeCapture;
            setChallengeCaptureCrop(crop); setPendingChallengeCapture(null); setPendingProjectCapture(false);
            setChallengeCaptureToken((current) => current + 1);
          }}
          thumbnailRequestOptions={{ includeOverlays: Boolean(challengeEditor) && !projectCaptureRequestRef.current, width: 1200, height: 750, quality: 0.92, crop: challengeCaptureCrop }}
          mesh={viewportObjectRecords.length > 0 ? ((editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && topologySelectionBuild ? topologySelectionBuild : build).mesh : null}
          objectRecords={viewportObjectRecords}
          workplaneGeometryBounds={projectWorkplaneBounds}
          objectColors={objectColors}
          visualSection={sectionEnabled ? sectionPose : null}
          onSectionPlaneSelect={() => { setModelSelection([]); setSelectedAnnotationId(null); setOriginEditObjectId(null); setSectionSelected(true); }}
          objectOrigins={activeViewportObjectOrigins}
          operationOrigins={activeViewportOperationOrigins}
          alignmentActive={alignOpen}
          alignmentBusy={alignmentBusy}
          alignmentTargets={alignmentDisplayTargets}
          alignmentReference={alignmentDisplayReference}
          onAlignmentSelect={selectAlignmentReference}
          onAlign={alignSelection}
          sketchOverlays={viewportSketchOverlays}
          editableOriginId={alignOpen ? null : originEditObjectId}
          selectedObjectOriginId={editingSection ? SECTION_PLANE_ID : selectedAnnotation && selectedAnnotationPoint ? selectedAnnotation.id : selectedOriginObjectId}
          selectedOperationOriginId={editingSection ? null : selectedOperationOriginId}
          selectedObjectIds={viewportSelectedObjectIds}
          operationContext={pendingEdgeTreatment || pendingFaceExtrude || pendingShell || pendingRevolve ? viewportTopologyPreviewContext : viewportOperationContext}
          isolatedHistoryObjectId={!editingEdgeTreatmentId && !editingFaceExtrudeId && !editingShellId && !editingRevolveId && selectedOperationTimeline && selectedOperationTimeline.index < selectedOperationTimeline.count - 1 ? selectedOperationTimeline.objectId : null}
          color={document.color}
          projectName={document.name}
          onProjectRename={openProjectRename}
          workplane={document.workplane}
          view={view}
          projection={projection}
          renderQuality={renderQuality}
          displayMode={displayMode}
          shadingMode={shadingMode}
          displayUnit={displayUnit}
          locale={locale}
          parameterHandlesVisible={!alignOpen && showParameterHandles}
          contextToolbarVisible={Boolean(pendingSweepPathId) || editingSection || (pendingFaceExtrude || pendingRevolve || pendingShell ? true : pendingEdgeTreatment
            ? selectedTopologyFaces.length + selectedTopologyEdges.length > 0
            : modelSelection.length > 0 || Boolean(selectedAnnotation))}
          manipulatorControls={pendingSweepPathId ? <>
            <span>{t("sweep.selectFace")}</span>
            <Tool label={t("dashboard.cancel.77dfd2")} onClick={beginSweep}><X /></Tool>
          </> : editingSection ? <>
            <Tool label={t("camera.positionTriad")} active={sectionPositionVisible} onClick={() => setSectionPositionVisible((value) => !value)}><ToolbarPositionManipulatorIcon /></Tool>
            <Tool label={t("camera.rotationTriad")} active={sectionRotationVisible} onClick={() => setSectionRotationVisible((value) => !value)}><ToolbarRotationManipulatorIcon /></Tool>
            <Tool label={t("camera.reverseSection")} onClick={() => setSectionPose((pose) => ({ ...pose, inverted: !(pose.inverted ?? true) }))}><ViewToolbarIcon file="inverse" /></Tool>
          </> : selectedAnnotation ? <>
            <Tool label={t("camera.positionTriad")} active={showPositionTriad} onClick={() => setShowPositionTriad((visible) => !visible)}><ToolbarPositionManipulatorIcon /></Tool>
            {selectedAnnotation.kind !== "text" && ((selectedAnnotation.kind === "circle" || selectedAnnotation.kind === "rectangle") || selectedAnnotation.kind === "angle" || selectedAnnotation.showLength !== false) && <Tool label={t("camera.parameterHandles")} active={showParameterHandles} onClick={() => setShowParameterHandles((visible) => !visible)}><ToolbarParameterManipulatorIcon /></Tool>}
            {(selectedAnnotation.kind === "circle" || selectedAnnotation.kind === "rectangle") && selectedAnnotation.mode === "planar" && <Tool label={t("camera.rotationTriad")} active={showRotationTriad} onClick={() => setShowRotationTriad((visible) => !visible)}><ToolbarRotationManipulatorIcon /></Tool>}
            {selectedAnnotation.kind === "text" && <>
              <Tool label={t("camera.parameterHandles")} active={showParameterHandles} onClick={() => setShowParameterHandles((visible) => !visible)}><ToolbarParameterManipulatorIcon /></Tool>
              <Tool label={t("operation.edit")} active={editingAnnotationId === selectedAnnotation.id} onClick={() => setEditingAnnotationId(selectedAnnotation.id)}><ToolbarEditOperationIcon /></Tool>
            </>}
          </> : alignOpen ? <>
            <button type="button" className={`kercad-alignment-mode ${alignmentMode === "reference" ? "active" : ""}`} aria-label={uiText("ui.kercadparametriceditor.align.to.reference.d591b2", {}, locale)} title={uiText("ui.kercadparametriceditor.align.to.reference.d591b2", {}, locale)} aria-pressed={alignmentMode === "reference"} onClick={() => setAlignmentMode("reference")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kercad/alignment/mode-reference.svg" alt="" draggable={false} />
            </button>
            <button type="button" className={`kercad-alignment-mode ${alignmentMode === "group" ? "active" : ""}`} aria-label={uiText("ui.kercadparametriceditor.align.to.group.19071e", {}, locale)} title={uiText("ui.kercadparametriceditor.align.to.group.19071e", {}, locale)} aria-pressed={alignmentMode === "group"} onClick={() => setAlignmentMode("group")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kercad/alignment/mode-group.svg" alt="" draggable={false} />
            </button>
          </> : selectedFeature?.kind === "polarPattern" ? <>
            <Tool label={t("camera.positionTriad")} active={showPositionTriad} onClick={() => setShowPositionTriad((visible) => !visible)}><ToolbarPositionManipulatorIcon /></Tool>
            <Tool label={t("camera.parameterHandles")} active={showParameterHandles} onClick={() => setShowParameterHandles((visible) => !visible)}><ToolbarParameterManipulatorIcon /></Tool>
          </> : selectedEdgeTreatmentFeature || pendingEdgeTreatment || pendingShell || editingMirrorPlaneId || selectedFeature?.kind === "shell" || selectedFeature?.kind === "mirror" || selectedFeature?.kind === "linearPattern" ? null : <>
            <Tool label={t("camera.positionTriad")} active={showPositionTriad} onClick={() => setShowPositionTriad((visible) => !visible)}><ToolbarPositionManipulatorIcon /></Tool>
            <Tool label={t("camera.rotationTriad")} active={showRotationTriad} onClick={() => setShowRotationTriad((visible) => !visible)}><ToolbarRotationManipulatorIcon /></Tool>
            {selectionKind === "feature" && <Tool className="kercad-parameter-handles-toggle" label={t("camera.parameterHandles")} active={showParameterHandles} onClick={() => setShowParameterHandles((visible) => !visible)}><ToolbarParameterManipulatorIcon /></Tool>}
            {scaleTarget && <Tool label={t("camera.scaleManipulator")} active={showScaleManipulator} onClick={() => setShowScaleManipulator((visible) => !visible)}><ToolbarScaleManipulatorIcon /></Tool>}
            {selectedFeature?.kind === "primitive" && selectedFeature.primitive === "tube" && <CylinderProfileButtons locale={locale} elliptical={Boolean(selectedFeature.ellipsoidal)} onChange={(enabled) => updateFeature(selectedFeature.id, (feature) => { if (feature.kind === "primitive") setTubeElliptical(feature, enabled); })} />}
            {selectedFeature?.kind === "primitive" && selectedFeature.primitive === "torus" && <>
              <CylinderProfileButtons locale={locale} elliptical={Boolean(selectedFeature.ellipsoidal)} onChange={(enabled) => updateFeature(selectedFeature.id, (feature) => { if (feature.kind === "primitive") setTorusElliptical(feature, enabled); })} />
              <ViewportFloatingNumberInput locale={locale} value={selectedFeature.angle ?? 360} unit="angle" displayUnit={displayUnit} snap={1} label={t("property.angle")} min={0} max={360} onCommit={(angle) => updateFeature(selectedFeature.id, (feature) => { if (feature.kind === "primitive") feature.angle = angle; })} />
            </>}
            {selectedFeature?.kind === "primitive" && selectedFeature.primitive === "platonic" && <>
              <PlatonicTypeButtons value={selectedFeature.platonicType ?? "tetrahedron"} locale={locale} onChange={(type) => updateFeature(selectedFeature.id, (feature) => { if (feature.kind === "primitive") feature.platonicType = type; })} />
              <ViewportFloatingNumberInput locale={locale} value={selectedFeature.width} unit="length" displayUnit={displayUnit} snap={document.workplane.snapSpacing} label={t("property.size")} min={.1} max={200} onCommit={(size) => mutate((draft) => updateParametricShapeParameter(draft, selectedFeature.id, "size", size))} />
            </>}
            {selectedFeature?.kind === "primitive" && (selectedFeature.primitive === "sphere" || selectedFeature.primitive === "halfSphere") && <CylinderProfileButtons sphere hemisphere={selectedFeature.primitive === "halfSphere"} locale={locale} elliptical={Boolean(selectedFeature.ellipsoidal)} onChange={(enabled) => mutate((draft) => {
              const feature = draft.features.find((item) => item.id === selectedFeature.id);
              if (feature?.kind === "primitive") setSphereEllipsoidal(feature, enabled);
            })} />}
            {selectedFeature?.kind === "extrude" && (() => {
              const profileSketch = document.features.find((item) => item.id === selectedFeature.sketchId);
              if (profileSketch?.kind !== "sketch" || profileSketch.purpose === "user" || profileSketch.profile.shape !== "circle") return null;
              return <CylinderProfileButtons locale={locale} elliptical={Boolean(profileSketch.profile.elliptical)} onChange={(elliptical) => mutate((draft) => {
                const sketch = draft.features.find((item) => item.id === profileSketch.id);
                if (sketch?.kind === "sketch" && sketch.profile.shape === "circle") {
                  if (elliptical && !sketch.profile.elliptical) sketch.profile.radius2 = sketch.profile.diameter / 2;
                  sketch.profile.elliptical = elliptical;
                }
              })} />;
            })()}
            {selectedReferenceObject?.referenceMesh && <>
              <ViewportFloatingNumberInput locale={locale} value={selectedReferenceObject.referenceMesh.opacity * 100} unit="percent" displayUnit={displayUnit} snap={1} label={t("property.opacity")} min={5} max={100} onCommit={(value) => updateObject(selectedReferenceObject.id, (object) => { if (object.referenceMesh) object.referenceMesh.opacity = value / 100; })} />
              <ReferenceDisplayButtons value={selectedReferenceObject.referenceMesh.displayMode} locale={locale} onChange={(mode) => updateObject(selectedReferenceObject.id, (object) => { if (object.referenceMesh) object.referenceMesh.displayMode = mode; })} />
            </>}
          </>}
          selection={editingSection || placingSection || alignOpen || originEditObjectId || placingWorkplane || editingMirrorPlaneId || selectingTopologyFaces || selectingTopologyEdges ? null : selectedBox}
          scaleTarget={showScaleManipulator && !selectedAnnotation && !editingSection && !placingSection && !alignOpen && !originEditObjectId && !placingWorkplane && !editingMirrorPlaneId && !selectingTopologyFaces && !selectingTopologyEdges && !pendingSweepPathId ? scaleTarget : null}
          onParametricScale={(target, factors, pivot) => mutate((draft) => applyParametricScale(draft, target, factors, pivot))}
          referenceImageSelection={modelSelection.length === 1 && selectionKind === "object" && !editingSection && !placingSection && !alignOpen && !originEditObjectId && !placingWorkplane && !editingMirrorPlaneId && !selectingTopologyFaces && !selectingTopologyEdges ? document.objects.find((object) => object.id === selectedObjectId && object.referenceMesh?.image) : null}
          onReferenceImageScale={(id, factor) => updateObject(id, (object) => { object.transform.scale.x *= factor; object.transform.scale.y *= factor; })}
          snap={snapAmount}
          operationModesVisible={Boolean(selectedOperationId && hasPreviousSolidOperation(document, selectedOperationId))}
          onOperationModeChange={setSelectedOperationMode}
          onShapeParameterChange={(parameter, value) => {
            const targetId = selectedOperationId ?? selectedSketchId;
            if (!targetId) return;
            mutate((draft) => updateParametricShapeParameter(draft, targetId, parameter, value));
          }}
          onObjectOriginMove={(objectId, position) => mutate((draft) => moveParametricObjectOrigin(draft, objectId, position))}
          onObjectAxisMove={(objectId, position) => {
            if (objectId === SECTION_PLANE_ID) { setSectionPose((pose) => ({ ...pose, position: { ...position } })); return; }
            mutate((draft) => {
            const annotation = draft.annotations?.find((candidate) => candidate.id === objectId);
            if (annotation) {
              setAnnotationPosition(annotation, annotationEndpoint, position);
              return;
            }
            const object = draft.objects.find((candidate) => candidate.id === objectId);
            if (object) {
              const previousTransform = structuredClone(object.transform);
              object.transform.position = { ...position };
              transformParametricObjectTopologyHints(draft, objectId, previousTransform);
            }
            });
          }}
          onObjectRotate={(objectId, _axis, deltaDegrees, localAxis) => {
            if (objectId === SECTION_PLANE_ID) { setSectionPose((pose) => ({ ...pose, rotation: rotatedCircleAnnotation(pose.rotation, localAxis, deltaDegrees) })); return; }
            mutate((draft) => {
            const annotation = draft.annotations?.find((item) => item.id === objectId);
            if ((annotation?.kind === "circle" || annotation?.kind === "rectangle")) annotation.rotation = rotatedCircleAnnotation(annotation.rotation, localAxis, deltaDegrees);
            else rotateParametricObjectAroundLocalAxis(draft, objectId, localAxis, deltaDegrees);
            });
          }}
          onOperationAxisMove={(featureId, delta) => mutate((draft) => applyParametricSelectionWorldDelta(draft, featureId, "feature", delta))}
          onOperationRotate={(featureId, axis, deltaDegrees) => mutate((draft) => applyParametricSelectionWorkplaneRotation(draft, featureId, "feature", axis, deltaDegrees))}
          onCameraOrientation={setCameraOrientation}
          onObjectSelect={(objectId, featureId) => {
            if (alignOpen) {
              selectAlignmentReference(modelSelection.find(item => objectIdForFeature(document, item.id) === objectId) ?? null);
              return;
            }
            const object = document.objects.find((candidate) => candidate.id === objectId);
            if (!object || object.locked || !object.visible) return;
            const operation = featureId ? document.features.find((feature) => feature.id === featureId && feature.objectId === objectId) : lastOperationForObject(document, objectId);
            setModelSelection([{ id: operation?.id ?? objectId, kind: operation ? "feature" : "object" }]);
          }}
          onObjectsSelect={(objectIds) => {
            if (alignOpen) { selectAlignmentReference(null); return; }
            const selected = objectIds.flatMap<ModelTreeSelection>((objectId) => {
              const object = document.objects.find((candidate) => candidate.id === objectId);
              if (!object || object.locked || !object.visible) return [];
              return [{ id: objectId, kind: "object" }];
            });
            setModelSelection(selected);
          }}
          onEmptySelect={() => {
            setSectionSelected(false);
            setSelectedAnnotationId(null);
            setAlignOpen(false);
            setModelSelection([]);
          }}
          workplaneFaceSelection={placingSection || placingWorkplane || Boolean(editingMirrorPlaneId)}
          onWorkplaneFaceSelect={({ origin, normal, viewerSide }) => {
            if (placingSection) {
              const direction = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
              if (viewerSide === -1) direction.negate();
              const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
              const rotation = new THREE.Euler().setFromQuaternion(quaternion, "ZYX");
              setSectionPose({ position: { ...origin }, rotation: { x: THREE.MathUtils.radToDeg(rotation.x), y: THREE.MathUtils.radToDeg(rotation.y), z: THREE.MathUtils.radToDeg(rotation.z) }, inverted: true });
              setPlacingSection(false); setSectionEnabled(true); setSectionSelected(true); setNotice(null);
              return;
            }
            if (editingMirrorPlaneId) {
              mutate((draft) => {
                const feature = draft.features.find((candidate) => candidate.id === editingMirrorPlaneId);
                if (feature?.kind !== "mirror") return;
                const object = draft.objects.find((candidate) => candidate.id === feature.objectId);
                if (!object) return;
                const objectMatrix = parametricTransformMatrix(object.transform);
                const localOrigin = new THREE.Vector3(origin.x, origin.y, origin.z).applyMatrix4(objectMatrix.clone().invert());
                const localNormal = new THREE.Vector3(normal.x, normal.y, normal.z)
                  .applyMatrix3(new THREE.Matrix3().setFromMatrix4(objectMatrix).transpose())
                  .normalize();
                feature.planeOrigin = { x: localOrigin.x, y: localOrigin.y, z: localOrigin.z };
                feature.planeNormal = { x: localNormal.x, y: localNormal.y, z: localNormal.z };
              });
              setEditingMirrorPlaneId(null);
              setNotice({ type: "ok", text: t("notice.mirrorPlaneSet") });
            } else {
              mutate((draft) => { Object.assign(draft.workplane, parametricWorkplaneFromFace(origin, normal)); });
              setPlacingWorkplane(false);
              setNotice({ type: "ok", text: t("notice.workplanePlaced") });
            }
          }}
          topologyFaceSelection={selectingTopologyFaces}
          onTopologyFaceSelect={selectTopologyFace}
          topologyEdgeSelection={selectingTopologyEdges}
          onTopologyEdgeSelect={selectTopologyEdge}
          topologySelections={(editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId) && !topologySelectionBuild ? [] : [...selectedTopologyFaces, ...selectedTopologyEdges]}
          topologyMultiSelection={!pendingSweepPathId && !pendingFaceExtrude && !pendingRevolve}
          historicalTopologySelections={editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId || operationContext?.detailMesh ? [] : historicalTopologyReferences}
          historicalTopologyRecords={editingEdgeTreatmentId || editingFaceExtrudeId || editingShellId || editingRevolveId || operationContext?.detailMesh ? [] : historicalTopologyRecords}
          faceExtrudeHandle={alignOpen ? null : faceExtrudeHandle}
          onFaceExtrudeTaperChange={(taperAngle) => {
            if (pendingFaceExtrude) setPendingFaceExtrude((current) => current ? { ...current, taperAngle } : current);
            else if (faceExtrudeHandle?.featureId) updateFeature(faceExtrudeHandle.featureId, (feature) => { if (feature.kind === "faceExtrude") feature.taperAngle = taperAngle; });
          }}
          onFaceExtrudeDistanceChange={(distance, operation) => {
            if (pendingFaceExtrude) setPendingFaceExtrude((current) => current ? { ...current, distance, operation } : current);
            else if (faceExtrudeHandle?.featureId) updateFeature(faceExtrudeHandle.featureId, (feature) => { if (feature.kind === "faceExtrude") { feature.distance = distance; feature.operation = operation; } });
          }}
          faceExtrudeDraft={alignOpen ? null : pendingFaceExtrude}
          onFaceExtrudeAccept={pendingFaceExtrude ? acceptFaceExtrude : undefined}
          onFaceExtrudeCancel={pendingFaceExtrude ? cancelFaceExtrude : undefined}
          faceExtrudeCanAccept={selectedTopologyFaces.length === 1}
          edgeTreatmentHandle={alignOpen ? null : edgeTreatmentHandle}
          onEdgeTreatmentRadiusChange={(radius) => {
            if (pendingEdgeTreatment) setEdgeTreatmentRadius(radius);
            else if (selectedEdgeTreatmentFeature) updateFeature(selectedEdgeTreatmentFeature.id, (feature) => { if (feature.kind === "fillet") feature.radius = radius; });
          }}
          onEdgeTreatmentTypeChange={(treatment) => {
            if (pendingEdgeTreatment) setPendingEdgeTreatment(treatment);
            else if (selectedEdgeTreatmentFeature) updateFeature(selectedEdgeTreatmentFeature.id, (feature) => { if (feature.kind === "fillet") feature.treatment = treatment; });
          }}
          onEdgeTreatmentAccept={pendingEdgeTreatment ? acceptEdgeTreatment : undefined}
          onEdgeTreatmentCancel={pendingEdgeTreatment ? cancelEdgeTreatment : undefined}
          edgeTreatmentCanAccept={selectedTopologyFaces.length + selectedTopologyEdges.length > 0}
          revolveHandle={alignOpen ? null : revolveHandle}
          revolveDraft={alignOpen ? null : pendingRevolve}
          onRevolveDraftChange={(update) => setPendingRevolve((current) => current ? { ...current, ...update } : current)}
          onRevolveAccept={pendingRevolve ? acceptRevolve : undefined}
          onRevolveCancel={pendingRevolve ? cancelRevolve : undefined}
          revolveCanAccept={selectedTopologyFaces.length === 1 && (pendingRevolve?.axis !== "edge" || selectedTopologyEdges.length === 1)}
          onRevolveAngleDragStart={beginTransaction}
          onRevolveAnglePreview={(angle) => {
            if (selectedFeature?.kind !== "revolve" && selectedFeature?.kind !== "polarPattern" && !(selectedFeature?.kind === "primitive" && selectedFeature.primitive === "torus")) return;
            mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "revolve" || feature?.kind === "polarPattern" || feature?.kind === "primitive" && feature.primitive === "torus") feature.angle = feature.kind === "primitive" ? Math.min(360, Math.max(0, angle)) : angle;
            });
          }}
          onRevolveAngleChange={(angle) => {
            if (selectedFeature?.kind === "revolve" || selectedFeature?.kind === "polarPattern" || selectedFeature?.kind === "primitive" && selectedFeature.primitive === "torus") mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "primitive" && feature.primitive === "torus") feature.angle = Math.min(360, Math.max(0, angle));
              else if (feature?.kind === "revolve" || feature?.kind === "polarPattern") feature.angle = Math.min(360, Math.max(-360, Math.abs(angle) < 1 ? (angle < 0 ? -1 : 1) : angle));
            });
            finishTransaction();
          }}
          onRevolveAngleCancel={cancelTransaction}
          distanceHandle={alignOpen ? null : distanceHandle}
          shellDraft={alignOpen ? null : pendingShell}
          onShellDraftChange={(thickness) => setPendingShell((current) => current ? { ...current, thickness: Math.max(0.01, thickness) } : current)}
          onShellCornerTypeChange={(cornerType) => setPendingShell((current) => current ? { ...current, cornerType } : current)}
          onShellAccept={pendingShell ? acceptShell : undefined}
          onShellCancel={pendingShell ? cancelShell : undefined}
          shellCanAccept={selectedTopologyFaces.length > 0 && new Set(selectedTopologyFaces.map((reference) => reference.objectId)).size === 1}
          onDistanceParameterDragStart={beginTransaction}
          onDistanceParameterPreview={(value) => {
            if (selectedFeature?.kind !== "shell" && selectedFeature?.kind !== "linearPattern") return;
            mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "shell") feature.thickness = Math.max(0.01, value);
              if (feature?.kind === "linearPattern") feature.spacing = value;
            });
          }}
          onDistanceParameterChange={(value) => {
            if (selectedFeature?.kind === "shell" || selectedFeature?.kind === "linearPattern") mutate((draft) => {
              const feature = draft.features.find((candidate) => candidate.id === selectedFeature.id);
              if (feature?.kind === "shell") feature.thickness = Math.max(0.01, value);
              if (feature?.kind === "linearPattern") feature.spacing = value;
            });
            finishTransaction();
          }}
          onDistanceParameterCancel={cancelTransaction}
          floatingFeature={alignOpen ? null : viewportFloatingFeature}
          booleanObjects={document.objects}
          patternSources={patternSources}
          booleanAddOnly={viewportFloatingFeature?.kind === "objectBoolean" && !hasPreviousSolidOperation(document, viewportFloatingFeature.id)}
          onEditSketch={beginSketch}
          onEditEdgeTreatmentSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "fillet") beginEdgeTreatment(feature.treatment, feature.id);
          }}
          onEditFaceExtrudeSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "faceExtrude") beginFaceExtrude(feature.operation, feature.id);
          }}
          onEditShellSelection={(featureId) => beginShell(featureId)}
          onEditRevolveFace={(featureId) => beginRevolve(featureId, "face")}
          onEditRevolveAxis={beginRevolveAxisEdit}
          onEditMirrorPlane={beginMirrorPlaneSelection}
          onFloatingFeatureChange={(featureId, update) => updateFeature(featureId, (feature) => {
            if ((feature.kind === "extrude" || feature.kind === "faceExtrude") && update.taperAngle !== undefined) feature.taperAngle = update.taperAngle;
            if (feature.kind === "linearPattern" || feature.kind === "polarPattern") {
              if (update.count !== undefined) feature.count = Math.min(50, Math.max(2, Math.round(update.count)));
              if (feature.kind === "polarPattern") {
                if (update.axis) feature.axis = update.axis;
                if (update.sourceFeatureId === "body") {
                  feature.source = "body";
                  feature.sourceFeatureId = undefined;
                  feature.dependencies = undefined;
                } else if (update.sourceFeatureId && patternSources.some((source) => source.id === update.sourceFeatureId)) {
                  feature.source = "feature";
                  feature.sourceFeatureId = update.sourceFeatureId;
                  feature.dependencies = [{ type: "feature", id: update.sourceFeatureId }];
                }
              }
            }
            if (feature.kind === "objectBoolean") {
              if (update.operation && (update.operation === "add" || hasPreviousSolidOperation(document, featureId))) feature.operation = update.operation;
              if (update.sourceObjectId && update.sourceObjectId !== feature.objectId && document.objects.some((object) => object.id === update.sourceObjectId)) {
                feature.sourceObjectId = update.sourceObjectId;
                feature.dependencies = [{ type: "object", id: update.sourceObjectId }];
              }
            }
            if (feature.kind === "extrude" && update.distance !== undefined && Math.abs(update.distance) >= 0.01) feature.distance = update.distance;
            if (feature.kind === "faceExtrude" && update.distance !== undefined) feature.distance = Math.max(0.01, update.distance);
            if (feature.kind === "revolve" && update.angle !== undefined) feature.angle = Math.min(360, Math.max(-360, update.angle));
            if (feature.kind === "shell" && update.thickness !== undefined) feature.thickness = Math.max(0.01, update.thickness);
            if (feature.kind === "shell" && update.cornerType !== undefined) feature.cornerType = update.cornerType;
            if (feature.kind === "mirror" && update.duplicate !== undefined) feature.duplicate = update.duplicate;
          })}
        />}
        {sketchSession ? <aside ref={constraintsScrollRef} className="kercad-sketch-constraints-panel" aria-label={t("sketch.constraints")}>
          <header>
            <div><strong>{t("sketch.constraints")}</strong><span>{t("sketch.constraintHint")}</span></div>
            <output className={`kercad-sketch-constraint-status ${sketchConstraintStatus.kind}`} role="status" aria-live="polite" aria-atomic="true">{sketchConstraintStatus.label}</output>
          </header>
          <section>
            <h2>{t("sketch.geometric")}</h2>
            <div className="kercad-sketch-side-tool-grid">
              <SketchSideTool label={t("sketch.horizontal")} enabled={selectedConstraintSegments.length > 0} active={selectedConstraintKind("horizontal")} onClick={() => toggleSketchConstraint("horizontal")}><SketchConstraintIcon file="horizontal" /></SketchSideTool>
              <SketchSideTool label={t("sketch.vertical")} enabled={selectedConstraintSegments.length > 0} active={selectedConstraintKind("vertical")} onClick={() => toggleSketchConstraint("vertical")}><SketchConstraintIcon file="vertical" /></SketchSideTool>
              <SketchSideTool label={t("sketch.parallel")} enabled={Boolean(selectedLinePair)} active={selectedPairConstraintKind("parallel")} onClick={() => toggleSketchPairConstraint("parallel")}><SketchConstraintIcon file="parallel" /></SketchSideTool>
              <SketchSideTool label={t("sketch.perpendicular")} enabled={Boolean(selectedLinePair)} active={selectedPairConstraintKind("perpendicular")} onClick={() => toggleSketchPairConstraint("perpendicular")}><SketchConstraintIcon file="perpendicular" /></SketchSideTool>
              <SketchSideTool label={t("sketch.concentric")} enabled={Boolean(selectedCirclePair)} active={selectedConcentricActive} onClick={toggleSketchConcentric}><SketchConstraintIcon file="concentric" /></SketchSideTool>
              <SketchSideTool label={t("sketch.equal")} enabled={selectedEqualLinePairs.length > 0 || Boolean(selectedCirclePair)} active={selectedEqualActive} onClick={toggleSketchEqual}><SketchConstraintIcon file="equal" /></SketchSideTool>
              <SketchSideTool label={t("sketch.midpoint")} enabled={Boolean(selectedPointLinePair)} active={selectedPointLineActive("midpoint")} onClick={() => toggleSketchPointLineConstraint("midpoint")}><SketchConstraintIcon file="midpoint" /></SketchSideTool>
              <SketchSideTool label={t("sketch.pointOnGeometry")} enabled={Boolean(selectedPointLinePair || selectedPointGeometryConstraint)} active={selectedPointLinePair ? selectedPointLineActive("pointOnObject") : selectedPointGeometryActive} onClick={toggleSketchPointOnGeometry}><SketchConstraintIcon file="point-on-geometry" /></SketchSideTool>
              <SketchSideTool label={t("sketch.tangent")} enabled={Boolean(selectedTangentConstraint)} active={selectedTangentActive} onClick={toggleSketchTangent}><SketchConstraintIcon file="tangent" /></SketchSideTool>
              <SketchSideTool label={t("sketch.symmetry")} enabled={Boolean(selectedSymmetrySet)} active={selectedSymmetryActive} onClick={toggleSketchSymmetry}><SketchConstraintIcon file="symmetry" /></SketchSideTool>
              <SketchSideTool label={t("sketch.coincident")} enabled={selectedConstraintPoints.length >= 2} active={selectedPointsCoincident} onClick={toggleCoincidentSketchPoints}><SketchConstraintIcon file="coincident" /></SketchSideTool>
              <SketchSideTool label={t("sketch.fixPoint")} enabled={selectedConstraintPoints.length > 0} active={selectedPointsFixed} onClick={toggleFixedSketchPoints}><SketchConstraintIcon file="fix-point" /></SketchSideTool>
            </div>
          </section>
          <section>
            <h2>{t("sketch.dimensions")}</h2>
            <div className="kercad-sketch-side-tool-grid">
              <SketchSideTool label={t("sketch.distanceX")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("x")} onClick={() => toggleSketchDimension("x")}><SketchConstraintIcon file="distance-x" /></SketchSideTool>
              <SketchSideTool label={t("sketch.distanceY")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("z")} onClick={() => toggleSketchDimension("z")}><SketchConstraintIcon file="distance-y" /></SketchSideTool>
              <SketchSideTool label={t("sketch.dimensionLength")} enabled={Boolean(selectedDimensionSegment)} active={selectedDimensionActive("aligned")} onClick={() => toggleSketchDimension("aligned")}><SketchConstraintIcon file="length" /></SketchSideTool>
              <SketchSideTool label={t("sketch.radius")} enabled={Boolean(selectedDimensionCircle || selectedDimensionArc)} active={selectedRadiusActive} onClick={toggleSketchRadius}><SketchConstraintIcon file="radius" /></SketchSideTool>
              <SketchSideTool label={t("sketch.diameter")} enabled={Boolean(selectedDimensionCircle || selectedDimensionArc)} active={selectedDiameterActive} onClick={toggleSketchDiameter}><SketchConstraintIcon file="diameter" /></SketchSideTool>
              <SketchSideTool label={t("sketch.angle")} enabled={selectedAngleSegments.length > 0 || Boolean(selectedDimensionArc)} active={selectedDimensionArc ? selectedArcAngleActive : selectedAngleActive} onClick={selectedDimensionArc ? toggleSketchArcAngle : toggleSketchAngle}><SketchConstraintIcon file="angle" /></SketchSideTool>
            </div>
          </section>
        </aside> : null}
        <ViewCube orientation={cameraOrientation} onDirection={(direction, smooth = true) => setView((current) => ({ name: "custom", direction, smooth, token: current.token + 1 }))} />
        {challengeEditor && !sketchSession ? <div style={{ display: challengeOpen ? "contents" : "none" }}><ChallengeEditor
          challenge={challengeEditor}
          dock={challengeDock}
          capture={challengeCapture}
          selectionParameters={challengeSelectionParameters}
          onDockChange={setChallengeDock}
          onCapture={(stepId) => {
            setPendingChallengeCapture(stepId);
          }}
          onCancel={() => onCancelChallengeEdit?.()}
          onCollapse={() => setChallengeOpen(false)}
          onSave={(edited) => onSaveChallenge?.(edited, structuredClone(latestDocumentRef.current))}
        /></div> : null}
        {challenge && !sketchSession ? <div style={{ display: challengeOpen ? "contents" : "none" }}><ChallengePlayer challenge={challenge} dock={challengeDock} onDockChange={setChallengeDock} onClose={() => setChallengeOpen(false)} /></div> : null}
        {(challenge || challengeEditor) && !challengeOpen && !sketchSession ? <button className="kercad-challenge-reopen" type="button" title={uiText("ui.challengeplayer.expand.challenge.7b0e39", {}, locale)} aria-label={uiText("ui.challengeplayer.expand.challenge.7b0e39", {}, locale)} onClick={() => setChallengeOpen(true)}><ChallengeIcon size={24} /></button> : null}
        <button data-kercad-popup="grid" className={`kercad-workplane-settings-button ${workplaneOpen ? "active" : ""}`} aria-label={t("grid.settings")} title={t("grid.title")} onClick={() => { setWorkplaneDraft(document.workplane); setWorkplaneOpen((value) => !value); }}><GridControlIcon size={22} /></button>
        <button
          className={`kercad-workplane-snap-button ${document.workplane.snapToGrid ? "active" : ""}`}
          aria-label={document.workplane.snapToGrid ? t("grid.disableSnap") : t("grid.enableSnap")}
          aria-pressed={document.workplane.snapToGrid}
          title={document.workplane.snapToGrid ? t("grid.snapEnabled") : t("grid.snapDisabled")}
          onClick={() => {
            const enabled = !document.workplane.snapToGrid;
            mutate((draft) => { draft.workplane.snapToGrid = enabled; });
            setWorkplaneDraft((current) => ({ ...current, snapToGrid: enabled }));
          }}
        ><GridControlIcon snap size={21} /></button>
        <div className="kercad-snap-spacing-control" data-kercad-popup="snap-spacing" onKeyDown={(event) => { if (event.key === "Escape") setSnapSpacingOpen(false); }}>
          <button type="button" className="kercad-snap-spacing-trigger" aria-label={t("grid.snapSpacing")} title={t("grid.snapSpacing")} aria-expanded={snapSpacingOpen} aria-controls="kercad-snap-spacing-options" onClick={() => setSnapSpacingOpen((open) => !open)}>
            <span>{Number(millimetersToDisplayLength(document.workplane.snapSpacing, displayUnit).toFixed(4))} {displayUnitLabel(displayUnit)}</span><ChevronUp size={15} />
          </button>
          {snapSpacingOpen && <div id="kercad-snap-spacing-options" className="kercad-snap-spacing-options" role="group" aria-label={t("grid.snapSpacing")}>
            {[0.5, 1, 2, 5, 10].map((value) => {
              const active = Math.abs(document.workplane.snapSpacing - displayLengthToMillimeters(value, displayUnit)) < 0.000001;
              return <button type="button" key={value} className={active ? "active" : ""} aria-pressed={active} onClick={() => { updateGridSettings({ snapSpacing: displayLengthToMillimeters(value, displayUnit) }); setSnapSpacingOpen(false); }}>{value} {displayUnitLabel(displayUnit)}{active && <Check size={15} />}</button>;
            })}
            <button type="button" onClick={() => {
              setSnapSpacingOpen(false);
              setWorkplaneDraft(document.workplane);
              focusSnapSpacingRef.current = true;
              setWorkplaneOpen(true);
            }}>{t("grid.customSpacing")}</button>
          </div>}
        </div>
        {workplaneOpen ? <div data-kercad-popup="grid" className="kercad-workplane-popover">
          <header><div><strong>{t("grid.title")}</strong></div><button type="button" aria-label={t("common.close")} onClick={() => setWorkplaneOpen(false)}><X size={17} /></button></header>
          <label className="kercad-grid-visibility"><span>{t("grid.showFloor")}</span><input type="checkbox" role="switch" checked={workplaneDraft.gridVisible} onChange={(event) => updateGridSettings({ gridVisible: event.target.checked })} /><span className="kercad-grid-switch-track" aria-hidden="true" /></label>
          <AdvancedNumberFields label={t("grid.size")} fields={[
            { key: "width", label: t("grid.width"), caption: "X", value: workplaneDraft.width, min: 1, max: 2000 },
            { key: "depth", label: t("grid.depth"), caption: "Y", value: workplaneDraft.depth, min: 1, max: 2000 },
          ]} step={1} unit="mm" displayUnit={displayUnit} locale={locale} onCommit={updateGridSettings} />
          <AdvancedNumberFields label={t("grid.step")} fields={[
            { key: "gridStep", label: `${t("grid.step")} (3D)`, caption: "3D", value: workplaneDraft.gridStep, min: 0.1, max: 200 },
            { key: "sketchGridStep", label: t("grid.sketchViewLineSpacing"), caption: t("operation.sketch"), value: workplaneDraft.sketchGridStep ?? 0, min: 0, max: 200 },
          ]} step={0.1} unit="mm" displayUnit={displayUnit} locale={locale} onCommit={({ gridStep, sketchGridStep }) => updateGridSettings({
            ...(gridStep !== undefined ? { gridStep } : {}),
            ...(sketchGridStep !== undefined ? { sketchGridStep: sketchGridStep > 0 ? Math.max(0.1, sketchGridStep) : 0 } : {}),
          })} />
          <AdvancedNumberInput label={t("grid.snapSpacing")} value={workplaneDraft.snapSpacing} min={0.1} max={10000} step={0.1} unit="mm" displayUnit={displayUnit} locale={locale} inputRef={(input) => { if (input && focusSnapSpacingRef.current) { focusSnapSpacingRef.current = false; input.focus(); input.select(); } }} onCommit={(snapSpacing) => updateGridSettings({ snapSpacing })} />
        </div> : null}
        <button
          className={`kercad-sidebar-mode-control ${modelSidebarMode}`}
          aria-label={modelSidebarMode === "normal" ? t("sidebar.simplify") : modelSidebarMode === "simplified" ? t("sidebar.hide") : t("sidebar.show")}
          title={modelSidebarMode === "normal" ? t("sidebar.visible") : modelSidebarMode === "simplified" ? t("sidebar.simplified") : t("sidebar.hidden")}
          onClick={() => setModelSidebarMode((current) => current === "normal" ? "simplified" : current === "simplified" ? "hidden" : "normal")}
        >
          {modelSidebarMode === "normal" ? <ChevronLeft size={23} /> : modelSidebarMode === "simplified" ? <ChevronDown size={23} /> : <ChevronRight size={23} />}
        </button>
        <div ref={cameraControlsScrollRef} className="camera-controls" aria-label={t("camera.controls")}>
          <button aria-label={t("camera.home")} title={t("camera.home")} onClick={() => setCamera("home")}><Home size={28} /></button>
          <span className="camera-control-separator" aria-hidden="true" />
          <button aria-label={projection === "orthographic" ? t("camera.perspective") : t("camera.orthographic")} title={projection === "orthographic" ? t("camera.perspective") : t("camera.orthographic")} onClick={() => setProjection((current) => current === "orthographic" ? "perspective" : "orthographic")}>
            {projection === "orthographic" ? <ToolbarPerspectiveIcon /> : <ToolbarOrthographicIcon />}
          </button>
          <button className={displayMode === "wireframe" ? "active" : ""} aria-label={t("camera.wireframe")} aria-pressed={displayMode === "wireframe"} title={t("camera.wireframe")} onClick={() => setDisplayMode((current) => current === "solid" ? "wireframe" : "solid")}>
            <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"><path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Zm0 0v9m8-4.5-8 4.5-8-4.5M12 11v11m-8-4.5 8-4.5 8 4.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" /></svg>
          </button>
          <span className="camera-control-separator" aria-hidden="true" />
          <button aria-label={t("camera.fit")} title={t("camera.fit")} onClick={() => setCamera("fit")}><Maximize2 size={26} /></button>
          <button aria-label={t("camera.selection")} title={t("camera.selection")} disabled={!selectedBox} onClick={() => setCamera("selection")}><Focus size={26} /></button>
          <button aria-label={t("camera.zoomIn")} title={t("camera.zoomIn")} onClick={() => setCamera("zoom-in")}><Plus size={33} /></button>
          <button aria-label={t("camera.zoomOut")} title={t("camera.zoomOut")} onClick={() => setCamera("zoom-out")}><Minus size={33} /></button>
        </div>
        {build.warning && <div className="kercad-rebuild-error" role="alert" aria-live="assertive" aria-atomic="true"><strong>{t("history.stopped")}</strong><span>{build.warning}</span>{rebuildSuggestion ? <small><b>{t("rebuild.suggestionLabel")}:</b> {rebuildSuggestion}</small> : null}</div>}
        {notice && <div className={`kercad-reference-toast ${notice.type}`} role={notice.type === "error" ? "alert" : "status"} aria-live={notice.type === "error" ? "assertive" : "polite"} aria-atomic="true">{notice.text}</div>}
        {modelSidebarMode !== "hidden" ? <ParametricModelSidebar
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={(id) => { setAnnotationTool(null); setEditingAnnotationId(null); setModelSelection([]); setSelectedAnnotationId(id); }}
          onUpdateAnnotation={(id, update) => mutate((draft) => { const annotation = draft.annotations?.find((item) => item.id === id); if (annotation) update(annotation); })}
          onUpdateAnnotationGroup={(update) => mutate((draft) => { draft.annotationGroup = { expanded: true, position: 0, ...draft.annotationGroup, ...update }; })}
          document={document}
          selection={modelSelection}
          mode={modelSidebarMode}
          gridStep={document.workplane.snapSpacing}
          displayUnit={displayUnit}
          locale={locale}
          editingOriginObjectId={originEditObjectId}
          failedFeatureId={build.failedFeatureId}
          onSelectionChange={(selection) => { setSelectedAnnotationId(null); setModelSelection(selection); }}
          alignmentReference={alignmentDisplayReference}
          onAlignmentSelect={alignOpen ? selectAlignmentReference : undefined}
          onReorderSelection={reorderSelection}
          onRenameSelection={renameSelection}
          onResetFeature={resetSelectedFeature}
          onDeleteSelection={deleteCurrentSelection}
          onToggleOriginEdit={toggleOriginEdit}
          onEditFeatureSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "fillet") beginEdgeTreatment(feature.treatment, feature.id);
          }}
          onEditSketch={beginSketch}
          onEditFaceExtrudeSelection={(featureId) => {
            const feature = document.features.find((candidate) => candidate.id === featureId);
            if (feature?.kind === "faceExtrude") beginFaceExtrude(feature.operation, feature.id);
          }}
          onEditShellSelection={(featureId) => beginShell(featureId)}
          onEditRevolveFace={(featureId) => beginRevolve(featureId, "face")}
          onEditRevolveAxis={beginRevolveAxisEdit}
          onEditMirrorPlane={beginMirrorPlaneSelection}
          edgeTreatmentDraft={pendingEdgeTreatment ? { treatment: pendingEdgeTreatment, radius: edgeTreatmentRadius, faceCount: selectedTopologyFaces.length, edgeCount: selectedTopologyEdges.length, editing: Boolean(editingEdgeTreatmentId) } : null}
          onEdgeTreatmentDraftChange={(update) => {
            if (update.treatment) setPendingEdgeTreatment(update.treatment);
            if (update.radius !== undefined) setEdgeTreatmentRadius(Math.max(0.01, update.radius));
          }}
          onAcceptEdgeTreatment={acceptEdgeTreatment}
          onCancelEdgeTreatment={cancelEdgeTreatment}
          faceExtrudeDraft={pendingFaceExtrude ? { ...pendingFaceExtrude, faceCount: selectedTopologyFaces.length, editing: Boolean(editingFaceExtrudeId) } : null}
          onFaceExtrudeDraftChange={(update) => setPendingFaceExtrude((current) => current ? { ...current, ...update } : current)}
          onAcceptFaceExtrude={acceptFaceExtrude}
          onCancelFaceExtrude={cancelFaceExtrude}
          shellDraft={pendingShell ? { ...pendingShell, faceCount: selectedTopologyFaces.length, editing: Boolean(editingShellId) } : null}
          onShellDraftChange={(thickness) => setPendingShell((current) => current ? { ...current, thickness: Math.max(0.01, thickness) } : current)}
          onAcceptShell={acceptShell}
          onShellCornerTypeChange={(cornerType) => setPendingShell((current) => current ? { ...current, cornerType } : current)}
          onCancelShell={cancelShell}
          revolveDraft={pendingRevolve ? { ...pendingRevolve, faceCount: selectedTopologyFaces.length, edgeCount: selectedTopologyEdges.length, editing: Boolean(editingRevolveId) } : null}
          onRevolveDraftChange={(update) => setPendingRevolve((current) => current ? { ...current, ...update } : current)}
          onAcceptRevolve={acceptRevolve}
          onCancelRevolve={cancelRevolve}
          onUpdateObject={updateObject}
          onUpdateFeature={updateFeature}
          onUpdateFeatures={(apply) => { mutate((draft) => apply(draft.features)); }}
        /> : null}
      </section>

      {importOpen && <ImportDesignDialog locale={locale} onClose={() => setImportOpen(false)} onBrowse={() => importRef.current?.click()} onFile={(file) => { setImportOpen(false); void importManagedFile(file); }} />}
      <PopupPointer open={exportOpen} panel=".kercad-export-panel" trigger='button[data-kercad-popup="export"]' />
      <PopupPointer open={settingsOpen} panel=".kercad-settings-panel" trigger='button[data-kercad-popup="settings"]' />
      <PopupPointer open={workplaneOpen} panel=".kercad-workplane-popover" trigger='button[data-kercad-popup="grid"]' />
      {exportOpen && (
        <aside data-kercad-popup="export" className="top-action-panel export-action-panel kercad-export-panel">
          <header><div className="top-action-heading"><strong>{t("dialog.exportTitle")}</strong></div><button aria-label={t("common.close")} onClick={() => setExportOpen(false)}><X /></button></header>
          <label className="kercad-export-name"><span>{t("dialog.fileName")}</span><input type="text" value={exportFileName} maxLength={120} placeholder={uiText("common.filenameModel", {}, locale)} onChange={(event) => setExportFileName(event.target.value)} /></label>
          <label className="kercad-export-name"><span>{t("dialog.authorName")}</span><input type="text" value={sharedAuthor} maxLength={160} autoComplete="name" placeholder={t("dialog.authorName")} onChange={(event) => setSharedAuthor(event.target.value)} disabled={projectExporting || sharedSaving} /></label>
          {onSaveShared ? <>
            <button type="button" onClick={() => setSharedSaveOpen(current => !current)} aria-expanded={sharedSaveOpen}>{uiText("dashboard.save.to.shared.5476e1", {}, locale)}</button>
            {sharedSaveOpen ? <form className="kercad-editor-share-form" onSubmit={event => { event.preventDefault(); void publishShared(); }}>
              <p>{uiText("ui.kercadparametriceditor.save.a.copy.on.the.server.for.everyone.local.cha.0911ad", {}, locale)}</p>
              <label>{uiText("dashboard.shared.file.name.930b6b", {}, locale)}<input autoFocus value={sharedName} required maxLength={100} pattern={'[^<>:"/\\\\|?*]+'} disabled={sharedSaving} onChange={event => setSharedName(event.target.value)} /></label>
              <label>{uiText("dashboard.your.name.ab4229", {}, locale)}<input value={sharedAuthor} required maxLength={80} disabled={sharedSaving} onChange={event => setSharedAuthor(event.target.value)} /></label>
              <button type="submit" disabled={sharedSaving || !sharedName.trim() || !sharedAuthor.trim()}>{sharedSaving ? (uiText("dialog.saving", {}, locale)) : (uiText("ui.kercadparametriceditor.publish.project.0b468c", {}, locale))}</button>
              {sharedSaveMessage ? <p role="status">{sharedSaveMessage}</p> : null}
            </form> : null}
          </> : null}
          <div className="kercad-export-options">
            <div className="kercad-export-option kercad-project-export-option" role="group" aria-label={t("dialog.projectFormat")}>
              <div className="kercad-export-option-header"><span className="export-format-icon">kerCAD</span><strong>{t("dialog.projectFormat")}</strong><button type="button" onClick={() => void exportProject()} disabled={projectExporting}>{projectExporting ? t("dialog.saving") : t("toolbar.export")}</button></div>
            </div>
            <div className="kercad-export-option" role="group" aria-label={t("dialog.stepFormat")}><div className="kercad-export-option-header"><span className="export-format-icon step">{uiText("ui.parametriccadeditor.step.0c9b85", {}, locale)}</span><strong>{t("dialog.stepFormat")}</strong><button type="button" onClick={() => void exportStep()} disabled={exporting || kernelBusy || !build.mesh || (exportScope === "selection" && !exportSelectedObjectIds.length)}>{exporting ? t("dialog.exporting") : t("toolbar.export")}</button></div></div>
            <div className="kercad-export-option kercad-stl-export-option" role="group" aria-label={t("dialog.stlFormat")}>
              <div className="kercad-export-option-header"><span className="export-format-icon">{uiText("ui.legacyworkplaneeditor.stl.735c11", {}, locale)}</span><strong>{t("dialog.stlFormat")}</strong><button type="button" onClick={() => void exportStl()} disabled={stlExporting || kernelBusy || build.objectRecords.length === 0 || (stlExportScope === "selection" && !exportSelectedObjectIds.length)}>{stlExporting ? t("dialog.exporting") : t("toolbar.export")}</button></div>
              <div className="kercad-stl-scope-buttons" role="group" aria-label={uiText("ui.kercadparametriceditor.stl.export.scope.defecc", {}, locale)}>
                <button type="button" aria-pressed={stlExportScope === "project"} disabled={stlExporting} onClick={() => setStlExportScope("project")}>{uiText("ui.kercadparametriceditor.whole.project.a904ea", {}, locale)}</button>
                <button type="button" aria-pressed={stlExportScope === "selection"} disabled={stlExporting || !exportSelectedObjectIds.length} onClick={() => setStlExportScope("selection")}>{uiText("ui.kercadparametriceditor.selection.only.66c1ae", {}, locale)} ({exportSelectedObjectIds.length})</button>
              </div>
              <label className="kercad-stl-quality"><span>{t("dialog.stlQuality")}: <strong>{t(stlQuality === "low" ? "dialog.qualityLow" : stlQuality === "medium" ? "dialog.qualityMedium" : stlQuality === "high" ? "dialog.qualityHigh" : "dialog.qualityVeryHigh")}</strong></span><input type="range" min={0} max={3} step={1} value={(["low", "medium", "high", "veryHigh"] as const).indexOf(stlQuality)} aria-valuetext={t(stlQuality === "low" ? "dialog.qualityLow" : stlQuality === "medium" ? "dialog.qualityMedium" : stlQuality === "high" ? "dialog.qualityHigh" : "dialog.qualityVeryHigh")} onChange={(event) => setStlQuality((["low", "medium", "high", "veryHigh"] as const)[Number(event.target.value)])} /><span className="kercad-stl-quality-labels" aria-hidden="true"><small>{t("dialog.qualityLow")}</small><small>{t("dialog.qualityMedium")}</small><small>{t("dialog.qualityHigh")}</small><small>{t("dialog.qualityVeryHigh")}</small></span></label>
            </div>
          </div>
        </aside>
      )}

      {projectRenameOpen ? (
        <div className="kercad-dialog-backdrop" onPointerDown={() => setProjectRenameOpen(false)}>
          <form ref={projectRenameDialogRef} className="kercad-new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-project-rename-title" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()} onSubmit={(event) => {
            event.preventDefault();
            if (saveProjectDetails()) setProjectRenameOpen(false);
          }}>
            <header><strong id="kercad-project-rename-title">{uiText("dashboard.rename.project.633018", {}, locale)}</strong><button type="button" aria-label={t("common.close")} onClick={() => setProjectRenameOpen(false)}><X /></button></header>
            <label className="kercad-project-rename-field"><span>{t("settings.name")}</span><input autoFocus value={projectRenameDraft} maxLength={120} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setProjectRenameDraft(event.target.value)} /></label>
            <label className="kercad-project-rename-field"><span>{t("project.author")}</span><input value={projectAuthorDraft} maxLength={160} autoComplete="name" onChange={(event) => setProjectAuthorDraft(event.target.value)} /></label>
            <section className="kercad-project-cover-controls">
              <strong>{t("project.cover")}</strong>
              {document.thumbnailOverride && <img src={document.thumbnailOverride} alt={t("project.cover")} />}
              <small>{t(document.thumbnailOverride ? "project.coverManual" : "project.coverAutomatic")}</small>
              <div><button type="button" disabled={Boolean(sketchSession)} onClick={() => {
                if (sketchSession) return;
                if (!saveProjectDetails()) return;
                setProjectRenameOpen(false); setPendingChallengeCapture(null); setPendingProjectCapture(true);
              }}><Camera size={18} />{t("project.captureCover")}</button>
              <button type="button" disabled={!document.thumbnailOverride} onClick={() => {
                mutate((draft) => { delete draft.thumbnailOverride; });
                projectCaptureRequestRef.current = false; challengeCaptureStepRef.current = null;
                setChallengeCaptureCrop(undefined); setChallengeCaptureToken((current) => current + 1);
              }}><RotateCcw size={18} />{t("project.resetCover")}</button></div>
            </section>
            <footer><button type="button" onClick={() => setProjectRenameOpen(false)}>{t("common.cancel")}</button><button type="submit" className="primary" disabled={!projectRenameDraft.trim()}>{uiText("dashboard.ok.9ce3bd", {}, locale)}</button></footer>
          </form>
        </div>
      ) : null}
      {newDocumentOpen ? (
        <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setNewDocumentOpen(false)}>
          <section ref={newDocumentDialogRef} className="kercad-new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-new-document-title" aria-describedby="kercad-new-document-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
            <header><strong id="kercad-new-document-title">{t("dialog.newTitle")}</strong><button type="button" aria-label={t("common.cancel")} onClick={() => setNewDocumentOpen(false)}><X size={18} /></button></header>
            <p id="kercad-new-document-description">{t("dialog.newWarning")}</p>
            <footer><button type="button" onClick={() => setNewDocumentOpen(false)}>{t("common.cancel")}</button><button type="button" className="danger" onClick={newDocument}>{t("dialog.createNew")}</button><button type="button" className="primary" onClick={openExportFromNewDocumentWarning}>{t("dialog.save")}</button></footer>
          </section>
        </div>
      ) : null}

      {pendingProjectImport ? (
        <div className="kercad-dialog-backdrop" role="presentation" onPointerDown={() => setPendingProjectImport(null)}>
          <section ref={importProjectDialogRef} className="kercad-new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-import-project-title" aria-describedby="kercad-import-project-description" tabIndex={-1} onPointerDown={(event) => event.stopPropagation()}>
            <header><strong id="kercad-import-project-title">{t("dialog.importProject")}</strong><button type="button" aria-label={t("common.cancel")} onClick={() => setPendingProjectImport(null)}><X size={18} /></button></header>
            <p id="kercad-import-project-description"><strong>{pendingProjectImport.document.name || pendingProjectImport.fileName}</strong> {t("dialog.contains")} {pendingProjectImport.document.objects.length} {t(pendingProjectImport.document.objects.length === 1 ? "dialog.object" : "dialog.objects")}. {t("dialog.importChoice")}</p>
            <footer><button type="button" onClick={() => setPendingProjectImport(null)}>{t("common.cancel")}</button><button type="button" onClick={openPendingProject}>{t("common.open")}</button><button type="button" className="primary" onClick={mergePendingProject}>{t("dialog.addToCurrent")}</button></footer>
          </section>
        </div>
      ) : null}

      {settingsOpen && (
        <aside data-kercad-popup="settings" className="top-action-panel kercad-settings-panel">
          <header><strong>{t("settings.title")}</strong><button aria-label={t("common.close")} onClick={() => setSettingsOpen(false)}><X /></button></header>
          <label><span>{t("settings.rendering")}</span><select value={renderQuality} onChange={(event) => setRenderQuality(event.target.value as ViewportRenderQuality)}><option value="normal">{t("settings.renderNormal")}</option><option value="optimized">{t("settings.renderOptimized")}</option></select></label>
          <label><span>{t("settings.shading")}</span><select value={shadingMode} onChange={(event) => setShadingMode(event.target.value as ViewportShadingMode)}><option value="shadows">{t("settings.shadows")}</option><option value="basic">{t("settings.basicShadows")}</option><option value="noShadows">{t("settings.noShadows")}</option></select></label>
          <label><span>{t("settings.units")}</span><select value={displayUnit} onChange={(event) => { const next = cloneDocument(latestDocumentRef.current); next.displayUnit = normalizeDisplayUnit(event.target.value); commit(next); }}><option value="mm">{t("settings.millimeters")}</option><option value="cm">{t("settings.centimeters")}</option><option value="m">{t("settings.meters")}</option><option value="in">{t("settings.inches")}</option><option value="ft">{t("settings.feet")}</option></select></label>
          {/* <p>{t("settings.unitsHint")}</p> */}
          <label className="kercad-settings-toggle"><span>{t("settings.showFps")}</span><input type="checkbox" checked={showFps} onChange={(event) => setShowFps(event.target.checked)} /></label>
          {/* <p>{t("settings.autosave")}</p> */}
        </aside>
      )}

      <input ref={importRef} hidden type="file" accept={".kercad,.kercad.json,.json,.svg,.step,.stp,.stl,.obj,.jpg,.jpeg,.png,image/jpeg,image/png,application/vnd.kercad.project+zip,application/json,image/svg+xml,model/step,model/stl,model/obj ," + LEGACY_PROJECT_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) { setImportOpen(false); void importManagedFile(file); } event.target.value = ""; }} />
      <input ref={sketchSvgImportRef} hidden type="file" accept=".svg,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSvgIntoSketch(file); event.target.value = ""; }} />
    </main>
  );
}

function FpsCounter({ sketchMode = false }: { sketchMode?: boolean }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (sketchMode) {
      let frame = 0;
      let frames = 0;
      let started = performance.now();
      setFps(0);
      const sample = (now: number) => {
        frames += 1;
        if (now - started >= 500) {
          setFps(Math.round(frames * 1000 / (now - started)));
          frames = 0;
          started = now;
        }
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      return () => cancelAnimationFrame(frame);
    }
    const update = () => setFps(Math.round(window.kercadParametricPerf?.get().fps ?? 0));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [sketchMode]);
  const tone = fps > 0 && fps < 20 ? "low" : fps < 40 ? "medium" : "high";
  return <output className={`kercad-fps-counter ${tone}`} aria-label={uiText("ui.kercadparametriceditor.frames.per.second.1f5f3f", { value0: fps })}>{fps} {uiText("ui.kercadparametriceditor.fps.fce204")}</output>;
}

function BackgroundProcessIndicator({ label, rightOffset, regenerating = false }: { label: string; rightOffset: number; regenerating?: boolean }) {
  return <output className={`kercad-background-process ${regenerating ? "regenerating" : ""}`} role="status" aria-live="polite" aria-atomic="true" aria-busy="true" aria-label={label} style={{ right: rightOffset }}><span aria-hidden="true" />{label}</output>;
}

function ToolbarSection({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`toolbar-section ${className}`}><div className="toolbar-section-label">{label}</div><div className="toolbar-section-tools">{children}</div></div>;
}

function Tool({ label, className = "", enabled = true, active, onClick, children }: { label: string; className?: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`toolbar-icon ${className} ${enabled ? "" : "disabled"} ${active ? "active" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} disabled={!enabled} onClick={onClick}>{children}</button>;
}

function SketchSideTool({ label, enabled = true, active, onClick, children }: { label: string; enabled?: boolean; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`kercad-sketch-side-tool ${active ? "active" : ""}`} type="button" aria-label={label} aria-pressed={active} disabled={!enabled} title={label} onClick={onClick}><span className="kercad-sketch-side-tool-icon">{children}</span></button>;
}

function ViewCube({ orientation, onDirection }: { orientation: CameraOrientation; onDirection: (direction: [number, number, number], smooth?: boolean) => void }) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; azimuth: number; polar: number } | null>(null);
  const draggedRef = useRef(false);
  const [hoveredSurfaceId, setHoveredSurfaceId] = useState<string | null>(null);
  const chooseDirection = (direction: [number, number, number]) => {
    if (!draggedRef.current) onDirection(direction, true);
    draggedRef.current = false;
  };
  type CubePoint = [number, number, number];
  type CubeSurface = { id: string; kind: "face" | "edge" | "corner"; points: CubePoint[]; direction: CubePoint; label?: string; textRight?: CubePoint; textDown?: CubePoint };
  const half = 29;
  const faceHalf = 20;
  const axes = [0, 1, 2] as const;
  const point = (values: Partial<Record<(typeof axes)[number], number>>): CubePoint => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  const faceLabels = new Map<string, string>([
    ["0:1", "LEFT"], ["0:-1", "RIGHT"], ["1:1", "TOP"], ["1:-1", "BOTTOM"], ["2:1", "FRONT"], ["2:-1", "BACK"],
  ]);
  const faceTextBasis = (axis: number, sign: number): { textRight: CubePoint; textDown: CubePoint } => {
    if (axis === 0) return { textRight: [0, 0, -sign], textDown: [0, -1, 0] };
    if (axis === 1) return { textRight: [1, 0, 0], textDown: [0, 0, sign] };
    return { textRight: [sign, 0, 0], textDown: [0, -1, 0] };
  };
  const surfaces: CubeSurface[] = [];
  for (const axis of axes) for (const sign of [-1, 1] as const) {
    const [first, second] = axes.filter((candidate) => candidate !== axis);
    surfaces.push({
      id: `face-${axis}-${sign}`,
      kind: "face",
      direction: point({ [axis]: sign }),
      label: faceLabels.get(`${axis}:${sign}`),
      ...faceTextBasis(axis, sign),
      points: [
        point({ [axis]: sign * half, [first]: -faceHalf, [second]: -faceHalf }),
        point({ [axis]: sign * half, [first]: faceHalf, [second]: -faceHalf }),
        point({ [axis]: sign * half, [first]: faceHalf, [second]: faceHalf }),
        point({ [axis]: sign * half, [first]: -faceHalf, [second]: faceHalf }),
      ],
    });
  }
  for (let firstAxis = 0; firstAxis < 3; firstAxis += 1) for (let secondAxis = firstAxis + 1; secondAxis < 3; secondAxis += 1) {
    const lengthAxis = axes.find((axis) => axis !== firstAxis && axis !== secondAxis)!;
    for (const firstSign of [-1, 1] as const) for (const secondSign of [-1, 1] as const) surfaces.push({
      id: `edge-${firstAxis}-${firstSign}-${secondAxis}-${secondSign}`,
      kind: "edge",
      direction: point({ [firstAxis]: firstSign, [secondAxis]: secondSign }),
      points: [
        point({ [firstAxis]: firstSign * half, [secondAxis]: secondSign * faceHalf, [lengthAxis]: -faceHalf }),
        point({ [firstAxis]: firstSign * half, [secondAxis]: secondSign * faceHalf, [lengthAxis]: faceHalf }),
        point({ [firstAxis]: firstSign * faceHalf, [secondAxis]: secondSign * half, [lengthAxis]: faceHalf }),
        point({ [firstAxis]: firstSign * faceHalf, [secondAxis]: secondSign * half, [lengthAxis]: -faceHalf }),
      ],
    });
  }
  for (const x of [-1, 1] as const) for (const y of [-1, 1] as const) for (const z of [-1, 1] as const) surfaces.push({
    id: `corner-${x}-${y}-${z}`,
    kind: "corner",
    direction: [x, y, z],
    points: [[x * half, y * faceHalf, z * faceHalf], [x * faceHalf, y * half, z * faceHalf], [x * faceHalf, y * faceHalf, z * half]],
  });
  const rotate = ([x, logicalY, z]: CubePoint): CubePoint => {
    const y = -logicalY;
    const yaw = -orientation.azimuth;
    const pitch = orientation.polar - Math.PI / 2;
    const yawX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const yawZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [yawX, y * Math.cos(pitch) - yawZ * Math.sin(pitch), y * Math.sin(pitch) + yawZ * Math.cos(pitch)];
  };
  const projectPoint = (source: CubePoint) => {
    const [x, y, z] = rotate(source);
    const perspective = 420 / (420 - z);
    return [41 + x * perspective, 41 + y * perspective] as const;
  };
  const projected = surfaces.filter((surface) => rotate(surface.direction)[2] > 0.001).map((surface) => {
    const transformed = surface.points.map(rotate);
    const points = surface.points.map(projectPoint);
    const center = points.reduce((sum, current) => [sum[0] + current[0] / points.length, sum[1] + current[1] / points.length], [0, 0]);
    const center3d = surface.points.reduce<CubePoint>((sum, current) => [sum[0] + current[0] / surface.points.length, sum[1] + current[1] / surface.points.length, sum[2] + current[2] / surface.points.length], [0, 0, 0]);
    const textTransform = surface.textRight && surface.textDown ? (() => {
      const origin = projectPoint(center3d);
      const right = projectPoint([center3d[0] + surface.textRight![0], center3d[1] + surface.textRight![1], center3d[2] + surface.textRight![2]]);
      const down = projectPoint([center3d[0] + surface.textDown![0], center3d[1] + surface.textDown![1], center3d[2] + surface.textDown![2]]);
      return `matrix(${(right[0] - origin[0]).toFixed(5)} ${(right[1] - origin[1]).toFixed(5)} ${(down[0] - origin[0]).toFixed(5)} ${(down[1] - origin[1]).toFixed(5)} ${origin[0].toFixed(3)} ${origin[1].toFixed(3)})`;
    })() : undefined;
    return { ...surface, points, center, textTransform, depth: transformed.reduce((sum, current) => sum + current[2], 0) / transformed.length };
  }).sort((first, second) => first.depth - second.depth);
  const pointInPolygon = (x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) => {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [currentX, currentY] = polygon[index];
      const [previousX, previousY] = polygon[previous];
      if ((currentY > y) !== (previousY > y) && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX) inside = !inside;
    }
    return inside;
  };
  const distanceToPolygon = (x: number, y: number, polygon: ReadonlyArray<readonly [number, number]>) => {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 0; index < polygon.length; index += 1) {
      const [startX, startY] = polygon[index];
      const [endX, endY] = polygon[(index + 1) % polygon.length];
      const dx = endX - startX;
      const dy = endY - startY;
      const lengthSquared = dx * dx + dy * dy;
      const amount = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared)) : 0;
      minimum = Math.min(minimum, Math.hypot(x - (startX + dx * amount), y - (startY + dy * amount)));
    }
    return minimum;
  };
  const surfaceAt = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const x = (clientX - bounds.left) * 82 / Math.max(1, bounds.width);
    const y = (clientY - bounds.top) * 82 / Math.max(1, bounds.height);
    const priority = { face: 0, edge: 1, corner: 2 } as const;
    return projected.filter((surface) => pointInPolygon(x, y, surface.points) || (surface.kind !== "face" && distanceToPolygon(x, y, surface.points) <= 1.25))
      .sort((first, second) => priority[second.kind] - priority[first.kind] || second.depth - first.depth)[0] ?? null;
  };
  return <div
    className="view-cube"
    aria-label={uiText("ui.kercadparametriceditor.cubo.de.vistas.interactivo.48a94b")}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      setHoveredSurfaceId(surfaceAt(event.clientX, event.clientY, event.currentTarget)?.id ?? null);
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, azimuth: orientation.azimuth, polar: orientation.polar };
      draggedRef.current = false;
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        setHoveredSurfaceId(surfaceAt(event.clientX, event.clientY, event.currentTarget)?.id ?? null);
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      draggedRef.current = true;
      setHoveredSurfaceId(null);
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      const azimuth = drag.azimuth - dx * 0.012;
      const polar = Math.min(Math.PI - 0.03, Math.max(0.03, drag.polar - dy * 0.012));
      onDirection([Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)], false);
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    }}
    onPointerCancel={() => { dragRef.current = null; draggedRef.current = false; setHoveredSurfaceId(null); }}
    onPointerLeave={() => { if (!dragRef.current) setHoveredSurfaceId(null); }}
    onClick={() => {
      const surface = projected.find((candidate) => candidate.id === hoveredSurfaceId);
      if (surface) chooseDirection(surface.direction);
    }}
  ><svg className="kercad-navicube" viewBox="0 0 82 82" role="group" aria-label={uiText("ui.kercadparametriceditor.view.directions.7bb8d1")}>
    {projected.map((surface) => <g key={surface.id} className={`kercad-navicube-surface ${surface.kind} ${hoveredSurfaceId === surface.id ? "hovered" : ""}`} pointerEvents="none" role="button" tabIndex={0} aria-label={surface.label ? uiText("ui.kercadparametriceditor.view.81bf77", { value0: surface.label }) : uiText("ui.kercadparametriceditor.view.b4f03d", { value0: surface.kind, value1: surface.direction.join(", ") })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseDirection(surface.direction); } }}>
      <polygon points={surface.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} />
      {surface.label && surface.textTransform ? <text x={0} y={0} transform={surface.textTransform}>{surface.label}</text> : null}
    </g>)}
  </svg></div>;
}
