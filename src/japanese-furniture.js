import * as THREE from "three";

// 元ゲームのデータを使わず、基本形から作る和室向けの家具。
export function createJapaneseFurniture(
  type,
  { box, cylinder, mat, makeEdges },
) {
  const g = new THREE.Group();
  const b = (...args) => box(g, ...args);
  const c = (...args) => cylinder(g, ...args);
  const addMesh = (
    geometry,
    color,
    position,
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
  ) => {
    const mesh = new THREE.Mesh(geometry, mat(color));
    mesh.userData.baseColor = color;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.add(makeEdges(mesh.geometry, 30));
    g.add(mesh);
    return mesh;
  };
  if (type === "fan") {
    // 卓上型のような低い台座、支柱、青い羽根、前後の丸いガード。
    b(0.48, 0.07, 0.36, 0, 0.035, 0, 0xe0cfaa);
    b(0.36, 0.016, 0.14, 0, 0.079, 0.08, 0x4d7292);
    for (let x of [-0.1, 0, 0.1])
      c(0.023, 0.023, 0.018, x, 0.095, 0.08, 0xe3e4da);
    c(0.035, 0.045, 0.46, 0, 0.31, -0.025, 0xbabdb8);
    c(0.09, 0.1, 0.06, 0, 0.56, -0.025, 0xb9bcb6);
    const cy = 0.86,
      radius = 0.29;
    // TorusGeometryはXY平面上に円を作る。扇風機の正面は+Z。
    for (let z of [-0.08, 0.08])
      addMesh(new THREE.TorusGeometry(radius, 0.012, 6, 32), 0xaeb3ad, [
        0,
        cy,
        z,
      ]);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      addMesh(
        new THREE.SphereGeometry(1, 12, 8),
        0x4a9dbd,
        [Math.sin(a) * 0.125, cy + Math.cos(a) * 0.125, 0],
        [0, 0, -a - 0.38],
        [0.105, 0.17, 0.018],
      );
    }
    // ガードは細い円柱を中心から放射状に置く。
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      addMesh(
        new THREE.CylinderGeometry(0.0035, 0.0035, radius - 0.03, 5),
        0xaeb3ad,
        [Math.sin(a) * 0.155, cy + Math.cos(a) * 0.155, 0.09],
        [0, 0, -a],
      );
    }
    addMesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.035, 20),
      0xe3e4dc,
      [0, cy, 0.105],
      [Math.PI / 2, 0, 0],
    );
  }
  if (type === "lowtable") {
    b(1.3, 0.08, 0.8, 0, 0.36, 0, 0x9d744f);
    for (let x of [-0.52, 0.52])
      for (let z of [-0.29, 0.29]) b(0.09, 0.32, 0.09, x, 0.16, z, 0x76573d);
  }
  if (type === "zabuton") {
    b(0.56, 0.09, 0.56, 0, 0.045, 0, 0x637f84);
    b(0.48, 0.012, 0.48, 0, 0.096, 0, 0x78979a);
  }
  if (type === "futon") {
    b(1.05, 0.16, 1.9, 0, 0.08, 0, 0xe9e6d7);
    b(0.98, 0.13, 1.28, 0, 0.22, 0.18, 0x879daf);
    b(0.55, 0.13, 0.31, 0, 0.225, -0.7, 0xf7f5eb);
  }
  if (type === "shoji") {
    // 自立した建具の簡易モデル（壁の開口と連動する引き戸ではない）。
    b(1.46, 1.82, 0.035, 0, 0.91, 0, 0xf4f0df);
    for (let x of [-0.72, 0, 0.72]) b(0.045, 1.86, 0.07, x, 0.93, 0, 0x947350);
    for (let y of [0.03, 0.5, 0.95, 1.4, 1.83])
      b(1.48, 0.045, 0.07, 0, y, 0, 0x947350);
    for (let x of [-0.48, -0.24, 0.24, 0.48])
      b(0.018, 1.8, 0.055, x, 0.91, 0.015, 0xb99a72);
    b(1.48, 0.035, 0.26, 0, 0.017, 0, 0x947350);
  }
  return g;
}
