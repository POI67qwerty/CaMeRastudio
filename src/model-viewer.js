import "./model-viewer.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseModel, MAX_MODEL_BYTES } from "./model-io.js";
import { BinaryLineRenderer } from "./binary-lines.js";
import { drawPerspectiveGuides } from "./perspective-guides.js";
import { fitCameraToModel } from "./viewer/model-camera.js";
import { disposeModel } from "./viewer/model-resources.js";
import { createPngBlob } from "./viewer/png-export.js";

const $ = (s) => document.querySelector(s);

const embedded =
  new URLSearchParams(location.search).get("embedded") === "room";
let viewerActive = true;
if (embedded) {
  $("#backToRoom").addEventListener("click", (e) => {
    e.preventDefault();
    window.parent.postMessage({ type: "room-viewer-close" }, location.origin);
  });
  window.addEventListener("message", (e) => {
    if (
      e.origin === location.origin &&
      e.source === window.parent &&
      e.data?.type === "room-viewer-active"
    ) {
      viewerActive = !!e.data.active;
    }
  });
}
const stage = $("#stage"),
  canvas = $("#view"),
  overlay = $("#guideOverlay");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eee8);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca896, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 7);
scene.add(sun);
const room = new THREE.Group();
scene.add(room);
let objects = [],
  model = null,
  modelName = "",
  mode = "color",
  guideCache = "",
  busy = false;
const binary = new BinaryLineRenderer(renderer),
  controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
camera.position.set(4, 3, 5);
controls.update();
let toastTimer;
function toast(text, isError = false) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}
function setStatus(text) {
  $("#status").textContent = text;
}
function fitModel(front = false) {
  if (!model) {
    toast("先にGLBを読み込んでください");
    return;
  }
  fitCameraToModel(model, camera, controls, front);
  guideCache = "";
}
function applyCulling() {
  if (!model) return;
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m) {
        if (m.userData.viewerOriginalSide === undefined)
          m.userData.viewerOriginalSide = m.side;
        m.side = $("#culling").checked ? THREE.FrontSide : THREE.DoubleSide;
        m.needsUpdate = true;
      }
  });
}
async function loadFile(file) {
  if (!file || busy) return;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    toast("GLBファイルを選んでください", true);
    return;
  }
  if (file.size > MAX_MODEL_BYTES) {
    toast("GLBは1ファイル50MB以下にしてください", true);
    return;
  }
  busy = true;
  $("#openModel").disabled = true;
  setStatus("読み込み中…");
  try {
    const data = await file.arrayBuffer(),
      gltf = await parseModel(data),
      candidate = new THREE.Group();
    candidate.add(gltf.scene);
    candidate.userData.id = 1;
    candidate.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(candidate),
      size = bounds.getSize(new THREE.Vector3());
    let count = 0;
    candidate.traverse((o) => {
      if (o.isMesh) count++;
    });
    if (
      !count ||
      bounds.isEmpty() ||
      ![
        size.x,
        size.y,
        size.z,
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        bounds.max.x,
        bounds.max.y,
        bounds.max.z,
      ].every(Number.isFinite) ||
      size.length() < 1e-9
    ) {
      disposeModel(candidate);
      throw new Error("表示できる形状がありません。");
    }
    if (model) {
      scene.remove(model);
      disposeModel(model);
      binary.ids.forEach((material) => material.dispose());
      binary.ids.clear();
      binary.meshIds = new WeakMap();
      binary.nextMeshId = 1;
    }
    model = candidate;
    objects = [model];
    scene.add(model);
    modelName = file.name;
    $("#filename").textContent = file.name;
    $("#filename").title = file.name;
    $("#empty").hidden = true;
    applyCulling();
    fitModel();
    toast("モデルを読み込みました");
  } catch (err) {
    console.error(err);
    toast(err.message || "モデルを読み込めませんでした", true);
  } finally {
    busy = false;
    $("#openModel").disabled = false;
    $("#modelFile").value = "";
    setStatus("準備完了");
  }
}
function settings() {
  return {
    horizon: $("#horizon").checked,
    guides: $("#guides").checked,
    grid: $("#guideGrid").checked,
    count: Number($("#guideCount").value),
    opacity: Number($("#guideOpacity").value) / 100,
    width: Number($("#guideWidth").value),
    axes: {
      x: $("#axisX").checked,
      z: $("#axisZ").checked,
      y: $("#axisY").checked,
    },
    gridStep: Math.max(0.1, Math.min(10, Number($("#gridStep").value) || 0.5)),
    gridCount: Math.max(
      1,
      Math.min(60, Math.floor(Number($("#gridCount").value) || 20)),
    ),
  };
}
function binarySettings() {
  const d = Number($("#depthSensitivity").value),
    n = Number($("#normalSensitivity").value);
  return {
    width: Number($("#lineWidth").value),
    depthLimit: 0.025 * Math.pow(6, (50 - d) / 49),
    normalLimit: 0.15 * Math.pow(6, (50 - n) / 49),
    useIds: $("#idEdges").checked,
    doubleSided: !$("#culling").checked,
    perMeshIds: true,
  };
}
function drawGuides(force = false) {
  const s = settings(),
    w = overlay.width,
    h = overlay.height;
  const signature = [
    w,
    h,
    ...camera.position.toArray(),
    ...camera.quaternion.toArray(),
    camera.fov,
    camera.aspect,
    camera.near,
    JSON.stringify(s),
  ].join("|");
  if (!force && signature === guideCache) return;
  guideCache = signature;
  drawPerspectiveGuides(overlay.getContext("2d"), camera, w, h, s);
}
function render() {
  if (mode === "binary")
    binary.render(scene, camera, objects, room, null, binarySettings());
  else renderer.render(scene, camera);
}
function animate() {
  requestAnimationFrame(animate);
  if (!viewerActive) return;
  controls.update();
  render();
  drawGuides();
}
function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  overlay.width = Math.round(r.width);
  overlay.height = Math.round(r.height);
  guideCache = "";
}
new ResizeObserver(resize).observe(stage);
resize();
animate();
$("#openModel").onclick = () => $("#modelFile").click();
$("#modelFile").onchange = (e) => loadFile(e.target.files[0]);
for (const name of ["dragenter", "dragover"])
  stage.addEventListener(name, (e) => {
    e.preventDefault();
    stage.classList.add("dragging");
  });
for (const name of ["dragleave", "drop"])
  stage.addEventListener(name, (e) => {
    e.preventDefault();
    stage.classList.remove("dragging");
  });
stage.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));
$("#resetView").onclick = () => fitModel();
$("#frontView").onclick = () => fitModel(true);
$("#fov").oninput = (e) => {
  camera.fov = Number(e.target.value);
  camera.updateProjectionMatrix();
  $("#fovOut").textContent = e.target.value + "°";
};
$("#culling").onchange = applyCulling;
document.querySelectorAll("[data-mode]").forEach(
  (button) =>
    (button.onclick = () => {
      mode = button.dataset.mode;
      document
        .querySelectorAll("[data-mode]")
        .forEach((x) => x.classList.toggle("active", x === button));
      $("#binarySettings").hidden = mode !== "binary";
    }),
);
$("#guideCount").oninput = (e) => {
  $("#guideCountNumber").value = e.target.value;
  $("#guideOut").textContent = e.target.value + "本";
};
$("#guideCountNumber").onchange = (e) => {
  const n = Math.max(
    2,
    Math.min(200, Math.floor(Number(e.target.value) || 24)),
  );
  e.target.value = n;
  $("#guideCount").value = n;
  $("#guideOut").textContent = n + "本";
};
$("#guideOpacity").oninput = (e) =>
  ($("#opacityOut").textContent = e.target.value + "%");
$("#guideWidth").oninput = (e) =>
  ($("#guideWidthOut").textContent = Number(e.target.value).toFixed(2) + " px");
$("#guideGrid").onchange = (e) =>
  ($("#gridSettings").hidden = !e.target.checked);
$("#lineWidth").oninput = (e) =>
  ($("#lineWidthOut").textContent = Number(e.target.value).toFixed(1) + " px");
$("#depthSensitivity").oninput = (e) =>
  ($("#depthOut").textContent = e.target.value == 50 ? "標準" : e.target.value);
$("#normalSensitivity").oninput = (e) =>
  ($("#normalOut").textContent =
    e.target.value == 50 ? "標準" : e.target.value);
async function exportBlob() {
  if (!model) throw new Error("先にGLBを読み込んでください");
  controls.update();
  render();
  drawGuides(true);
  return createPngBlob(canvas, overlay, $("#exportGuides").checked);
}
$("#download").onclick = async () => {
  try {
    const blob = await exportBlob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (modelName.replace(/\.glb$/i, "") || "model") +
      "-" +
      (mode === "binary" ? "binary" : "color") +
      ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("PNGを保存しました");
  } catch (e) {
    toast(e.message, true);
  }
};
$("#copy").onclick = async () => {
  try {
    if (!navigator.clipboard?.write || !window.ClipboardItem)
      throw new Error(
        "このブラウザでは画像コピーを利用できません。PNG保存をお試しください",
      );
    const blob = await exportBlob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("画像をコピーしました");
  } catch (e) {
    toast(e.message || "画像をコピーできませんでした", true);
  }
};
