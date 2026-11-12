import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  encodeBase64,
  decodeBase64,
  MAX_MODEL_BYTES,
  MAX_PROJECT_BYTES,
} from "./model-io.js";
import { rectangle, intersects, outsideFloor } from "./collision.js";
import { BinaryLineRenderer } from "./binary-lines.js";
import { drawPerspectiveGuides } from "./perspective-guides.js";
import { TATAMI_PATTERNS } from "./tatami.js";
import { setupViewerNavigation } from "./room/viewer-navigation.js";
import { createGeometryTools } from "./room/geometry.js";
import {
  labels,
  sizes,
  defaultDesk,
  createFurnitureFactory,
} from "./room/furniture.js";
import {
  validModelScale,
  setModelScale,
  prepareModel,
} from "./room/imported-model.js";
import { validDesk, validateProject } from "./room/project-validation.js";
import { createOpeningTools } from "./room/openings.js";
import { createRoomBuilder } from "./room/room-geometry.js";
import { createPlanDrawer } from "./room/plan-drawing.js";
import { serializeProjectObjects } from "./room/project-serialization.js";
import { templateItems } from "./room/templates.js";
import { bindGuideControls } from "./room/guide-controls.js";
import { bindImageExport } from "./room/image-export.js";
import {
  setupCameraTools,
  syncCameraFovUI,
  validateCameraSnapshot,
  applyCameraSnapshot,
} from "./shared/camera-controls.js";

const $ = (s) => document.querySelector(s);

const isViewerShowing = setupViewerNavigation($("#openViewer"));

// --- 3Dシーン・カメラ・レンダラーの準備 ---
const viewport = $("#viewport"),
  canvas = $("#view"),
  plan = $("#plan"),
  overlay = $("#overlay");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9ede7);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
camera.position.set(8, 7, 9);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const binaryRenderer = new BinaryLineRenderer(renderer);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = false; // 操作を離した後の慣性をなくす。
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1;
controls.maxDistance = 40;
controls.update();
const cameraTools = setupCameraTools({
  camera,
  controls,
  toast,
  lockDisabled: ["#camera", "#resetCamera", "#zoomIn", "#zoomOut", "#fov"].map(
    $,
  ),
  onCameraLoaded: () => syncCameraFovUI(camera),
});
scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca896, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 7);
scene.add(sun);
// --- 現在編集中の部屋とUIの状態 ---
let mode = "color",
  objects = [],
  selected = null,
  walls = [],
  nextId = 1;
let W = 8,
  D = 7;
let floorStyle = "wood",
  tatamiPattern = "8"; // テンプレート選択中と、実際に作成済みの床は別に持つ。
let cells = Array.from({ length: D }, () => Array(W).fill(true)),
  openings = {},
  planTool = "select",
  placementType = null,
  placementPrimitive = null,
  selectedBox = null,
  warnings = new Map(),
  resizeDrag = null,
  selectedOpening = null;
const normal = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] };
const cellKey = (x, z, side) => `${x},${z},${side}`;
const {
  edgeAt,
  openingData,
  unpackOpening,
  openingLimit,
  openingPieces,
  openingAt,
} = createOpeningTools({
  normal,
  getCells: () => cells,
  getOpenings: () => openings,
  getDimensions: () => ({ W, D }),
});
// --- 窓・ドアと選択中の寸法欄 ---
function sanitizeOpenings() {
  for (const key of Object.keys(openings)) {
    let e = unpackOpening(key),
      data = openingData(openings[key]);
    if (!data || !normal[e.side] || !edgeAt(e.x, e.z, e.side)) {
      delete openings[key];
      continue;
    }
    let limit = openingLimit(key);
    if (limit < 0.2) {
      delete openings[key];
      continue;
    }
    openings[key] = { ...data, width: Math.min(data.width, limit) };
  }
  if (selectedOpening && !openingData(openings[selectedOpening]))
    selectedOpening = null;
}
function renderOpeningEditor() {
  const data = selectedOpening && openingData(openings[selectedOpening]);
  $("#openingEmpty").hidden = !!data;
  $("#openingEditor").hidden = !data;
  if (!data) return;
  $("#openingName").textContent =
    data.type === "window" ? "窓を選択中" : "ドアを選択中";
  $("#openingWidth").max = openingLimit(selectedOpening);
  $("#openingWidth").value = Number(data.width.toFixed(2));
  $("#openingHeight").value = data.height;
  $("#openingSill").value = data.sill;
  $("#sillLabel").hidden = data.type !== "window";
  $("#openingLimit").textContent =
    `この位置での幅の上限：${openingLimit(selectedOpening).toFixed(2)}m（壁の長さ・隣の窓やドアによる）`;
}
function selectOpening(key) {
  select(null);
  selectedOpening = key;
  renderOpeningEditor();
  drawPlan();
}
function renderDeskEditor() {
  let d =
    selected?.userData.type === "desk" ? selected.userData.deskSpec : null;
  $("#deskEditor").hidden = !d;
  if (!d) return;
  $("#deskWidth").value = d.width;
  $("#deskDepth").value = d.depth;
  $("#deskThickness").value = d.thickness;
  $("#deskLeg").value = d.leg;
}
function makeRng(seed) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function seedValue() {
  return Math.max(0, Math.floor(Number($("#seed").value) || 0)) >>> 0;
}
function clearGenerated(group) {
  while (group.children.length) {
    let child = group.children[0];
    group.remove(child);
    child.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
    });
  }
}
// --- 操作履歴（元に戻す・やり直し） ---
let undoStack = [],
  redoStack = [];
function snapshot() {
  return {
    cells: cells.map((a) => [...a]),
    openings: { ...openings },
    objects: objects.map((g) => ({
      g,
      x: g.position.x,
      z: g.position.z,
      rot: g.rotation.y,
      modelScale: g.userData.type === "model" ? g.userData.modelScale : null,
    })),
    room: $("#room").value,
    seed: $("#seed").value,
    floorStyle,
    tatamiPattern,
  };
}
function remember() {
  undoStack.push(snapshot());
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}
function restore(state) {
  objects.forEach((o) => scene.remove(o));
  objects = state.objects.map((v) => {
    v.g.position.set(v.x, 0, v.z);
    v.g.rotation.y = v.rot;
    if (v.g.userData.type === "model" && v.modelScale != null)
      setModelScale(v.g, v.modelScale);
    scene.add(v.g);
    return v.g;
  });
  cells = state.cells.map((a) => [...a]);
  D = cells.length;
  W = cells[0].length;
  openings = { ...state.openings };
  floorStyle = state.floorStyle || "wood";
  tatamiPattern = state.tatamiPattern || "8";
  syncTatamiUI();
  $("#room").value = state.room;
  $("#seed").value = state.seed;
  select(null);
  makeRoom();
  setStyle(room);
  objects.forEach(setStyle);
  drawPlan();
}
function undo() {
  if (!undoStack.length) {
    toast("戻せる操作はありません");
    return;
  }
  redoStack.push(snapshot());
  restore(undoStack.pop());
  toast("元に戻しました");
}
function redo() {
  if (!redoStack.length) {
    toast("やり直せる操作はありません");
    return;
  }
  undoStack.push(snapshot());
  restore(redoStack.pop());
  toast("やり直しました");
}
const { mat, makeEdges, box, cylinder, primitive } = createGeometryTools(
  viewport,
  () => Number($("#lineWidth").value),
);

function renderModelEditor() {
  let g = selected?.userData.type === "model" ? selected : null;
  $("#modelEditor").hidden = !g;
  if (!g) return;
  $("#modelFileName").textContent = g.userData.modelName || "GLB";
  $("#modelScale").value = g.userData.modelScale;
  const a = g.userData.baseDimensions.map((v) =>
    (v * g.userData.modelScale).toFixed(2),
  );
  $("#modelDimensions").textContent =
    `およそのサイズ：幅 ${a[0]} × 高さ ${a[1]} × 奥行 ${a[2]} m`;
}
// --- 家具の床外・重なり判定 ---
function getFootprint(o) {
  return o.userData.footprint || [...sizes[o.userData.type], 0, 0];
}
function footprintPoly(o) {
  const [w, d, ox = 0, oz = 0] = getFootprint(o);
  return rectangle(o.position.x, o.position.z, w, d, o.rotation.y, ox, oz);
}
// 家具の床面上の外接四角を、壁厚分だけ広げて判定する。
const WALL_CLEARANCE = 0.07;
function fitsAt(o, x, z, rotation = o.rotation.y, grid = cells) {
  const [w, d, ox = 0, oz = 0] = getFootprint(o);
  return !outsideFloor(
    rectangle(
      x,
      z,
      w + WALL_CLEARANCE * 2,
      d + WALL_CLEARANCE * 2,
      rotation,
      ox,
      oz,
    ),
    grid,
  );
}
function findInside(o, x, z) {
  if (fitsAt(o, x, z)) return { x, z };
  // まず部屋の外枠へ寄せる。回転・モデルの原点ずれも考慮。
  const poly = rectangle(
    0,
    0,
    ...getFootprint(o)
      .slice(0, 2)
      .map((n) => n + WALL_CLEARANCE * 2),
    o.rotation.y,
    ...getFootprint(o).slice(2, 4),
  );
  let minX = Math.min(...poly.map((v) => v[0])),
    maxX = Math.max(...poly.map((v) => v[0])),
    minZ = Math.min(...poly.map((v) => v[1])),
    maxZ = Math.max(...poly.map((v) => v[1]));
  let cx = Math.min(W / 2 - maxX, Math.max(-W / 2 - minX, x)),
    cz = Math.min(D / 2 - maxZ, Math.max(-D / 2 - minZ, z));
  if (fitsAt(o, cx, cz)) return { x: cx, z: cz };
  // L字などの不規則な床は、空いている位置を一定間隔で探す。
  let best = null,
    bestDist = Infinity;
  const step = 0.25;
  for (let zz = -D / 2; zz <= D / 2; zz += step)
    for (let xx = -W / 2; xx <= W / 2; xx += step) {
      const dist = (xx - x) ** 2 + (zz - z) ** 2;
      if (dist >= bestDist) continue;
      if (fitsAt(o, xx, zz)) {
        best = { x: xx, z: zz };
        bestDist = dist;
      }
    }
  return best;
}
let lastWallNotice = 0;
function wallNotice(message = "壁や床の外には移動できません") {
  if (Date.now() - lastWallNotice > 1200) {
    lastWallNotice = Date.now();
    toast(message);
  }
}
function moveInside(o, x, z) {
  const dx = x - o.position.x,
    dz = z - o.position.z,
    dist = Math.hypot(dx, dz);
  if (!dist) return;
  // 通り抜けを防ぐため、長いドラッグは0.1m以下に分割して検査する。
  const steps = Math.min(500, Math.ceil(dist / 0.1));
  const sx = o.position.x,
    sz = o.position.z;
  let lastX = sx,
    lastZ = sz,
    blocked = false;
  for (let i = 1; i <= steps; i++) {
    const nx = sx + (dx * i) / steps,
      nz = sz + (dz * i) / steps;
    if (!fitsAt(o, nx, nz)) {
      blocked = true;
      break;
    }
    lastX = nx;
    lastZ = nz;
  }
  o.position.x = lastX;
  o.position.z = lastZ;
  if (blocked) wallNotice();
}
function validatePlacement() {
  warnings = new Map();
  const shapes = objects.map(footprintPoly);
  objects.forEach((o, i) => {
    let issues = [];
    if (outsideFloor(shapes[i], cells)) issues.push("床からはみ出し");
    for (let j = 0; j < objects.length; j++)
      if (i !== j && intersects(shapes[i], shapes[j])) {
        issues.push("ほかの物と重なり");
        break;
      }
    if (issues.length) warnings.set(o, issues);
  });
  const summary = $("#collisionSummary");
  summary.classList.toggle("has-warning", warnings.size > 0);
  summary.textContent = warnings.size
    ? `⚠ ${warnings.size}個に配置の警告があります`
    : "配置に問題はありません";
  const detail = $("#selectedWarning");
  if (detail) {
    detail.textContent =
      selected && warnings.has(selected)
        ? "⚠ " + warnings.get(selected).join("・")
        : "";
    detail.hidden = !detail.textContent;
  }
  if (selectedBox)
    selectedBox.material.color.set(
      selected && warnings.has(selected) ? 0xd17954 : 0x4d9aa0,
    );
}
// --- 床・壁と家具の作成・選択 ---
const room = new THREE.Group();
scene.add(room);
const makeRoom = createRoomBuilder({
  room,
  clearGenerated,
  box,
  mat,
  normal,
  edgeAt,
  openingPieces,
  setStyle,
  getRoomState: () => ({ W, D, cells, floorStyle, tatamiPattern }),
  setWalls: (value) => {
    walls = value;
  },
});
function syncTatamiUI() {
  $("#tatamiPattern").value = tatamiPattern;
  $("#tatamiSettings").hidden = floorStyle !== "tatami";
}
$("#tatamiPattern").onchange = (e) => {
  if (!Object.hasOwn(TATAMI_PATTERNS, e.target.value)) return;
  remember();
  tatamiPattern = e.target.value;
  makeRoom();
  drawPlan();
  toast("畳の敷き方を変更しました");
};
function generateOpenings(seed) {
  selectedOpening = null;
  renderOpeningEditor();
  let rng = makeRng(seed ^ 0x14ac3),
    options = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      for (let side of Object.keys(normal))
        if (edgeAt(x, z, side)) options.push({ x, z, side });
  openings = {};
  let back = options.filter((e) => e.side === "back");
  if (back.length) {
    let start = Math.floor(rng() * back.length);
    for (let i = 0; i < Math.min(2, back.length); i++) {
      let e = back[(start + i) % back.length];
      openings[cellKey(e.x, e.z, e.side)] = "window";
    }
  }
  let sides = options.filter((e) => e.side === "right" || e.side === "front");
  if (sides.length) {
    let e = sides[Math.floor(rng() * sides.length)];
    openings[cellKey(e.x, e.z, e.side)] = "door";
  }
}
const createFurniture = createFurnitureFactory({
  box,
  cylinder,
  mat,
  makeEdges,
});

function setStyle(root) {
  root.traverse((o) => {
    if (o.userData.binaryOnly) {
      o.visible = mode === "binary";
      return;
    }
    if (o.userData.outline) {
      o.visible = mode === "line" && !o.userData.tatamiBase;
      return;
    }
    if (o.isMesh) {
      if (o.userData.baseColor !== undefined) {
        o.material.color.set(mode === "line" ? 0xffffff : o.userData.baseColor);
      } else if (o.material) {
        let mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m.userData.originalColor && m.color)
            m.userData.originalColor = m.color.clone();
          if (m.color && m.userData.originalColor)
            m.color.copy(
              mode === "line"
                ? new THREE.Color(0xffffff)
                : m.userData.originalColor,
            );
        });
      }
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        m.side = $("#culling").checked ? THREE.FrontSide : THREE.DoubleSide;
        m.needsUpdate = true;
      });
    }
    if (o.isLineSegments) o.visible = mode === "line";
  });
  scene.background.set(mode === "line" ? 0xffffff : 0xe9ede7);
}
function add(type, x = 0, z = 0, rot = 0, custom = null) {
  let g = custom || createFurniture(type);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.userData = { ...g.userData, type, id: nextId++ };
  const fit = findInside(g, x, z);
  if (!fit) {
    clearGenerated(g);
    toast("この家具が収まる床がありません");
    return null;
  }
  g.position.x = fit.x;
  g.position.z = fit.z;
  scene.add(g);
  objects.push(g);
  setStyle(g);
  select(g);
  drawPlan();
  return g;
}
function select(o) {
  selected = o;
  selectedOpening = null;
  renderOpeningEditor();
  if (selectedBox) {
    scene.remove(selectedBox);
    selectedBox.geometry.dispose();
    selectedBox.material.dispose();
    selectedBox = null;
  }
  if (o) {
    selectedBox = new THREE.BoxHelper(o, 0x4d9aa0);
    scene.add(selectedBox);
  }
  $("#selectedName").innerHTML = o
    ? `<strong>${labels[o.userData.type]}</strong> <span style="color:#a2ada4">#${o.userData.id}</span>`
    : "間取りまたは3D上で選択";
  renderDeskEditor();
  renderModelEditor();
  drawPlan();
}
function remove() {
  if (!selected) return;
  scene.remove(selected);
  objects = objects.filter((x) => x !== selected);
  select(null);
}
function rotate(step = Math.PI / 2) {
  if (!selected) return;
  const angle = selected.rotation.y + step;
  if (!fitsAt(selected, selected.position.x, selected.position.z, angle)) {
    toast("壁や床からはみ出すため回転できません");
    return;
  }
  remember();
  selected.rotation.y = angle;
  drawPlan();
}
function template(kind, randomize = false) {
  let rng = makeRng(seedValue() ^ 0x17de);
  objects.forEach((o) => scene.remove(o));
  objects = [];
  select(null);
  let a = templateItems(kind);
  let skipped = 0;
  a.forEach((v) => {
    if (randomize && kind !== "classroom" && kind !== "washitsu") {
      v[1] = Math.max(-3.2, Math.min(3.2, v[1] + (rng() - 0.5) * 0.7));
      v[2] = Math.max(-2.8, Math.min(2.8, v[2] + (rng() - 0.5) * 0.7));
    }
    if (!add(...v)) skipped++;
  });
  select(null);
  setStyle(room);
  drawPlan();
  return skipped;
}
// --- 間取り図の描画と2D編集 ---
const drawPlan = createPlanDrawer({
  plan,
  roomSize: $("#roomSize"),
  normal,
  edgeAt,
  openingPieces,
  getFootprint,
  labels,
  validatePlacement,
  getState: () => ({
    W,
    D,
    cells,
    objects,
    warnings,
    selected,
    selectedOpening,
    planTool,
    placementType,
    resizeDrag,
  }),
});
function pointCell(p) {
  return { x: Math.floor(p.x + W / 2), z: Math.floor(p.z + D / 2) };
}
function nearestEdge(p) {
  let best = null;
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      for (let side of Object.keys(normal))
        if (edgeAt(x, z, side)) {
          let xx = x - W / 2,
            zz = z - D / 2,
            d;
          if (side === "back" || side === "front") {
            let e = zz + (side === "front" ? 1 : 0);
            d = Math.hypot(Math.max(xx - p.x, 0, p.x - xx - 1), p.z - e);
          } else {
            let e = xx + (side === "right" ? 1 : 0);
            d = Math.hypot(p.x - e, Math.max(zz - p.z, 0, p.z - zz - 1));
          }
          if (!best || d < best.d) best = { x, z, side, d };
        }
  return best && best.d < 0.25 ? best : null;
}
function editPlan(p) {
  let { x, z } = pointCell(p);
  if (planTool === "floor" || planTool === "outside") {
    if (x < 0 || x >= W || z < 0 || z >= D) return;
    let val = planTool === "floor";
    if (cells[z][x] === val) return;
    cells[z][x] = val;
    if (!val && objects.some((o) => !fitsAt(o, o.position.x, o.position.z))) {
      cells[z][x] = true;
      wallNotice("家具がある場所は外にできません");
      return;
    }
    sanitizeOpenings();
    makeRoom();
    renderOpeningEditor();
    drawPlan();
    return;
  }
  if (planTool === "wall" || planTool === "opening") {
    let e = nearestEdge(p);
    if (!e) {
      if (planTool === "opening")
        toast("色の付いた窓かドアをクリックしてください");
      return;
    }
    let found = openingAt(e, p);
    if (planTool === "opening") {
      if (found) selectOpening(found);
      else toast("窓・ドアの色の付いた部分を選んでください");
      return;
    }
    if (found) {
      const data = openingData(openings[found]);
      if (data.type === "window")
        openings[found] = {
          type: "door",
          width: data.width,
          height: 2.2,
          sill: 0,
        };
      else delete openings[found];
    } else {
      found = cellKey(e.x, e.z, e.side);
      const limit = openingLimit(found);
      if (limit < 0.2) {
        toast("隣の開口と重なるため追加できません");
        return;
      }
      openings[found] = {
        type: "window",
        width: Math.min(0.84, limit),
        height: 1.3,
        sill: 1.05,
      };
    }
    if (openingData(openings[found])) selectOpening(found);
    else {
      selectedOpening = null;
      renderOpeningEditor();
    }
    makeRoom();
    drawPlan();
  }
}
function planPoint(e) {
  const r = plan.getBoundingClientRect(),
    s = plan.width,
    scale = (s - 96) / (Math.max(W, D) + 1);
  return {
    x: (((e.clientX - r.left) / r.width) * s - s / 2) / scale,
    z: (((e.clientY - r.top) / r.height) * s - s / 2) / scale,
  };
}
function boundaryForResize(p) {
  const e = nearestEdge(p);
  if (!e) return null;
  return (e.side === "left" && e.x === 0) ||
    (e.side === "right" && e.x === W - 1) ||
    (e.side === "back" && e.z === 0) ||
    (e.side === "front" && e.z === D - 1)
    ? e.side
    : null;
}
function resizeRoom(side, delta) {
  let oldW = W,
    oldD = D;
  delta = Math.max(
    side === "left" || side === "right" ? 2 - W : 2 - D,
    Math.min(side === "left" || side === "right" ? 20 - W : 20 - D, delta),
  );
  if (!delta) return;
  const shiftX = side === "left" ? delta : 0,
    shiftZ = side === "back" ? delta : 0,
    newW = W + (side === "left" || side === "right" ? delta : 0),
    newD = D + (side === "back" || side === "front" ? delta : 0);
  let next = Array.from({ length: newD }, () => Array(newW).fill(true));
  for (let z = 0; z < oldD; z++)
    for (let x = 0; x < oldW; x++) {
      let nx = x + shiftX,
        nz = z + shiftZ;
      if (nx >= 0 && nx < newW && nz >= 0 && nz < newD)
        next[nz][nx] = cells[z][x];
    }
  let nextOpen = {};
  for (const [key, value] of Object.entries(openings)) {
    let [sx, sz, edge] = key.split(","),
      x = Number(sx),
      z = Number(sz),
      nx = x + shiftX,
      nz = z + shiftZ;
    if (edge === side) {
      if (side === "left" && x === 0) nx = 0;
      if (side === "right" && x === oldW - 1) nx = newW - 1;
      if (side === "back" && z === 0) nz = 0;
      if (side === "front" && z === oldD - 1) nz = newD - 1;
    }
    if (nx >= 0 && nx < newW && nz >= 0 && nz < newD)
      nextOpen[cellKey(nx, nz, edge)] = value;
  }
  const dx = shiftX - (newW - oldW) / 2,
    dz = shiftZ - (newD - oldD) / 2;
  if (
    objects.some(
      (o) =>
        !fitsAt(o, o.position.x + dx, o.position.z + dz, o.rotation.y, next),
    )
  ) {
    toast("家具が壁からはみ出すため縮められません。家具を移動してください");
    drawPlan();
    return;
  }
  W = newW;
  D = newD;
  cells = next;
  openings = nextOpen;
  objects.forEach((o) => {
    o.position.x += dx;
    o.position.z += dz;
  });
  selectedOpening = null;
  sanitizeOpenings();
  renderOpeningEditor();
  makeRoom();
  drawPlan();
  toast(`部屋を ${W} × ${D}m に変更しました`);
}
let dragging = false,
  planEditDown = false;
plan.addEventListener("pointerdown", (e) => {
  let p = planPoint(e);
  if (placementType) {
    let c = pointCell(p);
    if (!cells[c.z]?.[c.x]) {
      toast("床の上をクリックしてください");
      return;
    }
    remember();
    add(
      placementType,
      Math.round(p.x * 10) / 10,
      Math.round(p.z * 10) / 10,
      0,
      placementType === "primitive" ? primitive(placementPrimitive) : null,
    );
    return;
  }
  if (planTool === "select") {
    let side = boundaryForResize(p);
    if (side) {
      resizeDrag = {
        side,
        start: side === "left" || side === "right" ? p.x : p.z,
        current: side === "left" || side === "right" ? p.x : p.z,
      };
      plan.setPointerCapture(e.pointerId);
      drawPlan();
      return;
    }
  }
  if (planTool !== "select") {
    remember();
    editPlan(p);
    planEditDown = true;
    plan.setPointerCapture(e.pointerId);
    return;
  }
  let found = [...objects].reverse().find((o) => {
    let dx = p.x - o.position.x,
      dz = p.z - o.position.z,
      angle = o.rotation.y;
    let xx = dx * Math.cos(angle) - dz * Math.sin(angle),
      zz = dx * Math.sin(angle) + dz * Math.cos(angle);
    let [w, d, ox = 0, oz = 0] = getFootprint(o);
    return Math.abs(xx - ox) < w / 2 + 0.1 && Math.abs(zz - oz) < d / 2 + 0.1;
  });
  select(found || null);
  if (found) {
    remember();
    dragging = true;
    plan.setPointerCapture(e.pointerId);
  }
});
plan.addEventListener("pointermove", (e) => {
  if (resizeDrag) {
    let p = planPoint(e);
    resizeDrag.current =
      resizeDrag.side === "left" || resizeDrag.side === "right" ? p.x : p.z;
    drawPlan();
    return;
  }
  if (!dragging && !planEditDown && planTool === "select" && !placementType) {
    const side = boundaryForResize(planPoint(e));
    plan.style.cursor = side
      ? side === "left" || side === "right"
        ? "ew-resize"
        : "ns-resize"
      : "crosshair";
  }
  if (planEditDown && (planTool === "floor" || planTool === "outside")) {
    editPlan(planPoint(e));
    return;
  }
  if (!dragging || !selected) return;
  let p = planPoint(e);
  moveInside(selected, Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10);
  drawPlan();
});
plan.addEventListener("pointerup", () => {
  if (resizeDrag) {
    let r = resizeDrag;
    resizeDrag = null;
    let sign = r.side === "left" || r.side === "back" ? -1 : 1;
    let delta = Math.round((r.current - r.start) * sign);
    if (delta) {
      remember();
      resizeRoom(r.side, delta);
    } else drawPlan();
  }
  dragging = false;
  planEditDown = false;
});
plan.addEventListener("pointercancel", () => {
  dragging = false;
  planEditDown = false;
  resizeDrag = null;
  drawPlan();
});
// 3D上の家具を床面へ投影してドラッグ。空白部分のドラッグはOrbitControlsが処理する。
// --- 3Dプレビューでの家具ドラッグ ---
const dragRay = new THREE.Raycaster(),
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag3D = null;
function rayAt(e) {
  const r = canvas.getBoundingClientRect();
  dragRay.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    ),
    camera,
  );
  return dragRay;
}
function groundAt(e) {
  return rayAt(e).ray.intersectPlane(groundPlane, new THREE.Vector3());
}
canvas.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0) return;
    if (placementType) {
      let p = groundAt(e),
        c = p && pointCell({ x: p.x, z: p.z });
      if (!p || !cells[c.z]?.[c.x]) {
        toast("床の上をクリックしてください");
        return;
      }
      e.stopImmediatePropagation();
      remember();
      add(
        placementType,
        Math.round(p.x * 10) / 10,
        Math.round(p.z * 10) / 10,
        0,
        placementType === "primitive" ? primitive(placementPrimitive) : null,
      );
      return;
    }
    const ray = rayAt(e),
      hit = ray
        .intersectObjects(objects, true)
        .find((h) => !h.object.userData.outline),
      wallHit = ray
        .intersectObjects(
          walls.filter((w) => w.visible),
          true,
        )
        .find((h) => !h.object.userData.outline);
    if (!hit || (wallHit && wallHit.distance < hit.distance)) return;
    let g = hit.object;
    while (g.parent && g.parent !== scene) g = g.parent;
    if (!objects.includes(g)) return;
    let p = groundAt(e);
    if (!p) return;
    e.stopImmediatePropagation();
    select(g);
    remember();
    cameraTools.setInteractionBlocked(true);
    drag3D = {
      g,
      offsetX: g.position.x - p.x,
      offsetZ: g.position.z - p.z,
      pointer: e.pointerId,
    };
    canvas.setPointerCapture(e.pointerId);
  },
  true,
);
canvas.addEventListener(
  "pointermove",
  (e) => {
    if (!drag3D || drag3D.pointer !== e.pointerId) return;
    e.stopImmediatePropagation();
    let p = groundAt(e);
    if (!p) return;
    moveInside(
      drag3D.g,
      Math.round((p.x + drag3D.offsetX) * 10) / 10,
      Math.round((p.z + drag3D.offsetZ) * 10) / 10,
    );
    drawPlan();
  },
  true,
);
function stopDrag3D(e) {
  if (!drag3D || drag3D.pointer !== e.pointerId) return;
  e.stopImmediatePropagation();
  drag3D = null;
  cameraTools.setInteractionBlocked(false);
}
canvas.addEventListener("pointerup", stopDrag3D, true);
canvas.addEventListener("pointercancel", stopDrag3D, true);
// --- カメラ、ガイド、描画ループ ---
function preset(name) {
  controls.target.set(0, 1, 0);
  controls.maxPolarAngle = Math.PI * 0.99;
  if (name === "eye") {
    camera.position.set(0, 1.5, 5);
    controls.target.set(0, 1.5, 0);
  } else if (name === "front") {
    camera.position.set(0, 1.5, 8);
    controls.target.set(0, 1.5, 0);
  } else if (name === "two") {
    camera.position.set(7, 1.5, 8);
    controls.target.set(0, 1.5, 0);
  } else if (name === "three") {
    camera.position.set(5, 1, 7);
    controls.target.set(0, 2, 0);
  } else if (name === "top") {
    camera.position.set(0.001, 12, 0);
    controls.target.set(0, 0, 0);
  } else {
    camera.position.set(8, 7, 9);
  }
  controls.update();
}
function guideSettings() {
  return {
    horizon: $("#horizon").checked,
    guides: $("#guides").checked,
    grid: $("#guideGrid").checked,
    count: Math.max(
      2,
      Math.min(200, Math.round(Number($("#guideCount").value) || 24)),
    ),
    opacity: Number($("#guideOpacity").value) / 100,
    width: Number($("#guideWidth").value),
    axes: {
      x: $("#guideAxisX").checked,
      z: $("#guideAxisZ").checked,
      y: $("#guideAxisY").checked,
    },
    gridStep: Math.max(0.1, Math.min(10, Number($("#gridStep").value) || 0.5)),
    gridCount: Math.max(
      1,
      Math.min(60, Math.floor(Number($("#gridCount").value) || 20)),
    ),
  };
}
let guideCache = "";
function drawGuides() {
  const settings = guideSettings(),
    w = overlay.width,
    h = overlay.height;
  const signature = [
    w,
    h,
    camera.position.x,
    camera.position.y,
    camera.position.z,
    camera.quaternion.x,
    camera.quaternion.y,
    camera.quaternion.z,
    camera.quaternion.w,
    camera.fov,
    camera.aspect,
    camera.near,
    JSON.stringify(settings),
  ].join("|");
  if (signature === guideCache) return;
  guideCache = signature;
  drawPerspectiveGuides(overlay.getContext("2d"), camera, w, h, settings);
}
function resize() {
  let r = viewport.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  overlay.width = Math.round(r.width);
  overlay.height = Math.round(r.height);
  guideCache = "";
  scene.traverse((o) => {
    if (o.userData.outline) o.material.resolution.set(r.width, r.height);
  });
}
new ResizeObserver(resize).observe(viewport);
function binarySettings() {
  const depth = Number($("#depthSensitivity").value),
    normal = Number($("#normalSensitivity").value);
  return {
    width: Number($("#lineWidth").value),
    depthLimit: 0.025 * Math.pow(6, (50 - depth) / 49),
    normalLimit: 0.15 * Math.pow(6, (50 - normal) / 49),
    useIds: $("#idEdges").checked,
    doubleSided: !$("#culling").checked,
  };
}
function renderCurrent() {
  if (mode === "binary")
    binaryRenderer.render(
      scene,
      camera,
      objects,
      room,
      selectedBox,
      binarySettings(),
    );
  else renderer.render(scene, camera);
}
function animate() {
  requestAnimationFrame(animate);
  if (isViewerShowing()) return;
  controls.update();
  walls.forEach((w) => {
    let [nx, nz] = w.userData.normal;
    w.visible =
      !$("#hideWalls").checked ||
      (camera.position.x - w.position.x) * nx +
        (camera.position.z - w.position.z) * nz <
        0.1;
  });
  if (selectedBox) selectedBox.update();
  renderCurrent();
  drawGuides();
}
resize();
generateOpenings(seedValue());
makeRoom();
template("bedroom", true);
animate();
let toastTimer;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
}
// --- 画面ボタン・キーボードの操作 ---
$("#random").onclick = () => {
  if (objects.length && !confirm("現在の配置を消して部屋を作り直しますか？"))
    return;
  remember();
  floorStyle = $("#room").value === "washitsu" ? "tatami" : "wood";
  syncTatamiUI();
  cells = Array.from({ length: D }, () => Array(W).fill(true));
  $("#seed").value = Math.floor(Math.random() * 999999);
  generateOpenings(seedValue());
  makeRoom();
  const skipped = template($("#room").value, true);
  toast(
    skipped
      ? `部屋を作りましたが、${skipped}個は床に収まらず配置できませんでした`
      : "新しいseedで部屋を作りました",
  );
};
document.querySelectorAll("[data-add]").forEach(
  (b) =>
    (b.onclick = () => {
      placementType = b.dataset.add;
      planTool = "select";
      document
        .querySelectorAll("[data-tool]")
        .forEach((x) =>
          x.classList.toggle("active", x.dataset.tool === "select"),
        );
      document
        .querySelectorAll("[data-add]")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("#status").textContent = labels[placementType] + "を配置中 · Escで終了";
      toast("間取りの床をクリックして配置");
    }),
);
document.querySelectorAll("[data-tool]").forEach(
  (b) =>
    (b.onclick = () => {
      planTool = b.dataset.tool;
      placementType = null;
      document
        .querySelectorAll("[data-add]")
        .forEach((x) => x.classList.remove("active"));
      document
        .querySelectorAll("[data-tool]")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("#status").textContent = "準備完了";
    }),
);
document.querySelectorAll("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.mode;
      document
        .querySelectorAll("[data-mode]")
        .forEach((x) => x.classList.toggle("active", x === b));
      setStyle(room);
      objects.forEach(setStyle);
      $("#binarySettings").hidden = mode !== "binary";
    }),
);
$("#culling").onchange = () => {
  setStyle(room);
  objects.forEach(setStyle);
};
$("#camera").onchange = (e) => preset(e.target.value);
$("#resetCamera").onclick = () => preset($("#camera").value);
$("#zoomIn").onclick = () => {
  camera.position.lerp(controls.target, 0.15);
  controls.update();
};
$("#zoomOut").onclick = () => {
  camera.position.sub(controls.target).multiplyScalar(1.2).add(controls.target);
  controls.update();
};
$("#fov").oninput = (e) => {
  camera.fov = +e.target.value;
  camera.updateProjectionMatrix();
  $("#fovOut").textContent = e.target.value + "°";
};
bindGuideControls($, scene);
$("#rotate").onclick = () => rotate();
$("#rotateFine").onclick = () => rotate(Math.PI / 12);
$("#remove").onclick = () => {
  if (selected) {
    remember();
    remove();
  }
};
$("#duplicate").onclick = () => {
  if (!selected) return;
  if (selected.userData.type === "model") {
    toast("読み込んだモデルの複製は未対応です");
    return;
  }
  remember();
  add(
    selected.userData.type,
    selected.position.x + 0.3,
    selected.position.z + 0.3,
    selected.rotation.y,
    selected.userData.type === "primitive"
      ? primitive(selected.userData.primitive)
      : selected.userData.type === "desk"
        ? createFurniture("desk", selected.userData.deskSpec)
        : null,
  );
};
$("#undo").onclick = undo;
$("#redo").onclick = redo;
$("#seedRoll").onclick = () => {
  $("#seed").value = Math.floor(Math.random() * 999999);
};
$("#seedBuild").onclick = () => {
  if (
    objects.length &&
    !confirm("現在の配置を消して、このseedから部屋を作成しますか？")
  )
    return;
  remember();
  floorStyle = $("#room").value === "washitsu" ? "tatami" : "wood";
  syncTatamiUI();
  cells = Array.from({ length: D }, () => Array(W).fill(true));
  generateOpenings(seedValue());
  makeRoom();
  const skipped = template($("#room").value, true);
  toast(
    skipped
      ? `部屋を作りましたが、${skipped}個は床に収まらず配置できませんでした`
      : "入力したseedから部屋を作成しました",
  );
};
$("#rerollOpenings").onclick = () => {
  remember();
  let n = (seedValue() + 1) >>> 0;
  $("#seed").value = n;
  generateOpenings(n);
  makeRoom();
  drawPlan();
  toast("開口を引き直しました");
};
$("#rerollPlacement").onclick = () => {
  if (
    objects.some((o) => o.userData.type === "model") &&
    !confirm("読み込んだモデルを含む家具を置き直します。よろしいですか？")
  )
    return;
  remember();
  $("#seed").value = (seedValue() + 1) >>> 0;
  const skipped = template($("#room").value, true);
  toast(
    skipped
      ? `引き直しましたが、${skipped}個は床に収まらず配置できませんでした`
      : "家具の配置を引き直しました",
  );
};
window.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName))
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key.toLowerCase() === "r")
    rotate(e.shiftKey ? Math.PI / 12 : Math.PI / 2);
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selected) {
      remember();
      remove();
    }
  }
  if (e.key === "Escape") {
    $("#modal").classList.remove("open");
    placementType = null;
    document
      .querySelectorAll("[data-add]")
      .forEach((x) => x.classList.remove("active"));
    $("#status").textContent = "準備完了";
  }
});
bindImageExport({
  $,
  canvas,
  renderCurrent,
  toast,
  getSelectedBox: () => selectedBox,
});
// --- 家具や開口の寸法編集 ---
$("#applyDesk").onclick = () => {
  if (!selected || selected.userData.type !== "desk") return;
  const spec = {
    width: Number($("#deskWidth").value),
    depth: Number($("#deskDepth").value),
    thickness: Number($("#deskThickness").value),
    leg: Number($("#deskLeg").value),
  };
  if (!validDesk(spec)) {
    toast(
      "寸法を確認してください：幅0.3〜4m、奥行0.3〜3m、厚さ0.02〜0.3m、脚0.2〜2m",
    );
    return;
  }
  const old = selected,
    index = objects.indexOf(old),
    replacement = createFurniture("desk", spec);
  replacement.position.copy(old.position);
  replacement.rotation.copy(old.rotation);
  replacement.userData = {
    ...replacement.userData,
    type: "desk",
    id: old.userData.id,
  };
  if (!fitsAt(replacement, replacement.position.x, replacement.position.z)) {
    clearGenerated(replacement);
    toast(
      "机が壁や床からはみ出します。先に移動するか、寸法を小さくしてください",
    );
    return;
  }
  remember();
  scene.remove(old);
  objects[index] = replacement;
  scene.add(replacement);
  setStyle(replacement);
  select(replacement);
  toast("机の寸法を変更しました");
};
$("#applyOpening").onclick = () => {
  const old = selectedOpening && openingData(openings[selectedOpening]);
  if (!old) return;
  const width = Number($("#openingWidth").value),
    height = Number($("#openingHeight").value),
    sill = old.type === "window" ? Number($("#openingSill").value) : 0,
    limit = openingLimit(selectedOpening);
  if (
    ![width, height, sill].every(Number.isFinite) ||
    width < 0.2 ||
    width > limit + 1e-6 ||
    height < 0.3 ||
    sill < 0 ||
    height + sill > 2.95
  ) {
    toast(`幅は0.2〜${limit.toFixed(2)}m、開口の上端は2.95m以下にしてください`);
    return;
  }
  remember();
  openings[selectedOpening] = { type: old.type, width, height, sill };
  makeRoom();
  renderOpeningEditor();
  drawPlan();
  toast(
    old.type === "window"
      ? "窓の寸法を変更しました"
      : "ドアの寸法を変更しました",
  );
};
$("#makePrimitive").onclick = () => {
  let w = Number($("#primW").value),
    h = Number($("#primH").value),
    d = Number($("#primD").value);
  if (![w, h, d].every((v) => Number.isFinite(v) && v >= 0.1 && v <= 10)) {
    toast("寸法は0.1〜10mで入力してください");
    return;
  }
  placementPrimitive = {
    kind: $("#primitiveType").value,
    w,
    h,
    d,
    color: $("#primColor").value,
  };
  placementType = "primitive";
  planTool = "select";
  document
    .querySelectorAll("[data-tool]")
    .forEach((x) => x.classList.toggle("active", x.dataset.tool === "select"));
  document
    .querySelectorAll("[data-add]")
    .forEach((x) => x.classList.remove("active"));
  $("#status").textContent = "基本形を配置中 · Escで終了";
  toast("間取りまたは3Dの床をクリックして配置");
  drawPlan();
};
// モデル拡大縮小は一括の倍率。壁の内側を守り、Undoにも残す。
$("#applyModelScale").onclick = () => {
  if (!selected || selected.userData.type !== "model") return;
  const value = Number($("#modelScale").value),
    old = selected.userData.modelScale;
  if (!validModelScale(value)) {
    toast("倍率は0.01〜100で入力してください");
    return;
  }
  if (value === old) return;
  setModelScale(selected, value);
  const valid = fitsAt(selected, selected.position.x, selected.position.z);
  setModelScale(selected, old);
  if (!valid) {
    toast(
      "壁や床からはみ出すため変更できません。モデルを移動するか倍率を小さくしてください",
    );
    renderModelEditor();
    return;
  }
  remember();
  setModelScale(selected, value);
  renderModelEditor();
  drawPlan();
  toast("モデルの倍率を変更しました");
};
// --- GLB読み込みとプロジェクトの保存・復元 ---
function busy(value) {
  $("#import").disabled = value;
  $("#save").disabled = value;
  $("#load").disabled = value;
}
$("#import").onclick = () => $("#modelFile").click();
$("#modelFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const scale = Number($("#importScale").value);
  if (!validModelScale(scale)) {
    toast("読み込み倍率は0.01〜100で入力してください");
    e.target.value = "";
    return;
  }
  if (file.size > MAX_MODEL_BYTES) {
    toast("GLBは1ファイル50MB以下にしてください");
    e.target.value = "";
    return;
  }
  busy(true);
  $("#status").textContent = "モデルを読み込み中…";
  try {
    const buffer = await file.arrayBuffer();
    const [base64, model] = await Promise.all([
      encodeBase64(buffer),
      prepareModel(buffer, null, file.name, scale, makeEdges),
    ]);
    model.userData.modelData = base64;
    remember();
    if (add("model", 0, 0, 0, model))
      toast("モデルを読み込みました。選択して倍率を変更できます");
  } catch (err) {
    console.error(err);
    toast(err.message || "モデルを読み込めませんでした");
  } finally {
    busy(false);
    $("#status").textContent = "準備完了";
    e.target.value = "";
  }
};
function projectData() {
  const { assets, serialized } = serializeProjectObjects(objects);
  return {
    version: 5,
    room: $("#room").value,
    seed: seedValue(),
    floorStyle,
    tatamiPattern,
    cells,
    openings,
    assets,
    objects: serialized,
    view: {
      mode,
      lineWidth: Number($("#lineWidth").value),
      depthSensitivity: Number($("#depthSensitivity").value),
      normalSensitivity: Number($("#normalSensitivity").value),
      idEdges: $("#idEdges").checked,
      guides: guideSettings(),
    },
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      zoom: camera.zoom,
    },
  };
}
$("#save").onclick = () => {
  try {
    const data = projectData();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    if (blob.size > MAX_PROJECT_BYTES) {
      toast("プロジェクトが200MBを超えています。モデルを減らしてください");
      return;
    }
    const a = document.createElement("a"),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "room-project.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("モデルを含むプロジェクトを保存しました");
  } catch (err) {
    console.error(err);
    toast(err.message || "プロジェクトを保存できませんでした");
  }
};
$("#load").onclick = () => $("#projectFile").click();
function restoreView(data) {
  if (data.view) {
    if (data.view.guides && typeof data.view.guides === "object") {
      const g = data.view.guides;
      for (const [id, key] of [
        ["horizon", "horizon"],
        ["guides", "guides"],
        ["guideGrid", "grid"],
      ])
        if (typeof g[key] === "boolean") $("#" + id).checked = g[key];
      for (const [id, key, min, max] of [
        ["guideCount", "count", 2, 200],
        ["guideOpacity", "opacity", 0.05, 1],
        ["guideWidth", "width", 0.25, 3],
        ["gridStep", "gridStep", 0.1, 10],
        ["gridCount", "gridCount", 1, 60],
      ])
        if (Number.isFinite(g[key]) && g[key] >= min && g[key] <= max)
          $("#" + id).value =
            key === "opacity" ? Math.round(g[key] * 100) : g[key];
      if (g.axes)
        for (const [id, key] of [
          ["guideAxisX", "x"],
          ["guideAxisZ", "z"],
          ["guideAxisY", "y"],
        ])
          if (typeof g.axes[key] === "boolean")
            $("#" + id).checked = g.axes[key];
      $("#guideCount").dispatchEvent(new Event("input"));
      $("#guideOpacity").dispatchEvent(new Event("input"));
      $("#guideWidth").dispatchEvent(new Event("input"));
      $("#guideGrid").dispatchEvent(new Event("change"));
    }
    if (["color", "line", "binary"].includes(data.view.mode)) {
      mode = data.view.mode;
      $("#binarySettings").hidden = mode !== "binary";
      document
        .querySelectorAll("[data-mode]")
        .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
      setStyle(room);
      objects.forEach(setStyle);
    }
    if (
      Number.isFinite(data.view.depthSensitivity) &&
      data.view.depthSensitivity >= 1 &&
      data.view.depthSensitivity <= 100
    ) {
      $("#depthSensitivity").value = data.view.depthSensitivity;
      $("#depthSensitivity").dispatchEvent(new Event("input"));
    }
    if (
      Number.isFinite(data.view.normalSensitivity) &&
      data.view.normalSensitivity >= 1 &&
      data.view.normalSensitivity <= 100
    ) {
      $("#normalSensitivity").value = data.view.normalSensitivity;
      $("#normalSensitivity").dispatchEvent(new Event("input"));
    }
    if (typeof data.view.idEdges === "boolean")
      $("#idEdges").checked = data.view.idEdges;
    if (
      Number.isFinite(data.view.lineWidth) &&
      data.view.lineWidth >= 0.5 &&
      data.view.lineWidth <= 5
    ) {
      $("#lineWidth").value = data.view.lineWidth;
      $("#lineWidth").dispatchEvent(new Event("input"));
    }
  }
  if (data.camera && !cameraTools.isLocked()) {
    const storedCamera = {
      ...data.camera,
      type: "room-sketch-camera",
      version: 1,
      near: data.camera.near ?? 0.05,
      far: data.camera.far ?? 200,
      zoom: data.camera.zoom ?? 1,
    };
    try {
      // 操作可能範囲も必要に応じて広げ、保存した視点が変わらないようにする。
      applyCameraSnapshot(
        camera,
        controls,
        validateCameraSnapshot(storedCamera),
      );
    } catch {
      // 旧形式で注視点と位置が同じなど、従来受け付けていた値も読み込めるようにする。
      camera.position.fromArray(data.camera.position);
      controls.target.fromArray(data.camera.target);
      camera.fov = storedCamera.fov;
      camera.near = storedCamera.near;
      camera.far = storedCamera.far;
      camera.zoom = storedCamera.zoom;
      camera.updateProjectionMatrix();
      controls.update();
    }
    syncCameraFovUI(camera);
  }
}
$("#projectFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > MAX_PROJECT_BYTES) {
    toast("プロジェクトは200MB以下にしてください");
    e.target.value = "";
    return;
  }
  busy(true);
  $("#status").textContent = "プロジェクトを読み込み中…";
  let beforeLoad = null;
  try {
    const data = JSON.parse(await f.text());
    validateProject(data);
    // モデルの復元は、現在の作業を消す前に完了させる。
    const buffers = new Map(),
      prepared = [];
    for (const o of data.objects) {
      if (o.type !== "model") {
        prepared.push(null);
        continue;
      }
      const asset = data.assets[o.model.asset],
        bytes = asset.data;
      if (!buffers.has(o.model.asset))
        buffers.set(o.model.asset, decodeBase64(bytes));
      prepared.push(
        await prepareModel(
          buffers.get(o.model.asset),
          bytes,
          o.model.name || "model.glb",
          o.model.scale,
          makeEdges,
        ),
      );
    }
    beforeLoad = snapshot();
    remember();
    objects.forEach((o) => scene.remove(o));
    objects = [];
    cells = data.cells
      ? data.cells.map((r) => [...r])
      : Array.from({ length: 7 }, () => Array(8).fill(true));
    D = cells.length;
    W = cells[0].length;
    openings = data.openings || {};
    floorStyle = data.floorStyle || "wood";
    tatamiPattern = data.tatamiPattern || "8";
    syncTatamiUI();
    sanitizeOpenings();
    $("#seed").value = data.seed ?? 1042;
    makeRoom();
    $("#room").value = data.room || "empty";
    let adjusted = 0,
      failed = 0;
    data.objects.forEach((o, i) => {
      let custom =
        o.type === "primitive"
          ? primitive(o.primitive)
          : o.type === "desk"
            ? createFurniture("desk", o.desk || defaultDesk)
            : o.type === "model"
              ? prepared[i]
              : null;
      let g = add(o.type, o.x, o.z, o.rot, custom);
      if (!g) failed++;
      else if (Math.hypot(g.position.x - o.x, g.position.z - o.z) > 0.0001)
        adjusted++;
    });
    if (failed)
      throw new Error(
        "家具やモデルが床内に収まらないため、読み込みを中止しました。",
      );
    select(null);
    restoreView(data);
    beforeLoad = null;
    const message = adjusted
      ? `読み込みました。${adjusted}個の物を床の内側へ調整しました`
      : "モデルを含むプロジェクトを読み込みました";
    toast(
      cameraTools.isLocked() && data.camera
        ? `${message}。カメラはロック中のため変更していません`
        : message,
    );
  } catch (err) {
    if (beforeLoad) {
      restore(beforeLoad);
      undoStack.pop();
    }
    console.error(err);
    toast(err.message || "プロジェクトファイルを読み込めませんでした");
  } finally {
    busy(false);
    $("#status").textContent = "準備完了";
    e.target.value = "";
  }
};
