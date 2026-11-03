# Grip Limit (v1.0)

Simulador 3D de navegador preparado para **PWA**, construido con **Next.js (App Router)**, **TypeScript**, **React Three Fiber (R3F)**, **Drei** y **Zustand**. Combina el pilotaje táctico sobre doble carril de **Scalextric** (sin desgaste de neumáticos) con la ingeniería modular de garaje de **Let's & Go**.

## Características principales v1.0

- **3 Circuitos 3D con biomas propios + Modo Maqueta de Salón (`[E]`)**:
  - **Montmeló GP**: Curvas largas parabólicas (*Renault*, *Campsa*), pinar mediterráneo `InstancedMesh` y Tribuna Principal.
  - **Sierra Seca**: Montaña rusa inspirada en *Laguna Seca* con subida de `+14.4 m`, cañón desértico y el **Sacacorchos** (caída del `25 %` enlazando izquierda-derecha).
  - **Neo-Wangan**: Autopista urbana nocturna inspirada en la *Shuto Expressway C1* de Tokio con viaductos elevados (`+9.4 m`) y rascacielos iluminados en neón cian/magenta.
  - **Modo Salón / Maqueta**: Alterna en tiempo real a una mesa gigante de roble con transformador clásico de Scalextric y cajas Mini-4WD.
- **Sectores Estilo F1 (`S1`, `S2`, `S3`), Vuelta Perfecta y Coche Fantasma (`[G]`)**:
  - Parciales en vivo con código oficial de colores (**Morado** récord absoluto, **Verde** en ritmo, **Ámbar** lento).
  - Calificación automática al cruzar meta (**¡Vuelta Perfecta!**, **Maestro del Derrape**, **Vuelta Limpia**) y recompensas en **Créditos GP** (`×1.35` al conducir con `Ayuda: OFF`).
  - **Ghost Car** holográfico grabado a `20 Hz` en `Float32Array` (0 GC) y persistido por circuito.
- **Garaje *Let's & Go* + Importador `.GLB` de la Comunidad**:
  - **5 Carrocerías 3D base** (*Magnum Aero-Saber*, *Sonic Downforce GT*, *Phantom Streamliner*, *Shuto Boxer GT-R* y *Asurada Cyber-F1*), **3 Motores**, **3 Compuestos de Neumáticos**, **3 Juegos de Rodillos Guía** y **2 Chasis** (con progresión GP o interruptor **Sandbox** de 1 clic).
  - **Taller Custom Drag & Drop (`.glb`)**: Arrastra cualquier coche `.glb` descargado de *Sketchfab*, *Poly Pizza*, *Kenney* o *Quaternius*; se normaliza automáticamente a `4.2 m`, se guarda en **`IndexedDB`** y permite rotar el morro `90°` con un clic.
- **Doble Carril + Rival IA con Audio Espacial 3D**:
  - Dos raíles paralelos (`±1.25 m`) con geometría diferencial exacta y motor de sonido dual Web Audio API (`StereoPannerNode`, atenuación cuadrática y efecto Doppler).

## Ejecución local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

## Controles rápidos

- **Acelerar**: `W` / `Flecha Arriba` / `Espacio` (o pedal táctil derecho).
- **Frenar**: `S` / `Flecha Abajo` / `Shift` (o pedal táctil izquierdo).
- **Ayuda predictiva ON/OFF (`×1.35 GP` en OFF)**: `H`
- **Coche Fantasma (Ghost Replay) ON/OFF**: `G`
- **Ambiente (Exterior Real / Maqueta de Salón)**: `E`
- **Cambiar carril (Izquierdo / Derecho)**: `L`
- **Silenciar / Activar audio**: `M`
- **Cámara (Persecución con FOV dinámico / Cenital)**: `C`
- **Reencarrilar**: `R`
