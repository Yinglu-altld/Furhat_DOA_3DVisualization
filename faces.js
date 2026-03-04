import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0.9, 0.9, 1.7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.2;
controls.maxDistance = 2.8;

const keyLight = new THREE.DirectionalLight(0xffffff, 4);
keyLight.position.set(1.2, 1.8, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
fillLight.position.set(-1.4, -0.8, -1.6);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambient);

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

let geometry = new THREE.IcosahedronGeometry(0.34, 3).toNonIndexed();
const basePositions = geometry.attributes.position.array.slice();

const orbMaterial = new THREE.MeshPhongMaterial({
  color: 0xd43513,
  opacity: 0.5,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const orbMesh = new THREE.Mesh(geometry, orbMaterial);
scene.add(orbMesh);

const edgeGeom = new THREE.EdgesGeometry(geometry, 20);
const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0x76f3f7,
  transparent: true,
  opacity: 0.65,
  depthWrite: false,
});
orbMesh.add(new THREE.LineSegments(edgeGeom, edgeMaterial));

const v = new THREE.Vector3();
const n = new THREE.Vector3();
const currentDirection = new THREE.Vector3(1, 0, 0);
let currentStrength = 0.12;
let hasExternalDOA = false;
const idleClock = new THREE.Clock();

function deformOrb(dir, strength) {
  const pos = geometry.attributes.position;
  const displacement = 0.55 * strength;

  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3;
    v.set(basePositions[ix], basePositions[ix + 1], basePositions[ix + 2]);
    n.copy(v).normalize();

    let weight = n.dot(dir);
    weight = Math.max(0, weight);
    weight = Math.pow(weight, 14);

    v.addScaledVector(n, weight * displacement);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

window.orb = {
  update(data) {
    if (!data || !data.dir) return;

    const x = Number(data.dir.x);
    const y = Number(data.dir.y);
    const z = Number(data.dir.z);
    const strength = Number(data.strength);

    if (![x, y, z, strength].every((num) => Number.isFinite(num))) return;

    currentDirection.set(x, y, z);
    if (currentDirection.lengthSq() < 1e-8) return;
    currentDirection.normalize();

    currentStrength = THREE.MathUtils.clamp(strength, 0, 1);
    hasExternalDOA = true;
  },
};

function animate() {
  requestAnimationFrame(animate);

  if (!hasExternalDOA) {
    const t = idleClock.getElapsedTime() * 0.6;
    currentDirection.set(Math.cos(t), 0.25, Math.sin(t)).normalize();
    currentStrength = 0.12;
  }

  deformOrb(currentDirection, currentStrength);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
