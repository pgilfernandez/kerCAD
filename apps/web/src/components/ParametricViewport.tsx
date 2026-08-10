"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderMesh } from "@/types/parametric";

export type CameraView = { name: "iso" | "top" | "front" | "right"; token: number };

type Props = {
  mesh: RenderMesh | null;
  color: string;
  view: CameraView;
};

export function ParametricViewport({ mesh, color, view }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#edf4f7");
    scene.fog = new THREE.Fog("#edf4f7", 210, 380);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(95, 78, 110);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.target.set(0, 5, 0);
    controls.minDistance = 18;
    controls.maxDistance = 420;

    scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4bf", 2.1));
    const key = new THREE.DirectionalLight("#ffffff", 3.2);
    key.position.set(80, 130, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 120;
    key.shadow.camera.bottom = -120;
    scene.add(key);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ color: "#e7f1f4", roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);

    const fineGrid = new THREE.GridHelper(260, 52, "#9fc8d3", "#c8dce2");
    fineGrid.position.y = 0;
    const gridMaterials = Array.isArray(fineGrid.material) ? fineGrid.material : [fineGrid.material];
    gridMaterials.forEach((material) => { material.opacity = 0.75; material.transparent = true; });
    scene.add(fineGrid);

    const axis = new THREE.AxesHelper(24);
    axis.position.set(-108, 0.05, 108);
    scene.add(axis);

    const modelGroup = new THREE.Group();
    modelGroup.rotation.x = -Math.PI / 2;
    scene.add(modelGroup);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    modelRef.current = modelGroup;
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !camera || !controls) return;
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
    });
    group.clear();
    if (!mesh) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.03, polygonOffset: true, polygonOffsetFactor: 1 }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(mesh.edges, 3));
    const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: "#384c58", transparent: true, opacity: 0.68 }));
    group.add(edges);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    controls.target.copy(center);
    const distance = Math.max(55, Math.max(size.x, size.y, size.z) * 2.35);
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.72, distance));
    camera.near = Math.max(0.1, distance / 1000);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    controls.update();
  }, [mesh, color]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = controls.target;
    const distance = Math.max(75, camera.position.distanceTo(target));
    const vectors: Record<CameraView["name"], THREE.Vector3> = {
      iso: new THREE.Vector3(1, 0.78, 1),
      top: new THREE.Vector3(0, 1, 0.001),
      front: new THREE.Vector3(0, 0.001, 1),
      right: new THREE.Vector3(1, 0.001, 0),
    };
    camera.position.copy(target).add(vectors[view.name].normalize().multiplyScalar(distance));
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    controls.update();
  }, [view]);

  return <div className="parametric-viewport" ref={hostRef} aria-label="Vista 3D de la pieza" />;
}
