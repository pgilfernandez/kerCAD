import type { ParametricDocument, ParametricTopologyReference } from "@/types/parametric";

export class ParametricTopologyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParametricTopologyError";
  }
}

function finiteVector(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function isParametricTopologyReference(value: unknown): value is ParametricTopologyReference {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<ParametricTopologyReference>;
  if (typeof stored.id !== "string" || typeof stored.name !== "string" || typeof stored.objectId !== "string" || typeof stored.sourceFeatureId !== "string") return false;
  const reference = stored.reference as ParametricTopologyReference["reference"] | undefined;
  if (!reference || typeof reference.origin !== "string" || !reference.hint) return false;
  if (reference.hint.entityType === "face") {
    return "role" in reference && typeof reference.role === "string"
      && (reference.hint.normal === undefined || finiteVector(reference.hint.normal))
      && (reference.hint.centroid === undefined || finiteVector(reference.hint.centroid))
      && (reference.hint.area === undefined || Number.isFinite(reference.hint.area));
  }
  return reference.hint.entityType === "edge"
    && "faceRoles" in reference
    && Array.isArray(reference.faceRoles)
    && reference.faceRoles.length === 2
    && reference.faceRoles.every((role) => typeof role === "string")
    && (reference.hint.midpoint === undefined || finiteVector(reference.hint.midpoint))
    && (reference.hint.length === undefined || Number.isFinite(reference.hint.length));
}

export function assertValidParametricTopology(document: ParametricDocument) {
  const objectIds = new Set(document.objects.map((object) => object.id));
  const featureById = new Map(document.features.map((feature) => [feature.id, feature]));
  const references = new Map<string, ParametricTopologyReference>();
  for (const reference of document.topologyReferences) {
    if (!isParametricTopologyReference(reference)) throw new ParametricTopologyError("El proyecto contiene una referencia de cara o arista no válida.");
    if (references.has(reference.id)) throw new ParametricTopologyError(`La referencia topológica ${reference.id} está duplicada.`);
    if (!objectIds.has(reference.objectId)) throw new ParametricTopologyError(`${reference.name}: el objeto de origen ya no existe.`);
    const source = featureById.get(reference.sourceFeatureId);
    if (!source) throw new ParametricTopologyError(`${reference.name}: la operación de origen ya no existe.`);
    if (source.objectId !== reference.objectId) throw new ParametricTopologyError(`${reference.name}: la operación de origen pertenece a otro objeto.`);
    references.set(reference.id, reference);
  }
  for (const feature of document.features) {
    if (feature.kind !== "fillet") continue;
    for (const referenceId of feature.edgeReferenceIds ?? []) {
      const reference = references.get(referenceId);
      if (!reference) throw new ParametricTopologyError(`${feature.name}: la arista referenciada ya no existe.`);
      if (reference.reference.hint.entityType !== "edge") throw new ParametricTopologyError(`${feature.name}: la referencia seleccionada no es una arista.`);
      if (feature.objectId && reference.objectId !== feature.objectId) throw new ParametricTopologyError(`${feature.name}: la arista pertenece a otro objeto.`);
    }
  }
}

export function recoverParametricTopologyReference(
  stored: ParametricTopologyReference,
  replacement: ParametricTopologyReference["reference"],
): ParametricTopologyReference {
  return { ...stored, reference: structuredClone(replacement) };
}
