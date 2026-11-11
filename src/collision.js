// 2D oriented rectangles: all tests are made in the room's XZ floor plane.
export function rectangle(x, z, w, d, angle = 0, ox = 0, oz = 0) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([a, b]) => {
    a += ox;
    b += oz;
    return [x + c * a + s * b, z - s * a + c * b];
  });
}
export function intersects(a, b) {
  // Separating axis theorem. Merely touching is not considered an overlap.
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        nx = -(q[1] - p[1]),
        nz = q[0] - p[0];
      const ap = a.map((v) => v[0] * nx + v[1] * nz),
        bp = b.map((v) => v[0] * nx + v[1] * nz);
      if (
        Math.max(...ap) <= Math.min(...bp) + 1e-7 ||
        Math.max(...bp) <= Math.min(...ap) + 1e-7
      )
        return false;
    }
  return true;
}
export function outsideFloor(poly, cells) {
  const depth = cells.length,
    width = cells[0].length;
  const xs = poly.map((p) => p[0]),
    zs = poly.map((p) => p[1]);
  if (
    Math.min(...xs) < -width / 2 - 1e-7 ||
    Math.max(...xs) > width / 2 + 1e-7 ||
    Math.min(...zs) < -depth / 2 - 1e-7 ||
    Math.max(...zs) > depth / 2 + 1e-7
  )
    return true;
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++)
      if (!cells[z][x]) {
        if (
          intersects(
            poly,
            rectangle(x - width / 2 + 0.5, z - depth / 2 + 0.5, 1, 1),
          )
        )
          return true;
      }
  return false;
}
