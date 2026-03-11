import * as THREE from "three";
import { createSceneSetup, POWER } from "./sceneSetup.js";
import { createDirectionController } from "./doaController.js";

const { scene, camera, renderer, controls } = createSceneSetup({ cameraZ: 1.18 });
const meshColor = 0xcfa1f3;
const edgeColor = 0x76f3f7;

let geometry = new THREE.IcosahedronGeometry(0.34, 3);
geometry = geometry.toNonIndexed();

const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice();

const material = new THREE.MeshPhongMaterial({
  color: meshColor,
  opacity: 0.3,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const icosahedron = new THREE.Mesh(geometry, material);
scene.add(icosahedron);

// Creating wireframe for cool effect
const lineMaterial = new THREE.MeshPhongMaterial({
  color: edgeColor,
  wireframe: true,
  opacity: 0.6,
  transparent: true,
});
const edgeLines = new THREE.Mesh(geometry, lineMaterial);
icosahedron.add(edgeLines);

const directionController = createDirectionController();

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const VOLUME_SCALE = 0.001;

function spikeTowards(dir, strength) {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    v.set(basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);

    n.copy(v).normalize();

    let w = n.dot(dir);
    w = Math.max(0, w);
    w = Math.pow(w, POWER);

    v.addScaledVector(n, w * strength);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

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

    faceNormal.subVectors(tmpB, tmpA).cross(tmpC.clone().sub(tmpA)).normalize();

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
    wireColor: `#${lineMaterial.color.getHexString()}`,
    wireOpacity: Number(lineMaterial.opacity.toFixed(2)),
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

  if ("wireColor" in style) {
    const wireColor = normalizeHexColor(style.wireColor, current.wireColor);
    lineMaterial.color.set(wireColor);
  }

  if ("wireOpacity" in style && Number.isFinite(style.wireOpacity)) {
    const wireOpacity = clamp01(style.wireOpacity);
    lineMaterial.opacity = wireOpacity;
    lineMaterial.transparent = wireOpacity < 1;
  }

  if ("explodeAmount" in style && Number.isFinite(style.explodeAmount)) {
    explode = clampExplode(style.explodeAmount);
  }
}

window.orb = {
  update(data) {
    directionController.updateFromData(data);
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

  const { direction, volume } = directionController.getDirectionStep();
  const scaledVolume = volume * VOLUME_SCALE;
  spikeTowards(direction, scaledVolume);
  explodeFaces(explode);

  controls.update();
  renderer.render(scene, camera);
}

animate();
