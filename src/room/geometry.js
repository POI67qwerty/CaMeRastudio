// 部屋・家具で共有する基本形と、辺の線画を生成する。
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
export function createGeometryTools(viewport, getLineWidth) {
  const mat = (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      side: THREE.FrontSide,
    });
  function makeEdges(geometry, threshold = 30) {
    const source = new THREE.EdgesGeometry(geometry, threshold);
    const geo = new LineSegmentsGeometry().fromEdgesGeometry(source);
    source.dispose();
    const material = new LineMaterial({
      color: 0x262c29,
      linewidth: getLineWidth(),
      transparent: true,
      opacity: 0.9,
    });
    material.resolution.set(viewport.clientWidth, viewport.clientHeight);
    const line = new LineSegments2(geo, material);
    line.visible = false;
    line.userData.outline = true;
    return line;
  }
  function box(parent, w, h, d, x, y, z, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z);
    mesh.userData.baseColor = color;
    mesh.add(makeEdges(mesh.geometry));
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, rt, rb, h, x, y, z, color) {
    let mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, 12),
      mat(color),
    );
    mesh.position.set(x, y, z);
    mesh.userData.baseColor = color;
    mesh.add(makeEdges(mesh.geometry));
    parent.add(mesh);
    return mesh;
  }
  function primitive(spec) {
    let g = new THREE.Group(),
      geom;
    if (spec.kind === "box")
      geom = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
    else if (spec.kind === "cylinder")
      geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    else geom = new THREE.SphereGeometry(0.5, 24, 16);
    let mesh = new THREE.Mesh(geom, mat(spec.color));
    mesh.userData.baseColor = spec.color;
    mesh.position.y = spec.h / 2;
    if (spec.kind !== "box") mesh.scale.set(spec.w, spec.h, spec.d);
    mesh.add(makeEdges(mesh.geometry, spec.kind === "sphere" ? 15 : 25));
    g.add(mesh);
    g.userData.primitive = { ...spec };
    g.userData.footprint = [spec.w, spec.d, 0, 0];
    return g;
  }

  return { mat, makeEdges, box, cylinder, primitive };
}
