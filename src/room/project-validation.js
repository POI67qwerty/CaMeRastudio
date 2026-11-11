// 保存したプロジェクトの形式と寸法を検証する。
import { TATAMI_PATTERNS } from "../tatami.js";
import { sizes } from "./furniture.js";
import { validModelScale } from "./imported-model.js";

export function validDesk(v) {
  return (
    !!v &&
    [
      ["width", 0.3, 4],
      ["depth", 0.3, 3],
      ["thickness", 0.02, 0.3],
      ["leg", 0.2, 2],
    ].every(([k, a, b]) => Number.isFinite(v[k]) && v[k] >= a && v[k] <= b)
  );
}

export function validateProject(data) {
  if (data?.floorStyle != null && !["wood", "tatami"].includes(data.floorStyle))
    throw new Error("床の種類が不正です。");
  if (
    data?.tatamiPattern != null &&
    !Object.hasOwn(TATAMI_PATTERNS, data.tatamiPattern)
  )
    throw new Error("畳の敷き方が不正です。");
  if (
    !data ||
    !Array.isArray(data.objects) ||
    data.objects.some(
      (o) => !o || !sizes[o.type] || ![o.x, o.z, o.rot].every(Number.isFinite),
    )
  )
    throw new Error("プロジェクトの家具情報が不正です。");
  if (
    data.cells &&
    (!Array.isArray(data.cells) ||
      data.cells.length < 2 ||
      data.cells.length > 20 ||
      !Array.isArray(data.cells[0]) ||
      data.cells[0].length < 2 ||
      data.cells[0].length > 20 ||
      data.cells.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== data.cells[0].length ||
          row.some((v) => typeof v !== "boolean"),
      ))
  )
    throw new Error("床のデータが不正です。");
  if (
    data.objects.some((o) => o.type === "desk" && o.desk && !validDesk(o.desk))
  )
    throw new Error("机の寸法が不正です。");
  if (
    data.objects.some(
      (o) =>
        o.type === "primitive" &&
        (!o.primitive ||
          !["box", "cylinder", "sphere"].includes(o.primitive.kind) ||
          ![o.primitive.w, o.primitive.h, o.primitive.d].every(
            (v) => Number.isFinite(v) && v >= 0.1 && v <= 10,
          ) ||
          !/^#[0-9a-fA-F]{6}$/.test(o.primitive.color)),
    )
  )
    throw new Error("基本形のデータが不正です。");
  if (
    data.openings &&
    Object.values(data.openings).some((v) => {
      if (typeof v === "string") return !["wall", "window", "door"].includes(v);
      return (
        !v ||
        !["window", "door"].includes(v.type) ||
        ![v.width, v.height, v.sill].every(Number.isFinite) ||
        v.width < 0.2 ||
        v.width > 20 ||
        v.height < 0.3 ||
        v.sill < 0 ||
        v.height + v.sill > 2.95
      );
    })
  )
    throw new Error("窓・ドアのデータが不正です。");
  if (
    data.camera &&
    (!Array.isArray(data.camera.position) ||
      data.camera.position.length !== 3 ||
      !data.camera.position.every(Number.isFinite) ||
      !Array.isArray(data.camera.target) ||
      data.camera.target.length !== 3 ||
      !data.camera.target.every(Number.isFinite) ||
      !Number.isFinite(data.camera.fov) ||
      data.camera.fov < 1 ||
      data.camera.fov > 179)
  )
    throw new Error("カメラのデータが不正です。");
  for (const o of data.objects)
    if (o.type === "model") {
      if (
        !o.model ||
        typeof o.model.asset !== "string" ||
        !validModelScale(o.model.scale) ||
        !data.assets ||
        !Object.hasOwn(data.assets, o.model.asset) ||
        data.assets[o.model.asset]?.encoding !== "base64"
      )
        throw new Error("プロジェクトに必要なGLBデータがありません。");
    }
}
