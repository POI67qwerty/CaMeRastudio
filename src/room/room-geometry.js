// 床・畳・壁・窓・ドアの3D形状を現在の間取りから組み立てる。
import * as THREE from "three";
import { tatamiEdges } from "../tatami.js";
export function createRoomBuilder({
  room,
  clearGenerated,
  box,
  mat,
  normal,
  edgeAt,
  openingPieces,
  setStyle,
  getRoomState,
  setWalls,
}) {
  return function makeRoom() {
    const { W, D, cells, floorStyle, tatamiPattern } = getRoomState();
    clearGenerated(room);
    const walls = [];
    const floorVertices = [];
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++)
        if (cells[z][x]) {
          let wx = x - W / 2 + 0.5,
            wz = z - D / 2 + 0.5;
          const tatami = floorStyle === "tatami";
          const tile = box(
            room,
            1,
            0.12,
            1,
            wx,
            -0.06,
            wz,
            tatami ? 0xaebd87 : 0xd7c6ae,
          );
          // 畳の辺は1mマスではなく、別途作る敷き方に従う。
          if (tatami) tile.children[0].userData.tatamiBase = true;
          // 二値線画では、マスのわずかな隙間や深度の競合による点を防ぐため、
          // 隙間のない一枚の床面をわずかに上へ重ねる。
          const x0 = wx - 0.5,
            x1 = wx + 0.5,
            z0 = wz - 0.5,
            z1 = wz + 0.5,
            y = 0.004;
          floorVertices.push(
            x0,
            y,
            z0,
            x0,
            y,
            z1,
            x1,
            y,
            z1,
            x0,
            y,
            z0,
            x1,
            y,
            z1,
            x1,
            y,
            z0,
          );
          for (const side of Object.keys(normal))
            if (edgeAt(x, z, side)) {
              let [dx, dz] = normal[side],
                group = new THREE.Group();
              group.position.set(wx + dx * 0.5, 0, wz + dz * 0.5);
              if (side === "left" || side === "right")
                group.rotation.y = Math.PI / 2;
              group.userData.side = side;
              group.userData.normal = [dx, dz];
              const pieces = openingPieces(x, z, side);
              let cursor = -0.5;
              function wallPart(l, r, bottom, top) {
                if (r - l > 0.0001 && top - bottom > 0.0001)
                  box(
                    group,
                    r - l,
                    top - bottom,
                    0.12,
                    (l + r) / 2,
                    (bottom + top) / 2,
                    0,
                    0xe9e9dd,
                  );
              }
              for (const p of pieces) {
                const left = Math.max(cursor, p.l),
                  right = p.r;
                if (right <= left) continue;
                wallPart(cursor, left, 0, 3);
                const data = p.data,
                  bottom = data.type === "window" ? data.sill : 0,
                  top = bottom + data.height;
                wallPart(left, right, 0, bottom);
                wallPart(left, right, top, 3);
                if (data.type === "window")
                  box(
                    group,
                    right - left,
                    data.height,
                    0.035,
                    (left + right) / 2,
                    bottom + data.height / 2,
                    0,
                    0xb7d2d2,
                  );
                // 枠の上下は連続して描き、左右は開口の実際の端にだけ描く。
                const thick = 0.045,
                  mid = (left + right) / 2,
                  span = right - left;
                box(
                  group,
                  span,
                  thick,
                  0.15,
                  mid,
                  top - thick / 2,
                  0,
                  0xf6f5ed,
                );
                if (data.type === "window")
                  box(
                    group,
                    span,
                    thick,
                    0.15,
                    mid,
                    bottom + thick / 2,
                    0,
                    0xf6f5ed,
                  );
                let horizontal = side === "back" || side === "front";
                let leftIsEnd = horizontal
                  ? Math.abs(p.a - p.globalStart) < 1e-5
                  : Math.abs(p.b - p.globalEnd) < 1e-5;
                let rightIsEnd = horizontal
                  ? Math.abs(p.b - p.globalEnd) < 1e-5
                  : Math.abs(p.a - p.globalStart) < 1e-5;
                if (leftIsEnd)
                  box(
                    group,
                    thick,
                    data.height,
                    0.15,
                    left + thick / 2,
                    bottom + data.height / 2,
                    0,
                    0xf6f5ed,
                  );
                if (rightIsEnd)
                  box(
                    group,
                    thick,
                    data.height,
                    0.15,
                    right - thick / 2,
                    bottom + data.height / 2,
                    0,
                    0xf6f5ed,
                  );
                cursor = right;
              }
              wallPart(cursor, 0.5, 0, 3);
              walls.push(group);
              room.add(group);
            }
        }
    if (floorStyle === "tatami") {
      for (const edge of tatamiEdges(cells, tatamiPattern)) {
        const mid = (edge.start + edge.end) / 2,
          len = edge.end - edge.start;
        if (edge.axis === "h")
          box(room, len, 0.025, 0.018, mid, 0.0125, edge.fixed, 0x647551);
        else box(room, 0.018, 0.025, len, edge.fixed, 0.0125, mid, 0x647551);
      }
    }
    if (floorVertices.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(floorVertices, 3),
      );
      geometry.computeVertexNormals();
      const top = new THREE.Mesh(geometry, mat(0xd7c6ae));
      top.userData.binaryOnly = true;
      room.add(top);
    }
    setWalls(walls);
    setStyle(room);
  };
}
