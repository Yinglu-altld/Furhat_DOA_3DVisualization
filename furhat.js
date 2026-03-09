import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let arrowColor = "white";

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
const light = new THREE.DirectionalLight(0xffffff, 5);
light.position.set(1, 4, 2);
scene.add(light);

const backLight = new THREE.DirectionalLight(0xffffff, 2);
backLight.position.set(-1, -4, -2); // fixed typo
scene.add(backLight);

// Adding .obj and .mtl file of respeaker (note: material must load before obj to apply)
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

mtlLoader.load("./speaker.mtl", (materials) => {
  materials.preload();
  objLoader.setMaterials(materials);

  objLoader.load("./speaker.obj", (root) => {
    root.scale.set(9, 9, 9);
    root.rotation.x = -Math.PI / 2;
    scene.add(root);
  });
});

// Loading Furhat simplified mesh
const fhScale = 1;
let furhat = null;
const fhLoader = new OBJLoader();
const fhMTL = new MTLLoader();

fhMTL.load("./furhat.mtl", (fhMaterial) => {
    fhMaterial.preload();
    fhLoader.setMaterials(fhMaterial);

    fhLoader.load("./furhat.obj", (fh) => {
        furhat = fh;
        fh.scale.set(fhScale, fhScale, fhScale);
        scene.add(fh);
    });
});

// Helpers for json file
let DOAData = [];
let jsonIndex = 0;
const clock = new THREE.Clock();
const stepTime = 0.1;

const direction = new THREE.Vector3();
let str = 0.2;
let p = null;

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

// Creating animation
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
  }

  controler.update();
  renderer.render( scene, camera );
  furhat.position.y = str * 2 - 0.1;
  const yaw = Math.atan2( direction.x, direction.y );
  furhat.rotation.y = yaw;
}

animate();
