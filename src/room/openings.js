// 床の外周と、壁に付く窓・ドアの範囲計算。
// get* は現在の状態を返すため、部屋の変更や読込後も古い配列を使わない。
export function createOpeningTools({
  normal,
  getCells,
  getOpenings,
  getDimensions,
}) {
  function edgeAt(x, z, side) {
    const cells = getCells();
    let [dx, dz] = normal[side],
      nx = x + dx,
      nz = z + dz;
    return !!cells[z]?.[x] && !cells[nz]?.[nx];
  }
  // 開口は1mマスの中心を基準に持つ。幅が複数マスに及ぶときも、
  // 連続する同じ壁に沿って3Dの開口を分割して作る。
  function openingData(value) {
    if (!value || value === "wall") return null;
    const type = typeof value === "string" ? value : value.type;
    if (type !== "window" && type !== "door") return null;
    const defaults =
      type === "window"
        ? { type, width: 0.84, height: 1.3, sill: 1.05 }
        : { type, width: 0.84, height: 2.2, sill: 0 };
    return typeof value === "string"
      ? defaults
      : {
          ...defaults,
          ...value,
          type,
          sill: type === "door" ? 0 : Number(value.sill ?? defaults.sill),
        };
  }
  function unpackOpening(key) {
    let [sx, sz, side] = key.split(",");
    return { x: Number(sx), z: Number(sz), side };
  }
  function sameWall(a, b) {
    return (
      a.side === b.side &&
      (a.side === "back" || a.side === "front" ? a.z === b.z : a.x === b.x)
    );
  }
  function axisFor(e) {
    return e.side === "back" || e.side === "front" ? e.x : e.z;
  }
  function openingLimit(key) {
    const openings = getOpenings();
    const e = unpackOpening(key),
      horizontal = e.side === "back" || e.side === "front";
    if (!normal[e.side] || !edgeAt(e.x, e.z, e.side)) return 0;
    const axis = axisFor(e);
    let lo = axis,
      hi = axis + 1;
    function available(i) {
      return horizontal ? edgeAt(i, e.z, e.side) : edgeAt(e.x, i, e.side);
    }
    while (available(lo - 1)) lo--;
    while (available(hi)) hi++;
    const center = axis + 0.5;
    let distance = Math.min(center - lo, hi - center);
    for (const [otherKey, value] of Object.entries(openings)) {
      if (otherKey === key) continue;
      const other = unpackOpening(otherKey),
        data = openingData(value);
      if (!data || !sameWall(e, other) || !edgeAt(other.x, other.z, other.side))
        continue;
      const c = axisFor(other) + 0.5,
        a = c - data.width / 2,
        b = c + data.width / 2;
      if (b <= center) distance = Math.min(distance, center - b);
      else if (a >= center) distance = Math.min(distance, a - center);
      else distance = 0;
    }
    return Math.max(0, Math.round(distance * 200) / 100);
  }
  function openingPieces(x, z, side) {
    const openings = getOpenings();
    let segment = { x, z, side },
      horizontal = side === "back" || side === "front",
      axis = axisFor(segment),
      pieces = [];
    for (const [key, value] of Object.entries(openings)) {
      let e = unpackOpening(key),
        data = openingData(value);
      if (!data || !sameWall(segment, e) || !edgeAt(e.x, e.z, e.side)) continue;
      const center = axisFor(e) + 0.5,
        lo = center - data.width / 2,
        hi = center + data.width / 2,
        a = Math.max(axis, lo),
        b = Math.min(axis + 1, hi);
      if (b - a <= 1e-6) continue;
      let l = horizontal ? a - axis - 0.5 : axis + 0.5 - b,
        r = horizontal ? b - axis - 0.5 : axis + 0.5 - a;
      pieces.push({
        key,
        data,
        l,
        r,
        a,
        b,
        globalStart: lo,
        globalEnd: hi,
        side,
      });
    }
    return pieces.sort((a, b) => a.l - b.l);
  }
  function openingAt(e, p) {
    const { W, D } = getDimensions();
    const horizontal = e.side === "back" || e.side === "front",
      axis = horizontal ? p.x + W / 2 : p.z + D / 2;
    return (
      openingPieces(e.x, e.z, e.side).find(
        (o) => axis >= o.a - 0.04 && axis <= o.b + 0.04,
      )?.key || null
    );
  }

  return {
    edgeAt,
    openingData,
    unpackOpening,
    openingLimit,
    openingPieces,
    openingAt,
  };
}
