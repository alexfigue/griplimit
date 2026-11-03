import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Grip Limit — Slot & Garage Racing',
    short_name: 'Grip Limit',
    description:
      'Simulador híbrido 3D de pista estilo Scalextric e ingeniería de garaje Let’s & Go en el Circuit de Barcelona-Catalunya.',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0D1117',
    theme_color: '#0D1117',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
