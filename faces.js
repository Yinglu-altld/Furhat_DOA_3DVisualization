import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enableZoom = false;

const useAmbientLight = false;
if (useAmbientLight) {
  const ambient = new THREE.AmbientLight(0xffffff, 3);
  scene.add(ambient);
} else {
  const light = new THREE.DirectionalLight(0xffffff, 5);
  light.position.set(1, 4, 2);
  scene.add(light);

  const backLight = new THREE.DirectionalLight(0xffffff, 2);
  backLight.position.set(-1, -4, -2);
  scene.add(backLight);
}

const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

mtlLoader.load(
  "/public/speaker.mtl",
  (materials) => {
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
      (err) => console.error("Failed to load speaker.obj", err)
    );
  },
  undefined,
  (err) => console.error("Failed to load speaker.mtl", err)
);

const geometry = new THREE.IcosahedronGeometry(0.34, 3);
const basePositions = geometry.attributes.position.array.slice();

const material = new THREE.MeshPhongMaterial({
  color: 0x5e07c3,
  opacity: 0.2,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const icosahedron = new THREE.Mesh(geometry, material);
scene.add(icosahedron);

const lineMaterial = new THREE.MeshPhongMaterial({
  color: 0x76f3f7,
  wireframe: true,
  opacity: 0.5,
  transparent: true,
});
const edgeLines = new THREE.Mesh(geometry, lineMaterial);
icosahedron.add(edgeLines);

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex.toLowerCase()}`;
}

function getOrbStyle() {
  return {
    fillColor: `#${material.color.getHexString()}`,
    fillOpacity: Number(material.opacity.toFixed(2)),
    wireColor: `#${lineMaterial.color.getHexString()}`,
    wireOpacity: Number(lineMaterial.opacity.toFixed(2)),
    wireVisible: edgeLines.visible,
  };
}

function setOrbStyle(style = {}) {
  const current = getOrbStyle();

  if ("fillColor" in style) {
    const fillColor = normalizeHexColor(style.fillColor, current.fillColor);
    material.color.set(fillColor);
  }

  if ("fillOpacity" in style && Number.isFinite(style.fillOpacity)) {
    const fillOpacity = clamp01(style.fillOpacity);
    material.opacity = fillOpacity;
    material.transparent = fillOpacity < 1;
  }

  if ("wireColor" in style) {
    const wireColor = normalizeHexColor(style.wireColor, current.wireColor);
    lineMaterial.color.set(wireColor);
  }

  if ("wireOpacity" in style && Number.isFinite(style.wireOpacity)) {
    const wireOpacity = clamp01(style.wireOpacity);
    lineMaterial.opacity = wireOpacity;
    lineMaterial.transparent = wireOpacity < 1;
  }

  if ("wireVisible" in style && typeof style.wireVisible === "boolean") {
    edgeLines.visible = style.wireVisible;
  }
}

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const direction = new THREE.Vector3(1, 0, 0);
const SPIKE_AMOUNT = 0.36;
let hasExternalDOA = false;
const idleClock = new THREE.Clock();

function spikeTowards(dir, s) {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    v.set(basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);

    n.copy(v).normalize();

    let w = n.dot(dir);
    w = Math.max(0, w);
    w = Math.pow(w, 14);

    v.addScaledVector(n, w * s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

window.orb = {
  update(data) {
    if (!data || typeof data !== "object") return;
    const source = data.dir && typeof data.dir === "object" ? data.dir : data;
    const x = Number(source.x);
    const y = Number(source.y);
    const z = Number(source.z);
    if (![x, y, z].every((num) => Number.isFinite(num))) return;

    direction.set(x, y, z);
    if (direction.lengthSq() < 1e-8) return;
    direction.normalize();
    hasExternalDOA = true;
  },
  setStyle(style) {
    setOrbStyle(style);
  },
  getStyle() {
    return getOrbStyle();
  },
};
window.dispatchEvent(new Event("orb-ready"));

function animate() {
  requestAnimationFrame(animate);

  if (!hasExternalDOA) {
    const t = idleClock.getElapsedTime() * 0.8;
    direction.set(Math.cos(t), 0.25, Math.sin(t)).normalize();
  }

  spikeTowards(direction, SPIKE_AMOUNT);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
