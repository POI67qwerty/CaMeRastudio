// 2Dの間取り図、壁、家具、警告、ドラッグ中の表示を描く。
export function createPlanDrawer({
  plan,
  roomSize,
  normal,
  edgeAt,
  openingPieces,
  getFootprint,
  labels,
  validatePlacement,
  getState,
}) {
  return function drawPlan() {
    validatePlacement();
    const {
      W,
      D,
      cells,
      objects,
      warnings,
      selected,
      selectedOpening,
      planTool,
      placementType,
      resizeDrag,
    } = getState();
    let ctx = plan.getContext("2d"),
      s = plan.width,
      margin = 48,
      scale = (s - 2 * margin) / (Math.max(W, D) + 1);
    roomSize.textContent = `${W} × ${D}m · 1マス = 1m`;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = "#f7f9f5";
    ctx.fillRect(0, 0, s, s);
    const px = (x) => s / 2 + x * scale,
      pz = (z) => s / 2 + z * scale;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        let xx = px(x - W / 2),
          zz = pz(z - D / 2);
        ctx.fillStyle = cells[z][x] ? "#e9f0e7" : "#f7f9f5";
        ctx.fillRect(xx, zz, scale, scale);
        ctx.strokeStyle = "#dce6da";
        ctx.lineWidth = 1;
        ctx.strokeRect(xx, zz, scale, scale);
        for (let side of Object.keys(normal))
          if (edgeAt(x, z, side)) {
            ctx.lineWidth = 5;
            ctx.strokeStyle = "#536c59";
            ctx.beginPath();
            if (side === "back") {
              ctx.moveTo(xx, zz);
              ctx.lineTo(xx + scale, zz);
            }
            if (side === "front") {
              ctx.moveTo(xx, zz + scale);
              ctx.lineTo(xx + scale, zz + scale);
            }
            if (side === "left") {
              ctx.moveTo(xx, zz);
              ctx.lineTo(xx, zz + scale);
            }
            if (side === "right") {
              ctx.moveTo(xx + scale, zz);
              ctx.lineTo(xx + scale, zz + scale);
            }
            ctx.stroke();
            for (const part of openingPieces(x, z, side)) {
              let horizontal = side === "back" || side === "front",
                axis = horizontal ? x : z,
                a = (part.a - axis) * scale,
                b = (part.b - axis) * scale;
              ctx.lineWidth = part.key === selectedOpening ? 10 : 7;
              ctx.strokeStyle =
                part.key === selectedOpening
                  ? "#3c8c83"
                  : part.data.type === "window"
                    ? "#8ab9b8"
                    : "#d2a16b";
              ctx.beginPath();
              if (horizontal) {
                const y = side === "back" ? zz : zz + scale;
                ctx.moveTo(xx + a, y);
                ctx.lineTo(xx + b, y);
              } else {
                const q = side === "left" ? xx : xx + scale;
                ctx.moveTo(q, zz + a);
                ctx.lineTo(q, zz + b);
              }
              ctx.stroke();
            }
          }
      }
    objects.forEach((o) => {
      let [w, d, ox = 0, oz = 0] = getFootprint(o);
      ctx.save();
      ctx.translate(px(o.position.x), pz(o.position.z));
      ctx.rotate(-o.rotation.y);
      ctx.translate(ox * scale, oz * scale);
      ctx.fillStyle = warnings.has(o)
        ? "#e6b49c"
        : o === selected
          ? "#537b5e"
          : "#a7bda7";
      ctx.strokeStyle = warnings.has(o)
        ? "#ba6545"
        : o === selected
          ? "#355c3f"
          : "#829e87";
      ctx.lineWidth = 2;
      ctx.fillRect((-w * scale) / 2, (-d * scale) / 2, w * scale, d * scale);
      ctx.strokeRect((-w * scale) / 2, (-d * scale) / 2, w * scale, d * scale);
      ctx.fillStyle = o === selected ? "#fff" : "#48644d";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[o.userData.type], 0, 0);
      ctx.restore();
    });
    if (planTool === "select" && !placementType) {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#587d60";
      ctx.lineWidth = 2;
      [
        [0, -D / 2],
        [0, D / 2],
        [-W / 2, 0],
        [W / 2, 0],
      ].forEach(([x, z]) => {
        ctx.beginPath();
        ctx.arc(px(x), pz(z), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
    if (resizeDrag) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "#698f6d";
      ctx.lineWidth = 3;
      ctx.strokeRect(px(-W / 2), pz(-D / 2), W * scale, D * scale);
      ctx.beginPath();
      let v = resizeDrag.current;
      if (resizeDrag.side === "left" || resizeDrag.side === "right") {
        ctx.moveTo(px(v), pz(-D / 2));
        ctx.lineTo(px(v), pz(D / 2));
      } else {
        ctx.moveTo(px(-W / 2), pz(v));
        ctx.lineTo(px(W / 2), pz(v));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
}
