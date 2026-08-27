import { assertValidParametricDependencies } from "@/lib/parametricDependencyGraph";
import { cloneDocument, normalizeParametricDocument } from "@/lib/parametricDocument";
import { assertValidParametricTopology } from "@/lib/parametricTopology";
import type { ParametricDocument, ParametricFeature } from "@/types/parametric";

export type ParametricProjectMergeResult = {
  document: ParametricDocument;
  importedObjectIds: string[];
  objectIdMap: Map<string, string>;
  featureIdMap: Map<string, string>;
  topologyReferenceIdMap: Map<string, string>;
};

function uniqueImportedId(original: string, used: Set<string>) {
  if (!used.has(original)) {
    used.add(original);
    return original;
  }
  let suffix = 2;
  let candidate = `${original}-import-${suffix}`;
  while (used.has(candidate)) candidate = `${original}-import-${suffix += 1}`;
  used.add(candidate);
  return candidate;
}

function remapOptional(id: string | undefined, ids: Map<string, string>) {
  return id === undefined ? undefined : ids.get(id) ?? id;
}

function remapFeatureReferences(feature: ParametricFeature, featureIds: Map<string, string>, objectIds: Map<string, string>, topologyIds: Map<string, string>) {
  feature.id = featureIds.get(feature.id) ?? feature.id;
  feature.objectId = remapOptional(feature.objectId, objectIds);
  feature.dependencies = feature.dependencies?.map((dependency) => ({
    ...dependency,
    id: dependency.type === "object" ? objectIds.get(dependency.id) ?? dependency.id : featureIds.get(dependency.id) ?? dependency.id,
  }));
  if (feature.kind === "extrude") feature.sketchId = featureIds.get(feature.sketchId) ?? feature.sketchId;
  if (feature.kind === "fillet") {
    feature.edgeReferenceIds = feature.edgeReferenceIds?.map((id) => topologyIds.get(id) ?? id);
    feature.selectionReferenceIds = feature.selectionReferenceIds?.map((id) => topologyIds.get(id) ?? id);
  }
  if (feature.kind === "faceExtrude") feature.faceReferenceId = topologyIds.get(feature.faceReferenceId) ?? feature.faceReferenceId;
  if (feature.kind === "shell") feature.faceReferenceIds = feature.faceReferenceIds.map((id) => topologyIds.get(id) ?? id);
  if (feature.kind === "revolve") {
    feature.axisReferenceId = remapOptional(feature.axisReferenceId, topologyIds);
    feature.faceReferenceId = remapOptional(feature.faceReferenceId, topologyIds);
    feature.sketchId = remapOptional(feature.sketchId, featureIds);
  }
  if (feature.kind === "linearPattern" || feature.kind === "polarPattern") feature.sourceFeatureId = remapOptional(feature.sourceFeatureId, featureIds);
  if (feature.kind === "objectBoolean") feature.sourceObjectId = objectIds.get(feature.sourceObjectId) ?? feature.sourceObjectId;
}

function remapTopologyOrigin(origin: string, featureIds: Map<string, string>) {
  for (const [previous, next] of featureIds) {
    if (origin === previous) return next;
    if (origin.startsWith(`${previous}:`)) return `${next}${origin.slice(previous.length)}`;
  }
  return origin;
}

export function mergeParametricProjects(targetInput: ParametricDocument, importedInput: ParametricDocument): ParametricProjectMergeResult {
  const target = cloneDocument(normalizeParametricDocument(targetInput));
  const imported = cloneDocument(normalizeParametricDocument(importedInput));
  assertValidParametricDependencies(imported);
  assertValidParametricTopology(imported);

  const usedIds = new Set([
    target.id,
    ...target.objects.map((object) => object.id),
    ...target.features.map((feature) => feature.id),
    ...target.topologyReferences.map((reference) => reference.id),
  ]);
  const objectIdMap = new Map(imported.objects.map((object) => [object.id, uniqueImportedId(object.id, usedIds)]));
  const featureIdMap = new Map(imported.features.map((feature) => [feature.id, uniqueImportedId(feature.id, usedIds)]));
  const topologyReferenceIdMap = new Map(imported.topologyReferences.map((reference) => [reference.id, uniqueImportedId(reference.id, usedIds)]));

  for (const object of imported.objects) object.id = objectIdMap.get(object.id) ?? object.id;
  for (const feature of imported.features) remapFeatureReferences(feature, featureIdMap, objectIdMap, topologyReferenceIdMap);
  for (const reference of imported.topologyReferences) {
    reference.id = topologyReferenceIdMap.get(reference.id) ?? reference.id;
    reference.objectId = objectIdMap.get(reference.objectId) ?? reference.objectId;
    reference.sourceFeatureId = featureIdMap.get(reference.sourceFeatureId) ?? reference.sourceFeatureId;
    reference.reference.origin = remapTopologyOrigin(reference.reference.origin, featureIdMap);
  }

  target.objects.push(...imported.objects);
  target.features.push(...imported.features);
  target.topologyReferences.push(...imported.topologyReferences);
  target.updatedAt = Date.now();
  assertValidParametricDependencies(target);
  assertValidParametricTopology(target);
  return {
    document: target,
    importedObjectIds: imported.objects.map((object) => object.id),
    objectIdMap,
    featureIdMap,
    topologyReferenceIdMap,
  };
}
