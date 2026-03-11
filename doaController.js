import * as THREE from "three";

export const DOA_ACTIVE_TIMEOUT_MS = 1200;

export function createDirectionController({
  smoothFactor = 0.18,
  staleTimeoutMs = DOA_ACTIVE_TIMEOUT_MS,
  activityRise = 0.22,
  activityDecay = 0.12,
} = {}) {
  const currentDirection = new THREE.Vector3(1, 0, 0);
  const targetDirection = new THREE.Vector3(1, 0, 0);

  let hasExternalDOA = false;
  let lastDOATimeMs = 0;
  let activity = 0;

  function updateFromData(data) {
    if (!data || typeof data !== "object") return false;
    const source = data.dir && typeof data.dir === "object" ? data.dir : data;
    const x = Number(source.x);
    const y = Number(source.y);
    const z = Number(source.z);
    if (![x, y, z].every((num) => Number.isFinite(num))) return false;

    targetDirection.set(x, y, z);
    if (targetDirection.lengthSq() < 1e-8) return false;

    targetDirection.normalize();
    hasExternalDOA = true;
    lastDOATimeMs = Date.now();
    return true;
  }

  function getDirectionStep() {
    const hasFreshDOA = hasExternalDOA && Date.now() - lastDOATimeMs < staleTimeoutMs;

    if (hasFreshDOA) {
      currentDirection.lerp(targetDirection, smoothFactor);
      if (currentDirection.lengthSq() < 1e-8) {
        currentDirection.copy(targetDirection);
      }
      currentDirection.normalize();
      activity = THREE.MathUtils.lerp(activity, 1, activityRise);
      return { direction: currentDirection, hasFreshDOA, hasExternalDOA, activity };
    }

    activity = THREE.MathUtils.lerp(activity, 0, activityDecay);
    if (activity < 1e-4) activity = 0;

    return { direction: currentDirection, hasFreshDOA, hasExternalDOA, activity };
  }

  return { updateFromData, getDirectionStep };
}
