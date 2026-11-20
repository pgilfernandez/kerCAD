import { createExtrudeFeature, createObjectBooleanFeature, createParametricObject, createShellFeature, createSketchFeature, createStarterDocument } from "../../apps/web/src/lib/parametricDocument";

export function operationToolbarDocument() {
  const document = createStarterDocument();
  document.name = "Operation controls";
  const shell = createShellFeature(1);
  shell.objectId = document.objects[0].id;
  shell.faceReferenceIds = [`${shell.id}:face`];
  document.topologyReferences.push({
    id: shell.faceReferenceIds[0], name: "Top", objectId: shell.objectId,
    sourceFeatureId: document.features[1].id,
    reference: { origin: `${document.features[1].id}:result`, role: "top", hint: { entityType: "face", centroid: [0, 0, 20], normal: [0, 0, 1], area: 400, surfaceType: "plane" } },
  });
  document.features.push(shell);
  for (const [index, name] of ["Tool one", "Tool two"].entries()) {
    const object = createParametricObject(index + 2, { x: index === 0 ? -9 : 9, y: 0, z: 4 });
    object.name = name;
    const profile = createSketchFeature("rectangle", index + 1);
    profile.profile = { shape: "rectangle", width: 6, depth: 6 };
    profile.objectId = object.id;
    const prism = createExtrudeFeature(profile.id, index + 1, false);
    prism.distance = 6;
    prism.objectId = object.id;
    document.objects.push(object);
    document.features.push(profile, prism);
  }
  const boolean = createObjectBooleanFeature(1, document.objects[1].id);
  boolean.objectId = document.objects[0].id;
  document.features.push(boolean);
  return document;
}
