import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const POWER = 14;

export function createSceneSetup({
  cameraZ = 1,
  mount = document.getElementById("viz-root") || document.body,
  loadSpeaker = true,
} = {}) {
  const scene = new THREE.Scene();

  const initialBounds = mount.getBoundingClientRect();
  const initialWidth = Math.max(1, initialBounds.width || window.innerWidth);
  const initialHeight = Math.max(1, initialBounds.height || window.innerHeight);

  const camera = new THREE.PerspectiveCamera(75, initialWidth / initialHeight, 0.1, 1000);
  camera.position.z = cameraZ;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initialWidth, initialHeight);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enableZoom = false;

  const light = new THREE.DirectionalLight(0xffffff, 5);
  light.position.set(1, 4, 2);
  scene.add(light);

  const backLight = new THREE.DirectionalLight(0xffffff, 2);
  backLight.position.set(-1, -4, -2);
  scene.add(backLight);

  if (loadSpeaker) {
    const objLoader = new OBJLoader();
    const mtlLoader = new MTLLoader();

    mtlLoader.load("/public/speaker.mtl", (materials) => {
      materials.preload();
      objLoader.setMaterials(materials);

      objLoader.load(
        "/public/speaker.obj",
        (root) => {
          root.scale.set(9, 9, 9);
          root.rotation.x = -Math.PI / 2;
          scene.add(root);
        },
        undefined,
        (err) => console.error("OBJ load error:", err)
      );
    });
  }

  const resizeRendererToStage = () => {
    const bounds = mount.getBoundingClientRect();
    const width = Math.max(1, bounds.width || window.innerWidth);
    const height = Math.max(1, bounds.height || window.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  window.addEventListener("resize", resizeRendererToStage);
  if (typeof ResizeObserver !== "undefined") {
    const stageObserver = new ResizeObserver(() => resizeRendererToStage());
    stageObserver.observe(mount);
  }

  return { scene, camera, renderer, controls };
}
