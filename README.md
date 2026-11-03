# Grip Limit (v2.0)

Simulador 3D de navegador preparado para **PWA**, construido con **Next.js (App Router)**, **TypeScript**, **React Three Fiber (R3F)**, **Drei** y **Zustand**. Combina el pilotaje táctico sobre doble carril de **Scalextric** (sin desgaste de neumáticos) con la ingeniería modular de garaje de **Let's & Go**.

## Características principales v2.0

- **Modo Copa 3V (*Let's & Go*) + Semáforo F1 de 5 Focos + Jefes IA**:
  - **Parrilla de Salida F1**: Secuencia oficial de 5 luces rojas en el pórtico 3D y en el HUD. Acelerar antes de apagarse penaliza con **Salida Nula** (`1.2 s` de corte de corriente); clavar el gatillo en `< 0.28 s` al apagarse activa **¡Salida Perfecta Turbo!** (`+28 %` de empuje inicial).
  - **3 Jefes IA con personalidad propia**: **Kai "Vortex"** (*Copa Bronce* en Montmeló), **Mako "Corkscrew"** (*Copa Plata* en Sierra Seca) y **Viktor "Midnight"** (*Copa Oro* en Neo-Wangan, capaz de forzar el vértice y descarrilar si le presionas a menos de `8 m`).
- **Rebufo Aerodinámico (Slipstream) y Descarga OverVolt 18V (`[B]`)**:
  - **Rebufo**: Rodar a menos de `15 m` detrás del rival reduce la resistencia aerodinámica un `35 %`, suma `+12 %` de aceleración y recarga el condensador.
  - **OverVolt 18V**: Derrapar al límite en curva y rodar a rebufo cargan el condensador de `0 %` a `100 %`. Al activarlo (`Tecla B` o botón táctil), libera `2.5 s` de sobrevoltaje (`+28 %` aceleración, `+14 %` punta y chispas eléctricas cian).
- **Clima Dinámico: Seco y Tormenta de Lluvia (`[V]`)**:
  - Cortina 3D de lluvia 0-GC (`950` trazos dinámicos), asfalto húmedo especular tipo espejo y pérdida de adherencia en seco (`78 %`), compensable equipando los neumáticos **Lluvia Extrema Wet-Pro (`96 %`)** en el Garaje (`+20 % GP` extra en lluvia).
- **Flota Oficial de 9 Vehículos `.GLB` + Giro Físico de las 4 Ruedas + Showroom 360°**:
  - Incluye 9 vehículos `.glb` preinstalados en `/public/cars/` (incluyendo modelos CC0 de *Kenney* y *Open Source 3D*: *Kenney Touring GT*, *Apex V10 Stradale*, *Titan Euro-Truck Racing* y *Superbike GP Slot*) con giro físico real de ruedas ($\omega = v / r$).
  - Al abrir el **Garaje**, la cámara orbita automáticamente 360° alrededor del coche en modo **Showroom Turntable**.
  - **Taller Custom Drag & Drop (`.glb`)**: Arrastra cualquier coche `.glb` de la comunidad; se auto-escala a `4.2 m`, se persiste en **`IndexedDB`** y permite rotar el morro `90°`.

## Ejecución local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

## Controles rápidos

- **Acelerar**: `W` / `Flecha Arriba` / `Espacio` (o pedal táctil derecho).
- **Frenar**: `S` / `Flecha Abajo` / `Shift` (o pedal táctil izquierdo).
- **Descarga OverVolt 18V**: `B` (o botón táctil `OverVolt`).
- **Clima (Seco / Lluvia `+20% GP`)**: `V`
- **Ayuda predictiva ON/OFF (`×1.35 GP` en OFF)**: `H`
- **Coche Fantasma (Ghost Replay) ON/OFF**: `G`
- **Ambiente (Exterior Real / Maqueta de Salón)**: `E`
- **Cambiar carril (Izquierdo / Derecho)**: `L`
- **Silenciar / Activar audio**: `M`
- **Cámara (Persecución con FOV dinámico / Cenital)**: `C`
- **Reencarrilar**: `R`
