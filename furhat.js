import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

import { createSceneSetup, linInt } from "./sceneSetup.js";
const {scene, camera, renderer, controls, doaState} = createSceneSetup();

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

let str;

// Creating animation
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
    str = p.volume;
  }

  controls.update();
  renderer.render( scene, camera );
  furhat.position.y = str / 1000 - 0.1;
  const yaw = Math.atan2( doaState.direction.x, doaState.direction.y );
  furhat.rotation.y = yaw;
}

animate();
