// 線画・パースガイドの入力欄と表示値を同期する。
export function bindGuideControls($, scene) {
  $("#lineWidth").oninput = (e) => {
    $("#lineWidthOut").textContent = Number(e.target.value).toFixed(1) + " px";
    scene.traverse((o) => {
      if (o.userData.outline) o.material.linewidth = Number(e.target.value);
    });
  };
  $("#depthSensitivity").oninput = (e) =>
    ($("#depthOut").textContent =
      e.target.value == 50 ? "標準" : e.target.value);
  $("#normalSensitivity").oninput = (e) =>
    ($("#normalOut").textContent =
      e.target.value == 50 ? "標準" : e.target.value);
  $("#guideCount").oninput = (e) => {
    const n = Math.max(
      2,
      Math.min(200, Math.round(Number(e.target.value) || 24)),
    );
    $("#guideCountNumber").value = n;
    $("#guideOut").textContent = n + "本";
  };
  $("#guideCountNumber").oninput = (e) => {
    if (e.target.value === "") return;
    const n = Math.max(
      2,
      Math.min(200, Math.round(Number(e.target.value) || 2)),
    );
    $("#guideCount").value = n;
    $("#guideOut").textContent = n + "本";
  };
  $("#guideCountNumber").onchange = (e) => {
    e.target.value = $("#guideCount").value;
  };
  $("#guideOpacity").oninput = (e) =>
    ($("#guideOpacityOut").textContent = e.target.value + "%");
  $("#guideWidth").oninput = (e) =>
    ($("#guideWidthOut").textContent =
      Number(e.target.value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") +
      " px");
  $("#guideGrid").onchange = (e) =>
    ($("#gridSettings").hidden = !e.target.checked);
  $("#gridStep").onchange = (e) => {
    e.target.value = Math.max(0.1, Math.min(10, Number(e.target.value) || 0.5));
  };
  $("#gridCount").onchange = (e) => {
    e.target.value = Math.max(
      1,
      Math.min(60, Math.floor(Number(e.target.value) || 20)),
    );
  };
}
