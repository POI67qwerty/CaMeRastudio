// 添付の図に基づく、0.9m単位の代表的な敷き方。
// 矩形は [左, 上, 幅, 奥行]。全畳は 1×2、半畳は 1×1。
export const TATAMI_UNIT = 0.9;
export const TATAMI_PATTERNS = {
  4.5: {
    width: 3,
    depth: 3,
    mats: [
      [0, 0, 1, 2],
      [1, 0, 2, 1],
      [1, 1, 1, 1],
      [2, 1, 1, 2],
      [0, 2, 2, 1],
    ],
  },
  6: {
    width: 4,
    depth: 3,
    mats: [
      [0, 0, 2, 1],
      [2, 0, 2, 1],
      [0, 1, 1, 2],
      [1, 1, 2, 1],
      [1, 2, 2, 1],
      [3, 1, 1, 2],
    ],
  },
  "6-vertical": {
    width: 3,
    depth: 4,
    mats: [
      [0, 0, 2, 1],
      [2, 0, 1, 2],
      [0, 1, 1, 2],
      [1, 1, 1, 2],
      [2, 2, 1, 2],
      [0, 3, 2, 1],
    ],
  },
  8: {
    width: 4,
    depth: 4,
    mats: [
      [0, 0, 2, 1],
      [2, 0, 2, 1],
      [0, 1, 1, 2],
      [1, 1, 2, 1],
      [1, 2, 2, 1],
      [3, 1, 1, 2],
      [0, 3, 2, 1],
      [2, 3, 2, 1],
    ],
  },
};

// 敷き方を繰り返して部屋の床全体に延ばし、存在しない床では縁を切る。
// 部屋の編集マスは1mなので、端には半端な大きさの畳が出る場合がある。
export function tatamiEdges(cells, pattern = "8") {
  const p = TATAMI_PATTERNS[pattern] || TATAMI_PATTERNS["8"];
  const d = cells.length,
    w = cells[0].length,
    unit = TATAMI_UNIT;
  const pw = p.width * unit,
    pd = p.depth * unit,
    byLine = new Map();
  const put = (axis, fixed, start, end) => {
    // 微小な浮動小数点の差による同一線の二重描画を防ぐ。
    const k = axis + ":" + Math.round(fixed * 1e6);
    if (!byLine.has(k)) byLine.set(k, { axis, fixed, intervals: [] });
    byLine.get(k).intervals.push([start, end]);
  };
  for (
    let j = Math.floor(-d / 2 / pd - 0.5);
    j <= Math.ceil(d / 2 / pd + 0.5);
    j++
  ) {
    for (
      let i = Math.floor(-w / 2 / pw - 0.5);
      i <= Math.ceil(w / 2 / pw + 0.5);
      i++
    ) {
      const ox = (i - 0.5) * pw,
        oz = (j - 0.5) * pd;
      for (const [x, z, mw, md] of p.mats) {
        const x0 = ox + x * unit,
          x1 = ox + (x + mw) * unit,
          z0 = oz + z * unit,
          z1 = oz + (z + md) * unit;
        if (x1 < -w / 2 || x0 > w / 2 || z1 < -d / 2 || z0 > d / 2) continue;
        put("h", z0, x0, x1);
        put("h", z1, x0, x1);
        put("v", x0, z0, z1);
        put("v", x1, z0, z1);
      }
    }
  }
  const onFloor = (x, z) => {
    const ix = Math.floor(x + w / 2),
      iz = Math.floor(z + d / 2);
    return !!cells[iz]?.[ix];
  };
  const result = [];
  for (const { axis, fixed, intervals } of byLine.values()) {
    const span = axis === "h" ? w : d,
      cross = axis === "h" ? d : w;
    if (fixed < -cross / 2 - 1e-7 || fixed > cross / 2 + 1e-7) continue;
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of intervals) {
      const last = merged.at(-1);
      if (last && a <= last[1] + 1e-7) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    for (const [a, b] of merged) {
      const start = Math.max(a, -span / 2),
        end = Math.min(b, span / 2);
      if (end - start < 1e-7) continue;
      const cuts = [start, end];
      for (let k = 1; k < span; k++) {
        const x = -span / 2 + k;
        if (x > start + 1e-7 && x < end - 1e-7) cuts.push(x);
      }
      cuts.sort((x, y) => x - y);
      let active = null;
      for (let k = 0; k < cuts.length - 1; k++) {
        const lo = cuts[k],
          hi = cuts[k + 1],
          mid = (lo + hi) / 2,
          eps = 1e-6;
        const visible =
          axis === "h"
            ? onFloor(mid, fixed - eps) || onFloor(mid, fixed + eps)
            : onFloor(fixed - eps, mid) || onFloor(fixed + eps, mid);
        if (visible) {
          if (active === null) active = lo;
        } else if (active !== null) {
          result.push({ axis, fixed, start: active, end: lo });
          active = null;
        }
      }
      if (active !== null) result.push({ axis, fixed, start: active, end });
    }
  }
  return result;
}
