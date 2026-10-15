import * as THREE from "three";

/** Normalized coordinates in the original viewport, with a top-left origin. */
export type CaptureCrop = { x: number; y: number; width: number; height: number };

export function captureViewportCrop(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, crop: CaptureCrop, width: number, height: number) {
  const captureCamera = camera.clone();
  const bounds = renderer.domElement.getBoundingClientRect();
  captureCamera.setViewOffset(bounds.width, bounds.height, crop.x * bounds.width, crop.y * bounds.height, crop.width * bounds.width, crop.height * bounds.height);
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
  target.texture.colorSpace = renderer.outputColorSpace;
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, captureCamera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the capture image.");
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
    context.putImageData(image, 0, 0);
    return canvas;
  } finally { renderer.setRenderTarget(previous); target.dispose(); }
}
