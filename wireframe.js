import * as THREE from "three";
import { createSceneSetup, POWER } from "./sceneSetup.js";
import { createDirectionController } from "./doaController.js";

const { scene, camera, renderer, controls } = createSceneSetup();

const geometry = new THREE.IcosahedronGeometry(0.4, 3);
const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice();

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

const directionController = createDirectionController();

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const ACTIVE_STRENGTH = 0.22;

function resetToBaseShape() {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    pos.setXYZ(i, basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

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

  const { direction, hasFreshDOA } = directionController.getDirectionStep();

  if (hasFreshDOA) {
    spikeTowards(direction, ACTIVE_STRENGTH * 1.8);
  } else {
    resetToBaseShape();
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
