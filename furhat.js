import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { createSceneSetup } from "./sceneSetup.js";
import { createDirectionController } from "./doaController.js";

const { scene, camera, renderer, controls } = createSceneSetup();

const directionController = createDirectionController();

const up = new THREE.Vector3(0, 1, 0);
const markerQuat = new THREE.Quaternion();

let furhat = null;

const accentMaterial = new THREE.MeshPhongMaterial({
  color: 0x22d6ff,
  emissive: 0x0a3a49,
  shininess: 80,
});

const marker = new THREE.Object3D();
const markerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 18), accentMaterial);
markerBase.position.y = 0.04;
marker.add(markerBase);

const markerTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 24), accentMaterial);
markerTip.position.y = 0.09;
marker.add(markerTip);

marker.position.set(0, 0.12, 0);
scene.add(marker);

const fhScale = 1;
const fhLoader = new OBJLoader();
const fhMTL = new MTLLoader();

fhMTL.load("/public/furhat.mtl", (fhMaterials) => {
  fhMaterials.preload();
  fhLoader.setMaterials(fhMaterials);

  fhLoader.load(
    "/public/furhat.obj",
    (fh) => {
      furhat = fh;
      furhat.scale.set(fhScale, fhScale, fhScale);
      scene.add(furhat);
    },
    undefined,
    (err) => console.error("Furhat OBJ load error:", err)
  );
});

let turnGain = 1;
let bobAmount = 0.16;

function clampTurnGain(value) {
  return THREE.MathUtils.clamp(value, 0.2, 2.5);
}

function clampBobAmount(value) {
  return THREE.MathUtils.clamp(value, 0, 0.4);
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
    accentColor: `#${accentMaterial.color.getHexString()}`,
    turnGain: Number(turnGain.toFixed(2)),
    bobAmount: Number(bobAmount.toFixed(2)),
  };
}

function setOrbStyle(style = {}) {
  const current = getOrbStyle();

  if ("accentColor" in style) {
    const accentColor = normalizeHexColor(style.accentColor, current.accentColor);
    accentMaterial.color.set(accentColor);
  }

  if ("turnGain" in style && Number.isFinite(style.turnGain)) {
    turnGain = clampTurnGain(style.turnGain);
  }

  if ("bobAmount" in style && Number.isFinite(style.bobAmount)) {
    bobAmount = clampBobAmount(style.bobAmount);
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

  const { direction, hasFreshDOA, hasExternalDOA, activity } = directionController.getDirectionStep();
  const time = performance.now() * 0.001;

  if (hasFreshDOA || activity > 0) {
    markerQuat.setFromUnitVectors(up, direction);
    marker.quaternion.slerp(markerQuat, 0.2);
    marker.scale.setScalar(0.55 + 0.45 * activity);

    if (furhat) {
      const yaw = Math.atan2(direction.x, direction.z);
      furhat.rotation.y = yaw * turnGain;
      furhat.position.y = -0.1 + bobAmount * activity * (0.5 + 0.5 * Math.sin(time * 1.3));
    }
  } else if (!hasExternalDOA) {
    marker.quaternion.identity();
    marker.scale.setScalar(0.55);

    if (furhat) {
      furhat.rotation.y = 0;
      furhat.position.y = -0.1;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
