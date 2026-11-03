'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CarModel, type CarVisualMotionState } from '@/components/canvas/CarModel';
import { PredictiveBrakingLine } from '@/components/canvas/PredictiveBrakingLine';
import {
  livePlayerProgress,
  liveRivalState,
} from '@/components/canvas/RivalCar';
import {
  SkidmarksRibbon,
  type SkidmarkEmitterState,
} from '@/components/canvas/SkidmarksRibbon';
import { useControls } from '@/hooks/useControls';
import { computeDynamicGripAtSpeed, GRAVITY_MS2 } from '@/lib/carStats';
import {
  ActiveLapGhostBuffer,
  liveLapClock,
  saveBestGhostForTrack,
} from '@/lib/ghostRecorder';
import {
  CIRCUITS,
  computeEffectiveLaneRadius,
  evaluateSplineKinematics,
  getLaneLateralOffsetM,
  getTrackCurve,
  getTrackLUT,
  scanUpcomingBrakingAdvice,
  type SplineKinematicsResult,
} from '@/lib/montmeloSpline';
import { soundEngine } from '@/lib/soundEngine';
import { useGarageStore, useTelemetryStore } from '@/store/store';

const SLOT_BRAKE_DECEL_MS2 = 38.0;
const ENGINE_COAST_BRAKE_MS2 = 8.0;
const AERO_DRAG_COEFF = 0.0022;
const DERAIL_RECOVERY_SECONDS = 1.75;
const GRAVEL_DECEL_MS2 = 25.0;

const DRIFT_ONSET_GRIP_RATIO = 0.85;
const DRIFT_FULL_ANGLE_RATIO = 1.28;
const MAX_SLOT_DRIFT_YAW_RAD = 0.58;
const DRIFT_TIRE_SCRUB_DECEL_MS2 = 17.5;

const BASE_CAMERA_FOV = 50;
const MAX_SPEED_FOV_BOOST = 8.5;

interface InternalPhysicsState {
  distanceM: number;
  speedMs: number;
  smoothedThrottle: number;
  lateralOffsetM: number;
  guideStress: number;
  isDerailed: boolean;
  derailTimerSec: number;
  derailPosition: THREE.Vector3;
  derailVelocity: THREE.Vector3;
  peakDerailForceN: number;
  lapCount: number;
  lapTimeMs: number;
  derailCountInLap: number;
  maxGuideStressInLap: number;
  driftScoreSecInLap: number;
  sectorStage: 0 | 1 | 2;
  sectorSplitStartMs: number;
  purpleSectorsInLap: number;
  countdownStepTimerSec: number;
  lightsOutHoldDurationSec: number;
  greenElapsedSec: number;
  jumpedStartArmed: boolean;
  falseStartPenaltyTimerSec: number;
  turboStartTimerSec: number;
  overVoltCharge: number;
  overVoltTimerSec: number;
  uiSyncAccumulatorSec: number;
}

const _kinematics: SplineKinematicsResult = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  outwardNormal: new THREE.Vector3(),
  curvature: 0,
  curvatureRadius: Infinity,
  turnSign: 0,
};
const _laneWorldPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _desiredCamLook = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Motor físico del jugador v2.0 con:
 * - Doble carril paralelo + gravedad longitudinal en cuestas + downforce aerodinámico + Clima Lluvia/Seco.
 * - Semáforo F1 de 5 luces (Salida Nula / Salida Turbo), Rebufo aerodinámico y Descarga OverVolt 18V [B].
 * - Cronometraje oficial por Sectores F1 (S1, S2, S3), Modo Copa 3V y Ghost Car 0-GC.
 */
export function PhysicsCar() {
  const carGroupRef = useRef<THREE.Group>(null);
  const controlsRef = useControls();
  const ghostBufferRef = useRef<ActiveLapGhostBuffer>(
    new ActiveLapGhostBuffer()
  );

  const carStats = useGarageStore((state) => state.carStats);
  const activeTireId = useGarageStore((state) => state.loadout.tiresId);
  const trackId = useTelemetryStore((state) => state.trackId);
  const playerLane = useTelemetryStore((state) => state.playerLane);
  const resetNonce = useTelemetryStore((state) => state.resetNonce);
  const overVoltTriggerNonce = useTelemetryStore(
    (state) => state.overVoltTriggerNonce
  );

  const curve = useMemo(() => getTrackCurve(trackId), [trackId]);
  const trackLUT = useMemo(() => getTrackLUT(trackId), [trackId]);
  const trackLengthM = useMemo(() => curve.getLength(), [curve]);

  const targetLaneOffsetM = getLaneLateralOffsetM(playerLane);
  const [isDerailedVisual, setIsDerailedVisual] = useState(false);

  const visualMotionRef = useRef<CarVisualMotionState>({
    bodyRollRad: 0,
    driftYawRad: 0,
    driftIntensity: 0,
    speedMs: 0,
    brakeIntensity: 0,
    guideStress: 0,
    overVoltActive: false,
    isDerailed: false,
  });

  const skidEmitterRef = useRef<SkidmarkEmitterState>({
    carGroup: null,
    driftYawRad: 0,
    driftIntensity: 0,
    isDerailed: false,
  });

  const physicsRef = useRef<InternalPhysicsState>({
    distanceM: 0,
    speedMs: 0,
    smoothedThrottle: 0,
    lateralOffsetM: targetLaneOffsetM,
    guideStress: 0,
    isDerailed: false,
    derailTimerSec: 0,
    derailPosition: new THREE.Vector3(),
    derailVelocity: new THREE.Vector3(),
    peakDerailForceN: 0,
    lapCount: 1,
    lapTimeMs: 0,
    derailCountInLap: 0,
    maxGuideStressInLap: 0,
    driftScoreSecInLap: 0,
    sectorStage: 0,
    sectorSplitStartMs: 0,
    purpleSectorsInLap: 0,
    countdownStepTimerSec: 0,
    lightsOutHoldDurationSec: 0.68,
    greenElapsedSec: 99,
    jumpedStartArmed: false,
    falseStartPenaltyTimerSec: 0,
    turboStartTimerSec: 0,
    overVoltCharge: 0.45,
    overVoltTimerSec: 0,
    uiSyncAccumulatorSec: 0,
  });

  useEffect(() => {
    void useGarageStore.getState().hydrateGarage();
    useTelemetryStore
      .getState()
      .setTrackId(useTelemetryStore.getState().trackId);
  }, []);

  // Activación de descarga OverVolt 18V [Tecla B / Botón HUD]
  const prevOverVoltNonceRef = useRef(overVoltTriggerNonce);
  useEffect(() => {
    if (prevOverVoltNonceRef.current === overVoltTriggerNonce) return;
    prevOverVoltNonceRef.current = overVoltTriggerNonce;

    const sim = physicsRef.current;
    if (
      sim.overVoltCharge >= 0.99 &&
      sim.overVoltTimerSec <= 0 &&
      !sim.isDerailed
    ) {
      sim.overVoltCharge = 0;
      sim.overVoltTimerSec = 2.5;
      soundEngine.unlock();
      soundEngine.playOverVoltSound();
    }
  }, [overVoltTriggerNonce]);

  const prevTrackRef = useRef(trackId);
  useEffect(() => {
    const sim = physicsRef.current;
    const vis = visualMotionRef.current;
    const telemetry = useTelemetryStore.getState();

    const isCupStartReset =
      telemetry.raceMode === 'cup' && telemetry.cupStartPhase === 'countdown';

    if (prevTrackRef.current !== trackId || isCupStartReset) {
      prevTrackRef.current = trackId;
      sim.distanceM = 0;
      sim.lapCount = 1;
      sim.lapTimeMs = 0;
      sim.derailCountInLap = 0;
      sim.maxGuideStressInLap = 0;
      sim.driftScoreSecInLap = 0;
      sim.sectorStage = 0;
      sim.sectorSplitStartMs = 0;
      sim.purpleSectorsInLap = 0;
      sim.countdownStepTimerSec = 0;
      sim.lightsOutHoldDurationSec = 0.55 + Math.random() * 0.38;
      sim.greenElapsedSec = isCupStartReset ? 0 : 99;
      sim.jumpedStartArmed = false;
      sim.falseStartPenaltyTimerSec = 0;
      sim.turboStartTimerSec = 0;
      if (isCupStartReset) {
        sim.overVoltCharge = 0.5;
        sim.overVoltTimerSec = 0;
        soundEngine.unlock();
        soundEngine.playCountdownBeep(false);
      }
      ghostBufferRef.current.reset();
      liveLapClock.elapsedMs = 0;
      liveLapClock.active = false;
    } else if (sim.lapTimeMs > 500 && !sim.isDerailed) {
      sim.derailCountInLap += 1;
    }

    sim.speedMs = 0;
    sim.smoothedThrottle = 0;
    sim.guideStress = 0;
    sim.isDerailed = false;
    sim.derailTimerSec = 0;

    vis.bodyRollRad = 0;
    vis.driftYawRad = 0;
    vis.driftIntensity = 0;
    vis.speedMs = 0;
    vis.brakeIntensity = 0;
    vis.guideStress = 0;
    vis.overVoltActive = false;
    vis.isDerailed = false;
    setIsDerailedVisual(false);
  }, [resetNonce, trackId]);

  useFrame((state, rawDelta) => {
    const carGroup = carGroupRef.current;
    if (!carGroup) return;

    const dt = Math.min(rawDelta, 0.05);
    const sim = physicsRef.current;
    const vis = visualMotionRef.current;
    const telemetryState = useTelemetryStore.getState();
    const { throttle: rawThrottle, brake } = controlsRef.current;

    const isRain = telemetryState.weatherMode === 'rain';
    const wetTireFactor = isRain
      ? activeTireId === 'tir_wet_rain'
        ? 0.96
        : 0.78
      : 1.0;

    let forceImmediateHudSync = false;

    // 1. Secuencia del Semáforo F1 de 5 luces en Modo Copa 3V
    if (
      telemetryState.raceMode === 'cup' &&
      telemetryState.cupStartPhase === 'countdown'
    ) {
      sim.countdownStepTimerSec += dt;

      if (rawThrottle > 0.1 && telemetryState.countdownLights >= 3) {
        sim.jumpedStartArmed = true;
      } else if (rawThrottle === 0) {
        sim.jumpedStartArmed = false;
      }

      if (telemetryState.countdownLights < 5) {
        if (sim.countdownStepTimerSec >= 0.62) {
          sim.countdownStepTimerSec = 0;
          const nextLight = (telemetryState.countdownLights + 1) as
            | 1
            | 2
            | 3
            | 4
            | 5;
          telemetryState.setCupCountdownState('countdown', nextLight);
          soundEngine.playCountdownBeep(false);
          forceImmediateHudSync = true;
        }
      } else if (sim.countdownStepTimerSec >= sim.lightsOutHoldDurationSec) {
        sim.countdownStepTimerSec = 0;
        sim.greenElapsedSec = 0;
        telemetryState.setCupCountdownState('green', 0);

        if (sim.jumpedStartArmed || rawThrottle > 0.1) {
          sim.falseStartPenaltyTimerSec = 1.25;
          soundEngine.playFalseStartBuzzer();
        } else {
          soundEngine.playCountdownBeep(true);
        }
        forceImmediateHudSync = true;
      }
    } else if (telemetryState.cupStartPhase === 'green') {
      sim.greenElapsedSec += dt;
      // Detección de Salida Perfecta Turbo si clavas el gatillo en los primeros 0.28s tras apagarse el semáforo
      if (
        sim.greenElapsedSec <= 0.28 &&
        rawThrottle > 0.1 &&
        sim.falseStartPenaltyTimerSec <= 0 &&
        sim.turboStartTimerSec <= 0 &&
        sim.speedMs < 2.5
      ) {
        sim.turboStartTimerSec = 1.85;
        sim.overVoltCharge = Math.min(1, sim.overVoltCharge + 0.25);
        soundEngine.playOverVoltSound();
        forceImmediateHudSync = true;
      }
    }

    if (sim.falseStartPenaltyTimerSec > 0) {
      sim.falseStartPenaltyTimerSec = Math.max(
        0,
        sim.falseStartPenaltyTimerSec - dt
      );
    }
    if (sim.turboStartTimerSec > 0) {
      sim.turboStartTimerSec = Math.max(0, sim.turboStartTimerSec - dt);
    }
    if (sim.overVoltTimerSec > 0) {
      sim.overVoltTimerSec = Math.max(0, sim.overVoltTimerSec - dt);
    }

    const isWaitingAtGrid =
      telemetryState.raceMode === 'cup' &&
      telemetryState.cupStartPhase === 'countdown';
    const isFalseStartStalled = sim.falseStartPenaltyTimerSec > 0;
    const isOverVoltActive = sim.overVoltTimerSec > 0;
    const isTurboStartActive = sim.turboStartTimerSec > 0;

    vis.overVoltActive = isOverVoltActive || isTurboStartActive;

    const effectiveRawThrottle =
      isWaitingAtGrid || isFalseStartStalled ? 0 : rawThrottle;

    sim.lateralOffsetM = THREE.MathUtils.lerp(
      sim.lateralOffsetM,
      targetLaneOffsetM,
      1 - Math.exp(-12 * dt)
    );

    const throttleRate =
      effectiveRawThrottle > sim.smoothedThrottle ? 15.0 : 34.0;
    sim.smoothedThrottle = THREE.MathUtils.lerp(
      sim.smoothedThrottle,
      effectiveRawThrottle,
      1 - Math.exp(-throttleRate * dt)
    );
    if (sim.smoothedThrottle < 0.01 && effectiveRawThrottle === 0) {
      sim.smoothedThrottle = 0;
    }

    vis.brakeIntensity = brake;

    // 2. Cálculo de Rebufo Aerodinámico (Slipstream) tras el rival
    const playerTotalDist =
      (sim.lapCount - 1) * trackLengthM + sim.distanceM;
    livePlayerProgress.distanceM = sim.distanceM;
    livePlayerProgress.lapCount = sim.lapCount;
    livePlayerProgress.totalDistanceM = playerTotalDist;

    let distBehindRivalOnLoop =
      (liveRivalState.distanceM - sim.distanceM + trackLengthM) % trackLengthM;
    if (distBehindRivalOnLoop > trackLengthM * 0.5) {
      distBehindRivalOnLoop -= trackLengthM;
    }

    const isSlipstreaming =
      telemetryState.rivalEnabled &&
      !isWaitingAtGrid &&
      !sim.isDerailed &&
      sim.speedMs > 11 &&
      distBehindRivalOnLoop > 1.8 &&
      distBehindRivalOnLoop < 15.0;

    if (isSlipstreaming && !isOverVoltActive) {
      sim.overVoltCharge = Math.min(1, sim.overVoltCharge + 0.16 * dt);
    }

    const baseMaxSpeedMs = carStats.MaxSpeed / 3.6;
    const maxSpeedMultiplier =
      (isOverVoltActive ? 1.14 : 1.0) * (isSlipstreaming ? 1.05 : 1.0);
    const maxSpeedMs = baseMaxSpeedMs * maxSpeedMultiplier;

    let currentCentrifugalForceN = 0;
    let currentEffectiveRadiusM = Infinity;
    let currentDynamicGripN =
      computeDynamicGripAtSpeed(carStats, sim.speedMs) * wetTireFactor;
    let gripRatio = 0;
    let slopePercent = 0;

    if (!sim.isDerailed) {
      const prevU = sim.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, prevU, _kinematics);

      const preEffectiveRadius = computeEffectiveLaneRadius(
        _kinematics.curvatureRadius,
        _kinematics.turnSign,
        sim.lateralOffsetM
      );
      const preForceN = Number.isFinite(preEffectiveRadius)
        ? (carStats.TotalWeight * (sim.speedMs * sim.speedMs)) /
          preEffectiveRadius
        : 0;
      const preGripRatio =
        currentDynamicGripN > 0 ? preForceN / currentDynamicGripN : 0;
      const preDriftIntensity = THREE.MathUtils.clamp(
        (preGripRatio - DRIFT_ONSET_GRIP_RATIO) /
          (DRIFT_FULL_ANGLE_RATIO - DRIFT_ONSET_GRIP_RATIO),
        0,
        1
      );

      const slopeGravityAccel = -GRAVITY_MS2 * _kinematics.tangent.y;
      const speedRatio = maxSpeedMs > 0 ? sim.speedMs / maxSpeedMs : 0;
      const powerBandFactor = Math.max(0, 1 - Math.pow(speedRatio, 2.4));
      const rearTractionEfficiency = 1 - 0.45 * preDriftIntensity;

      const boostAccelMult =
        (isOverVoltActive ? 1.28 : 1.0) *
        (isTurboStartActive ? 1.28 : 1.0) *
        (isSlipstreaming ? 1.12 : 1.0);

      const driveAccel =
        sim.smoothedThrottle *
        carStats.Acceleration *
        boostAccelMult *
        powerBandFactor *
        rearTractionEfficiency;

      const brakeDecel = brake * SLOT_BRAKE_DECEL_MS2;
      const effectiveDragCoeff = isSlipstreaming
        ? AERO_DRAG_COEFF * 0.65
        : AERO_DRAG_COEFF;
      const coastDecel =
        effectiveRawThrottle === 0 && sim.speedMs > 0
          ? ENGINE_COAST_BRAKE_MS2 +
            effectiveDragCoeff * sim.speedMs * sim.speedMs
          : effectiveDragCoeff * sim.speedMs * sim.speedMs;

      const scrubFactor = effectiveRawThrottle === 0 ? 1.0 : 0.45;
      const driftScrubDecel =
        preDriftIntensity * DRIFT_TIRE_SCRUB_DECEL_MS2 * scrubFactor;

      const netLongitudinalAccel =
        driveAccel +
        slopeGravityAccel -
        brakeDecel -
        coastDecel -
        driftScrubDecel;

      const downhillMaxCap =
        _kinematics.tangent.y < -0.05 ? maxSpeedMs * 1.06 : maxSpeedMs;
      sim.speedMs = isWaitingAtGrid
        ? 0
        : THREE.MathUtils.clamp(
            sim.speedMs + netLongitudinalAccel * dt,
            0,
            downhillMaxCap
          );

      const arcDifferentialFactor =
        Number.isFinite(_kinematics.curvatureRadius) &&
        Number.isFinite(preEffectiveRadius)
          ? THREE.MathUtils.clamp(
              _kinematics.curvatureRadius / preEffectiveRadius,
              0.72,
              1.35
            )
          : 1.0;

      if (!isWaitingAtGrid && (sim.speedMs > 0.1 || sim.lapTimeMs > 0)) {
        sim.lapTimeMs += dt * 1000;
      }

      const nextDistance =
        sim.distanceM + sim.speedMs * arcDifferentialFactor * dt;
      const nextU = nextDistance / trackLengthM;

      // Detección de cruce por Sector 1 (33.3%) y Sector 2 (66.6%)
      if (sim.lapTimeMs > 800 && nextDistance < trackLengthM) {
        if (sim.sectorStage === 0 && nextU >= 1 / 3 && nextU < 0.85) {
          const s1Time = Math.max(200, sim.lapTimeMs - sim.sectorSplitStartMs);
          const color = useTelemetryStore
            .getState()
            .recordSectorSplit(0, s1Time);
          if (color === 'purple') sim.purpleSectorsInLap += 1;
          soundEngine.playSectorBeep(color === 'pending' ? 'amber' : color);
          sim.sectorStage = 1;
          sim.sectorSplitStartMs = sim.lapTimeMs;
          forceImmediateHudSync = true;
        } else if (sim.sectorStage === 1 && nextU >= 2 / 3 && nextU < 0.96) {
          const s2Time = Math.max(200, sim.lapTimeMs - sim.sectorSplitStartMs);
          const color = useTelemetryStore
            .getState()
            .recordSectorSplit(1, s2Time);
          if (color === 'purple') sim.purpleSectorsInLap += 1;
          soundEngine.playSectorBeep(color === 'pending' ? 'amber' : color);
          sim.sectorStage = 2;
          sim.sectorSplitStartMs = sim.lapTimeMs;
          forceImmediateHudSync = true;
        }
      }

      // Cruce por Línea de Meta (Sector 3 + Evaluación de Vuelta + Guardado de Ghost + Copa 3V)
      if (nextDistance >= trackLengthM) {
        if (sim.lapTimeMs > 4000) {
          if (sim.sectorStage === 2) {
            const s3Time = Math.max(
              200,
              sim.lapTimeMs - sim.sectorSplitStartMs
            );
            const s3Color = useTelemetryStore
              .getState()
              .recordSectorSplit(2, s3Time);
            if (s3Color === 'purple') sim.purpleSectorsInLap += 1;
          }

          const summary = useTelemetryStore.getState().completeEvaluatedLap({
            lapTimeMs: sim.lapTimeMs,
            derailCount: sim.derailCountInLap,
            maxGuideStress: sim.maxGuideStressInLap,
            driftScoreSec: sim.driftScoreSecInLap,
            purpleSectorsInLap: sim.purpleSectorsInLap,
            goldTargetMs: CIRCUITS[trackId].goldTargetMs,
          });

          if (summary.isNewBest) {
            const exportedGhost = ghostBufferRef.current.exportSnapshot(
              trackId,
              sim.lapTimeMs,
              trackLengthM,
              sim.lateralOffsetM,
              carStats.modelPath,
              carStats.modelYawOffsetRad
            );
            saveBestGhostForTrack(exportedGhost);
            useTelemetryStore.getState().bumpGhostVersion();
          }

          if (
            telemetryState.raceMode === 'cup' &&
            telemetryState.cupStartPhase === 'green' &&
            sim.lapCount >= telemetryState.cupTargetLaps
          ) {
            telemetryState.finishCupRace('player');
            soundEngine.playPerfectLapFanfare();
          } else if (summary.medal === 'perfect') {
            soundEngine.playPerfectLapFanfare();
          } else {
            soundEngine.playLapChime(summary.isNewBest);
          }
        }

        sim.lapCount += 1;
        sim.lapTimeMs = 0;
        sim.derailCountInLap = 0;
        sim.maxGuideStressInLap = 0;
        sim.driftScoreSecInLap = 0;
        sim.sectorStage = 0;
        sim.sectorSplitStartMs = 0;
        sim.purpleSectorsInLap = 0;
        ghostBufferRef.current.reset();
        liveLapClock.elapsedMs = 0;
        forceImmediateHudSync = true;
      }

      sim.distanceM =
        ((nextDistance % trackLengthM) + trackLengthM) % trackLengthM;
      const u = sim.distanceM / trackLengthM;

      evaluateSplineKinematics(curve, u, _kinematics);
      slopePercent = _kinematics.tangent.y * 100;
      currentEffectiveRadiusM = computeEffectiveLaneRadius(
        _kinematics.curvatureRadius,
        _kinematics.turnSign,
        sim.lateralOffsetM
      );
      currentDynamicGripN =
        computeDynamicGripAtSpeed(carStats, sim.speedMs) * wetTireFactor;

      currentCentrifugalForceN = Number.isFinite(currentEffectiveRadiusM)
        ? (carStats.TotalWeight * (sim.speedMs * sim.speedMs)) /
          currentEffectiveRadiusM
        : 0;
      gripRatio =
        currentDynamicGripN > 0
          ? currentCentrifugalForceN / currentDynamicGripN
          : 0;

      const driftIntensity = THREE.MathUtils.clamp(
        (gripRatio - DRIFT_ONSET_GRIP_RATIO) /
          (DRIFT_FULL_ANGLE_RATIO - DRIFT_ONSET_GRIP_RATIO),
        0,
        1
      );

      if (driftIntensity > 0.12 && sim.speedMs > 5) {
        sim.driftScoreSecInLap += dt;
        if (!isOverVoltActive) {
          sim.overVoltCharge = Math.min(
            1,
            sim.overVoltCharge + driftIntensity * 0.22 * dt
          );
        }
      }

      if (gripRatio >= carStats.DriftCeilingRatio) {
        sim.guideStress = 1.0;
      } else if (gripRatio > 1.0) {
        const excessRatio = gripRatio - 1.0;
        const rollerMarginScale =
          0.4 / Math.max(0.25, carStats.DriftCeilingRatio - 1.0);
        const throttleAbuseMultiplier = 0.7 + 1.15 * sim.smoothedThrottle;
        const stressBuildRate =
          (0.75 + excessRatio * 8.8 * rollerMarginScale) *
          throttleAbuseMultiplier;
        sim.guideStress = Math.min(1.0, sim.guideStress + stressBuildRate * dt);
      } else {
        sim.guideStress = Math.max(
          0,
          sim.guideStress - carStats.GuideRecoveryRate * dt
        );
      }

      sim.maxGuideStressInLap = Math.max(
        sim.maxGuideStressInLap,
        sim.guideStress
      );
      vis.guideStress = sim.guideStress;

      _laneWorldPos
        .copy(_kinematics.position)
        .addScaledVector(_kinematics.right, sim.lateralOffsetM);

      if (sim.guideStress >= 1.0) {
        sim.isDerailed = true;
        sim.derailCountInLap += 1;
        sim.derailTimerSec = DERAIL_RECOVERY_SECONDS;
        sim.peakDerailForceN = currentCentrifugalForceN;
        sim.overVoltTimerSec = 0;

        sim.derailPosition.copy(_laneWorldPos);
        sim.derailVelocity
          .copy(_kinematics.tangent)
          .multiplyScalar(sim.speedMs * 0.8)
          .addScaledVector(_kinematics.outwardNormal, sim.speedMs * 0.36);

        vis.isDerailed = true;
        vis.driftIntensity = 0;
        setIsDerailedVisual(true);
        soundEngine.playDerailSound();
        forceImmediateHudSync = true;
      } else {
        carGroup.position.copy(_laneWorldPos);
        _lookTarget.copy(_laneWorldPos).add(_kinematics.tangent);
        carGroup.up.copy(_worldUp);
        carGroup.lookAt(_lookTarget);
        carGroup.updateMatrixWorld();

        const targetDriftYaw =
          -_kinematics.turnSign * driftIntensity * MAX_SLOT_DRIFT_YAW_RAD;
        vis.driftYawRad = THREE.MathUtils.lerp(
          vis.driftYawRad,
          targetDriftYaw,
          1 - Math.exp(-13.5 * dt)
        );
        vis.driftIntensity = driftIntensity;

        const clampedLoad = Math.min(1.25, gripRatio);
        const targetRollRad =
          -_kinematics.turnSign * clampedLoad * carStats.centerOfGravity * 0.56;
        vis.bodyRollRad = THREE.MathUtils.lerp(
          vis.bodyRollRad,
          targetRollRad,
          1 - Math.exp(-14 * dt)
        );
      }
    }

    if (sim.isDerailed) {
      if (sim.lapTimeMs > 0) {
        sim.lapTimeMs += dt * 1000;
      }

      sim.derailTimerSec -= dt;
      sim.derailPosition.addScaledVector(sim.derailVelocity, dt);

      const currentSlipSpeed = sim.derailVelocity.length();
      if (currentSlipSpeed > 0.05) {
        const nextSlipSpeed = Math.max(
          0,
          currentSlipSpeed - GRAVEL_DECEL_MS2 * dt
        );
        sim.derailVelocity.multiplyScalar(nextSlipSpeed / currentSlipSpeed);
      }

      carGroup.position.copy(sim.derailPosition);
      carGroup.rotateY(5.0 * dt * Math.min(1, currentSlipSpeed / 12));

      sim.speedMs = currentSlipSpeed;
      currentCentrifugalForceN = sim.peakDerailForceN;
      gripRatio =
        currentDynamicGripN > 0
          ? currentCentrifugalForceN / currentDynamicGripN
          : 1.4;

      if (sim.derailTimerSec <= 0) {
        sim.isDerailed = false;
        sim.speedMs = 0;
        sim.guideStress = 0;
        vis.bodyRollRad = 0;
        vis.driftYawRad = 0;
        vis.driftIntensity = 0;
        vis.guideStress = 0;
        vis.isDerailed = false;
        setIsDerailedVisual(false);
        forceImmediateHudSync = true;
      }
    }

    // Reloj en tiempo real y muestreo 20 Hz 0-GC para el Ghost Car
    liveLapClock.elapsedMs = sim.lapTimeMs;
    liveLapClock.active = sim.lapTimeMs > 0;
    if (sim.lapTimeMs > 0) {
      ghostBufferRef.current.recordSampleIfDue(
        sim.lapTimeMs,
        sim.distanceM,
        sim.lateralOffsetM,
        vis.driftYawRad
      );
    }

    // Puente 0-GC para rotación de las 4 ruedas y marcas de neumáticos
    vis.speedMs = sim.speedMs;
    skidEmitterRef.current.carGroup = carGroup;
    skidEmitterRef.current.driftYawRad = vis.driftYawRad;
    skidEmitterRef.current.driftIntensity = vis.driftIntensity;
    skidEmitterRef.current.isDerailed = sim.isDerailed;

    const isGarageOpen = useGarageStore.getState().isGarageOpen;
    soundEngine.updateContinuousFrame({
      speedMs: sim.speedMs,
      maxSpeedMs,
      maxRpm: carStats.maxRpm,
      throttle: sim.smoothedThrottle,
      driftIntensity: vis.driftIntensity,
      isDerailed: sim.isDerailed,
      soundEnabled: telemetryState.soundEnabled,
    });

    // Cámara dinámica: Showroom 360° en Garaje, Chase Cam con FOV sensible a velocidad/OverVolt, o Vista Cenital
    const perspCam = state.camera as THREE.PerspectiveCamera;
    if (isGarageOpen) {
      const orbitAngle = state.clock.elapsedTime * 0.55;
      const orbitRadius = 6.2;
      _desiredCamPos.set(
        carGroup.position.x + Math.cos(orbitAngle) * orbitRadius,
        carGroup.position.y + 2.45,
        carGroup.position.z + Math.sin(orbitAngle) * orbitRadius
      );
      _desiredCamLook.set(
        carGroup.position.x,
        carGroup.position.y + 0.52,
        carGroup.position.z
      );

      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-6.5 * dt));
      state.camera.lookAt(_desiredCamLook);

      if (
        perspCam.isPerspectiveCamera &&
        Math.abs(perspCam.fov - 44) > 0.05
      ) {
        perspCam.fov = THREE.MathUtils.lerp(
          perspCam.fov,
          44,
          1 - Math.exp(-6 * dt)
        );
        perspCam.updateProjectionMatrix();
      }
    } else if (telemetryState.cameraMode === 'chase') {
      const u = sim.distanceM / trackLengthM;
      evaluateSplineKinematics(curve, u, _kinematics);

      _desiredCamPos
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, -13.8);
      _desiredCamPos.y += 6.6;

      if (!sim.isDerailed && vis.driftIntensity > 0.3) {
        const shakeAmp = (vis.driftIntensity - 0.3) * 0.09;
        const tNow = state.clock.elapsedTime;
        _desiredCamPos.y += Math.sin(tNow * 48) * shakeAmp;
      }

      _desiredCamLook
        .copy(carGroup.position)
        .addScaledVector(_kinematics.tangent, 11.5);

      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-8.2 * dt));
      state.camera.lookAt(_desiredCamLook);

      if (perspCam.isPerspectiveCamera) {
        const speedNorm =
          baseMaxSpeedMs > 0 ? Math.min(1.15, sim.speedMs / baseMaxSpeedMs) : 0;
        const overVoltFovExtra = isOverVoltActive ? 4.2 : 0;
        const targetFov =
          BASE_CAMERA_FOV +
          Math.pow(speedNorm, 1.5) * MAX_SPEED_FOV_BOOST +
          overVoltFovExtra;
        if (Math.abs(perspCam.fov - targetFov) > 0.03) {
          perspCam.fov = THREE.MathUtils.lerp(
            perspCam.fov,
            targetFov,
            1 - Math.exp(-6 * dt)
          );
          perspCam.updateProjectionMatrix();
        }
      }
    } else {
      _desiredCamPos.set(0, 198, 22);
      state.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-5 * dt));
      state.camera.lookAt(0, 2, -16);

      if (
        perspCam.isPerspectiveCamera &&
        Math.abs(perspCam.fov - BASE_CAMERA_FOV) > 0.05
      ) {
        perspCam.fov = THREE.MathUtils.lerp(
          perspCam.fov,
          BASE_CAMERA_FOV,
          1 - Math.exp(-6 * dt)
        );
        perspCam.updateProjectionMatrix();
      }
    }

    sim.uiSyncAccumulatorSec += dt;
    if (sim.uiSyncAccumulatorSec >= 1 / 30 || forceImmediateHudSync) {
      sim.uiSyncAccumulatorSec = 0;

      const lookAhead =
        sim.isDerailed || !telemetryState.assistEnabled
          ? { advice: 'clear' as const, recommendedCornerSpeedKmh: null }
          : scanUpcomingBrakingAdvice(
              trackLUT,
              sim.distanceM,
              sim.speedMs,
              carStats.TotalWeight,
              carStats.TotalGrip * wetTireFactor,
              carStats.AeroDownforceCoeff * wetTireFactor,
              sim.lateralOffsetM
            );

      const driftDeg = Math.abs(THREE.MathUtils.radToDeg(vis.driftYawRad));
      const updatedPlayerTotal =
        (sim.lapCount - 1) * trackLengthM + sim.distanceM;
      const gapToRivalM = updatedPlayerTotal - liveRivalState.totalDistanceM;
      const playerRacePosition: 1 | 2 = gapToRivalM >= -0.2 ? 1 : 2;

      telemetryState.updateTelemetry({
        speedMs: sim.speedMs,
        speedKmh: sim.speedMs * 3.6,
        centrifugalForce: currentCentrifugalForceN,
        gripAvailable: currentDynamicGripN,
        gripUsageRatio: gripRatio,
        isDrifting: !sim.isDerailed && vis.driftIntensity > 0.05,
        driftAngleDeg: driftDeg,
        guideStressRatio: sim.guideStress,
        brakeAdvice: lookAhead.advice,
        recommendedCornerSpeedKmh: lookAhead.recommendedCornerSpeedKmh,
        curvatureRadius: currentEffectiveRadiusM,
        slopePercent,
        lapProgress: sim.distanceM / trackLengthM,
        lapCount: sim.lapCount,
        currentLapTimeMs: sim.lapTimeMs,
        isDerailed: sim.isDerailed,
        lastDerailForce: sim.peakDerailForceN,
        throttleInput: sim.smoothedThrottle,
        brakeInput: brake,
        slipstreamActive: isSlipstreaming,
        overVoltCharge: sim.overVoltCharge,
        overVoltActive: isOverVoltActive,
        falseStartPenalty: isFalseStartStalled,
        turboStartActive: isTurboStartActive,
        gapToRivalM,
        playerRacePosition,
        rivalLapCount: liveRivalState.lapCount,
      });
    }
  });

  return (
    <>
      <SkidmarksRibbon emitterRef={skidEmitterRef} />
      <PredictiveBrakingLine liveStateRef={physicsRef} />
      <group ref={carGroupRef} name="physics-slot-car">
        <CarModel
          modelPath={carStats.modelPath}
          modelYawOffsetRad={carStats.modelYawOffsetRad}
          motionRef={visualMotionRef}
          isDerailed={isDerailedVisual}
        />
      </group>
    </>
  );
}

export default PhysicsCar;
