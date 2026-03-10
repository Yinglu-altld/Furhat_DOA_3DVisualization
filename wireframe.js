import * as THREE from "three";

import { createSceneSetup, linInt } from "./sceneSetup.js";
import { POWER } from "./sceneSetup.js";

let meshColor = 0xA51AEB;
let edgeColor = 0x1AEBC8;

const {scene, camera, renderer, controls, doaState} = createSceneSetup();

// Creating the orb (icosahedron)
const geometry = new THREE.IcosahedronGeometry(0.4, 3);

// Store the base (rest) positions so deformation doesn't accumulate
const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice(); // copy

const material = new THREE.MeshPhongMaterial({
  color: meshColor,
  opacity: 0.2,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const icosahedron = new THREE.Mesh(geometry, material);
scene.add( icosahedron );

// Creating wireframe for cool effect
const lineMaterial = new THREE.MeshPhongMaterial({
  color: edgeColor,
  wireframe: true,
  opacity: 0.5,
  transparent: true,
});
const edgeLines = new THREE.Mesh(geometry, lineMaterial);
icosahedron.add(edgeLines);

// Reuse vectors (avoid per-frame allocations)
const v = new THREE.Vector3();
const n = new THREE.Vector3();

// Function for creating spikes towards a given direction and strength
function spikeTowards(dir, strength) {
  const pos = geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    // Start from the original vertex position every frame
    const ix = i * 3;
    v.set(basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);

    // Vertex direction from center
    n.copy(v).normalize();

    // Weight based on facing direction
    let w = n.dot(dir);     // [-1..1]
    w = Math.max(0, w);     // only in front
    w = Math.pow(w, POWER);    // sharp spike

    // Push outward along the normal
    v.addScaledVector(n, w * strength);

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
};

// Initialize str
let str;

// Looping animation & updating views
function animate() {
  requestAnimationFrame(animate);

  if ( doaState.data.length > 0 ) {
    const elapsed = doaState.clock.getElapsedTime();
    const frame = elapsed / doaState.stepTime;
    const indexA = Math.floor( frame ) % doaState.data.length;
    const indexB = ( indexA + 1 ) % doaState.data.length;
    const t = frame % 1;

    const a = doaState.data[ indexA ];
    const b= doaState.data[ indexB ];
    const p = linInt( a, b, t );

    doaState.direction.set( p.x, p.y, p.z ).normalize();
    str = p.confidence;

    spikeTowards(doaState.direction, str * 2);

  }

  controls.update();
  renderer.render(scene, camera);
}

animate();