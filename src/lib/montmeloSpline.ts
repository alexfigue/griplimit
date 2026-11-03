import * as THREE from 'three';
import type { BrakeAdviceLevel, LaneId, TrackId } from '@/types/types';

/** Separación lateral desde el eje central para cada carril de Scalextric (m) */
export const DUAL_LANE_OFFSET_M = 1.25;

export function getLaneLateralOffsetM(lane: LaneId): number {
  return lane === 'left' ? -DUAL_LANE_OFFSET_M : DUAL_LANE_OFFSET_M;
}

/**
 * CIRCUITO 1: Circuit de Barcelona-Catalunya (Montmeló) — Sentido horario.
 */
export const MONTMELO_WAYPOINTS: THREE.Vector3[] = [
  new THREE.Vector3(25, 0.0, 42),
  new THREE.Vector3(-32, 0.0, 42),
  new THREE.Vector3(-82, 0.0, 42),

  // T1 & T2 — Esses "Elf"
  new THREE.Vector3(-101, 0.2, 37),
  new THREE.Vector3(-109, 0.5, 25),
  new THREE.Vector3(-119, 1.0, 14),

  // T3 — "Curva Renault"
  new THREE.Vector3(-133, 2.0, -4),
  new THREE.Vector3(-130, 3.1, -28),
  new THREE.Vector3(-108, 3.9, -46),
  new THREE.Vector3(-80, 4.0, -48),

  // T4 — "Repsol"
  new THREE.Vector3(-56, 3.5, -41),
  new THREE.Vector3(-47, 2.6, -24),
  new THREE.Vector3(-58, 1.8, -11),

  // T5 — "Seat"
  new THREE.Vector3(-75, 1.0, -4),
  new THREE.Vector3(-86, 0.4, 8),
  new THREE.Vector3(-77, 0.3, 19),
  new THREE.Vector3(-54, 0.6, 19),

  // T6, T7 & T8 — Subida "Würth"
  new THREE.Vector3(-30, 1.3, 12),
  new THREE.Vector3(-17, 2.2, -1),
  new THREE.Vector3(-16, 3.3, -20),
  new THREE.Vector3(-8, 4.1, -38),

  // T9 — "Campsa"
  new THREE.Vector3(11, 4.5, -48),
  new THREE.Vector3(31, 4.1, -40),

  // Recta de Atrás
  new THREE.Vector3(47, 2.7, -25),
  new THREE.Vector3(62, 1.3, -11),

  // T10 & T11 — "La Caixa"
  new THREE.Vector3(74, 0.6, -6),
  new THREE.Vector3(84, 0.7, -14),
  new THREE.Vector3(87, 0.9, -28),

  // T12 — "Banc Sabadell"
  new THREE.Vector3(101, 1.1, -38),
  new THREE.Vector3(119, 0.9, -25),

  // T13 & T14 — "Europcar" y "New Holland"
  new THREE.Vector3(125, 0.5, 0),
  new THREE.Vector3(116, 0.2, 26),
  new THREE.Vector3(96, 0.0, 40),
  new THREE.Vector3(68, 0.0, 42),
];

/**
 * CIRCUITO 2: Sierra Seca Raceway (Inspirado en Laguna Seca) — Sentido antihorario.
 * Incluye horquilla doble Andretti, gran ascenso Rahal hasta +14.4 m de altitud,
 * cresta ciega y el mítico SACACORCHOS (caída del 25% enlazando izquierda-derecha),
 * seguido de la bajada rápida Rainey.
 */
export const SIERRA_SECA_WAYPOINTS: THREE.Vector3[] = [
  // Recta Principal con rasante rápido T1
  new THREE.Vector3(-20, 0.0, 44), // Salida / Meta
  new THREE.Vector3(35, 0.8, 44),  // Rasante rápido T1
  new THREE.Vector3(80, 0.2, 42),  // Frenada Andretti

  // Horquilla "Andretti" (Doble vértice a izquierdas)
  new THREE.Vector3(104, 0.2, 32),
  new THREE.Vector3(108, 0.2, 13),
  new THREE.Vector3(92, 0.3, 1),
  new THREE.Vector3(66, 0.5, 4),

  // Infield técnico en el valle (T3 y T4)
  new THREE.Vector3(38, 0.7, 13),
  new THREE.Vector3(10, 0.9, 11),
  new THREE.Vector3(-6, 1.4, 2),
  new THREE.Vector3(-11, 2.3, -9),

  // Curva 5 y Fuerte Subida "Rahal" hacia la cumbre (+14.4 m)
  new THREE.Vector3(4, 3.6, -18),
  new THREE.Vector3(36, 6.5, -26),
  new THREE.Vector3(70, 10.3, -34),
  new THREE.Vector3(98, 13.0, -48),

  // Cresta Ciega en la cima norte
  new THREE.Vector3(92, 14.2, -64),
  new THREE.Vector3(64, 14.4, -70),

  // EL SACACORCHOS (The Corkscrew): Izquierda ciega -> Caída libre del 25% -> Derecha al fondo
  new THREE.Vector3(42, 13.2, -64), // Entrada ciega a izquierdas
  new THREE.Vector3(31, 9.4, -51),  // Tobogán en picado
  new THREE.Vector3(14, 5.6, -50),  // Cambio brusco a derechas en compresión

  // Curva "Rainey" (Bajada rápida de radio amplio)
  new THREE.Vector3(-18, 3.8, -58),
  new THREE.Vector3(-56, 2.5, -54),
  new THREE.Vector3(-86, 1.6, -36),

  // Peraltada T10 y Horquilla final T11 hacia Meta
  new THREE.Vector3(-102, 1.0, -12),
  new THREE.Vector3(-104, 0.4, 15),
  new THREE.Vector3(-91, 0.1, 35),
  new THREE.Vector3(-64, 0.0, 44),
];

/**
 * CIRCUITO 3: Neo-Wangan Midnight (Inspirado en la Shuto Expressway C1 de Tokio).
 * Autopista urbana nocturna con recta Wangan de velocidad máxima, bucle elevado en viaducto (+9.4 m),
 * ese técnica entre rascacielos y curvón peraltado hacia meta.
 */
export const NEO_WANGAN_WAYPOINTS: THREE.Vector3[] = [
  // Gran Recta Wangan Bayshore
  new THREE.Vector3(-40, 0.0, 50),
  new THREE.Vector3(45, 0.0, 50),
  new THREE.Vector3(115, 0.6, 50),

  // Rampa helicoidal ascendente "Shibaura Loop" (+9.4 m)
  new THREE.Vector3(146, 2.8, 36),
  new THREE.Vector3(154, 5.8, 8),
  new THREE.Vector3(138, 8.4, -18),
  new THREE.Vector3(102, 9.4, -24),
  new THREE.Vector3(62, 8.8, -16),

  // Descenso enlazado entre torres de oficinas "Ginza S-Curves"
  new THREE.Vector3(26, 6.4, -8),
  new THREE.Vector3(-8, 4.0, -16),
  new THREE.Vector3(-22, 2.8, -38),
  new THREE.Vector3(-6, 2.2, -62),

  // Sector norte técnico y horquilla "Edobashi Junction"
  new THREE.Vector3(28, 1.8, -74),
  new THREE.Vector3(72, 1.6, -74),
  new THREE.Vector3(106, 1.4, -92),
  new THREE.Vector3(96, 1.2, -116),
  new THREE.Vector3(56, 1.2, -122),

  // Viaducto exprés de retorno oeste y curvón hacia recta principal
  new THREE.Vector3(4, 2.4, -114),
  new THREE.Vector3(-48, 4.6, -102),
  new THREE.Vector3(-98, 6.6, -86),
  new THREE.Vector3(-134, 5.4, -56),
  new THREE.Vector3(-146, 3.2, -16),
  new THREE.Vector3(-138, 1.4, 22),
  new THREE.Vector3(-112, 0.3, 44),
  new THREE.Vector3(-78, 0.0, 50),
];

export interface CircuitMetadata {
  readonly id: TrackId;
  readonly name: string;
  readonly subtitle: string;
  readonly waypoints: THREE.Vector3[];
  readonly goldTargetMs: number;
  readonly terrainColor: string;
  readonly gridPrimaryColor: string;
  readonly gridSecondaryColor: string;
}

export const CIRCUITS: Record<TrackId, CircuitMetadata> = {
  montmelo: {
    id: 'montmelo',
    name: 'Montmeló GP',
    subtitle: 'Circuit de Catalunya · Curvas largas de apoyo',
    waypoints: MONTMELO_WAYPOINTS,
    goldTargetMs: 18500,
    terrainColor: '#111915',
    gridPrimaryColor: '#1f2937',
    gridSecondaryColor: '#151e27',
  },
  'sierra-seca': {
    id: 'sierra-seca',
    name: 'Sierra Seca',
    subtitle: 'Cumbres y Sacacorchos · Desnivel extremo 14.5 m',
    waypoints: SIERRA_SECA_WAYPOINTS,
    goldTargetMs: 18000,
    terrainColor: '#1D1711',
    gridPrimaryColor: '#2c2219',
    gridSecondaryColor: '#1f1812',
  },
  'neo-wangan': {
    id: 'neo-wangan',
    name: 'Neo-Wangan',
    subtitle: 'Autopista nocturna de Tokio · Viaductos de alta velocidad',
    waypoints: NEO_WANGAN_WAYPOINTS,
    goldTargetMs: 22500,
    terrainColor: '#070B14',
    gridPrimaryColor: '#0ea5e9',
    gridSecondaryColor: '#1e1b4b',
  },
};

export const PREDICTIVE_BRAKE_DECEL_MS2 = 38.0;
const DRIVER_REACTION_TIME_SEC = 0.22;

const curveCache: Partial<Record<TrackId, THREE.CatmullRomCurve3>> = {};

export function createMontmeloCurve(): THREE.CatmullRomCurve3 {
  return getTrackCurve('montmelo');
}

export function getMontmeloCurve(): THREE.CatmullRomCurve3 {
  return getTrackCurve('montmelo');
}

export function getTrackCurve(trackId: TrackId): THREE.CatmullRomCurve3 {
  const existing = curveCache[trackId];
  if (existing) return existing;

  const meta = CIRCUITS[trackId];
  const curve = new THREE.CatmullRomCurve3(
    meta.waypoints,
    true,
    'centripetal',
    0.5
  );
  curve.arcLengthDivisions = 2400;
  curveCache[trackId] = curve;
  return curve;
}

/**
 * Calcula el radio de curvatura físico real de un carril desplazado lateralmente `laneOffsetM`:
 * - En curva a derechas (`turnSign = +1`), el carril derecho (`+1.25 m`) va por el interior: R_ef = R_centro - 1.25
 * - En curva a izquierdas (`turnSign = -1`), el carril izquierdo (`-1.25 m`) va por el interior: R_ef = R_centro - 1.25
 */
export function computeEffectiveLaneRadius(
  centerRadiusM: number,
  turnSign: number,
  laneOffsetM: number
): number {
  if (!Number.isFinite(centerRadiusM) || turnSign === 0) {
    return Infinity;
  }
  return Math.max(2.6, centerRadiusM - turnSign * laneOffsetM);
}

export interface SplineKinematicsResult {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  outwardNormal: THREE.Vector3;
  curvature: number;
  curvatureRadius: number;
  turnSign: number;
}

const _pMinus = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _pPlus = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

const DIFF_EPSILON = 0.0025;
const MIN_CURVATURE_THRESHOLD = 1e-4;

/**
 * Evalúa la geometría diferencial exacta en longitud de arco normalizada `u` ∈ [0, 1).
 */
export function evaluateSplineKinematics(
  curve: THREE.CatmullRomCurve3,
  u: number,
  target: SplineKinematicsResult
): SplineKinematicsResult {
  const wrappedU = ((u % 1) + 1) % 1;
  const t = curve.getUtoTmapping(wrappedU, wrappedU * curve.getLength());

  const tMinus = (t - DIFF_EPSILON + 1) % 1;
  const tPlus = (t + DIFF_EPSILON) % 1;

  curve.getPoint(tMinus, _pMinus);
  curve.getPoint(t, _p0);
  curve.getPoint(tPlus, _pPlus);

  _d1.subVectors(_pPlus, _pMinus).multiplyScalar(0.5 / DIFF_EPSILON);
  _d2
    .copy(_pPlus)
    .addScaledVector(_p0, -2)
    .add(_pMinus)
    .multiplyScalar(1 / (DIFF_EPSILON * DIFF_EPSILON));

  const d1Length = _d1.length();
  target.position.copy(_p0);

  if (d1Length < 1e-6) {
    target.tangent.set(-1, 0, 0);
    target.right.set(0, 0, -1);
    target.outwardNormal.set(0, 0, 1);
    target.curvature = 0;
    target.curvatureRadius = Infinity;
    target.turnSign = 0;
    return target;
  }

  target.tangent.copy(_d1).divideScalar(d1Length);
  target.right.crossVectors(target.tangent, _worldUp).normalize();

  _cross.crossVectors(_d1, _d2);
  const crossLength = _cross.length();
  const curvature = crossLength / (d1Length * d1Length * d1Length);

  target.curvature = curvature;

  if (curvature > MIN_CURVATURE_THRESHOLD) {
    target.curvatureRadius = 1 / curvature;
    target.turnSign = _cross.y < 0 ? 1 : -1;

    const accelAlongTangent = _d2.dot(target.tangent);
    _proj.copy(_d2).addScaledVector(target.tangent, -accelAlongTangent);
    if (_proj.lengthSq() > 1e-8) {
      target.outwardNormal.copy(_proj).normalize().negate();
    } else {
      target.outwardNormal.set(-target.tangent.z, 0, target.tangent.x).normalize();
    }
  } else {
    target.curvatureRadius = Infinity;
    target.turnSign = 0;
    target.outwardNormal.set(-target.tangent.z, 0, target.tangent.x).normalize();
  }

  return target;
}

export interface TrackLUTNode {
  readonly position: THREE.Vector3;
  readonly tangent: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly curvatureRadius: number;
  readonly turnSign: number;
}

export interface TrackLUT {
  readonly trackId: TrackId;
  readonly nodes: readonly TrackLUTNode[];
  readonly totalLengthM: number;
  readonly sampleCount: number;
}

const LUT_SAMPLE_COUNT = 1024;
const lutCache: Partial<Record<TrackId, TrackLUT>> = {};

export function getTrackLUT(trackId: TrackId): TrackLUT {
  const cached = lutCache[trackId];
  if (cached) return cached;

  const curve = getTrackCurve(trackId);
  const totalLengthM = curve.getLength();
  const nodes: TrackLUTNode[] = new Array(LUT_SAMPLE_COUNT);

  const sample: SplineKinematicsResult = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    outwardNormal: new THREE.Vector3(),
    curvature: 0,
    curvatureRadius: Infinity,
    turnSign: 0,
  };

  for (let i = 0; i < LUT_SAMPLE_COUNT; i++) {
    const u = i / LUT_SAMPLE_COUNT;
    evaluateSplineKinematics(curve, u, sample);

    nodes[i] = {
      position: sample.position.clone(),
      tangent: sample.tangent.clone(),
      right: sample.right.clone(),
      curvatureRadius: sample.curvatureRadius,
      turnSign: sample.turnSign,
    };
  }

  const built: TrackLUT = {
    trackId,
    nodes,
    totalLengthM,
    sampleCount: LUT_SAMPLE_COUNT,
  };
  lutCache[trackId] = built;
  return built;
}

export function getMontmeloTrackLUT(): TrackLUT {
  return getTrackLUT('montmelo');
}

export function sampleTrackLUTNode(lut: TrackLUT, distanceM: number): TrackLUTNode {
  const wrappedDist =
    ((distanceM % lut.totalLengthM) + lut.totalLengthM) % lut.totalLengthM;
  const idx =
    Math.floor((wrappedDist / lut.totalLengthM) * lut.sampleCount) %
    lut.sampleCount;
  return lut.nodes[idx];
}

/**
 * Calcula la velocidad límite exacta en un punto de radio efectivo `effectiveRadiusM`
 * teniendo en cuenta tanto el agarre estático como la carga aerodinámica (AeroDownforceCoeff * v²):
 *   (m * v²) / R = TotalGrip + C_aero * v²  ==>  v² * (m/R - C_aero) = TotalGrip
 */
export function computeCornerLimitSpeedMs(
  effectiveRadiusM: number,
  totalWeightKg: number,
  baseGripN: number,
  aeroDownforceCoeff = 0
): number {
  if (!Number.isFinite(effectiveRadiusM) || effectiveRadiusM > 230 || totalWeightKg <= 0) {
    return Infinity;
  }
  const denom = totalWeightKg / effectiveRadiusM - aeroDownforceCoeff;
  if (denom <= 0.05) {
    // Tal nivel de carga aerodinámica en curva amplia permite paso a fondo
    return Infinity;
  }
  return Math.sqrt(baseGripN / denom);
}

/**
 * Evalúa el riesgo cinemático de frenada para un punto situado a `lookAheadDistM` por delante,
 * considerando radio real del carril (interior/exterior), aerodinámica y pendiente en bajada.
 */
export function evaluatePointBrakingRisk(
  currentSpeedMs: number,
  lookAheadDistM: number,
  effectiveRadiusM: number,
  totalWeightKg: number,
  baseGripN: number,
  aeroDownforceCoeff = 0,
  slopeTangentY = 0
): { risk: number; limitSpeedMs: number } {
  const limitSpeedMs = computeCornerLimitSpeedMs(
    effectiveRadiusM,
    totalWeightKg,
    baseGripN,
    aeroDownforceCoeff
  );

  if (!Number.isFinite(limitSpeedMs)) {
    return { risk: 0, limitSpeedMs: Infinity };
  }

  if (currentSpeedMs <= limitSpeedMs * 0.84) {
    return { risk: 0, limitSpeedMs };
  }

  if (currentSpeedMs <= limitSpeedMs) {
    const approachFraction =
      (currentSpeedMs - limitSpeedMs * 0.84) / (limitSpeedMs * 0.16);
    return { risk: 0.45 * approachFraction, limitSpeedMs };
  }

  // En bajadas fuertes (como el Sacacorchos, tangent.y < 0) la gravedad alarga la distancia de frenado
  const effectiveBrakeDecel = Math.max(
    22.0,
    PREDICTIVE_BRAKE_DECEL_MS2 + 9.81 * slopeTangentY
  );
  const pureBrakingDistM =
    (currentSpeedMs * currentSpeedMs - limitSpeedMs * limitSpeedMs) /
    (2 * effectiveBrakeDecel);
  const reactionDistM = currentSpeedMs * DRIVER_REACTION_TIME_SEC;
  const requiredStopDistM = pureBrakingDistM + reactionDistM;

  if (lookAheadDistM <= requiredStopDistM * 1.14) {
    return { risk: 1.0, limitSpeedMs };
  }

  if (lookAheadDistM <= requiredStopDistM * 1.65 + 6) {
    return { risk: 0.58, limitSpeedMs };
  }

  return { risk: 0.2, limitSpeedMs };
}

export interface LookAheadScanSummary {
  advice: BrakeAdviceLevel;
  recommendedCornerSpeedKmh: number | null;
}

export function scanUpcomingBrakingAdvice(
  lut: TrackLUT,
  currentDistanceM: number,
  currentSpeedMs: number,
  totalWeightKg: number,
  baseGripN: number,
  aeroDownforceCoeff = 0,
  laneOffsetM = 0
): LookAheadScanSummary {
  if (currentSpeedMs < 3) {
    return { advice: 'clear', recommendedCornerSpeedKmh: null };
  }

  let maxRisk = 0;
  let minCriticalSpeedMs = Infinity;

  for (let d = 2; d <= 58; d += 2.2) {
    const node = sampleTrackLUTNode(lut, currentDistanceM + d);
    const effectiveRadius = computeEffectiveLaneRadius(
      node.curvatureRadius,
      node.turnSign,
      laneOffsetM
    );

    const { risk, limitSpeedMs } = evaluatePointBrakingRisk(
      currentSpeedMs,
      d,
      effectiveRadius,
      totalWeightKg,
      baseGripN,
      aeroDownforceCoeff,
      node.tangent.y
    );

    if (risk > maxRisk) {
      maxRisk = risk;
    }
    if (risk >= 0.45 && limitSpeedMs < minCriticalSpeedMs) {
      minCriticalSpeedMs = limitSpeedMs;
    }
  }

  const targetKmh = Number.isFinite(minCriticalSpeedMs)
    ? Math.round(minCriticalSpeedMs * 3.6)
    : null;

  if (maxRisk >= 0.95) {
    return { advice: 'brake', recommendedCornerSpeedKmh: targetKmh };
  }
  if (maxRisk >= 0.45) {
    return { advice: 'coast', recommendedCornerSpeedKmh: targetKmh };
  }
  return { advice: 'clear', recommendedCornerSpeedKmh: null };
}
