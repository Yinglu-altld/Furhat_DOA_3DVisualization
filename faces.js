import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
const stageEl = document.getElementById("viz-root") || document.body;
const initialBounds = stageEl.getBoundingClientRect();
const initialWidth = Math.max(1, initialBounds.width || window.innerWidth);
const initialHeight = Math.max(1, initialBounds.height || window.innerHeight);
const camera = new THREE.PerspectiveCamera(
  75,
  initialWidth / initialHeight,
  0.1,
  1000
);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(initialWidth, initialHeight);
stageEl.appendChild(renderer.domElement);

const controler = new OrbitControls(camera, renderer.domElement);
controler.enableDamping = true;
controler.dampingFactor = 0.1;
controler.enableZoom = false;

let ambiLight = false;

if (ambiLight) {
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

let geometry = new THREE.IcosahedronGeometry(0.34, 3);
geometry = geometry.toNonIndexed();

const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice();

const material = new THREE.MeshPhongMaterial({
  color: "blue",
  opacity: 0.3,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const icosahedron = new THREE.Mesh(geometry, material);
scene.add(icosahedron);

const edgeGeom = new THREE.EdgesGeometry(geometry, 20);
const lineMaterial = new THREE.LineBasicMaterial({
  color: 0x76f3f7,
  wireframe: true,
  opacity: 0.5,
  transparent: true,
  depthWrite: false,
  depthTest: true,
});
const edgeLines = new THREE.LineSegments(edgeGeom, lineMaterial);
icosahedron.add(edgeLines);

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const direction = new THREE.Vector3(1, 0, 0);
let hasExternalDOA = false;
let lastDOATimeMs = 0;
const idleClock = new THREE.Clock();
const idleDirection = new THREE.Vector3(1, 0, 0);
const DOA_ACTIVE_TIMEOUT_MS = 1200;
const IDLE_ROT_SPEED = 0.35;
const IDLE_ELEVATION = 0.2;
const IDLE_STRENGTH_BASE = 0.045;
const IDLE_STRENGTH_PULSE = 0.03;
const IDLE_EXPLODE_BASE = 0.06;
const IDLE_EXPLODE_PULSE = 0.02;

function spikeTowards(dir, strength) {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    v.set(basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);

    n.copy(v).normalize();

    let w = n.dot(dir);
    w = Math.max(0, w);
    w = Math.pow(w, 14);

    v.addScaledVector(n, w * strength);

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

let str = 0.12;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
let explode = 0.1;

function explodeFaces(amount) {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i += 3) {
    tmpA.fromBufferAttribute(pos, i + 0);
    tmpB.fromBufferAttribute(pos, i + 1);
    tmpC.fromBufferAttribute(pos, i + 2);

    faceNormal
      .subVectors(tmpB, tmpA)
      .cross(tmpC.clone().sub(tmpA))
      .normalize();

    tmpA.addScaledVector(faceNormal, amount);
    tmpB.addScaledVector(faceNormal, amount);
    tmpC.addScaledVector(faceNormal, amount);

    pos.setXYZ(i + 0, tmpA.x, tmpA.y, tmpA.z);
    pos.setXYZ(i + 1, tmpB.x, tmpB.y, tmpB.z);
    pos.setXYZ(i + 2, tmpC.x, tmpC.y, tmpC.z);
  }
  pos.needsUpdate = true;
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function clampExplode(value) {
  return THREE.MathUtils.clamp(value, 0, 0.3);
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
    explodeAmount: Number(explode.toFixed(2)),
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

  if ("explodeAmount" in style && Number.isFinite(style.explodeAmount)) {
    explode = clampExplode(style.explodeAmount);
  }
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
    lastDOATimeMs = Date.now();
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

  const hasFreshDOA = hasExternalDOA && Date.now() - lastDOATimeMs < DOA_ACTIVE_TIMEOUT_MS;

  if (hasFreshDOA) {
    spikeTowards(direction, str * 1.8);
    explodeFaces(explode);
  } else {
    const t = idleClock.getElapsedTime();
    const a = t * IDLE_ROT_SPEED;
    idleDirection
      .set(Math.cos(a), IDLE_ELEVATION + 0.05 * Math.sin(t * 0.23), Math.sin(a))
      .normalize();

    const idleStrength = IDLE_STRENGTH_BASE + IDLE_STRENGTH_PULSE * (0.5 + 0.5 * Math.sin(t * 0.8));
    const idleExplode = IDLE_EXPLODE_BASE + IDLE_EXPLODE_PULSE * Math.sin(t * 0.9);

    spikeTowards(idleDirection, idleStrength);
    explodeFaces(idleExplode);
  }

  controler.update();
  renderer.render(scene, camera);
}

function resizeRendererToStage() {
  const bounds = stageEl.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener("resize", resizeRendererToStage);
if (typeof ResizeObserver !== "undefined") {
  const stageObserver = new ResizeObserver(() => resizeRendererToStage());
  stageObserver.observe(stageEl);
}

animate();
