import * as THREE from "three";
import { createSceneSetup } from "./sceneSetup.js";
import { createDirectionController } from "./doaController.js";

const { scene, camera, renderer, controls } = createSceneSetup();

const arrowColor = 0x4de7c8;
const material = new THREE.MeshPhongMaterial({ color: arrowColor });

const shaftGeo = new THREE.CylinderGeometry(0.012, 0.03, 0.32, 48);
const shaft = new THREE.Mesh(shaftGeo, material);
shaft.position.y = 0.16;

const baseGeo = new THREE.SphereGeometry(0.03, 32, 32);
const baseSphere = new THREE.Mesh(baseGeo, material);
scene.add(baseSphere);

const tipGeo = new THREE.ConeGeometry(0.034, 0.05, 48);
const tip = new THREE.Mesh(tipGeo, material);
tip.position.y = 0.185;
shaft.add(tip);

const arrow = new THREE.Object3D();
arrow.add(shaft);
scene.add(arrow);

const directionController = createDirectionController();
const up = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();

const ACTIVE_LENGTH = 2.4;
const IDLE_LENGTH_BASE = 1.7;
const IDLE_LENGTH_PULSE_BASE = 0.28;

let lengthScale = 1;
let idlePulse = IDLE_LENGTH_PULSE_BASE;

function clampLengthScale(value) {
  return THREE.MathUtils.clamp(value, 0.5, 2.5);
}

function clampIdlePulse(value) {
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
    arrowColor: `#${material.color.getHexString()}`,
    lengthScale: Number(lengthScale.toFixed(2)),
    idlePulse: Number(idlePulse.toFixed(2)),
  };
}

function setOrbStyle(style = {}) {
  const current = getOrbStyle();

  if ("arrowColor" in style) {
    const arrowColor = normalizeHexColor(style.arrowColor, current.arrowColor);
    material.color.set(arrowColor);
  }

  if ("lengthScale" in style && Number.isFinite(style.lengthScale)) {
    lengthScale = clampLengthScale(style.lengthScale);
  }

  if ("idlePulse" in style && Number.isFinite(style.idlePulse)) {
    idlePulse = clampIdlePulse(style.idlePulse);
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

  const { direction, hasFreshDOA, hasExternalDOA } = directionController.getDirectionStep();

  if (hasFreshDOA) {
    arrow.scale.set(1, ACTIVE_LENGTH * lengthScale, 1);
    q.setFromUnitVectors(up, direction);
    arrow.quaternion.copy(q);
  } else if (!hasExternalDOA) {
    arrow.scale.set(1, IDLE_LENGTH_BASE * lengthScale, 1);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
