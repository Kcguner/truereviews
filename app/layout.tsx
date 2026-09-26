import type { Metadata } from 'next';
import './globals.css';
import { getSiteUrl } from '@/lib/site';

/**
 * Bu layout yalnızca `/` (dil middleware'ine yönlendirir) ve global 404'ü sarar;
 * asıl içerik `app/[locale]/layout.tsx` altındadır.
 *
 * `robots` BİLEREK burada tanımlanmıyor: Next.js 404 rotasına zaten otomatik
 * `noindex` ekliyor, burada bir daha eklemek iki meta etiketi basıyordu.
 * İndekslenebilir sayfalar `robots`'u kendi `generateMetadata`'sinde veriyor
 * (app/[locale]/page.tsx → lib/seo.ts ROBOTS_INDEX).
 */
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'TrueReviews — Google Review Analysis',
  description:
    'An honest one-page summary of your Google Maps reviews: satisfaction score, recurring praise and complaints, one concrete weekly action. Free, no sign-up.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
