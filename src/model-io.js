import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// GLBをJSONに埋め込むとサイズが約4/3に増えるので、極端なメモリ使用を防ぐ。
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;

export function validateGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20)
    throw new Error("GLBファイルが壊れているか、形式が違います。");
  if (buffer.byteLength > MAX_MODEL_BYTES)
    throw new Error("GLBは1ファイル50MB以下にしてください。");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  ) {
    throw new Error("有効なGLB 2.0ファイルではありません。");
  }
  const jsonLength = view.getUint32(12, true),
    chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || jsonLength > buffer.byteLength - 20)
    throw new Error("GLBのデータが壊れています。");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim(),
  );
  for (const item of [...(json.buffers || []), ...(json.images || [])]) {
    if (typeof item.uri === "string" && !item.uri.startsWith("data:")) {
      throw new Error(
        "外部ファイルを参照しない、単一のGLBに書き出してください。",
      );
    }
  }
}

export async function parseModel(buffer) {
  validateGLB(buffer);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    throw new Error(
      "外部ファイルを参照しない、単一のGLBに書き出してください。",
    );
  });
  const loader = new GLTFLoader(manager);
  return await new Promise((resolve, reject) =>
    loader.parse(buffer, "", resolve, reject),
  );
}

export function encodeBase64(buffer) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("モデルの保存データを作成できませんでした。"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.readAsDataURL(new Blob([buffer], { type: "model/gltf-binary" }));
  });
}

export function decodeBase64(text) {
  if (
    typeof text !== "string" ||
    text.length < 4 ||
    text.length > Math.ceil(MAX_MODEL_BYTES / 3) * 4 ||
    text.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(text)
  ) {
    throw new Error("プロジェクト内のGLBデータが不正か、50MBを超えています。");
  }
  let binary;
  try {
    binary = atob(text);
  } catch {
    throw new Error("プロジェクト内のGLBデータを読み込めません。");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  validateGLB(bytes.buffer);
  return bytes.buffer;
}
