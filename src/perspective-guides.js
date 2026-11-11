import * as THREE from "three";

// 無限直線（または有限線分）を画面の四辺で切り取る。
export function clipLine(x, y, dx, dy, width, height, segment = false) {
  if (
    ![x, y, dx, dy, width, height].every(Number.isFinite) ||
    Math.hypot(dx, dy) < 1e-12
  )
    return null;
  let lo = segment ? 0 : -Infinity,
    hi = segment ? 1 : Infinity;
  for (const [origin, direction, limit] of [
    [x, dx, width],
    [y, dy, height],
  ]) {
    if (Math.abs(direction) < 1e-12) {
      if (origin < 0 || origin > limit) return null;
      continue;
    }
    let a = (0 - origin) / direction,
      b = (limit - origin) / direction;
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (lo > hi) return null;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [x + lo * dx, y + lo * dy, x + hi * dx, y + hi * dy];
}

// 消失点を同次座標で扱う。画面に平行な軸（消失点が無限遠）も省略しない。
export function vanishingPoint(camera, direction, width, height) {
  const v = direction
    .clone()
    .applyQuaternion(camera.quaternion.clone().invert());
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const z = -v.z,
    x = width * 0.5 * (z + v.x / (tan * camera.aspect)),
    y = height * 0.5 * (z - v.y / tan);
  if (Math.abs(z) < 1e-9) return { infinite: true, dx: x, dy: y };
  const px = x / z,
    py = y / z;
  if (Math.max(Math.abs(px), Math.abs(py)) > Math.max(width, height) * 1e7)
    return { infinite: true, dx: x, dy: y };
  return { infinite: false, x: px, y: py };
}

// 画面全体を見渡せる方向を均等に選び、消失点を通る直線を描く。
export function guideSegments(vp, count, width, height) {
  const n = Math.max(1, Math.floor(count)),
    result = [];
  if (vp.infinite) {
    const len = Math.hypot(vp.dx, vp.dy);
    if (len < 1e-12) return result;
    const dx = vp.dx / len,
      dy = vp.dy / len,
      nx = -dy,
      ny = dx;
    const coords = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([x, y]) => x * nx + y * ny);
    const lo = Math.min(...coords),
      hi = Math.max(...coords);
    for (let i = 0; i < n; i++) {
      const c = lo + ((hi - lo) * (i + 0.5)) / n;
      const seg = clipLine(nx * c, ny * c, dx, dy, width, height);
      if (seg) result.push(seg);
    }
    return result;
  }
  const x = vp.x,
    y = vp.y,
    inside = x > 1e-7 && x < width - 1e-7 && y > 1e-7 && y < height - 1e-7;
  if (inside) {
    // VPが画面内なら、180度分の方向が直線の全種類。
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * (i + 0.5)) / n,
        seg = clipLine(x, y, Math.cos(a), Math.sin(a), width, height);
      if (seg) result.push(seg);
    }
    return result;
  }
  // 画面外なら四隅が作る扇形を求める。最大の角度の隙間を除けば視野を覆う。
  const turn = Math.PI * 2;
  const angles = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ]
    .filter(([cx, cy]) => Math.hypot(cx - x, cy - y) > 1e-8)
    .map(([cx, cy]) => (Math.atan2(cy - y, cx - x) + turn) % turn)
    .sort((a, b) => a - b);
  let maxGap = -1,
    start = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = i === angles.length - 1 ? angles[0] + turn : angles[i + 1],
      gap = next - angles[i];
    if (gap > maxGap) {
      maxGap = gap;
      start = next % turn;
    }
  }
  const span = turn - maxGap;
  for (let i = 0; i < n; i++) {
    const a = start + (span * (i + 0.5)) / n,
      seg = clipLine(x, y, Math.cos(a), Math.sin(a), width, height);
    if (seg) result.push(seg);
  }
  return result;
}

function worldSegment(camera, a, b, width, height) {
  // カメラの背後やnear面より手前を切り、投影が無限大になるのを防ぐ。
  a = a.clone().applyMatrix4(camera.matrixWorldInverse);
  b = b.clone().applyMatrix4(camera.matrixWorldInverse);
  const near = -camera.near * 1.001;
  if (a.z > near && b.z > near) return null;
  if (a.z > near) a.lerp(b, (near - a.z) / (b.z - a.z));
  else if (b.z > near) b.lerp(a, (near - b.z) / (a.z - b.z));
  a.applyMatrix4(camera.projectionMatrix);
  b.applyMatrix4(camera.projectionMatrix);
  const x1 = ((a.x + 1) * width) / 2,
    y1 = ((1 - a.y) * height) / 2,
    x2 = ((b.x + 1) * width) / 2,
    y2 = ((1 - b.y) * height) / 2;
  return clipLine(x1, y1, x2 - x1, y2 - y1, width, height, true);
}

export function drawPerspectiveGuides(ctx, camera, width, height, settings) {
  ctx.clearRect(0, 0, width, height);
  if (!settings.horizon && !settings.guides && !settings.grid) return;
  camera.updateMatrixWorld();
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineWidth = settings.width;
  if (settings.grid) {
    const count = settings.gridCount,
      step = settings.gridStep,
      extent = count * step;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(95,141,151,${settings.opacity * 0.62})`;
    for (let i = -count; i <= count; i++) {
      const t = i * step;
      for (const [a, b] of [
        [new THREE.Vector3(-extent, 0, t), new THREE.Vector3(extent, 0, t)],
        [new THREE.Vector3(t, 0, -extent), new THREE.Vector3(t, 0, extent)],
      ]) {
        const seg = worldSegment(camera, a, b, width, height);
        if (seg) {
          ctx.moveTo(seg[0], seg[1]);
          ctx.lineTo(seg[2], seg[3]);
        }
      }
    }
    ctx.stroke();
  }
  if (settings.guides) {
    const axes = [
      {
        key: "x",
        v: new THREE.Vector3(1, 0, 0),
        color: "204,110,103",
        label: "VP1",
      },
      {
        key: "z",
        v: new THREE.Vector3(0, 0, 1),
        color: "80,155,139",
        label: "VP2",
      },
      {
        key: "y",
        v: new THREE.Vector3(0, 1, 0),
        color: "105,133,193",
        label: "垂直",
      },
    ];
    for (const axis of axes) {
      if (!settings.axes[axis.key]) continue;
      const vp = vanishingPoint(camera, axis.v, width, height),
        segs = guideSegments(vp, settings.count, width, height);
      ctx.strokeStyle = `rgba(${axis.color},${settings.opacity})`;
      ctx.beginPath();
      for (const seg of segs) {
        ctx.moveTo(seg[0], seg[1]);
        ctx.lineTo(seg[2], seg[3]);
      }
      ctx.stroke();
      if (
        !vp.infinite &&
        vp.x >= 0 &&
        vp.x <= width &&
        vp.y >= 0 &&
        vp.y <= height
      ) {
        ctx.fillStyle = `rgba(${axis.color},${Math.max(settings.opacity, 0.6)})`;
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "11px sans-serif";
        ctx.fillText(
          axis.label,
          Math.min(width - 24, vp.x + 5),
          Math.max(12, vp.y - 5),
        );
      }
    }
  }
  if (settings.horizon) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        camera.quaternion,
      ),
      right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
      tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const A = tan * camera.aspect * right.y,
      B = tan * up.y,
      C = forward.y,
      a = (2 * A) / width,
      b = (-2 * B) / height,
      c = -A + B + C;
    if (Math.hypot(a, b) > 1e-12) {
      const px = Math.abs(b) > Math.abs(a) ? 0 : -c / a,
        py = Math.abs(b) > Math.abs(a) ? -c / b : 0,
        seg = clipLine(px, py, -b, a, width, height);
      if (seg) {
        ctx.strokeStyle = "rgba(195,99,94,.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(seg[0], seg[1]);
        ctx.lineTo(seg[2], seg[3]);
        ctx.stroke();
        ctx.fillStyle = "#b36760";
        ctx.font = "11px sans-serif";
        ctx.fillText(
          "EYE LEVEL",
          Math.max(4, Math.min(width - 65, seg[0] + 5)),
          Math.max(12, Math.min(height - 5, seg[1] - 5)),
        );
      }
    }
  }
  ctx.restore();
}
