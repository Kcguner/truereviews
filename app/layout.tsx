import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ücretsiz Google Yorum Analizi',
  description: 'İşletmenizin Google Maps yorumlarını ücretsiz analiz edin.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
