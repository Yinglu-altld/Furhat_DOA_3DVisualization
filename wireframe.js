import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Setting the camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 1;

// Setting the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Setting up orbit camera controls
const controler = new OrbitControls(camera, renderer.domElement);
controler.enableDamping = true;
controler.dampingFactor = 0.1;
controler.enableZoom = false;

// Setting the lights
let ambiLight = false;

if (ambiLight) {
  const ambient = new THREE.AmbientLight(0xffffff, 3);
  scene.add(ambient);
} else {
  const light = new THREE.DirectionalLight(0xffffff, 5);
  light.position.set(1, 4, 2);
  scene.add(light);

  const backLight = new THREE.DirectionalLight(0xffffff, 2);
  backLight.position.set(-1, -4, -2); // fixed typo
  scene.add(backLight);
}

// Adding .obj and .mtl file of respeaker (note: material must load before obj to apply)
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

mtlLoader.load("/speaker.mtl", (materials) => {
  materials.preload();
  objLoader.setMaterials(materials);

  objLoader.load("/speaker.obj", (root) => {
    root.scale.set(9, 9, 9);
    root.rotation.x = -Math.PI / 2;
    scene.add(root);
  });
});

// Creating the orb (icosahedron)
const geometry = new THREE.IcosahedronGeometry(0.4, 3);

// Store the base (rest) positions so deformation doesn't accumulate
const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice(); // copy

const material = new THREE.MeshPhongMaterial({
  color: 0x5e07c3,
  opacity: 0.2,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const icosahedron = new THREE.Mesh(geometry, material);
scene.add(icosahedron);

// Creating wireframe for cool effect
const lineMaterial = new THREE.MeshPhongMaterial({
  color: 0x76f3f7,
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
    w = Math.pow(w, 14);    // sharp spike

    // Push outward along the normal
    v.addScaledVector(n, w * strength);

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// let str = 0.22;
// const clock = new THREE.Clock();
// const angularSpeed = 1;

// Reuse direction vector too
const direction = new THREE.Vector3();

// Looping animation & updating views
function animate() {
  requestAnimationFrame(animate);

  // const t = clock.getElapsedTime();
  // const a = t * angularSpeed;
  // direction.set(Math.cos(a), 0.35, Math.sin(a)).normalize();

  // ###################### CALL THIS FUNCTION WITH A NORMALIZED DIRECTION VECTOR (FROM CENTRE) AND SIGNAL STRENGTH #######################
  spikeTowards(direction, str);

  controler.update();
  renderer.render(scene, camera);
}

animate();