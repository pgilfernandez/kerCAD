import * as THREE from "three";

/** Transform existing reference drawables together, without rebuilding meshes. */
export function referenceTransformPreview(model: THREE.Group, objectId: string, includeHandle = true) {
  const items = model.children.filter((child) => child.userData.objectId === objectId || includeHandle && child.userData.referenceImageTarget === objectId).map((object) => {
    if (object.matrixAutoUpdate) object.updateMatrix();
    return { object, matrix: object.matrix.clone(), autoUpdate: object.matrixAutoUpdate };
  });
  return {
    apply: (delta: THREE.Matrix4) => {
      for (const item of items) {
        item.object.matrixAutoUpdate = false;
        item.object.matrix.copy(delta).multiply(item.matrix);
        item.object.updateWorldMatrix(true, true);
      }
    },
    restore: () => {
      for (const item of items) {
        item.object.matrix.copy(item.matrix);
        item.object.matrixAutoUpdate = item.autoUpdate;
        item.object.updateWorldMatrix(true, true);
      }
    },
  };
}
