// GLBを部屋で扱うための外側グループ・倍率・外接範囲。
import * as THREE from "three";
import { parseModel } from "../model-io.js";

export function validModelScale(n) {
  return Number.isFinite(n) && n >= 0.01 && n <= 100;
}
export function setModelScale(g, scale) {
  g.scale.setScalar(scale);
  g.userData.modelScale = scale;
  const [w, d, ox, oz] = g.userData.baseFootprint;
  g.userData.footprint = [w * scale, d * scale, ox * scale, oz * scale];
}

export async function prepareModel(buffer, base64, name, scale, makeEdges) {
  if (!validModelScale(scale))
    throw new Error("モデルの倍率は0.01〜100で入力してください。");
  const gltf = await parseModel(buffer),
    content = gltf.scene;
  // 読み込んだシーン自体の位置・回転・スケールを変更しないよう、外側のGroupを操作する。
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  if (
    bounds.isEmpty() ||
    ![size.x, size.y, size.z, center.x, center.y, center.z].every(
      Number.isFinite,
    )
  )
    throw new Error("モデルに配置できる形状がありません。");
  const meshes = [];
  content.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  if (!meshes.length)
    throw new Error("モデルに表示できるメッシュがありません。");
  meshes.forEach((o) => o.add(makeEdges(o.geometry, 35)));
  const group = new THREE.Group();
  group.add(content);
  group.userData.modelName =
    typeof name === "string" ? name.slice(0, 200) : "model.glb";
  group.userData.modelData = base64;
  group.userData.baseFootprint = [
    Math.max(0.01, size.x),
    Math.max(0.01, size.z),
    center.x,
    center.z,
  ];
  group.userData.baseDimensions = [size.x, size.y, size.z];
  setModelScale(group, scale);
  return group;
}
