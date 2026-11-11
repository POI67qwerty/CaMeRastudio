// 部屋ガチャのテンプレートごとの家具と初期位置。
export function templateItems(kind) {
  let a = [];
  if (kind === "bedroom")
    a = [
      ["bed", -2, -0.7],
      ["desk", 1.65, -2.4],
      ["chair", 1.65, -1.35, Math.PI],
      ["shelf", -3.05, 1.65, Math.PI / 2],
      ["plant", 3, 2.3],
    ];
  if (kind === "living")
    a = [
      ["sofa", -1, -0.8],
      ["desk", -0.9, 0.65],
      ["shelf", 2.8, -2.6],
      ["plant", -3, 2.5],
      ["chair", 1.5, 1.7, -Math.PI / 2],
    ];
  if (kind === "washitsu")
    a = [
      ["lowtable", 0, 0],
      ["zabuton", -0.65, 1],
      ["zabuton", 0.65, 1],
      ["fan", -2.7, 1.5],
      ["futon", 2.4, 0.1],
      ["shoji", 0, -2.8],
      ["plant", -3, -2.3],
    ];
  if (kind === "classroom") {
    for (let z of [-1.5, 0.2, 1.9])
      for (let x of [-2, 0, 2]) {
        a.push(["desk", x, z]);
        a.push(["chair", x, z + 0.65, Math.PI]);
      }
    a.push(["shelf", 3, -2.7]);
  }
  return a;
}
