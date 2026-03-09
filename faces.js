import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let meshColor = 0xCFA1F3;

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
let geometry = new THREE.IcosahedronGeometry(0.34, 3);

geometry = geometry.toNonIndexed();

// Store the base (rest) positions so deformation doesn't accumulate
const posAttr = geometry.attributes.position;
const basePositions = posAttr.array.slice(); // copy

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

let str = 0.12;

// Reuse direction vector too
const direction = new THREE.Vector3();

// Explotion function
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const faceNormal = new THREE.Vector3();

let explode = 0.1;

function explodeFaces( amount ) {
  const pos = geometry.attributes.position;

  for( let i = 0; i < pos.count; i+= 3 ) {
    tmpA.fromBufferAttribute( pos, i + 0 );
    tmpB.fromBufferAttribute( pos, i + 1 );
    tmpC.fromBufferAttribute( pos, i + 2 );

    faceNormal
      .subVectors(tmpB, tmpA)
      .cross( tmpC.clone().sub(tmpA) )
      .normalize();

    tmpA.addScaledVector( faceNormal, amount );
    tmpB.addScaledVector( faceNormal, amount );
    tmpC.addScaledVector( faceNormal, amount );

    pos.setXYZ( i + 0, tmpA.x, tmpA.y, tmpA.z );
    pos.setXYZ( i + 1, tmpB.x, tmpB.y, tmpB.z );
    pos.setXYZ( i + 2, tmpC.x, tmpC.y, tmpC.z );
  }
  pos.needsUpdate = true;
}

// Helpers for json file
let DOAData = [];
let jsonIndex = 0;
const clock = new THREE.Clock();
const stepTime = 0.1;

// Fetching json data
fetch("./doa_xyz_frames.jsonl")
  .then(res => res.text())
  .then(text => {
    DOAData = text
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => JSON.parse(l));

    console.log("Loaded frames:", DOAData.length, DOAData[0]);
  })
  .catch(err => console.error("JSONL load error:", err));

// Linear interpolation for smoothing
function lerp( a, b, t ) {
  return a + ( b - a ) * t;
}

function linInt( a, b, t ) {
  return {
    x: lerp( a.x, b.x, t ),
    y: lerp( a.y, b.y, t ),
    z: lerp( a.z, b.z, t ),
    confidence: lerp( a.confidence, b.confidence, t ),
  };
}

// Looping animation & updating views
function animate() {
  requestAnimationFrame(animate);

if ( DOAData.length > 0 ) {
    const elapsed = clock.getElapsedTime();
    const frame = elapsed / stepTime;
    const indexA = Math.floor( frame ) % DOAData.length;
    const indexB = ( indexA + 1 ) % DOAData.length;
    const t = frame % 1;

    const a = DOAData[ indexA ];
    const b= DOAData[ indexB ];
    const p = linInt( a, b, t );

    direction.set( p.x, p.y, p.z ).normalize();
    str = p.confidence;

    spikeTowards(direction, str * 1.8);

  }
  explodeFaces( explode );

  controler.update();
  renderer.render( scene, camera );
}

animate();