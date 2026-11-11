// 部屋のPNG保存・画像コピーと書き出し画面の操作。
export function bindImageExport({
  $,
  canvas,
  renderCurrent,
  toast,
  getSelectedBox,
}) {
  $("#exportOpen").onclick = () => $("#modal").classList.add("open");
  $("#closeModal").onclick = () => $("#modal").classList.remove("open");
  $("#modal").onclick = (e) => {
    if (e.target.id === "modal") e.target.classList.remove("open");
  };
  $("#download").onclick = () => {
    if (getSelectedBox()) getSelectedBox().visible = false;
    renderCurrent();
    let a = document.createElement("a");
    a.download = "room-sketch.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    if (getSelectedBox()) getSelectedBox().visible = true;
    toast("PNGを書き出しました");
  };
  $("#copy").onclick = async () => {
    try {
      if (getSelectedBox()) getSelectedBox().visible = false;
      renderCurrent();
      let blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (getSelectedBox()) getSelectedBox().visible = true;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast("画像をクリップボードにコピーしました");
    } catch (e) {
      if (getSelectedBox()) getSelectedBox().visible = true;
      toast("コピーできませんでした。PNG保存をお試しください");
    }
  };
}
