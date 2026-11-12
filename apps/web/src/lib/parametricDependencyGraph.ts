import type { ParametricDependencyReference, ParametricDocument, ParametricFeature } from "@/types/parametric";

export class ParametricDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParametricDependencyError";
  }
}

function explicitDependencyId(
  reference: ParametricDependencyReference,
  featureIds: Set<string>,
  lastOperationByObject: Map<string, string>,
  objectIds: Set<string>,
) {
  if (reference.type === "feature") {
    if (!featureIds.has(reference.id)) throw new ParametricDependencyError(`Referenced operation ${reference.id} does not exist.`);
    return reference.id;
  }
  if (!objectIds.has(reference.id)) throw new ParametricDependencyError(`Referenced object ${reference.id} does not exist.`);
  const dependency = lastOperationByObject.get(reference.id);
  if (!dependency) throw new ParametricDependencyError(`Referenced object ${reference.id} does not have any operations yet.`);
  return dependency;
}

export function parametricFeatureDependencies(document: ParametricDocument) {
  const featureIds = new Set(document.features.map((feature) => feature.id));
  const objectIds = new Set(document.objects.map((object) => object.id));
  const lastOperationByObject = new Map<string, string>();
  for (const feature of document.features) {
    if (feature.objectId && feature.kind !== "sketch") lastOperationByObject.set(feature.objectId, feature.id);
  }
  const previousOperationByObject = new Map<string, string>();
  const dependencies = new Map<string, Set<string>>();
  for (const feature of document.features) {
    const inputs = new Set<string>();
    if (feature.kind === "extrude") {
      if (!featureIds.has(feature.sketchId)) throw new ParametricDependencyError(`${feature.name}: source sketch could not be found.`);
      inputs.add(feature.sketchId);
      if (feature.pathSketchId) {
        if (!featureIds.has(feature.pathSketchId)) throw new ParametricDependencyError(`${feature.name}: source sketch could not be found.`);
        inputs.add(feature.pathSketchId);
      }
      if (feature.endSketchId) {
        if (!featureIds.has(feature.endSketchId)) throw new ParametricDependencyError(`${feature.name}: source sketch could not be found.`);
        inputs.add(feature.endSketchId);
      }
    }
    if (feature.objectId && feature.kind !== "sketch") {
      const previous = previousOperationByObject.get(feature.objectId);
      if (previous) inputs.add(previous);
      previousOperationByObject.set(feature.objectId, feature.id);
    }
    for (const reference of feature.dependencies ?? []) {
      inputs.add(explicitDependencyId(reference, featureIds, lastOperationByObject, objectIds));
    }
    if (inputs.has(feature.id)) throw new ParametricDependencyError(`${feature.name} cannot depend on itself.`);
    dependencies.set(feature.id, inputs);
  }
  return dependencies;
}

export function topologicallySortedParametricFeatures(document: ParametricDocument): ParametricFeature[] {
  const dependencies = parametricFeatureDependencies(document);
  const featureById = new Map(document.features.map((feature) => [feature.id, feature]));
  const originalIndex = new Map(document.features.map((feature, index) => [feature.id, index]));
  const dependents = new Map<string, string[]>();
  const pendingCount = new Map<string, number>();
  for (const [featureId, inputs] of dependencies) {
    pendingCount.set(featureId, inputs.size);
    for (const input of inputs) dependents.set(input, [...dependents.get(input) ?? [], featureId]);
  }
  const ready = document.features.filter((feature) => pendingCount.get(feature.id) === 0).map((feature) => feature.id);
  const sorted: ParametricFeature[] = [];
  while (ready.length > 0) {
    ready.sort((left, right) => (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0));
    const featureId = ready.shift();
    if (!featureId) break;
    const feature = featureById.get(featureId);
    if (feature) sorted.push(feature);
    for (const dependent of dependents.get(featureId) ?? []) {
      const count = (pendingCount.get(dependent) ?? 0) - 1;
      pendingCount.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }
  if (sorted.length !== document.features.length) {
    const cyclic = document.features.filter((feature) => (pendingCount.get(feature.id) ?? 0) > 0).map((feature) => feature.name);
    throw new ParametricDependencyError(`A cyclic reference was detected: ${cyclic.join(" → ")}.`);
  }
  return sorted;
}

export function assertValidParametricDependencies(document: ParametricDocument) {
  topologicallySortedParametricFeatures(document);
}
