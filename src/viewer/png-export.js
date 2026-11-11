// 3Dキャンバスと任意の作画ガイドを合成し、PNGデータを作る。
export async function createPngBlob(canvas, overlay, includeGuides) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  if (includeGuides) ctx.drawImage(overlay, 0, 0, out.width, out.height);
  return await new Promise((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("画像を作成できませんでした"))),
      "image/png",
    ),
  );
}
