import * as THREE from "three";
import { PARAMETER_GUIDE_RENDER_ORDER, PARAMETER_HANDLE_RENDER_ORDER } from "@/lib/viewportRenderOrder";
import { annotationFontFamily } from "@/lib/textFonts";
import { annotationEnding, annotationEndingSize } from "@/lib/annotationEndings";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { ParametricAnnotation } from "@/types/parametric";
import { displayUnitLabel, formatDisplayLength, type ParametricDisplayUnit } from "@/lib/parametricUnits";
import { annotationAngleGeometry, annotationPosition, annotationLabelColors, type AnnotationPoint } from "@/lib/annotationGeometry";

/** An independent display layer: annotations never enter the CAD kernel. */
export function createAnnotationScene(annotations: ParametricAnnotation[], unit: ParametricDisplayUnit, selectedId: string | null, pointSelection: { point: AnnotationPoint | null; triadVisible: boolean; parametersVisible: boolean }, dark = false) {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const vector = (point: { x: number; y: number; z: number }) => new THREE.Vector3(point.x, point.y, point.z);
  let drawOrder = 100;
  const billboardCircles: THREE.Group[] = [];
  const parentQuaternion = new THREE.Quaternion(), cameraQuaternion = new THREE.Quaternion(), spinQuaternion = new THREE.Quaternion();
  const screenNormal = new THREE.Vector3(0, 0, 1);
  group.userData.updateBillboards = (camera: THREE.Camera) => {
    if (!group.visible || !billboardCircles.length) return;
    group.getWorldQuaternion(parentQuaternion).invert();
    camera.getWorldQuaternion(cameraQuaternion);
    for (const circle of billboardCircles) {
      circle.quaternion.copy(parentQuaternion).multiply(cameraQuaternion).multiply(spinQuaternion.setFromAxisAngle(screenNormal, circle.userData.rotationZ));
      circle.updateWorldMatrix(false, true);
    }
  };
  const drawLines = (points: THREE.Vector3[], id: string, color: string, dashed = false, width = 2) => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(points.flatMap((point) => [point.x, point.y, point.z]));
    const material = new LineMaterial({ color, linewidth: width, worldUnits: false, dashed, dashSize: 3, gapSize: 2, depthTest: false, depthWrite: false, transparent: true });
    const lines = new LineSegments2(geometry, material);
    lines.computeLineDistances();
    lines.userData.annotationId = id; lines.userData.annotationPickable = true;
    lines.onBeforeRender = (renderer) => material.resolution.set(Math.max(1, renderer.domElement.clientWidth), Math.max(1, renderer.domElement.clientHeight));
    lines.renderOrder = drawOrder; group.add(lines); disposables.push(geometry, material);
    return lines;
  };
  for (let index = 0; index < annotations.length; index++) {
    const annotation = annotations[index];
    // Earlier tree entries paint last, above every later annotation.
    drawOrder = 100 + (annotations.length - index) * 4;
    if (!annotation.visible) continue;
    if ((annotation.kind === "circle" || annotation.kind === "rectangle")) {
      const circle = new THREE.Group();
      circle.position.copy(vector(annotation.position));
      circle.rotation.set(THREE.MathUtils.degToRad(annotation.rotation.x), THREE.MathUtils.degToRad(annotation.rotation.y), THREE.MathUtils.degToRad(annotation.rotation.z), "ZYX");
      circle.userData.rotationZ = THREE.MathUtils.degToRad(annotation.rotation.z);
      group.add(circle);
      if (annotation.mode === "billboard") billboardCircles.push(circle);
      const points: THREE.Vector3[] = [];
      if (annotation.kind === "rectangle") {
        const x = annotation.radius, y = (annotation.height ?? annotation.radius * 1.4) / 2;
        const r = Math.min(x, y) * 0.12;
        const outline = new THREE.Shape();
        outline.moveTo(-x + r, -y);
        outline.lineTo(x - r, -y); outline.quadraticCurveTo(x, -y, x, -y + r);
        outline.lineTo(x, y - r); outline.quadraticCurveTo(x, y, x - r, y);
        outline.lineTo(-x + r, y); outline.quadraticCurveTo(-x, y, -x, y - r);
        outline.lineTo(-x, -y + r); outline.quadraticCurveTo(-x, -y, -x + r, -y);
        const vertices = outline.getPoints(8);
        for (let i = 1; i < vertices.length; i++) points.push(new THREE.Vector3(vertices[i - 1].x, vertices[i - 1].y, 0), new THREE.Vector3(vertices[i].x, vertices[i].y, 0));
      } else for (let index = 0; index < 128; index++) {
        const first = index / 128 * Math.PI * 2, last = (index + 1) / 128 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(first) * annotation.radius, Math.sin(first) * annotation.radius, 0), new THREE.Vector3(Math.cos(last) * annotation.radius, Math.sin(last) * annotation.radius, 0));
      }
      circle.add(drawLines(points, annotation.id, annotation.color, false, annotation.lineWidth));
      if (annotation.id === selectedId) {
        const sphere = (color: string, pixels: number) => {
          const geometry = new THREE.SphereGeometry(1, 16, 12);
          const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
          const handle = new THREE.Mesh(geometry, material);
          handle.renderOrder = pixels === 28 ? PARAMETER_HANDLE_RENDER_ORDER : 100010; handle.userData.yellowManipulatorBaseRadius = 1; handle.userData.yellowManipulatorDiameterPixels = pixels;
          if (pixels === 28) {
            material.color.set("#f0b83f");
            material.opacity = 0.92;
            const outlineGeometry = new THREE.SphereGeometry(1.12, 18, 12);
            const outlineMaterial = new THREE.MeshBasicMaterial({ color: "#b67c00", side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92 });
            const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
            outline.renderOrder = handle.renderOrder - 1;
            outline.userData.yellowManipulatorOutline = true;
            handle.add(outline);
            disposables.push(outlineGeometry, outlineMaterial);
          }
          circle.add(handle); disposables.push(geometry, material);
          return handle;
        };
        sphere("#add8ff", 14).userData.annotationPoint = "position";
        if (pointSelection.parametersVisible) {
          const end = new THREE.Vector3(annotation.radius + 4, 0, 0);
          const guide = drawLines([new THREE.Vector3(), end], annotation.id, "#e4bc00");
          guide.userData.annotationPickable = false; guide.renderOrder = PARAMETER_GUIDE_RENDER_ORDER; circle.add(guide);
          const handle = sphere("#fff157", 28); handle.position.copy(end); handle.userData.annotationRadiusTarget = true;
          const top = annotation.kind === "rectangle" ? (annotation.height ?? annotation.radius * 1.4) / 2 : annotation.radius;
          if (annotation.kind === "rectangle") {
            const heightHandle = sphere("#fff157", 28);
            heightHandle.position.set(0, top + 4, 0); heightHandle.userData.annotationHeightTarget = true;
          }
          const widthEnd = new THREE.Vector3(annotation.kind === "rectangle" ? -annotation.radius : 0, top + 4 + annotation.lineWidth, 0);
          const widthGuide = drawLines([new THREE.Vector3(widthEnd.x, top + 4, 0), widthEnd], annotation.id, "#e4bc00");
          widthGuide.userData.annotationPickable = false; widthGuide.renderOrder = PARAMETER_GUIDE_RENDER_ORDER; circle.add(widthGuide);
          const widthHandle = sphere("#fff157", 28); widthHandle.position.copy(widthEnd); widthHandle.userData.annotationLineWidthTarget = true;
        }
      }
      continue;
    }
    if (annotation.id === selectedId && annotation.kind !== "text") {
      const keys: AnnotationPoint[] = annotation.kind === "angle" ? ["start", "center", "end"] : ["start", "end"];
      for (const key of keys) {
        const active = pointSelection.point === key;
        if (active && pointSelection.triadVisible) continue;
        const point = annotationPosition(annotation, key);
        if (!point) continue;
        const geometry = new THREE.SphereGeometry(1, 16, 12);
        const material = new THREE.MeshBasicMaterial({ color: active ? "#ffe431" : "#add8ff", depthTest: false, depthWrite: false, transparent: true });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(vector(point));
        sphere.renderOrder = 100010;
        sphere.userData.annotationPoint = key;
        // Reuse the viewport's pre-render screen-size adjustment for handles.
        sphere.userData.yellowManipulatorBaseRadius = 1;
        sphere.userData.yellowManipulatorDiameterPixels = active ? 28 : 14;
        group.add(sphere); disposables.push(geometry, material);
      }
    }
    const color = annotation.color ?? (annotation.kind === "text" ? "#000000" : "#233c52");
    const label = (text: string, position: THREE.Vector3, size: number, font = "Arial", alignment = "center") => {
      const colors = annotationLabelColors(annotation, dark);
      if (!text) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const lines = text.split("\n");
      const fontSpec = `48px ${font}, sans-serif`;
      context.font = fontSpec;
      canvas.width = Math.min(4096, Math.max(64, Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width)) + 64)));
      canvas.height = Math.min(4096, Math.max(80, lines.length * 64 + 16));
      const x = alignment === "left" ? 32 : alignment === "right" ? canvas.width - 32 : canvas.width / 2;
      const paint = (stroke: number, radius: number) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const inset = stroke / 2;
        const right = canvas.width - inset, bottom = canvas.height - inset;
        radius = Math.min(radius, (right - inset) / 2, (bottom - inset) / 2);
        context.beginPath();
        context.moveTo(inset + radius, inset);
        context.lineTo(right - radius, inset); context.quadraticCurveTo(right, inset, right, inset + radius);
        context.lineTo(right, bottom - radius); context.quadraticCurveTo(right, bottom, right - radius, bottom);
        context.lineTo(inset + radius, bottom); context.quadraticCurveTo(inset, bottom, inset, bottom - radius);
        context.lineTo(inset, inset + radius); context.quadraticCurveTo(inset, inset, inset + radius, inset);
        context.closePath();
        context.fillStyle = colors.background; context.fill();
        context.strokeStyle = colors.color; context.lineWidth = stroke; context.stroke();
        context.font = fontSpec;
        context.fillStyle = colors.color;
        context.textBaseline = "middle";
        context.textAlign = alignment === "left" ? "left" : alignment === "right" ? "right" : "center";
        lines.forEach((line, index) => context.fillText(line, x, index * 64 + 40));
      };
      paint(2, 8);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.userData.annotationId = annotation.id;
      sprite.position.copy(position);
      sprite.center.set(alignment === "left" ? 0 : alignment === "right" ? 1 : 0.5, 0.5);
      sprite.scale.set(canvas.width / 48 * size, canvas.height / 48 * size, 1);
      sprite.renderOrder = drawOrder + 1;
      let lastPaint = "";
      const world = new THREE.Vector3(), scale = new THREE.Vector3(), ndc = new THREE.Vector3(), edge = new THREE.Vector3();
      sprite.onBeforeRender = (renderer, _scene, camera) => {
        sprite.getWorldPosition(world); sprite.getWorldScale(scale);
        ndc.copy(world).project(camera);
        edge.setFromMatrixColumn(camera.matrixWorld, 0).normalize().multiplyScalar(scale.x).add(world).project(camera);
        const pixelsPerTexel = Math.max(0.001, Math.abs(edge.x - ndc.x) * renderer.domElement.clientWidth / (2 * canvas.width));
        const stroke = Math.min(2 / pixelsPerTexel, Math.min(canvas.width, canvas.height) / 2);
        // Corner rounding scales with the label, preserving its proportions.
        const radius = 8;
        const stamp = `${stroke.toFixed(2)}:${radius.toFixed(2)}`;
        if (stamp !== lastPaint) { paint(stroke, radius); texture.needsUpdate = true; lastPaint = stamp; }
      };
      group.add(sprite);
      disposables.push(texture, material);
    };
    if (annotation.kind === "text") {
      label(annotation.text, vector(annotation.position), annotation.size, annotationFontFamily(annotation.font), annotation.alignment);
      continue;
    }
    if (annotation.kind === "angle") {
      const start = vector(annotation.start), center = vector(annotation.center), end = vector(annotation.end);
      const points = [start, center, center, end];
      const angle = annotationAngleGeometry(annotation);
      if (angle) {
        if (angle.degrees > 0.0001) for (let index = 1; index < angle.arc.length; index++) points.push(angle.arc[index - 1], angle.arc[index]);
        label(`${angle.degrees.toFixed(2)}°`, angle.labelPosition, annotation.size ?? 3);
      }
      drawLines(points, annotation.id, color);
      continue;
    }
    const start = vector(annotation.start), end = vector(annotation.end);
    const distance = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    const perpendicular = direction.clone().cross(Math.abs(direction.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(2);
    const startEnding = annotationEnding(annotation, "start"), endEnding = annotationEnding(annotation, "end");
    const points = !startEnding.startsWith("arrow") || !endEnding.startsWith("arrow") ? [start, end] : [
      start, end, start.clone().sub(perpendicular), start.clone().add(perpendicular), end.clone().sub(perpendicular), end.clone().add(perpendicular),
    ];
    drawLines(points, annotation.id, color, annotation.lineStyle === "dashed");
    if (distance > 0.001) {
      for (const [point, sign, ending] of [[start, -1, startEnding], [end, 1, endEnding]] as const) {
        if (ending === "none") continue;
        const height = annotationEndingSize(ending, distance);
        if (ending === "circle" || ending === "square") {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
          const context = canvas.getContext("2d"); if (!context) continue;
          context.fillStyle = color;
          if (ending === "circle") { context.beginPath(); context.arc(32, 32, 30, 0, Math.PI * 2); context.fill(); }
          else context.fillRect(2, 2, 60, 60);
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
          const marker = new THREE.Sprite(material); marker.position.copy(point); marker.scale.set(height, height, 1); marker.renderOrder = drawOrder;
          marker.userData.annotationId = annotation.id; marker.userData.annotationPickable = true;
          group.add(marker); disposables.push(texture, material); continue;
        }
        if (ending === "arrow4") {
          const base = point.clone().addScaledVector(direction, -sign * height);
          const wing = perpendicular.clone().normalize().multiplyScalar(height * .4);
          drawLines([base.clone().sub(wing), point, point, base.clone().add(wing)], annotation.id, color);
          continue;
        }
        const cone = new THREE.ConeGeometry(height * 0.3, height, 12);
        const coneMaterial = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
        const arrow = new THREE.Mesh(cone, coneMaterial);
        arrow.userData.annotationId = annotation.id; arrow.userData.annotationPickable = true;
        arrow.position.copy(point).addScaledVector(direction, -sign * height / 2);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().multiplyScalar(sign));
        arrow.renderOrder = drawOrder;
        group.add(arrow);
        disposables.push(cone, coneMaterial);
      }
    }
    if (annotation.showLength !== false) label(`${formatDisplayLength(distance, unit)} ${displayUnitLabel(unit)}`, start.clone().add(end).multiplyScalar(0.5), annotation.size ?? 3);
  }
  return { group, dispose: () => { group.removeFromParent(); disposables.forEach((resource) => resource.dispose()); } };
}
