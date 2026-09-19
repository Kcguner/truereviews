import type { Metadata } from 'next';
import './globals.css';
import { getSiteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'Ücretsiz Google Yorum Analizi',
  description: 'İşletmenizin Google Maps yorumlarını ücretsiz analiz edin.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
