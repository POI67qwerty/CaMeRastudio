// モデルの外接範囲から、収まるカメラ位置を計算する。
import * as THREE from "three";
export function fitCameraToModel(model, camera, controls, front = false) {
  const bounds = new THREE.Box3().setFromObject(model),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001),
    fov = THREE.MathUtils.degToRad(camera.fov),
    v = Math.max(
      0.01,
      Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect)),
    );
  const distance = (radius / Math.sin(v / 2)) * 1.25;
  const direction = new THREE.Vector3(
    ...(front ? [0, 0, 1] : [1, 0.7, 1.4]),
  ).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 10000, 0.00001);
  camera.far = Math.max(distance * 100, 1);
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.03;
  controls.maxDistance = distance * 30;
  controls.update();
}
