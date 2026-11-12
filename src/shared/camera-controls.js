import * as THREE from "three";
import "../styles/camera-controls.css";

// カメラの設定だけを部屋・モデルビューアー間でやり取りする。
// シーン・モデル・ガイドはこのファイルには含まれない。
export function cameraSnapshot(camera, controls) {
  return {
    type: "room-sketch-camera",
    version: 1,
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
  };
}

export function validateCameraSnapshot(data) {
  const vec = (v) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => Number.isFinite(x) && Math.abs(x) <= 1e9);
  if (
    !data ||
    data.type !== "room-sketch-camera" ||
    data.version !== 1 ||
    !vec(data.position) ||
    !vec(data.target) ||
    !Number.isFinite(data.fov) ||
    data.fov < 1 ||
    data.fov > 179 ||
    !Number.isFinite(data.near) ||
    data.near < 1e-9 ||
    !Number.isFinite(data.far) ||
    data.far <= data.near ||
    data.far > 1e12 ||
    !Number.isFinite(data.zoom) ||
    data.zoom < 0.001 ||
    data.zoom > 1000
  ) {
    throw new Error("カメラファイルの内容が不正です。");
  }
  const position = new THREE.Vector3().fromArray(data.position);
  const target = new THREE.Vector3().fromArray(data.target);
  const distance = position.distanceTo(target);
  if (distance < 1e-8 || !Number.isFinite(distance))
    throw new Error("カメラ位置と注視点が近すぎます。");
  return { ...data, distance };
}

export function applyCameraSnapshot(camera, controls, data) {
  // 読み込んだ位置が現在の操作範囲外でも、勝手に近づいたり角度が変わったりしないようにする。
  const delta = new THREE.Vector3()
    .fromArray(data.position)
    .sub(new THREE.Vector3().fromArray(data.target));
  const polar = Math.acos(
    THREE.MathUtils.clamp(delta.y / data.distance, -1, 1),
  );
  controls.minDistance = Math.min(controls.minDistance, data.distance * 0.5);
  controls.maxDistance = Math.max(controls.maxDistance, data.distance * 1.5);
  controls.minPolarAngle = Math.min(
    controls.minPolarAngle,
    Math.max(0, polar - 1e-5),
  );
  controls.maxPolarAngle = Math.max(
    controls.maxPolarAngle,
    Math.min(Math.PI, polar + 1e-5),
  );
  controls.target.fromArray(data.target);
  camera.position.fromArray(data.position);
  camera.fov = data.fov;
  camera.near = data.near;
  camera.far = data.far;
  camera.zoom = data.zoom;
  camera.updateProjectionMatrix();
  controls.update();
}

export function setupCameraTools({
  camera,
  controls,
  toast,
  lockDisabled = [],
  onCameraLoaded = () => {},
}) {
  const lock = document.querySelector("#cameraLock"),
    save = document.querySelector("#cameraSave"),
    load = document.querySelector("#cameraLoad"),
    file = document.querySelector("#cameraFile");
  let interactionBlocked = false;
  const syncEnabled = () => {
    controls.enabled = !lock.checked && !interactionBlocked;
  };
  lock.addEventListener("change", () => {
    syncEnabled();
    for (const element of lockDisabled) element.disabled = lock.checked;
    load.disabled = lock.checked;
    toast(
      lock.checked ? "カメラをロックしました" : "カメラのロックを解除しました",
    );
  });
  save.addEventListener("click", () => {
    try {
      const blob = new Blob(
        [JSON.stringify(cameraSnapshot(camera, controls), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "room-sketch-camera.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast("カメラ位置を保存しました");
    } catch (error) {
      toast(error.message || "カメラを保存できませんでした", true);
    }
  });
  load.addEventListener("click", () => {
    if (!lock.checked) file.click();
  });
  file.addEventListener("change", async () => {
    const selected = file.files[0];
    if (!selected) return;
    try {
      if (lock.checked)
        throw new Error("先にカメラのロックを解除してください。");
      if (selected.size > 65536)
        throw new Error("カメラファイルは64KB以下にしてください。");
      const data = validateCameraSnapshot(JSON.parse(await selected.text()));
      if (lock.checked)
        throw new Error("先にカメラのロックを解除してください。");
      applyCameraSnapshot(camera, controls, data);
      onCameraLoaded(data);
      toast("カメラ位置を読み込みました");
    } catch (error) {
      toast(
        error instanceof SyntaxError
          ? "JSONの形式が正しくありません。"
          : error.message || "カメラを読み込めませんでした",
        true,
      );
    } finally {
      file.value = "";
    }
  });
  return {
    isLocked: () => lock.checked,
    setInteractionBlocked: (value) => {
      interactionBlocked = value;
      syncEnabled();
    },
  };
}

export function syncCameraFovUI(camera) {
  const input = document.querySelector("#fov"),
    output = document.querySelector("#fovOut");
  input.min = Math.min(20, camera.fov);
  input.max = Math.max(90, camera.fov);
  input.value = camera.fov;
  output.textContent = `${Number(camera.fov.toFixed(2))}°`;
}
