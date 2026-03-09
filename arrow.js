import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let arrowColor = "green";

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

// Setting up a cylinder
const geometry = new THREE.CylinderGeometry( 0.01, 0.03, 0.3, 64 );
const material = new THREE.MeshPhongMaterial( { color: arrowColor } );
const cylinder = new THREE.Mesh( geometry, material );
cylinder.position.y = 0.15;

// Setting a small sphere at origin to avoid gaps from cylinder
const sphereGeo = new THREE.SphereGeometry( 0.03, 64 );
const sphere = new THREE.Mesh( sphereGeo, material );
scene.add( sphere );

// Arrow tip
const tipGeo = new THREE.ConeGeometry( 0.03, 0.03, 64 );
const arrowTip = new THREE.Mesh( tipGeo, material );
arrowTip.position.y = 0.15;
cylinder.add( arrowTip );

// Parent arrow
const arrow = new THREE.Object3D();
scene.add( arrow );
arrow.add( cylinder );
arrow.position.set( 0, 0, 0);

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

const up = new THREE.Vector3( 0, 1, 0 );
const q = new THREE.Quaternion();

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

  arrow.scale.set( 1, str * 15, 1 );
  q.setFromUnitVectors( up, direction );
  arrow.quaternion.copy( q );
  arrow.position.set( 0, 0, 0 );

  controler.update();
  renderer.render( scene, camera );
}

animate();
