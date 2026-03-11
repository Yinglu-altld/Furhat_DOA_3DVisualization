// scene-setup.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

export const POWER = 14;

export function createSceneSetup({

    // Setting up camera
  cameraZ = 1,
  mount = document.body,
} = {}) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = cameraZ;

    // Setting upp renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enableZoom = false;

    // Setting up lights
    const light = new THREE.DirectionalLight(0xffffff, 5);
    light.position.set(1, 4, 2);
    scene.add(light);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 2);
    backLight.position.set(-1, 1, -2);
    scene.add(backLight);

    const ambiLight = new THREE.AmbientLight( 0xffffff, 0.1 );
    scene.add( ambiLight );

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

    // Helpers for json file
    const doaState = {
        data: [],
        clock: new THREE.Clock(),
        stepTime: 0.1,
        direction: new THREE.Vector3(),
    };
    
    // Fetching json data
    fetch("./doa_xyz_frames.jsonl")
      .then(res => res.text())
      .then(text => {
        doaState.data = text
          .split("\n")
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .map(l => JSON.parse(l));
      });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, doaState };

}

// Linear interpolation for smoothing
function lerp( a, b, t ) {
  return a + ( b - a ) * t;
}

export function linInt( a, b, t ) {
  return {
    x: lerp( a.x, b.x, t ),
    y: lerp( a.y, b.y, t ),
    z: lerp( a.z, b.z, t ),
    volume: lerp( a.volume, b.volume, t ),
  };
}
