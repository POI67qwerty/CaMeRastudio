// 家具の種類・寸法と標準家具の形状。
import * as THREE from "three";
import { createJapaneseFurniture } from "../japanese-furniture.js";
export const labels = {
  desk: "机",
  chair: "椅子",
  bed: "ベッド",
  shelf: "本棚",
  sofa: "ソファ",
  plant: "観葉植物",
  fan: "扇風機",
  lowtable: "ちゃぶ台",
  zabuton: "座布団",
  futon: "布団",
  shoji: "障子",
  primitive: "基本形",
  model: "読み込んだモデル",
};
export const sizes = {
  desk: [1.5, 0.8],
  chair: [0.65, 0.65],
  bed: [1.45, 2.2],
  shelf: [1.2, 0.66, 0, -0.0875],
  sofa: [2, 0.85],
  plant: [0.86, 0.68, 0, 0.06],
  fan: [0.6, 0.46],
  lowtable: [1.3, 0.8],
  zabuton: [0.56, 0.56],
  futon: [1.05, 1.9],
  shoji: [1.5, 0.3],
  primitive: [1, 1],
  model: [1, 1],
};

export const defaultDesk = {
  width: 1.5,
  depth: 0.8,
  thickness: 0.09,
  leg: 0.73,
};

export function createFurnitureFactory({ box, cylinder, mat, makeEdges }) {
  function createFurniture(type, deskSpec = defaultDesk) {
    if (["fan", "lowtable", "zabuton", "futon", "shoji"].includes(type))
      return createJapaneseFurniture(type, { box, cylinder, mat, makeEdges });
    let g = new THREE.Group();
    const b = (...a) => box(g, ...a),
      c = (...a) => cylinder(g, ...a);
    if (type === "desk") {
      const q = { ...defaultDesk, ...deskSpec };
      g.userData.deskSpec = q;
      g.userData.footprint = [q.width, q.depth, 0, 0];
      b(q.width, q.thickness, q.depth, 0, q.leg + q.thickness / 2, 0, 0xc8a77e);
      const inset = Math.min(0.12, q.width / 3, q.depth / 3);
      for (let x of [-q.width / 2 + inset, q.width / 2 - inset])
        for (let z of [-q.depth / 2 + inset, q.depth / 2 - inset])
          b(0.07, q.leg, 0.07, x, q.leg / 2, z, 0xa98763);
    }
    if (type === "chair") {
      b(0.62, 0.08, 0.6, 0, 0.48, 0, 0xd4b992);
      b(0.62, 0.65, 0.08, 0, 0.81, -0.26, 0xd4b992);
      for (let x of [-0.24, 0.24])
        for (let z of [-0.23, 0.23])
          b(0.055, 0.45, 0.055, x, 0.225, z, 0x998b76);
    }
    if (type === "bed") {
      b(1.45, 0.28, 2.2, 0, 0.22, 0, 0xbca386);
      b(1.38, 0.25, 2.05, 0, 0.47, 0, 0xf2eee6);
      b(1.4, 0.3, 0.12, 0, 0.43, -1.05, 0xb79876);
      b(1.12, 0.12, 0.48, 0, 0.66, -0.62, 0xded9cc);
      b(1.38, 0.12, 1.1, 0, 0.65, 0.45, 0xc2d1c6);
    }
    if (type === "shelf") {
      b(1.2, 1.7, 0.43, 0, 0.85, -0.2, 0xd1b28d);
      for (let y of [0.15, 0.56, 0.98, 1.4, 1.7])
        b(1.2, 0.06, 0.48, 0, y, 0, 0xb99770);
      for (let x of [-0.57, 0.57]) b(0.06, 1.7, 0.48, x, 0.85, 0, 0xb99770);
      for (let i = 0; i < 5; i++)
        b(
          0.13,
          0.28,
          0.24,
          -0.43 + i * 0.17,
          0.74,
          0.02,
          [0xaaa797, 0x81988c, 0xd6c4a8, 0xaeb8a4, 0x9aaba9][i],
        );
    }
    if (type === "sofa") {
      b(2, 0.3, 0.85, 0, 0.31, 0, 0xb5bdae);
      b(2, 0.65, 0.18, 0, 0.68, -0.33, 0xa8b2a3);
      for (let x of [-0.91, 0.91]) b(0.18, 0.5, 0.85, x, 0.5, 0, 0xa8b2a3);
      for (let x of [-0.43, 0.43]) b(0.8, 0.15, 0.62, x, 0.52, 0.05, 0xc3ccbd);
    }
    if (type === "plant") {
      c(0.25, 0.18, 0.42, 0, 0.21, 0, 0xc69273);
      c(0.035, 0.035, 0.85, 0, 0.8, 0, 0x718b65);
      for (let [x, y, z] of [
        [0, 1.35, 0],
        [0.24, 1.1, 0],
        [-0.23, 1.1, 0.05],
        [0, 1.2, 0.2],
      ]) {
        let m = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          mat(0x91aa87),
        );
        m.position.set(x, y, z);
        m.scale.set(0.7, 1.25, 0.7);
        m.add(makeEdges(m.geometry, 35));
        g.add(m);
      }
    }
    return g;
  }

  return createFurniture;
}
