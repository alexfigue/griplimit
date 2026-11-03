/**
 * Sintetizador Espacial Dual Web Audio API ("Grip Limit")
 * Cero archivos MP3 externos:
 * - Voz 1 (Jugador): Motor eléctrico DC acoplado a RPM reales + chirrido de neumáticos en derrape.
 * - Voz 2 (Rival IA): Timbre diferenciado con espacialización 3D (StereoPannerNode + atenuación por
 *   distancia + desplazamiento Doppler) para escuchar al rival acercarse y adelantarte por el otro carril.
 * - Efectos puntuales para descarrilamiento y paso por línea de meta / récord de vuelta.
 */

interface SynthVoiceConfig {
  readonly mainWave: OscillatorType;
  readonly harmonicWave: OscillatorType;
  readonly harmonicMultiplier: number;
  readonly basePitchOffsetHz: number;
  readonly skidBaseHz: number;
  readonly useStereoPanner: boolean;
}

class VehicleSynthVoice {
  private readonly ctx: AudioContext;
  private readonly config: SynthVoiceConfig;
  private readonly oscMain: OscillatorNode;
  private readonly oscHarmonic: OscillatorNode;
  private readonly motorFilter: BiquadFilterNode;
  private readonly motorGain: GainNode;
  private readonly skidFilter: BiquadFilterNode;
  private readonly skidGain: GainNode;
  private readonly panner: StereoPannerNode | null;

  constructor(
    ctx: AudioContext,
    destination: AudioNode,
    sharedNoiseBuffer: AudioBuffer,
    config: SynthVoiceConfig
  ) {
    this.ctx = ctx;
    this.config = config;

    const outputNode =
      config.useStereoPanner && typeof ctx.createStereoPanner === 'function'
        ? ctx.createStereoPanner()
        : null;

    if (outputNode) {
      outputNode.connect(destination);
      this.panner = outputNode;
    } else {
      this.panner = null;
    }

    const voiceBus = outputNode ?? destination;

    // Osciladores acoplados del inducido eléctrico
    this.oscMain = ctx.createOscillator();
    this.oscMain.type = config.mainWave;
    this.oscMain.frequency.value = 65;

    this.oscHarmonic = ctx.createOscillator();
    this.oscHarmonic.type = config.harmonicWave;
    this.oscHarmonic.frequency.value = 65 * config.harmonicMultiplier;

    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 420;
    this.motorFilter.Q.value = 2.4;

    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;

    this.oscMain.connect(this.motorFilter);
    this.oscHarmonic.connect(this.motorFilter);
    this.motorFilter.connect(this.motorGain);
    this.motorGain.connect(voiceBus);

    this.oscMain.start();
    this.oscHarmonic.start();

    // Fuente independiente de chirrido de neumáticos
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = sharedNoiseBuffer;
    noiseSource.loop = true;

    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = config.skidBaseHz;
    this.skidFilter.Q.value = 8.5;

    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;

    noiseSource.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(voiceBus);
    noiseSource.start();
  }

  public silence(): void {
    const now = this.ctx.currentTime;
    this.motorGain.gain.setTargetAtTime(0, now, 0.04);
    this.skidGain.gain.setTargetAtTime(0, now, 0.04);
  }

  public update(params: {
    speedMs: number;
    maxSpeedMs: number;
    engineRpm?: number;
    maxRpm: number;
    throttle: number;
    driftIntensity: number;
    volumeScale: number;
    stereoPan: number;
    dopplerFactor: number;
  }): void {
    const now = this.ctx.currentTime;

    if (this.panner) {
      this.panner.pan.setTargetAtTime(params.stereoPan, now, 0.03);
    }

    const speedNorm =
      params.maxSpeedMs > 0
        ? Math.min(1.12, params.speedMs / params.maxSpeedMs)
        : 0;

    const rpmRatio =
      typeof params.engineRpm === 'number' && params.maxRpm > 0
        ? Math.min(1.08, Math.max(0.15, params.engineRpm / params.maxRpm))
        : 0.18 + speedNorm * 0.78 + params.throttle * 0.08;

    const baseFreq =
      (this.config.basePitchOffsetHz + rpmRatio * 295) * params.dopplerFactor;

    this.oscMain.frequency.setTargetAtTime(baseFreq, now, 0.018);
    this.oscHarmonic.frequency.setTargetAtTime(
      baseFreq * this.config.harmonicMultiplier,
      now,
      0.018
    );

    const cutoffFreq = 280 + rpmRatio * 2150 + params.throttle * 900;
    this.motorFilter.frequency.setTargetAtTime(cutoffFreq, now, 0.025);

    const isRevvingInNeutral =
      params.speedMs < 0.25 && (params.engineRpm ?? 0) > 2100;
    const rawMotorVol =
      params.speedMs < 0.25 && params.throttle < 0.02 && !isRevvingInNeutral
        ? 0.04 * params.volumeScale
        : (0.14 + rpmRatio * 0.22 + params.throttle * 0.14) *
          params.volumeScale;
    this.motorGain.gain.setTargetAtTime(rawMotorVol, now, 0.025);

    const skidVol =
      params.driftIntensity > 0.06 && params.speedMs > 4
        ? Math.min(0.42, params.driftIntensity * 0.44) * params.volumeScale
        : 0;
    const skidPitch =
      (this.config.skidBaseHz + params.driftIntensity * 520) *
      params.dopplerFactor;

    this.skidFilter.frequency.setTargetAtTime(skidPitch, now, 0.03);
    this.skidGain.gain.setTargetAtTime(skidVol, now, 0.03);
  }
}

class ProceduralSlotSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private playerVoice: VehicleSynthVoice | null = null;
  private rivalVoice: VehicleSynthVoice | null = null;

  private isInitialized = false;
  private isMuted = false;

  public unlock(): void {
    if (typeof window === 'undefined') return;

    if (!this.isInitialized) {
      this.initGraph();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private initGraph(): void {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.isMuted ? 0 : 0.32;
    master.connect(ctx.destination);
    this.masterGain = master;

    // Buffer compartido de ruido blanco para síntesis de neumáticos
    const bufferSize = Math.floor(ctx.sampleRate * 1.5);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Voz Jugador: centrada, cuerpo rico sawtooth + triangle
    this.playerVoice = new VehicleSynthVoice(ctx, master, noiseBuffer, {
      mainWave: 'sawtooth',
      harmonicWave: 'triangle',
      harmonicMultiplier: 2.98,
      basePitchOffsetHz: 52,
      skidBaseHz: 1180,
      useStereoPanner: false,
    });

    // Voz Rival IA: timbre eléctrico diferenciado (square + sawtooth) con StereoPanner 3D
    this.rivalVoice = new VehicleSynthVoice(ctx, master, noiseBuffer, {
      mainWave: 'square',
      harmonicWave: 'sawtooth',
      harmonicMultiplier: 2.52,
      basePitchOffsetHz: 66,
      skidBaseHz: 1420,
      useStereoPanner: true,
    });

    this.isInitialized = true;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isMuted = !enabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : 0.32,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  /** Actualiza la voz principal del jugador */
  public updateContinuousFrame(params: {
    speedMs: number;
    maxSpeedMs: number;
    engineRpm?: number;
    maxRpm: number;
    throttle: number;
    driftIntensity: number;
    isDerailed: boolean;
    soundEnabled: boolean;
  }): void {
    this.setSoundEnabled(params.soundEnabled);
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    if (params.isDerailed) {
      this.playerVoice?.silence();
      return;
    }

    this.playerVoice?.update({
      speedMs: params.speedMs,
      maxSpeedMs: params.maxSpeedMs,
      engineRpm: params.engineRpm,
      maxRpm: params.maxRpm,
      throttle: params.throttle,
      driftIntensity: params.driftIntensity,
      volumeScale: 1.0,
      stereoPan: 0,
      dopplerFactor: 1.0,
    });
  }

  public playGearShiftSound(isUpshift: boolean): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isUpshift ? 115 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(isUpshift ? 52 : 95, now + 0.07);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  /**
   * Actualiza la voz espacial 3D del Rival IA con atenuación cuadrática por distancia,
   * paneo estéreo izquierdo/derecho respecto a la cámara y efecto Doppler al cruzarse.
   */
  public updateRivalSpatialFrame(params: {
    speedMs: number;
    maxSpeedMs: number;
    throttle: number;
    driftIntensity: number;
    distanceToListenerM: number;
    stereoPan: number;
    radialClosingSpeedMs: number;
    active: boolean;
  }): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    if (!params.active) {
      this.rivalVoice?.silence();
      return;
    }

    // Atenuación espacial realista: presencia clara a < 18 m (duelo puerta con puerta), silencio suave > 65 m
    const distRatio = params.distanceToListenerM / 18.0;
    const distanceAttenuation = 0.72 / (1 + distRatio * distRatio);

    if (distanceAttenuation < 0.015) {
      this.rivalVoice?.silence();
      return;
    }

    const dopplerFactor = Math.max(
      0.86,
      Math.min(1.15, 1 + params.radialClosingSpeedMs / 343.0)
    );

    this.rivalVoice?.update({
      speedMs: params.speedMs,
      maxSpeedMs: params.maxSpeedMs,
      maxRpm: 20800,
      throttle: params.throttle,
      driftIntensity: params.driftIntensity,
      volumeScale: distanceAttenuation,
      stereoPan: Math.max(-0.9, Math.min(0.9, params.stereoPan)),
      dopplerFactor,
    });
  }

  public silenceRival(): void {
    if (!this.isInitialized) return;
    this.rivalVoice?.silence();
  }

  public playDerailSound(): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.24);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playLapChime(isNewRecord: boolean): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const notes = isNewRecord ? [880, 1108.73, 1318.51, 1760] : [880, 1174.66];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const start = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.19);
    });
  }

  public playSectorBeep(color: 'purple' | 'green' | 'amber'): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const freq = color === 'purple' ? 1318.5 : color === 'green' ? 1046.5 : 659.25;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = color === 'purple' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playPerfectLapFanfare(): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const start = now + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  public playCountdownBeep(isGreenGo: boolean): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isGreenGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGreenGo ? 880 : 440, now);

    const duration = isGreenGo ? 0.34 : 0.14;
    gain.gain.setValueAtTime(isGreenGo ? 0.32 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playFalseStartBuzzer(): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.setValueAtTime(110, now + 0.14);

    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playOverVoltSound(): void {
    if (
      this.isMuted ||
      !this.isInitialized ||
      !this.ctx ||
      !this.masterGain ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(1720, now + 0.32);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.37);
  }
}

export const soundEngine = new ProceduralSlotSoundEngine();
