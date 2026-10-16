import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

/** Transform existing reference drawables together, without rebuilding meshes. */
export function referenceTransformPreview(model: THREE.Group, objectId: string, includeHandle = true) {
  const items = model.children.filter((child) => child.userData.objectId === objectId || child.userData.referenceTransformObjectId === objectId || includeHandle && child.userData.referenceImageTarget === objectId).map((object) => {
    if (object.matrixAutoUpdate) object.updateMatrix();
    const lineMaterial = object instanceof LineSegments2 ? object.material : null;
    const state = { object, matrix: object.matrix.clone(), autoUpdate: object.matrixAutoUpdate, visible: object.visible, renderOrder: object.renderOrder, lineMaterial, depthTest: lineMaterial?.depthTest };
    if (lineMaterial) {
      object.visible = true;
      object.renderOrder = 39;
      lineMaterial.depthTest = false;
      lineMaterial.needsUpdate = true;
    }
    return state;
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
        item.object.visible = item.visible;
        item.object.renderOrder = item.renderOrder;
        if (item.lineMaterial && item.depthTest !== undefined) { item.lineMaterial.depthTest = item.depthTest; item.lineMaterial.needsUpdate = true; }
        item.object.updateWorldMatrix(true, true);
      }
    },
  };
}
