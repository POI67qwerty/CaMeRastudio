// 部屋とモデル専用ビューアーを同じタブ内で切り替える。
export function setupViewerNavigation(openButton) {
  // 別ページのビューアーを一度だけ開き、隠すときも破棄しない。
  // これにより部屋とモデルの両方の編集中の状態を保てる。
  const viewerPanel = document.createElement("section");
  viewerPanel.id = "viewerPanel";
  viewerPanel.className = "viewer-panel";
  viewerPanel.hidden = true;
  viewerPanel.setAttribute("aria-label", "モデル専用ビューアー");
  const viewerFrame = document.createElement("iframe");
  viewerFrame.title = "モデル専用ビューアー";
  viewerFrame.allow = "clipboard-write";
  viewerPanel.appendChild(viewerFrame);
  document.body.appendChild(viewerPanel);
  let viewerShowing = false;
  openButton.onclick = () => {
    if (!viewerFrame.getAttribute("src"))
      viewerFrame.src = "./model-viewer.html?embedded=room";
    viewerPanel.hidden = false;
    viewerShowing = true;
    viewerFrame.contentWindow?.postMessage(
      { type: "room-viewer-active", active: true },
      location.origin,
    );
    viewerFrame.focus();
  };
  window.addEventListener("message", (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== viewerFrame.contentWindow ||
      e.data?.type !== "room-viewer-close"
    )
      return;
    viewerShowing = false;
    viewerPanel.hidden = true;
    viewerFrame.contentWindow.postMessage(
      { type: "room-viewer-active", active: false },
      location.origin,
    );
    openButton.focus();
  });

  return () => viewerShowing;
}
