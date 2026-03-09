import * as THREE from "three";

import { createSceneSetup, linInt } from "./sceneSetup.js";
const {scene, camera, renderer, controls, doaState} = createSceneSetup();

let arrowColor = "green";

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

const up = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();

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
    str = p.confidence;
  }

  arrow.scale.set( 1, str * 15, 1 );
  q.setFromUnitVectors( up, doaState.direction );
  arrow.quaternion.copy( q );
  arrow.position.set( 0, 0, 0 );

  controls.update();
  renderer.render( scene, camera );
}

animate();
