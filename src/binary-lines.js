import * as THREE from "three";

// 漫画用の試作：通常画像を単に白黒にするのでなく、
// 3Dの法線・深度・物体IDを別画像に描き、隣接画素の差から線を作ります。
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const edgeShader = `
  varying vec2 vUv;
  uniform sampler2D uNormals;
  uniform sampler2D uDepth;
  uniform sampler2D uIds;
  uniform vec2 uPixel;
  uniform float uNear;
  uniform float uFar;
  uniform float uDepthLimit;
  uniform float uNormalLimit;
  uniform bool uUseIds;

  float cameraDistance(float depth) {
    return (uNear * uFar) / max(uFar - depth * (uFar - uNear), 0.00001);
  }
  float comparePixel(vec2 uv, vec4 centerNormal, float centerDepth, vec3 centerId) {
    vec4 n = texture2D(uNormals, uv);
    // オブジェクトから背景に変わる部分＝シルエット。
    if (n.a < 0.5) return 1.0;
    float d = cameraDistance(texture2D(uDepth, uv).x);
    float relativeDepth = abs(centerDepth - d) / max(min(centerDepth, d), 0.0001);
    float normalDifference = 1.0 - clamp(dot(normalize(centerNormal.rgb * 2.0 - 1.0),
                                              normalize(n.rgb * 2.0 - 1.0)), -1.0, 1.0);
    float idDifference = length(centerId - texture2D(uIds, uv).rgb);
    if (relativeDepth > uDepthLimit || normalDifference > uNormalLimit ||
        (uUseIds && idDifference > 0.0015)) return 1.0;
    return 0.0;
  }
  void main() {
    vec4 n = texture2D(uNormals, vUv);
    if (n.a < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float d = cameraDistance(texture2D(uDepth, vUv).x);
    vec3 id = texture2D(uIds, vUv).rgb;
    float edge = 0.0;
    edge = max(edge, comparePixel(vUv + vec2(uPixel.x, 0.0), n, d, id));
    edge = max(edge, comparePixel(vUv - vec2(uPixel.x, 0.0), n, d, id));
    edge = max(edge, comparePixel(vUv + vec2(0.0, uPixel.y), n, d, id));
    edge = max(edge, comparePixel(vUv - vec2(0.0, uPixel.y), n, d, id));
    gl_FragColor = vec4(edge, edge, edge, 1.0);
  }
`;

const binaryShader = `
  varying vec2 vUv;
  uniform sampler2D uEdges;
  uniform vec2 uPixel;
  uniform float uWidth;
  void main() {
    // 固定範囲で線を広げる。画素単位のため、太さは段階的に変わる。
    float radius = floor(max(uWidth - 1.0, 0.0) * 0.5 + 0.5);
    float edge = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        if (max(abs(float(x)), abs(float(y))) <= radius) {
          edge = max(edge, texture2D(uEdges, vUv + vec2(float(x), float(y)) * uPixel).r);
        }
      }
    }
    // 中間色を出さない。不透明な白または黒だけ。
    float value = edge > 0.5 ? 0.0 : 1.0;
    gl_FragColor = vec4(value, value, value, 1.0);
  }
`;

function target(depthTexture = false) {
  const result = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: depthTexture,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  if (depthTexture) {
    result.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    result.depthTexture.minFilter = THREE.NearestFilter;
    result.depthTexture.magFilter = THREE.NearestFilter;
  }
  return result;
}

export class BinaryLineRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.normalTarget = target(true);
    this.idTarget = target(true);
    this.edgeTarget = target(false);
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.ids = new Map();
    this.meshIds = new WeakMap();
    this.nextMeshId = 1;
    this.pixel = new THREE.Vector2(1, 1);
    this.size = new THREE.Vector2();
    this.clearColor = new THREE.Color();
    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.edgeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: edgeShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uNormals: { value: this.normalTarget.texture },
        uDepth: { value: this.normalTarget.depthTexture },
        uIds: { value: this.idTarget.texture },
        uPixel: { value: this.pixel },
        uNear: { value: 0.05 },
        uFar: { value: 200 },
        uDepthLimit: { value: 0.025 },
        uNormalLimit: { value: 0.15 },
        uUseIds: { value: true },
      },
    });
    this.binaryMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: binaryShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uEdges: { value: this.edgeTarget.texture },
        uPixel: { value: this.pixel },
        uWidth: { value: 1 },
      },
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.edgeMaterial,
    );
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);
  }

  resize() {
    this.renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.floor(this.size.x));
    const height = Math.max(1, Math.floor(this.size.y));
    if (
      this.normalTarget.width === width &&
      this.normalTarget.height === height
    )
      return;
    this.normalTarget.setSize(width, height);
    this.idTarget.setSize(width, height);
    this.edgeTarget.setSize(width, height);
    this.pixel.set(1 / width, 1 / height);
  }

  idMaterial(id, doubleSided) {
    let material = this.ids.get(id);
    if (!material) {
      // RGBA8で区別できるよう24bitの整数を3つの色に分ける。
      const n = ((id + 1) * 2654435761) >>> 0;
      const color = new THREE.Color().setRGB(
        ((n >>> 16) & 255) / 255,
        ((n >>> 8) & 255) / 255,
        (n & 255) / 255,
      );
      material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      this.ids.set(id, material);
    }
    material.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    return material;
  }

  render(scene, camera, objects, room, selectedBox, settings) {
    this.resize();
    const r = this.renderer;
    const oldTarget = r.getRenderTarget();
    const oldBackground = scene.background;
    const oldOverride = scene.overrideMaterial;
    r.getClearColor(this.clearColor);
    const oldAlpha = r.getClearAlpha();
    const oldSelectedVisible = selectedBox?.visible;
    const changed = [];
    try {
      if (selectedBox) selectedBox.visible = false;
      scene.background = null;
      r.setClearColor(0x000000, 0);
      this.normalMaterial.side = settings.doubleSided
        ? THREE.DoubleSide
        : THREE.FrontSide;
      scene.overrideMaterial = this.normalMaterial;
      r.setRenderTarget(this.normalTarget);
      r.clear();
      r.render(scene, camera);

      // 同じ家具の部品には同じIDを与え、異なる家具との境目を検出する。
      scene.overrideMaterial = null;
      scene.traverseVisible((node) => {
        if (!node.isMesh || node.userData.outline) return;
        let root = node;
        while (root.parent && root.parent !== scene) root = root.parent;
        if (root !== room && !objects.includes(root)) return;
        let id = root === room ? 0 : root.userData.id;
        // 単独モデルのビューアーでは、GLB内の別メッシュの境界も検出できる。
        if (settings.perMeshIds && root !== room) {
          if (!this.meshIds.has(node))
            this.meshIds.set(node, this.nextMeshId++);
          id = this.meshIds.get(node);
        }
        changed.push([node, node.material]);
        node.material = this.idMaterial(id, settings.doubleSided);
      });
      r.setRenderTarget(this.idTarget);
      r.clear();
      r.render(scene, camera);
      changed.forEach(([mesh, material]) => {
        mesh.material = material;
      });
      changed.length = 0;

      const u = this.edgeMaterial.uniforms;
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uDepthLimit.value = settings.depthLimit;
      u.uNormalLimit.value = settings.normalLimit;
      u.uUseIds.value = settings.useIds;
      this.quad.material = this.edgeMaterial;
      r.setRenderTarget(this.edgeTarget);
      r.clear();
      r.render(this.fullscreenScene, this.fullscreenCamera);

      this.binaryMaterial.uniforms.uWidth.value = settings.width;
      this.quad.material = this.binaryMaterial;
      r.setRenderTarget(oldTarget);
      r.clear();
      r.render(this.fullscreenScene, this.fullscreenCamera);
    } finally {
      changed.forEach(([mesh, material]) => {
        mesh.material = material;
      });
      scene.overrideMaterial = oldOverride;
      scene.background = oldBackground;
      if (selectedBox) selectedBox.visible = oldSelectedVisible;
      r.setClearColor(this.clearColor, oldAlpha);
      r.setRenderTarget(oldTarget);
    }
  }
}
