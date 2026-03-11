import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { createSceneSetup } from "./sceneSetup.js";
import { createDirectionController } from "./doaController.js";

const { scene, camera, renderer, controls } = createSceneSetup({ cameraZ: 1.35 });
const directionController = createDirectionController();

const fhScale = 1;
let furhat = null;
const fhLoader = new OBJLoader();
const fhMTL = new MTLLoader();
const VOLUME_SCALE = 0.001;

fhMTL.load("/public/furhat.mtl", (fhMaterials) => {
  fhMaterials.preload();
  fhLoader.setMaterials(fhMaterials);

  fhLoader.load(
    "/public/furhat.obj",
    (fh) => {
      furhat = fh;
      furhat.scale.set(fhScale, fhScale, fhScale);
      scene.add(fh);
    },
    undefined,
    (err) => console.error("Furhat OBJ load error:", err)
  );
});

window.orb = {
  update(data) {
    directionController.updateFromData(data);
  },
};
window.dispatchEvent(new Event("orb-ready"));

function animate() {
  requestAnimationFrame(animate);

  const { direction, volume } = directionController.getDirectionStep();

  controls.update();
  renderer.render(scene, camera);

  if (furhat) {
    furhat.position.y = volume * VOLUME_SCALE + 0.1;
    const yaw = Math.atan2(direction.x, direction.y);
    furhat.rotation.y = yaw;
  }
}

animate();
