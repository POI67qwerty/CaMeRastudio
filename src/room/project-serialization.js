// 家具とGLBデータをJSONに保存できる形へ変換し、同一GLBを共有する。
export function serializeProjectObjects(objects) {
  const assets = {},
    byData = new Map();
  const serialized = objects.map((o) => {
    const result = {
      type: o.userData.type,
      x: o.position.x,
      z: o.position.z,
      rot: o.rotation.y,
    };
    if (o.userData.type === "primitive")
      result.primitive = o.userData.primitive;
    else if (o.userData.type === "desk") result.desk = o.userData.deskSpec;
    else if (o.userData.type === "model") {
      const bytes = o.userData.modelData;
      if (typeof bytes !== "string" || !bytes)
        throw new Error(
          "モデルデータが見つかりません。モデルを読み込み直してください。",
        );
      let id = byData.get(bytes);
      if (!id) {
        id = "glb-" + (byData.size + 1);
        byData.set(bytes, id);
        assets[id] = { encoding: "base64", data: bytes };
      }
      result.model = {
        asset: id,
        name: o.userData.modelName,
        scale: o.userData.modelScale,
      };
    }
    return result;
  });
  return { assets, serialized };
}
