import * as THREE from "three";

export const DOA_ACTIVE_TIMEOUT_MS = 1200;

export function createDirectionController({
  directionSmoothFactor = 0.18,
  volumeSmoothFactor = 0.2,
  staleTimeoutMs = DOA_ACTIVE_TIMEOUT_MS,
} = {}) {
  const currentDirection = new THREE.Vector3(1, 0, 0);
  const targetDirection = new THREE.Vector3(1, 0, 0);
  let currentVolume = 0;
  let targetVolume = 0;

  let hasExternalDOA = false;
  let lastDOATimeMs = 0;

  function updateFromData(data) {
    if (!data || typeof data !== "object") return false;
    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);
    if (![x, y, z].every((num) => Number.isFinite(num))) return false;

    targetDirection.set(x, y, z);
    if (targetDirection.lengthSq() < 1e-8) return false;

    const rawVolume = Number(data.volume);
    const rawStrength = Number(data.strength);
    const signalLevel = Number.isFinite(rawVolume) ? rawVolume : rawStrength;
    targetVolume = Number.isFinite(signalLevel) ? Math.max(0, signalLevel) : 0;
    targetDirection.normalize();
    hasExternalDOA = true;
    lastDOATimeMs = Date.now();
    return true;
  }

  function getDirectionStep() {
    const hasFreshDOA = hasExternalDOA && Date.now() - lastDOATimeMs < staleTimeoutMs;

    if (hasFreshDOA) {
      currentDirection.lerp(targetDirection, directionSmoothFactor);
      if (currentDirection.lengthSq() < 1e-8) {
        currentDirection.copy(targetDirection);
      }
      currentDirection.normalize();
      currentVolume = THREE.MathUtils.lerp(currentVolume, targetVolume, volumeSmoothFactor);
      return { direction: currentDirection, hasFreshDOA, hasExternalDOA, volume: currentVolume };
    }

    currentVolume = THREE.MathUtils.lerp(currentVolume, 0, volumeSmoothFactor);
    if (currentVolume < 1e-4) currentVolume = 0;

    return { direction: currentDirection, hasFreshDOA, hasExternalDOA, volume: currentVolume };
  }

  return { updateFromData, getDirectionStep };
}
