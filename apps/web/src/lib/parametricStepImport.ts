import { loadBrepWithOcct } from "@/lib/brepKernel";
import { createImportedStepFeature, createParametricObject } from "@/lib/parametricDocument";
import { colorForNewParametricObject } from "@/lib/parametricObjects";
import type { ParametricDocument } from "@/types/parametric";
import { assertImportByteLimit } from "@/lib/parametricImportLimits";

export function appendImportedStepObject(document: ParametricDocument, sourceName: string, stepText: string, random = Math.random) {
  if (!stepText.trim()) throw new Error("The STEP file is empty.");
  const object = createParametricObject(document.objects.length + 1);
  const feature = createImportedStepFeature(sourceName, stepText, document.features.length + 1);
  object.name = feature.name;
  object.color = colorForNewParametricObject(document, random);
  feature.objectId = object.id;
  document.objects.push(object);
  document.features.push(feature);
  return { objectId: object.id, featureId: feature.id };
}

export async function importStepAsParametricObject(document: ParametricDocument, sourceName: string, buffer: ArrayBuffer, random = Math.random) {
  assertImportByteLimit("STEP", buffer.byteLength);
  const brep = await loadBrepWithOcct();
  const imported = await brep.importSTEP(new Blob([buffer]));
  if (!imported.ok) throw new Error(`Could not read the STEP file: ${String(imported.error.message ?? imported.error)}`);
  const tessellation = brep.mesh(imported.value);
  if (tessellation.vertices.length < 9) throw new Error("The STEP file does not contain solid geometry.");
  const canonical = brep.exportSTEP(imported.value);
  if (!canonical.ok) throw new Error(`Could not preserve the STEP B-Rep: ${String(canonical.error.message ?? canonical.error)}`);
  return appendImportedStepObject(document, sourceName, await canonical.value.text(), random);
}
