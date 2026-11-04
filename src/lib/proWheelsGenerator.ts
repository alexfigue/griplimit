import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ProRimStyle =
  | 'split'
  | 'turbine'
  | 'mesh'
  | 'blade'
  | 'classic'
  | 'cover';

export interface ProWheelSpec {
  x: number;
  y: number;
  z: number;
  r: number;
  w: number;
  rim?: number;
  slick?: boolean;
  whitewall?: number;
  wallColor?: string;
}

export interface CarWheelVisualPreset {
  rimStyle: ProRimStyle;
  rimColorHex: number;
  rimMetalness: number;
  rimRoughness: number;
  caliperColorHex: number;
  slick?: boolean;
  stripeBand?: number;
  stripeColorHex?: number;
}

export const WHEEL_PRESETS_BY_CAR_ID: Record<string, CarWheelVisualPreset> = {
  enduro: {
    rimStyle: 'mesh',
    rimColorHex: 0xe5c158, // Porsche GT3 RS Satin Neodyme Gold BBS Mesh
    rimMetalness: 0.88,
    rimRoughness: 0.2,
    caliperColorHex: 0xd91b2e,
    slick: false,
    stripeBand: 0.015,
    stripeColorHex: 0xfacc15,
  },
  razor: {
    rimStyle: 'split',
    rimColorHex: 0xe2e8f0, // Lamborghini Huracán GT3 Forged Y-Spoke
    rimMetalness: 0.92,
    rimRoughness: 0.16,
    caliperColorHex: 0xf97316,
    slick: false,
    stripeBand: 0.015,
    stripeColorHex: 0xef4444,
  },
  specter: {
    rimStyle: 'turbine',
    rimColorHex: 0xcbd5e1, // McLaren Senna GTR 12-Blade Aero Turbine
    rimMetalness: 0.9,
    rimRoughness: 0.18,
    caliperColorHex: 0xf97316,
    slick: true,
    stripeBand: 0.015,
    stripeColorHex: 0x38bdf8,
  },
  kaido: {
    rimStyle: 'blade',
    rimColorHex: 0xd4af37, // Skyline R34 Volk TE37 / Nismo Forged Bronze-Gold
    rimMetalness: 0.86,
    rimRoughness: 0.22,
    caliperColorHex: 0xf59e0b,
    slick: false,
  },
  apogee: {
    rimStyle: 'split',
    rimColorHex: 0xf1f5f9, // Ford GT Le Mans Forged Alloy
    rimMetalness: 0.92,
    rimRoughness: 0.15,
    caliperColorHex: 0x0284c7,
    slick: true,
    stripeBand: 0.015,
    stripeColorHex: 0xf8fafc,
  },
  touge: {
    rimStyle: 'classic',
    rimColorHex: 0xcbd5e1, // AE86 RS Watanabe 8-Spoke Classic
    rimMetalness: 0.84,
    rimRoughness: 0.24,
    caliperColorHex: 0xef4444,
    slick: false,
  },
  monoposto: {
    rimStyle: 'cover',
    rimColorHex: 0x94a3b8, // F1 Monoposto Aero Rim + Center-Lock
    rimMetalness: 0.85,
    rimRoughness: 0.22,
    caliperColorHex: 0xdc2626,
    slick: true,
    stripeBand: 0.018,
    stripeColorHex: 0xf2c40f,
  },
};

const geoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(
  key: string,
  factory: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = factory();
    geoCache.set(key, g);
  }
  return g;
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function defaultRimRadius(r: number): number {
  return Math.max(0.12, r - 0.084);
}

/**
 * Torno axial alrededor del eje X (cara exterior de la llanta mirando hacia +X).
 */
function latheAroundAxle(
  profile: ReadonlyArray<readonly [number, number]>,
  segments: number
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([radius, axial]) => new THREE.Vector2(radius, axial)),
    segments
  );
  g.rotateZ(-Math.PI / 2); // Eje Y de Lathe -> Eje X del eje de rueda
  return g;
}

function bakeVertexAO(
  g: THREE.BufferGeometry,
  aoFn: (x: number, y: number, z: number) => number
): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = aoFn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = v;
    c[i * 3 + 1] = v;
    c[i * 3 + 2] = v;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ng.computeVertexNormals();
  return ng;
}

/**
 * Proyecta una extrusión 2D (en XY con profundidad Z) sobre la cara cóncava `face(rho)` de la llanta.
 */
function mapSpokeToWheelDish(
  g: THREE.BufferGeometry,
  face: (rho: number) => number,
  depth: number
): THREE.BufferGeometry {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i);
    const sy = p.getY(i);
    const sz = p.getZ(i);
    const rho = Math.hypot(sx, sy) || 1e-6;
    const df = (face(rho + 1e-4) - face(rho - 1e-4)) / 2e-4;
    p.setXYZ(i, face(rho) - depth + sz, sx, sy);
    const nx = n.getZ(i);
    const ny = n.getX(i) - df * (sx / rho) * n.getZ(i);
    const nz = n.getY(i) - df * (sy / rho) * n.getZ(i);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

function createSpokeShape(
  thetaFn: (t: number) => number,
  halfWidthFn: (t: number) => number,
  rIn: number,
  rOut: number,
  steps: number
): THREE.Shape {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  const pointAt = (t: number): [number, number] => {
    const rho = rIn + (rOut - rIn) * t;
    const th = thetaFn(t);
    return [rho * Math.cos(th), rho * Math.sin(th)];
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [px, py] = pointAt(t);
    const [qx, qy] = pointAt(Math.min(1, t + 0.01));
    const [ox, oy] = pointAt(Math.max(0, t - 0.01));
    let tx = qx - ox;
    let ty = qy - oy;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const h = halfWidthFn(t);
    left.push(new THREE.Vector2(px - ty * h, py + tx * h));
    right.push(new THREE.Vector2(px + ty * h, py - tx * h));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

type SpokeAdder = (
  thetaFn: (t: number) => number,
  halfWidthFn: (t: number) => number,
  rIn: number,
  rOut: number,
  steps: number
) => void;

const RIM_SPOKE_BUILDERS: Record<
  ProRimStyle,
  (add: SpokeAdder, hub: number, lip: number) => void
> = {
  split: (add, hub, lip) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(() => a, (t) => 0.024 - 0.01 * t, hub * 0.8, hub + 0.035, 4);
      for (const s of [-1, 1]) {
        add(
          (t) => a + s * (0.02 + 0.13 * t),
          (t) => 0.0125 - 0.0035 * t,
          hub + 0.01,
          lip,
          12
        );
      }
    }
  },
  turbine: (add, hub, lip) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add(
        (t) => a + 0.5 * t * t,
        (t) => 0.0095 + 0.005 * t,
        hub * 0.85,
        lip,
        14
      );
    }
  },
  mesh: (add, hub, lip) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (const s of [-1, 1]) {
        add((t) => a + s * 0.3 * t, () => 0.0065, hub * 0.85, lip, 12);
      }
    }
  },
  blade: (add, hub, lip) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(
        (t) => a + 0.16 * t,
        (t) => 0.019 + 0.026 * t * t,
        hub * 0.85,
        lip,
        12
      );
    }
  },
  classic: (add, hub, lip) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(() => a, (t) => 0.0125 + 0.008 * t, hub * 0.85, lip, 6);
    }
  },
  cover: () => {},
};

/**
 * Geometría 3D del neumático con hombros redondeados, flancos abombados, 4 surcos de banda de rodadura
 * (o liso slick) y oclusión ambiental en vértices.
 */
export function getProTyreGeometry(
  r: number,
  w: number,
  rim = defaultRimRadius(r),
  slick = false
): THREE.BufferGeometry {
  return cachedGeo(`tyre|${r}|${w}|${rim}|${slick}`, () => {
    const hw = w / 2;
    const sh = 0.028;
    const prof: Array<[number, number]> = [
      [rim + 0.002, -hw + 0.018],
      [rim + 0.012, -hw + 0.006],
      [rim + 0.03, -hw + 0.001],
      [(rim + r) / 2, -hw - 0.005],
      [r - sh * 1.1, -hw - 0.002],
      [r - sh * 0.45, -hw + sh * 0.3],
      [r - 0.005, -hw + sh * 0.8],
      [r, -hw + sh * 1.15],
    ];
    if (!slick) {
      for (const gq of [-0.3, -0.1, 0.1, 0.3]) {
        const c = gq * w;
        prof.push(
          [r, c - 0.008],
          [r - 0.007, c - 0.005],
          [r - 0.007, c + 0.005],
          [r, c + 0.008]
        );
      }
    }
    prof.push(
      [r, hw - sh * 1.15],
      [r - 0.005, hw - sh * 0.8],
      [r - sh * 0.45, hw - sh * 0.3],
      [r - sh * 1.1, hw + 0.002],
      [(rim + r) / 2, hw + 0.005],
      [rim + 0.03, hw - 0.001],
      [rim + 0.012, hw - 0.006],
      [rim + 0.002, hw - 0.018]
    );
    return bakeVertexAO(
      latheAroundAxle(prof, 64),
      (x) => 0.45 + 0.55 * smooth(-hw, hw, x)
    );
  });
}

/**
 * Banda circular coloreada en el flanco exterior del neumático (Pirelli P-Zero F1/GT3 o Whitewall).
 */
export function getProSidewallStripeGeometry(
  r: number,
  w: number,
  rim = defaultRimRadius(r),
  band = 0.018
): THREE.BufferGeometry {
  return cachedGeo(`stripe|${r}|${w}|${rim}|${band}`, () => {
    const hw = w / 2;
    const wall: Array<[number, number]> = [
      [rim + 0.012, hw - 0.006],
      [rim + 0.03, hw - 0.001],
      [(rim + r) / 2, hw + 0.005],
      [r - 0.028 * 1.1, hw + 0.002],
    ];
    const axialAt = (rho: number): number => {
      let i = 1;
      while (i < wall.length - 1 && rho > wall[i][0]) i++;
      const [r0, a0] = wall[i - 1];
      const [r1, a1] = wall[i];
      return a0 + ((a1 - a0) * (rho - r0)) / (r1 - r0);
    };
    const inner = rim + 0.022;
    const outer = Math.min(inner + band, r - 0.045);
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 6; i++) {
      const rho = outer + ((inner - outer) * i) / 6;
      prof.push([rho, axialAt(rho) + 0.0018]);
    }
    return bakeVertexAO(latheAroundAxle(prof, 64), () => 0.96);
  });
}

/**
 * Geometría 3D de llanta forjada cóncava con garganta escalonada, radios biselados 3D, buje y tuercas.
 */
export function getProRimGeometry(
  style: ProRimStyle,
  r: number,
  w: number,
  rim = defaultRimRadius(r)
): THREE.BufferGeometry {
  return cachedGeo(`rim|${style}|${r}|${w}|${rim}`, () => {
    const hw = w / 2;
    const lipFace = hw - 0.012;
    const dish = Math.min(0.06, w * 0.2);
    const hub = 0.074;
    const lip = rim - 0.012;
    const face = (rho: number) =>
      lipFace - dish * Math.pow(1 - smooth(hub, lip, rho) * 0.999, 1.4) - 0.003;

    const parts: THREE.BufferGeometry[] = [];

    // 1. Labio exterior y barril de aleación (Lathe)
    parts.push(
      latheAroundAxle(
        [
          [rim + 0.013, hw - 0.024],
          [rim + 0.013, hw - 0.012],
          [rim + 0.008, hw - 0.005],
          [rim - 0.004, hw - 0.003],
          [rim - 0.016, hw - 0.007],
          [rim - 0.021, hw - 0.016],
          [rim - 0.021, -hw + 0.03],
          [rim - 0.012, -hw + 0.014],
        ],
        64
      )
    );

    // 2. Radios 3D extruidos con bisel y curvados hacia el interior cóncavo de la llanta
    const depth = 0.024;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelOffset: 0,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 1,
    };

    RIM_SPOKE_BUILDERS[style](
      (thetaFn, halfWidthFn, rIn, rOut, steps) => {
        const g = new THREE.ExtrudeGeometry(
          createSpokeShape(thetaFn, halfWidthFn, rIn, rOut, steps),
          extrudeSettings
        );
        parts.push(mapSpokeToWheelDish(g, face, depth));
      },
      hub,
      lip
    );

    if (style === 'cover') {
      const back = lipFace - 0.03;
      parts.push(
        latheAroundAxle(
          [
            [lip + 0.004, lipFace - 0.01],
            [lip - 0.008, lipFace - 0.005],
            [hub + 0.014, lipFace - 0.008],
            [hub * 0.78, back],
            [0.004, back],
          ],
          64
        )
      );
      const nut = new THREE.CylinderGeometry(0.034, 0.038, 0.03, 6);
      nut.rotateZ(-Math.PI / 2);
      nut.translate(back + 0.015, 0, 0);
      parts.push(nut);
    } else {
      const hubFace = face(hub) + 0.002;
      const hubDisc = new THREE.CylinderGeometry(
        hub + 0.006,
        hub + 0.012,
        0.03,
        32
      );
      hubDisc.rotateZ(-Math.PI / 2);
      hubDisc.translate(hubFace - 0.015, 0, 0);
      parts.push(hubDisc);

      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
        const nut = new THREE.CylinderGeometry(0.0095, 0.0105, 0.02, 6);
        nut.rotateZ(-Math.PI / 2);
        nut.translate(hubFace + 0.006, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        parts.push(nut);
      }

      const cap = new THREE.CylinderGeometry(0.027, 0.031, 0.012, 24);
      cap.rotateZ(-Math.PI / 2);
      cap.translate(hubFace + 0.005, 0, 0);
      parts.push(cap);
    }

    const nonIndexedParts = parts.map((g) => {
      g.deleteAttribute('uv');
      return g.index ? g.toNonIndexed() : g;
    });

    const merged = mergeGeometries(nonIndexedParts, false);
    return bakeVertexAO(merged, (x, y, z) => {
      const rho = Math.hypot(y, z);
      const depthAo = 0.32 + 0.68 * smooth(-hw, lipFace - 0.02, x);
      const hubAo = 0.8 + 0.2 * smooth(hub * 0.5, hub * 1.6, rho);
      return depthAo * hubAo;
    });
  });
}

function getBrakeDiscAxialCenter(w: number): number {
  const hw = w / 2;
  const dish = Math.min(0.06, w * 0.2);
  return hw - 0.012 - dish - 0.075;
}

/**
 * Disco de freno ventilado con campana central mecanizada.
 */
export function getProBrakeDiscGeometry(
  r: number,
  w: number,
  rim = defaultRimRadius(r)
): THREE.BufferGeometry {
  return cachedGeo(`disc|${r}|${w}|${rim}`, () => {
    const rd = rim - 0.055;
    const ri = Math.min(0.11, rd * 0.62);
    const t = 0.034;
    const c = getBrakeDiscAxialCenter(w);
    const ring = latheAroundAxle(
      [
        [ri, c - t / 2 + 0.002],
        [ri + 0.002, c - t / 2],
        [rd - 0.002, c - t / 2],
        [rd, c - t / 2 + 0.002],
        [rd, c + t / 2 - 0.002],
        [rd - 0.002, c + t / 2],
        [ri + 0.002, c + t / 2],
        [ri, c + t / 2 - 0.002],
      ],
      48
    );
    const hat = latheAroundAxle(
      [
        [ri + 0.002, c - t / 2],
        [ri - 0.005, c + t / 2 + 0.03],
        [ri * 0.64, c + t / 2 + 0.036],
        [0.0, c + t / 2 + 0.036],
      ],
      32
    );
    const merged = mergeGeometries(
      [ring, hat].map((p) => {
        p.deleteAttribute('uv');
        return p.index ? p.toNonIndexed() : p;
      }),
      false
    );
    return bakeVertexAO(merged, (_x, y, z) => {
      const rho = Math.hypot(y, z);
      return rho > ri + 0.01 && rho < rd - 0.008 ? 0.88 : 0.45;
    });
  });
}

/**
 * Pinza de freno Brembo/AP Racing de 6 pistones (permanece estática respecto a la mangueta mientras gira el disco).
 */
export function getProBrakeCaliperGeometry(
  r: number,
  w: number,
  rim = defaultRimRadius(r)
): THREE.BufferGeometry {
  return cachedGeo(`caliper|${r}|${w}|${rim}`, () => {
    const rd = rim - 0.055;
    const rIn = rd - 0.06;
    const rOut = rd + 0.016;
    const a0 = -0.42;
    const a1 = 0.42;
    const pts: THREE.Vector2[] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(rOut * Math.cos(a), rOut * Math.sin(a)));
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(rIn * Math.cos(a), rIn * Math.sin(a)));
    }
    const depth = 0.064;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.007,
      bevelSegments: 2,
      curveSegments: 1,
    });
    const c = getBrakeDiscAxialCenter(w);
    mapSpokeToWheelDish(g, () => c + depth / 2 + 0.008, depth);
    g.rotateX(-Math.PI * 0.32);
    g.deleteAttribute('uv');
    return bakeVertexAO(g, (x) => 0.75 + 0.25 * smooth(c - 0.04, c + 0.04, x));
  });
}

const SHARED_TYRE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x16181d,
  roughness: 0.78,
  metalness: 0.06,
  vertexColors: true,
});

const SHARED_DISC_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  roughness: 0.28,
  metalness: 0.88,
  vertexColors: true,
});

export interface AssembledProWheel {
  /** Grupo raíz colocado en (x, y, z) que contiene la pinza estática y el subgrupo giratorio */
  rootGroup: THREE.Group;
  /** Subgrupo que gira con ω = v / r (neumático, flanco, llanta y disco de freno) */
  spinGroup: THREE.Group;
}

/**
 * Construye una rueda completa de competición 3D para un eje concreto.
 * - `xSign`: `1` para el lado +X del coche (cara exterior hacia +X), `-1` para el lado -X (cara exterior hacia -X).
 */
export function buildProMotorsportWheel(
  spec: ProWheelSpec,
  carDesignId: string | undefined,
  xSign: 1 | -1,
  isGhost: boolean,
  ghostMaterial: THREE.Material,
  customDiscMaterial?: THREE.MeshStandardMaterial
): AssembledProWheel {
  const rootGroup = new THREE.Group();
  const spinGroup = new THREE.Group();
  rootGroup.add(spinGroup);

  const r = spec.r || 0.33;
  const w = spec.w || 0.28;
  const rimR = spec.rim ?? defaultRimRadius(r);

  const preset =
    WHEEL_PRESETS_BY_CAR_ID[carDesignId ?? 'enduro'] ??
    WHEEL_PRESETS_BY_CAR_ID.enduro;
  const isSlick = spec.slick ?? preset.slick ?? false;

  // Sub-orientación para que la cara exterior (+X en coordenadas de rueda) apunte siempre hacia fuera del coche
  const sideOrientationY = xSign === 1 ? 0 : Math.PI;

  const tyreGeo = getProTyreGeometry(r, w, rimR, isSlick);
  const rimGeo = getProRimGeometry(preset.rimStyle, r, w, rimR);

  if (isGhost) {
    const ghostTire = new THREE.Mesh(tyreGeo, ghostMaterial);
    const ghostRim = new THREE.Mesh(rimGeo, ghostMaterial);
    ghostTire.rotation.y = sideOrientationY;
    ghostRim.rotation.y = sideOrientationY;
    spinGroup.add(ghostTire, ghostRim);
    return { rootGroup, spinGroup };
  }

  // 1. Neumático con hombros redondeados y surcos 3D
  const tyreMesh = new THREE.Mesh(tyreGeo, SHARED_TYRE_MATERIAL);
  tyreMesh.rotation.y = sideOrientationY;
  tyreMesh.castShadow = true;
  tyreMesh.receiveShadow = true;
  spinGroup.add(tyreMesh);

  // 2. Banda lateral de competición (Pirelli P-Zero / Michelin / F1 Soft)
  const stripeBand = spec.whitewall ?? preset.stripeBand ?? 0;
  const stripeColor = spec.wallColor
    ? new THREE.Color(spec.wallColor).getHex()
    : preset.stripeColorHex;
  if (stripeBand > 0 && stripeColor !== undefined) {
    const stripeGeo = getProSidewallStripeGeometry(r, w, rimR, stripeBand);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: stripeColor,
      roughness: 0.5,
      metalness: 0.1,
      vertexColors: true,
    });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.rotation.y = sideOrientationY;
    spinGroup.add(stripeMesh);
  }

  // 3. Llanta forjada cóncava multi-radio con tuercas y buje
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: preset.rimColorHex,
    metalness: preset.rimMetalness,
    roughness: preset.rimRoughness,
    clearcoat: 0.65,
    clearcoatRoughness: 0.12,
    vertexColors: true,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.rotation.y = sideOrientationY;
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  spinGroup.add(rimMesh);

  // 4. Disco de freno cerámico/acero (gira solidario con la rueda y se pone al rojo vivo en frenadas fuertes)
  const discGeo = getProBrakeDiscGeometry(r, w, rimR);
  const discMesh = new THREE.Mesh(
    discGeo,
    customDiscMaterial ?? SHARED_DISC_MATERIAL
  );
  discMesh.rotation.y = sideOrientationY;
  spinGroup.add(discMesh);

  // 5. Pinza de freno de 6 pistones (permanece fija en rootGroup sin girar con spinGroup)
  const caliperGeo = getProBrakeCaliperGeometry(r, w, rimR);
  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: preset.caliperColorHex,
    metalness: 0.65,
    roughness: 0.22,
    clearcoat: 0.85,
    vertexColors: true,
  });
  const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
  caliperMesh.rotation.y = sideOrientationY;
  rootGroup.add(caliperMesh);

  return { rootGroup, spinGroup };
}
