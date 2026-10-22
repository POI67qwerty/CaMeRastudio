import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xddeeff, 0x29323a, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);
const grid = new THREE.GridHelper(30, 30, 0x55706f, 0x293d43);
scene.add(grid);
scene.add(new THREE.AxesHelper(2));
const positionHandle = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 20),
    new THREE.MeshBasicMaterial({ color: 0x63e3c8, depthTest: false }),
);
positionHandle.renderOrder = 1000;
positionHandle.name = "camera-position-handle";
const targetHandle = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 20),
    new THREE.MeshBasicMaterial({ color: 0xffa36b, depthTest: false }),
);
targetHandle.renderOrder = 1001;
targetHandle.name = "camera-target-handle";
targetHandle.renderOrder = 1001;
const fovHandle = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false }),
);
fovHandle.name = "camera-fov-handle";
fovHandle.renderOrder = 1002;
scene.add(positionHandle, targetHandle, fovHandle);

const perspectiveCamera = new THREE.PerspectiveCamera(39, 1, 0.01, 2000);
const orthographicCamera = new THREE.OrthographicCamera(
    -6,
    6,
    6,
    -6,
    0.01,
    2000,
);
let camera = perspectiveCamera;
const editorCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
const editorOrtho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 2000);
let editorViewCamera = editorCamera;
editorCamera.position.set(8, 6, 10);
const editorControls = new OrbitControls(editorViewCamera, canvas);
editorControls.target.set(0, 0, 0);
editorControls.enableDamping = true;
editorControls.screenSpacePanning = true;
editorControls.enablePan = true;
editorControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
editorControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
const cameraControls = new OrbitControls(camera, canvas);
cameraControls.enabled = false;
cameraControls.enableDamping = true;
cameraControls.target.set(0, 0, 0);
let activeView = "editor";
let model = null;
let cameraHelper = null;
let activeEditorAxis = "3d";
let dragState = null;
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const cameraTarget = new THREE.Vector3();
let history = [];
let historyIndex = -1;
let historyTimer = null;
let suppressHistory = false;

function value(id) {
    return Number($(id).value);
}

function setPair(id, v) {
    const field = Number(Number(v).toFixed(2));
    $(id).value = field;
    $(id + "N").value = field;
}

function cameraState() {
    return {
        version: 1,
        projection: $("projection").value,
        lens: value("lens"),
        sensor: value("sensor"),
        scale: value("scale"),
        fov: value("fov"),
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [cameraTarget.x, cameraTarget.y, cameraTarget.z],
        grid: $("grid").checked,
        background: $("bg").checked,
        color: $("color").value,
        backfaceCull: $("backfaceCull").checked,
    };
}

function pushHistory() {
    if (suppressHistory) return;
    const next = JSON.stringify(cameraState());
    if (history[historyIndex] === next) return;
    history = history.slice(0, historyIndex + 1);
    history.push(next);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
}

function scheduleHistory() {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(pushHistory, 250);
}

function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    suppressHistory = true;
    const s = JSON.parse(history[historyIndex]);
    $("projection").value = s.projection;
    for (const [id, v] of [
        ["lens", s.lens],
        ["sensor", s.sensor],
        ["scale", s.scale],
        ["fov", s.fov],
        ["x", s.position[0]],
        ["y", s.position[1]],
        ["z", s.position[2]],
        ["tx", s.target[0]],
        ["ty", s.target[1]],
        ["tz", s.target[2]],
    ])
        setPair(id, v);
    $("grid").checked = s.grid;
    $("bg").checked = s.background;
    $("color").value = s.color;
    $("backfaceCull").checked = s.backfaceCull !== false;
    applyBackfaceCulling();
    cameraTarget.set(...s.target);
    syncCamera();
    suppressHistory = false;
}

function undo() {
    clearTimeout(historyTimer);
    if (historyIndex > 0) restoreHistory(historyIndex - 1);
}

function redo() {
    clearTimeout(historyTimer);
    if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
}

function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    perspectiveCamera.aspect = width / height;
    perspectiveCamera.updateProjectionMatrix();
    editorCamera.aspect = width / height;
    editorCamera.updateProjectionMatrix();
    editorOrtho.left = (-10 * width) / height;
    editorOrtho.right = -editorOrtho.left;
    editorOrtho.top = 10;
    editorOrtho.bottom = -10;
    editorOrtho.updateProjectionMatrix();
    orthographicCamera.left = (-value("scale") * width) / height / 2;
    orthographicCamera.right = -orthographicCamera.left;
    orthographicCamera.top = value("scale") / 2;
    orthographicCamera.bottom = -orthographicCamera.top;
    orthographicCamera.updateProjectionMatrix();
}

function syncCamera() {
    const projection = $("projection").value;
    camera =
        projection === "orthographic" ? orthographicCamera : perspectiveCamera;
    const sensor = value("sensor");
    const lens = value("lens");
    perspectiveCamera.fov =
        projection === "fisheye"
            ? Math.min(170, value("fov"))
            : (2 * Math.atan(sensor / (2 * lens)) * 180) / Math.PI;
    perspectiveCamera.updateProjectionMatrix();
    resize();
    camera.position.set(value("x"), value("y"), value("z"));
    cameraTarget.set(value("tx"), value("ty"), value("tz"));
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld(true);
    cameraControls.object = camera;
    cameraControls.target.copy(cameraTarget);
    cameraControls.update();
    if (cameraHelper) {
        scene.remove(cameraHelper);
        cameraHelper.dispose();
    }
    cameraHelper = new THREE.CameraHelper(camera);
    cameraHelper.name = "camera-helper";
    cameraHelper.material.depthTest = false;
    cameraHelper.renderOrder = 999;
    cameraHelper.visible = activeView === "editor";
    scene.add(cameraHelper);
    updateCameraHandles();
    grid.visible = $("grid").checked;
    scene.background = $("bg").checked
        ? new THREE.Color($("color").value)
        : null;
    renderer.setClearColor($("color").value, $("bg").checked ? 1 : 0);
    $("orthoRow").style.opacity = projection === "orthographic" ? "1" : "0.45";
    $("editorMode").classList.toggle("active", activeView === "editor");
    $("cameraMode").classList.toggle("active", activeView === "camera");
    $("hud").textContent =
        activeView === "editor"
            ? `${model ? model.name + "　·　" : ""}編集ビュー：前・上・横は編集視点です。カメラ枠を見ながら位置を調整できます。`
            : `${model ? model.name + "　·　" : ""}カメラビュー：書き出しと同じ構図`;
}

function updateCameraHandles() {
    positionHandle.position.copy(camera.position);
    targetHandle.position.copy(cameraTarget);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(camera.quaternion)
        .normalize();
    const distance = Math.max(
        2,
        camera.position.distanceTo(cameraTarget) * 0.35,
    );
    const halfAngle = Math.atan(value("sensor") / (2 * value("lens")));
    fovHandle.position
        .copy(camera.position)
        .addScaledVector(forward, distance)
        .addScaledVector(right, distance * Math.tan(halfAngle));
    positionHandle.visible = activeView === "editor";
    targetHandle.visible = activeView === "editor";
    fovHandle.visible =
        activeView === "editor" && $("projection").value !== "orthographic";
}

function applyBackfaceCulling() {
    if (!model) return;
    const side = $("backfaceCull").checked ? THREE.FrontSide : THREE.DoubleSide;
    model.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
        for (const material of materials) {
            material.side = side;
            material.needsUpdate = true;
        }
    });
}

function setActiveView(view) {
    activeView = view;
    editorControls.enabled = view === "editor";
    cameraControls.enabled = view === "camera";
    if (cameraHelper) cameraHelper.visible = view === "editor";
    syncCamera();
}

function setEditorDirection(direction) {
    activeEditorAxis = direction;
    setActiveView("editor");
    const target = editorControls.target;
    const distance = Math.max(10, editorCamera.position.distanceTo(target));
    if (direction === "3d") {
        editorControls.enableRotate = true;
        editorControls.enableDamping = true;
        editorControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        editorViewCamera = editorCamera;
        editorControls.object = editorCamera;
        editorCamera.position.set(
            target.x + distance * 0.7,
            target.y + distance * 0.55,
            target.z + distance,
        );
        editorCamera.up.set(0, 1, 0);
        editorCamera.lookAt(target);
    } else {
        // In front/top/side modes, background drags only pan the editor view.
        // Camera markers are intercepted separately and remain draggable.
        editorControls.enableRotate = false;
        editorControls.enableDamping = false;
        editorControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        editorControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        editorViewCamera = editorOrtho;
        editorControls.object = editorOrtho;
        const d = distance * 1.3;
        if (direction === "front")
            editorOrtho.position.set(target.x, target.y, target.z + d);
        if (direction === "side")
            editorOrtho.position.set(target.x + d, target.y, target.z);
        if (direction === "top")
            editorOrtho.position.set(target.x, target.y + d, target.z + 0.001);
        editorOrtho.up.set(0, 1, 0);
        if (direction === "top") editorOrtho.up.set(0, 0, -1);
        editorOrtho.lookAt(target);
    }
    editorControls.update();
}

for (const id of [
    "lens",
    "sensor",
    "scale",
    "fov",
    "x",
    "y",
    "z",
    "tx",
    "ty",
    "tz",
]) {
    $(id).addEventListener("input", () => {
        setPair(id, value(id));
        syncCamera();
        scheduleHistory();
    });
    $(id + "N").addEventListener("input", () => {
        $(id).value = $(id + "N").value;
        syncCamera();
        scheduleHistory();
    });
}
$("backfaceCull").addEventListener("change", () => {
    applyBackfaceCulling();
    scheduleHistory();
});

for (const id of ["projection", "grid", "bg", "color"]) {
    $(id).addEventListener("input", () => {
        syncCamera();
        scheduleHistory();
    });
}

function animate() {
    requestAnimationFrame(animate);
    editorControls.update();
    if (cameraControls.enabled) {
        cameraControls.update();
        cameraTarget.copy(cameraControls.target);
        for (const [id, v] of [
            ["x", camera.position.x],
            ["y", camera.position.y],
            ["z", camera.position.z],
            ["tx", cameraTarget.x],
            ["ty", cameraTarget.y],
            ["tz", cameraTarget.z],
        ])
            setPair(id, v);
        if (cameraHelper) cameraHelper.update();
    }
    renderer.render(scene, activeView === "editor" ? editorViewCamera : camera);
}

function loadFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    new GLTFLoader().load(
        url,
        (gltf) => {
            URL.revokeObjectURL(url);
            if (model) scene.remove(model);
            model = gltf.scene;
            model.name = file.name;
            scene.add(model);
            applyBackfaceCulling();
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            const extent = Math.max(size.x, size.y, size.z, 1);
            editorControls.target.copy(center);
            editorCamera.position.set(
                center.x + extent * 1.4,
                center.y + extent,
                center.z + extent * 1.6,
            );
            setPair("x", center.x + extent * 1.1);
            setPair("y", center.y + extent * 0.75);
            setPair("z", center.z + extent * 1.4);
            setPair("tx", center.x);
            setPair("ty", center.y);
            setPair("tz", center.z);
            syncCamera();
            pushHistory();
        },
        undefined,
        (error) => {
            URL.revokeObjectURL(url);
            alert(
                "GLBを読み込めませんでした。ファイル形式を確認してください。\n" +
                    error.message,
            );
        },
    );
}

$("load").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (event) =>
    loadFile(event.target.files[0]),
);
stage.addEventListener("dragover", (event) => {
    event.preventDefault();
    $("drop").classList.add("show");
});
stage.addEventListener("dragleave", () => $("drop").classList.remove("show"));
stage.addEventListener("drop", (event) => {
    event.preventDefault();
    $("drop").classList.remove("show");
    loadFile(event.dataTransfer.files[0]);
});

$("editorMode").addEventListener("click", () => setActiveView("editor"));
$("cameraMode").addEventListener("click", () => setActiveView("camera"));
document.querySelectorAll("[data-lens]").forEach((button) => {
    button.addEventListener("click", () => {
        setPair("lens", Number(button.dataset.lens));
        syncCamera();
        scheduleHistory();
    });
});

document.querySelectorAll("[data-angle]").forEach((button) => {
    button.addEventListener("click", () => {
        const target = cameraTarget.clone();
        const distance = Math.max(5, camera.position.distanceTo(target));
        const mode = button.dataset.angle;
        camera.up.set(0, 1, 0);
        if (mode === "eye")
            camera.position.set(
                target.x,
                target.y + distance * 0.12,
                target.z + distance,
            );
        if (mode === "high")
            camera.position.set(
                target.x,
                target.y + distance * 0.78,
                target.z + distance * 0.62,
            );
        if (mode === "low")
            camera.position.set(
                target.x,
                target.y - distance * 0.28,
                target.z + distance * 0.96,
            );
        if (mode === "top") {
            camera.position.set(
                target.x,
                target.y + distance,
                target.z + 0.001,
            );
            camera.up.set(0, 0, -1);
        }
        setPair("x", camera.position.x);
        setPair("y", camera.position.y);
        setPair("z", camera.position.z);
        setPair("tx", target.x);
        setPair("ty", target.y);
        setPair("tz", target.z);
        syncCamera();
        scheduleHistory();
    });
});

document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () =>
        setEditorDirection(button.dataset.view),
    );
});

$("export").addEventListener("click", () => {
    const wasActive = activeView;
    setActiveView("camera");
    renderer.render(scene, camera);
    const anchor = document.createElement("a");
    anchor.download = "camera-view.png";
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    setActiveView(wasActive);
});

$("save").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(cameraState(), null, 4)], {
        type: "application/json",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "camera-settings.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
});
$("open").addEventListener("click", () => $("jsonfile").click());
$("jsonfile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const s = JSON.parse(reader.result);
            $("projection").value = s.projection;
            for (const [id, v] of [
                ["lens", s.lens],
                ["sensor", s.sensor],
                ["scale", s.scale],
                ["fov", s.fov],
                ["x", s.position[0]],
                ["y", s.position[1]],
                ["z", s.position[2]],
                ["tx", s.target[0]],
                ["ty", s.target[1]],
                ["tz", s.target[2]],
            ])
                setPair(id, v);
            $("grid").checked = s.grid;
            $("bg").checked = s.background;
            $("color").value = s.color;
            $("backfaceCull").checked = s.backfaceCull !== false;
            applyBackfaceCulling();
            syncCamera();
            history = [];
            historyIndex = -1;
            pushHistory();
        } catch {
            alert("設定ファイルを読み込めませんでした。");
        }
    };
    reader.readAsText(file);
});

// Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo.
document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
    event.preventDefault();
    event.shiftKey ? redo() : undo();
});

// Drag the turquoise camera marker or orange look-at marker in orthographic editor views.
function pointerRay(event) {
    const bounds = canvas.getBoundingClientRect();
    pointerNdc.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, editorViewCamera);
}

function dragPlaneNormal() {
    if (activeEditorAxis === "front") return new THREE.Vector3(0, 0, 1);
    if (activeEditorAxis === "top") return new THREE.Vector3(0, 1, 0);
    if (activeEditorAxis === "side") return new THREE.Vector3(1, 0, 0);
    return editorViewCamera.getWorldDirection(new THREE.Vector3());
}

canvas.addEventListener(
    "pointerdown",
    (event) => {
        if (activeView !== "editor" || event.button !== 0) return;
        pointerRay(event);
        const hits = raycaster.intersectObjects(
            [positionHandle, targetHandle, fovHandle],
            false,
        );
        if (!hits.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const object = hits[0].object;
        const origin = object.position.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            dragPlaneNormal(),
            origin,
        );
        const hitPoint = raycaster.ray.intersectPlane(
            plane,
            new THREE.Vector3(),
        );
        if (!hitPoint) return;
        dragState = {
            object,
            origin,
            plane,
            hitPoint,
            pointerId: event.pointerId,
        };
        canvas.setPointerCapture(event.pointerId);
    },
    true,
);
canvas.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    pointerRay(event);
    const hit = raycaster.ray.intersectPlane(
        dragState.plane,
        new THREE.Vector3(),
    );
    if (!hit) return;
    let delta = hit.sub(dragState.hitPoint);
    if (activeEditorAxis === "front") delta.z = 0;
    if (activeEditorAxis === "top") delta.y = 0;
    if (activeEditorAxis === "side") delta.x = 0;
    const moved = dragState.origin.clone().add(delta);
    if (dragState.object === positionHandle) {
        camera.position.copy(moved);
        setPair("x", moved.x);
        setPair("y", moved.y);
        setPair("z", moved.z);
    } else if (dragState.object === targetHandle) {
        cameraTarget.copy(moved);
        setPair("tx", moved.x);
        setPair("ty", moved.y);
        setPair("tz", moved.z);
    } else {
        const forward = camera.getWorldDirection(new THREE.Vector3());
        const right = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(camera.quaternion)
            .normalize();
        const fromCamera = moved.clone().sub(camera.position);
        const depth = Math.max(0.05, fromCamera.dot(forward));
        const halfWidth = Math.abs(fromCamera.dot(right));
        if (halfWidth > 0.01) {
            const lensMm = THREE.MathUtils.clamp(
                (value("sensor") * depth) / (2 * halfWidth),
                8,
                200,
            );
            setPair("lens", lensMm);
            if (camera.isPerspectiveCamera) {
                camera.fov =
                    (2 * Math.atan(value("sensor") / (2 * lensMm)) * 180) /
                    Math.PI;
                camera.updateProjectionMatrix();
            }
        }
    }
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld(true);
    cameraHelper.update();
    updateCameraHandles();
    scheduleHistory();
});
function finishHandleDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    pushHistory();
}
canvas.addEventListener("pointerup", finishHandleDrag);
canvas.addEventListener("pointercancel", finishHandleDrag);

// iPad / touch: two-finger tap = undo, three-finger tap = redo.
let touchGesture = null;
canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    if (!touchGesture)
        touchGesture = {
            count: 0,
            start: Date.now(),
            moved: false,
            ids: new Set(),
        };
    touchGesture.count++;
    touchGesture.ids.add(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
    if (
        event.pointerType === "touch" &&
        touchGesture &&
        Math.abs(event.movementX) + Math.abs(event.movementY) > 8
    )
        touchGesture.moved = true;
});
canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !touchGesture) return;
    touchGesture.ids.delete(event.pointerId);
    if (touchGesture.ids.size) return;
    const gesture = touchGesture;
    touchGesture = null;
    if (Date.now() - gesture.start > 350 || gesture.moved) return;
    if (gesture.count === 2) undo();
    if (gesture.count === 3) redo();
});

function setTheme(theme) {
    document.body.dataset.theme = theme;
    const light = theme === "light";
    $("themeToggle").textContent = light ? "☾ ダーク" : "☀ ライト";
    $("themeToggle").setAttribute(
        "aria-label",
        light ? "ダークモードに切り替え" : "ライトモードに切り替え",
    );
    localStorage.setItem("camera-studio-theme", theme);
}
$("themeToggle").addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "light" ? "dark" : "light");
});
setTheme(localStorage.getItem("camera-studio-theme") || "dark");

new ResizeObserver(resize).observe(stage);
resize();
syncCamera();
pushHistory();
setActiveView("editor");
animate();
