import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Croquetas',
  description: 'Aplicación de Croquetas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

