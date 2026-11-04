'use client';

import React, { useRef, useState } from 'react';
import {
  CALIPER_COLOR_PRESETS,
  PAINT_PRESETS,
  RIM_COLOR_PRESETS,
  RIM_STYLE_PRESETS,
  useGarageStore,
  useTelemetryStore,
} from '@/store/store';
import type { CustomAeroArchetype, PartCategory } from '@/types/types';

type GarageTab = PartCategory | 'visual' | 'community';

const TABS: readonly { id: GarageTab; label: string }[] = [
  { id: 'bodies', label: 'Carrocería' },
  { id: 'visual', label: '🎨 Pintura y Llantas' },
  { id: 'engines', label: 'Motor' },
  { id: 'tires', label: 'Gomas' },
  { id: 'rollers', label: 'Rodillos' },
  { id: 'chassis', label: 'Chasis' },
  { id: 'community', label: '+ .GLB' },
];

const ARCHETYPES: readonly {
  id: CustomAeroArchetype;
  title: string;
  spec: string;
}[] = [
  {
    id: 'balanced',
    title: 'Equilibrado Sport',
    spec: '14 kg · Downforce 0.55 · Punta ×1.01',
  },
  {
    id: 'downforce',
    title: 'Gran Alerón GT',
    spec: '16 kg · Downforce 1.05 · Punta ×0.96',
  },
  {
    id: 'topspeed',
    title: 'Cola Larga Velocidad',
    spec: '12 kg · Downforce 0.24 · Punta ×1.06',
  },
];

/**
 * Panel desplegable de Ingeniería de Garaje ("Let's & Go"), Economía GP
 * e Importador Drag & Drop de coches `.glb` de la comunidad (persistidos en IndexedDB).
 */
export function GaragePanel() {
  const isOpen = useGarageStore((s) => s.isGarageOpen);
  const setGarageOpen = useGarageStore((s) => s.setGarageOpen);
  const [activeTab, setActiveTab] = useState<GarageTab>('bodies');
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedArchetype, setSelectedArchetype] =
    useState<CustomAeroArchetype>('balanced');
  const [authorInput, setAuthorInput] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const catalog = useGarageStore((s) => s.catalog);
  const customBodies = useGarageStore((s) => s.customBodies);
  const loadout = useGarageStore((s) => s.loadout);
  const activeParts = useGarageStore((s) => s.activeParts);
  const carStats = useGarageStore((s) => s.carStats);
  const visualConfig = useGarageStore((s) => s.visualConfig);
  const updateVisualConfig = useGarageStore((s) => s.updateVisualConfig);
  const gpCredits = useGarageStore((s) => s.gpCredits);
  const unlockedPartIds = useGarageStore((s) => s.unlockedPartIds);
  const sandboxUnlocked = useGarageStore((s) => s.sandboxUnlocked);
  const magnetMode = useTelemetryStore((s) => s.magnetMode);
  const toggleMagnetMode = useTelemetryStore((s) => s.toggleMagnetMode);

  const selectOrBuyPart = useGarageStore((s) => s.selectOrBuyPart);
  const toggleSandboxUnlocked = useGarageStore((s) => s.toggleSandboxUnlocked);
  const importCommunityCarGLB = useGarageStore((s) => s.importCommunityCarGLB);
  const rotateCommunityCarYaw = useGarageStore((s) => s.rotateCommunityCarYaw);
  const deleteCommunityCar = useGarageStore((s) => s.deleteCommunityCar);

  const showTransientNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const isPartUnlocked = (partId: string, price = 0, isCustom = false) =>
    sandboxUnlocked ||
    isCustom ||
    price <= 0 ||
    unlockedPartIds.includes(partId);

  const handlePartAction = (
    category: PartCategory,
    partId: string,
    partName: string,
    price = 0,
    isCustom = false
  ) => {
    const alreadyUnlocked = isPartUnlocked(partId, price, isCustom);
    const ok = selectOrBuyPart(category, partId);
    if (!ok) {
      const missing = Math.max(0, price - gpCredits);
      showTransientNotice(
        `Te faltan ${missing} GP para ${partName}. Completa vueltas o activa Sandbox.`
      );
    } else if (!alreadyUnlocked && price > 0) {
      showTransientNotice(`¡${partName} desbloqueado y equipado (-${price} GP)!`);
    }
  };

  const handleGLBFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      showTransientNotice(
        'Sube un archivo binario .glb (en Sketchfab elige el formato glTF / .glb).'
      );
      return;
    }

    try {
      await importCommunityCarGLB(file, selectedArchetype, authorInput);
      setAuthorInput('');
      setActiveTab('bodies');
      showTransientNotice(
        `¡"${file.name}" importado y equipado! Usa "Girar 90°" si mira hacia un lado.`
      );
    } catch {
      showTransientNotice('No se pudo guardar el archivo .glb en el navegador.');
    }
  };

  const allBodies = [...catalog.bodies, ...customBodies];

  const renderPriceBadge = (
    active: boolean,
    unlocked: boolean,
    price = 0,
    weightLabel: string,
    isCustom = false
  ) => {
    if (active) {
      return (
        <span className="rounded-xs bg-[#2F81F7] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
          Equipado · {weightLabel}
        </span>
      );
    }
    if (isCustom) {
      return (
        <span className="rounded-xs bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
          Custom 3D · {weightLabel}
        </span>
      );
    }
    if (unlocked) {
      return (
        <span className="font-mono text-[11px] text-slate-400">
          {weightLabel}
        </span>
      );
    }
    const canAfford = gpCredits >= price;
    return (
      <span
        className={`rounded-xs px-1.5 py-0.5 font-mono text-[10px] font-bold ${
          canAfford
            ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
            : 'bg-slate-800 text-slate-400'
        }`}
      >
        Desbloquear · {price} GP
      </span>
    );
  };

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setGarageOpen(!isOpen)}
        aria-expanded={isOpen}
        className={`flex items-center gap-3 rounded-md border px-3.5 py-2 text-left backdrop-blur-md transition-colors ${
          isOpen
            ? 'border-[#2F81F7] bg-[#1A2332]/95'
            : 'border-slate-700/90 bg-[#151B24]/92 hover:border-[#2F81F7]'
        }`}
      >
        <div>
          <span className="block font-display text-xs font-bold text-[#F0F4F8]">
            Garaje · {activeParts.body.name}
          </span>
          <span className="block font-mono text-[11px] tabular-nums text-slate-400">
            <span className="font-semibold text-emerald-400">
              Acceso Total
            </span>{' '}
            · {carStats.TotalWeight} kg · {Math.round(carStats.TotalGrip)} N
          </span>
        </div>
        <span className="rounded-xs bg-[#2F81F7]/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#2F81F7]">
          {isOpen ? 'Cerrar' : 'Piezas'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 z-40 mt-2 w-84 sm:w-[420px] max-h-[80vh] overflow-y-auto rounded-md border border-slate-700/90 bg-[#151B24]/97 p-4 shadow-2xl backdrop-blur-md">
          {/* Barra superior de Acceso Total al Garaje + Showroom 360° */}
          <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xs border border-slate-800 bg-[#0D1117]/90 px-3 py-2">
            <div>
              <span className="block font-mono text-[10px] text-cyan-400">
                🎥 Showroom 360° activo · Acceso Completo Pro
              </span>
              <span className="font-mono text-xs font-bold text-emerald-400">
                ✓ Todos los coches (100k+ vértices) y piezas desbloqueados
              </span>
            </div>
          </div>

          {notice && (
            <div className="mb-2.5 rounded-xs border border-[#F59E0B]/60 bg-[#F59E0B]/15 px-2.5 py-1.5 text-[11px] text-amber-100">
              {notice}
            </div>
          )}

          {/* Resumen consolidado de ingeniería */}
          <div className="grid grid-cols-3 gap-2 rounded-xs border border-slate-800 bg-[#0D1117]/90 p-2.5 font-mono text-xs tabular-nums">
            <div>
              <span className="block text-[10px] text-slate-400">Peso total</span>
              <span className="font-semibold text-[#F0F4F8]">
                {carStats.TotalWeight} kg
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Vel. punta</span>
              <span className="font-semibold text-[#F0F4F8]">
                {carStats.MaxSpeed} km/h
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Aceleración</span>
              <span className="font-semibold text-[#F0F4F8]">
                {carStats.Acceleration} m/s²
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Grip base</span>
              <span className="font-semibold text-[#2F81F7]">
                {Math.round(carStats.TotalGrip)} N
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Carga aero</span>
              <span className="font-semibold text-emerald-400">
                +{carStats.AeroDownforceCoeff} v²
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Techo derrape</span>
              <span className="font-semibold text-[#F59E0B]">
                {Math.round(
                  (carStats.DriftCeilingRatio +
                    (magnetMode === 'wood-free' ? 0.36 : 0)) *
                    100
                )}
                %
              </span>
            </div>
          </div>

          {/* Selector de Reglaje de Imán de Neodimio en el Chasis */}
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xs border border-slate-800 bg-[#0D1117]/90 px-3 py-2">
            <div>
              <span className="block font-display text-xs font-bold text-[#F0F4F8]">
                Reglaje de Imán de Chasis [I]
              </span>
              <span className="block text-[11px] text-slate-400">
                {magnetMode === 'gt-magnet'
                  ? 'Imán GT: Máximo apoyo vertical en curva rápida'
                  : 'Modo Wood Sin Imán: Derrapes largos y progresivos de costado (+36% margen)'}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleMagnetMode}
              className={`shrink-0 rounded-xs border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                magnetMode === 'gt-magnet'
                  ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-200'
                  : 'border-[#F59E0B]/80 bg-[#F59E0B]/20 text-amber-200'
              }`}
            >
              {magnetMode === 'gt-magnet' ? '🧲 Imán GT' : '🪵 Wood Libre'}
            </button>
          </div>

          {/* Pestañas de subsistemas Let's & Go + Comunidad .GLB */}
          <div className="mt-3 flex flex-wrap gap-1 border-b border-slate-800 pb-2">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              const isCommunityTab = tab.id === 'community';
              const isVisualTab = tab.id === 'visual';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? isCommunityTab
                        ? 'bg-cyan-600 text-white'
                        : isVisualTab
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-[#2F81F7] text-white'
                      : isCommunityTab
                        ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                        : isVisualTab
                          ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                          : 'bg-[#0D1117]/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contenido de la categoría seleccionada */}
          <div className="mt-3 space-y-2">
            {activeTab === 'visual' && (
              <div className="space-y-3">
                {/* 1. Selector de Pintura Oficial PBR */}
                <div className="rounded-xs border border-slate-800 bg-[#0D1117]/85 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-[#F0F4F8]">
                      1. Pintura Oficial PBR en Tiempo Real
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateVisualConfig({
                          paintHex: null,
                          paintFinish: 'gloss-clearcoat',
                          rimStyle: 'default',
                          rimColorHex: null,
                          caliperColorHex: null,
                        })
                      }
                      className="rounded-xs border border-slate-700 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-amber-400 hover:text-amber-300"
                    >
                      ↺ Restaurar OEM
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {PAINT_PRESETS.map((preset) => {
                      const active = visualConfig.paintHex === preset.hex;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateVisualConfig({ paintHex: preset.hex })
                          }
                          className={`flex items-center gap-2 rounded-xs border px-2 py-1.5 text-left text-[11px] transition-colors ${
                            active
                              ? 'border-amber-400 bg-amber-500/15 font-bold text-white'
                              : 'border-slate-800 bg-[#151B24]/70 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 shadow-xs"
                            style={{ backgroundColor: preset.cssHex }}
                          />
                          <span className="truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Acabado de laca Clearcoat vs Mate */}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateVisualConfig({ paintFinish: 'gloss-clearcoat' })
                      }
                      className={`flex-1 rounded-xs border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                        visualConfig.paintFinish === 'gloss-clearcoat'
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-800 bg-[#151B24]/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ✨ Lacado Clearcoat
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateVisualConfig({ paintFinish: 'satin-matte' })
                      }
                      className={`flex-1 rounded-xs border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                        visualConfig.paintFinish === 'satin-matte'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-slate-800 bg-[#151B24]/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🌑 Satinado / Mate
                    </button>
                  </div>
                </div>

                {/* 2. Selector de Geometría 3D de Llantas Forjadas */}
                <div className="rounded-xs border border-slate-800 bg-[#0D1117]/85 p-2.5">
                  <span className="block font-display text-xs font-bold text-[#F0F4F8]">
                    2. Diseño de Llanta 3D Forjada (6 Geometrías)
                  </span>
                  <div className="mt-2 space-y-1.5">
                    {RIM_STYLE_PRESETS.map((rim) => {
                      const active = visualConfig.rimStyle === rim.id;
                      return (
                        <button
                          key={rim.id}
                          type="button"
                          onClick={() =>
                            updateVisualConfig({ rimStyle: rim.id })
                          }
                          className={`flex w-full items-center justify-between rounded-xs border px-2.5 py-1.5 text-left transition-colors ${
                            active
                              ? 'border-[#2F81F7] bg-[#2F81F7]/20 text-white'
                              : 'border-slate-800 bg-[#151B24]/70 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <span className="block text-xs font-semibold">
                              {rim.label}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {rim.subtitle}
                            </span>
                          </div>
                          {active && (
                            <span className="rounded-xs bg-[#2F81F7] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                              Montada
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Acabado Metálico de Llanta y Color de Pinzas Brembo */}
                <div className="rounded-xs border border-slate-800 bg-[#0D1117]/85 p-2.5">
                  <span className="block font-display text-xs font-bold text-[#F0F4F8]">
                    3. Aleación de Llanta & Pinzas Brembo 6 Pistones
                  </span>

                  <span className="mt-2 block font-mono text-[10px] uppercase text-slate-400">
                    Acabado Metálico de la Llanta
                  </span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {RIM_COLOR_PRESETS.map((rc) => {
                      const active = visualConfig.rimColorHex === rc.hex;
                      return (
                        <button
                          key={rc.id}
                          type="button"
                          onClick={() =>
                            updateVisualConfig({ rimColorHex: rc.hex })
                          }
                          className={`flex items-center gap-1.5 rounded-xs border px-2 py-1 text-left text-[11px] transition-colors ${
                            active
                              ? 'border-amber-400 bg-amber-500/15 font-bold text-white'
                              : 'border-slate-800 bg-[#151B24]/70 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                            style={{ backgroundColor: rc.cssHex }}
                          />
                          <span className="truncate">{rc.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="mt-2.5 block font-mono text-[10px] uppercase text-slate-400">
                    Color de Pinza de Freno Brembo
                  </span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {CALIPER_COLOR_PRESETS.map((cc) => {
                      const active = visualConfig.caliperColorHex === cc.hex;
                      return (
                        <button
                          key={cc.id}
                          type="button"
                          onClick={() =>
                            updateVisualConfig({ caliperColorHex: cc.hex })
                          }
                          className={`flex items-center gap-1.5 rounded-xs border px-2 py-1 text-left text-[11px] transition-colors ${
                            active
                              ? 'border-emerald-400 bg-emerald-500/15 font-bold text-white'
                              : 'border-slate-800 bg-[#151B24]/70 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                            style={{ backgroundColor: cc.cssHex }}
                          />
                          <span className="truncate">{cc.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bodies' &&
              allBodies.map((body) => {
                const active = body.id === loadout.bodyId;
                const price = body.price ?? 0;
                const unlocked = isPartUnlocked(
                  body.id,
                  price,
                  Boolean(body.isCustom)
                );

                return (
                  <div
                    key={body.id}
                    className={`rounded-xs border transition-colors ${
                      active
                        ? 'border-[#2F81F7] bg-[#2F81F7]/15'
                        : 'border-slate-800 bg-[#0D1117]/60 hover:border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handlePartAction(
                          'bodies',
                          body.id,
                          body.name,
                          price,
                          Boolean(body.isCustom)
                        )
                      }
                      className="w-full p-2.5 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F0F4F8]">
                          {body.name}
                        </span>
                        {renderPriceBadge(
                          active,
                          unlocked,
                          price,
                          `${body.weight} kg`,
                          Boolean(body.isCustom)
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {body.description}
                      </p>
                      <div className="mt-1 flex items-center justify-between font-mono text-[11px]">
                        <span className="text-emerald-400">
                          Downforce: {body.downforceCoeff} · Punta: ×
                          {body.aeroSpeedFactor.toFixed(2)}
                        </span>
                        {body.author && (
                          <span className="text-[10px] text-slate-500">
                            por {body.author}
                          </span>
                        )}
                      </div>
                    </button>

                    {body.isCustom && (
                      <div className="flex items-center justify-between border-t border-slate-800/80 px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => void rotateCommunityCarYaw(body.id)}
                          className="rounded-xs border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                        >
                          ↻ Girar morro 90°
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteCommunityCar(body.id)}
                          className="rounded-xs border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:border-[#E63946] hover:text-[#E63946]"
                        >
                          Borrar .glb
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {activeTab === 'engines' &&
              catalog.engines.map((engine) => {
                const active = engine.id === loadout.engineId;
                const price = engine.price ?? 0;
                const unlocked = isPartUnlocked(engine.id, price);
                return (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() =>
                      handlePartAction('engines', engine.id, engine.name, price)
                    }
                    className={`w-full rounded-xs border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-[#2F81F7] bg-[#2F81F7]/15'
                        : 'border-slate-800 bg-[#0D1117]/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {engine.name}
                      </span>
                      {renderPriceBadge(
                        active,
                        unlocked,
                        price,
                        `${engine.weight} kg`
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {engine.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-300">
                      {engine.maxRpm.toLocaleString('es-ES')} RPM ·{' '}
                      {engine.torque} N·m
                    </p>
                  </button>
                );
              })}

            {activeTab === 'tires' &&
              catalog.tires.map((tire) => {
                const active = tire.id === loadout.tiresId;
                const price = tire.price ?? 0;
                const unlocked = isPartUnlocked(tire.id, price);
                return (
                  <button
                    key={tire.id}
                    type="button"
                    onClick={() =>
                      handlePartAction('tires', tire.id, tire.name, price)
                    }
                    className={`w-full rounded-xs border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-[#2F81F7] bg-[#2F81F7]/15'
                        : 'border-slate-800 bg-[#0D1117]/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {tire.name}
                      </span>
                      {renderPriceBadge(
                        active,
                        unlocked,
                        price,
                        `${tire.weight} kg`
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {tire.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#2F81F7]">
                      Coeficiente μ = {tire.gripCoefficient.toFixed(2)}
                    </p>
                  </button>
                );
              })}

            {activeTab === 'rollers' &&
              catalog.rollers.map((roller) => {
                const active = roller.id === loadout.rollersId;
                const price = roller.price ?? 0;
                const unlocked = isPartUnlocked(roller.id, price);
                return (
                  <button
                    key={roller.id}
                    type="button"
                    onClick={() =>
                      handlePartAction('rollers', roller.id, roller.name, price)
                    }
                    className={`w-full rounded-xs border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-[#2F81F7] bg-[#2F81F7]/15'
                        : 'border-slate-800 bg-[#0D1117]/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {roller.name}
                      </span>
                      {renderPriceBadge(
                        active,
                        unlocked,
                        price,
                        `${roller.weight} kg`
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {roller.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#F59E0B]">
                      Margen extra derrape: +
                      {Math.round(roller.driftMarginBonus * 100)}%
                    </p>
                  </button>
                );
              })}

            {activeTab === 'chassis' &&
              catalog.chassis.map((chassis) => {
                const active = chassis.id === loadout.chassisId;
                const price = chassis.price ?? 0;
                const unlocked = isPartUnlocked(chassis.id, price);
                return (
                  <button
                    key={chassis.id}
                    type="button"
                    onClick={() =>
                      handlePartAction(
                        'chassis',
                        chassis.id,
                        chassis.name,
                        price
                      )
                    }
                    className={`w-full rounded-xs border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-[#2F81F7] bg-[#2F81F7]/15'
                        : 'border-slate-800 bg-[#0D1117]/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {chassis.name}
                      </span>
                      {renderPriceBadge(
                        active,
                        unlocked,
                        price,
                        `${chassis.baseWeight} kg`
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {chassis.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-300">
                      Centro de gravedad: {chassis.centerOfGravity} m
                    </p>
                  </button>
                );
              })}

            {activeTab === 'community' && (
              <div className="space-y-3">
                <div className="rounded-xs border border-slate-800 bg-[#0D1117]/80 p-2.5">
                  <span className="block text-[11px] font-semibold text-slate-200">
                    1. Elige perfil aerodinámico para el modelo 3D
                  </span>
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                    {ARCHETYPES.map((arch) => {
                      const active = selectedArchetype === arch.id;
                      return (
                        <button
                          key={arch.id}
                          type="button"
                          onClick={() => setSelectedArchetype(arch.id)}
                          className={`flex items-center justify-between rounded-xs border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                            active
                              ? 'border-cyan-400 bg-cyan-500/15 text-white'
                              : 'border-slate-800 bg-[#151B24]/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span className="font-semibold">{arch.title}</span>
                          <span className="font-mono text-[10px] text-cyan-300">
                            {arch.spec}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-2.5 block text-[11px] text-slate-400">
                    Autor o crédito CC-BY (opcional)
                    <input
                      type="text"
                      value={authorInput}
                      onChange={(e) => setAuthorInput(e.target.value)}
                      placeholder="Ej. Kenney / Autor Sketchfab"
                      maxLength={32}
                      className="mt-1 w-full rounded-xs border border-slate-700 bg-[#151B24] px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                  </label>
                </div>

                {/* Zona Drag & Drop .GLB */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const dropped = e.dataTransfer.files?.[0];
                    void handleGLBFile(dropped);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xs border-2 border-dashed p-4 text-center transition-colors ${
                    isDraggingFile
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-cyan-500/50 bg-[#0D1117]/75 hover:border-cyan-400 hover:bg-cyan-500/10'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb"
                    className="hidden"
                    onChange={(e) => {
                      const chosen = e.target.files?.[0];
                      void handleGLBFile(chosen);
                      e.target.value = '';
                    }}
                  />
                  <p className="font-display text-xs font-bold text-cyan-300">
                    2. Arrastra aquí tu archivo .GLB o haz clic para subirlo
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Auto-escalado a 4.2 m y guardado permanente en IndexedDB
                    (offline PWA).
                  </p>
                </div>

                {/* Directorio curado de repositorios 3D gratuitos */}
                <div className="rounded-xs border border-slate-800 bg-[#0D1117]/80 p-2.5 text-[11px]">
                  <span className="block font-semibold text-slate-200">
                    ¿Dónde descargar coches .GLB gratuitos de la comunidad?
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    <a
                      href="https://poly.pizza/search/car"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1.5 text-cyan-300 hover:border-cyan-400"
                    >
                      ↗ Poly Pizza (.glb)
                    </a>
                    <a
                      href="https://kenney.nl/assets/car-kit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1.5 text-cyan-300 hover:border-cyan-400"
                    >
                      ↗ Kenney Car Kit CC0
                    </a>
                    <a
                      href="https://quaternius.com/packs/ultimatetexturedvehicles.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1.5 text-cyan-300 hover:border-cyan-400"
                    >
                      ↗ Quaternius CC0
                    </a>
                    <a
                      href="https://sketchfab.com/search?features=downloadable&q=low+poly+race+car&type=models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xs border border-slate-700 bg-[#151B24] px-2 py-1.5 text-cyan-300 hover:border-cyan-400"
                    >
                      ↗ Sketchfab (glTF/glb)
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GaragePanel;
