import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-chakra-petch',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Grip Limit | Slot Physics & Garage Engineering',
  description:
    'Juego 3D híbrido de Scalextric e ingeniería de garaje Let’s & Go sobre el trazado de Montmeló.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Grip Limit',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D1117',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${chakraPetch.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
