import type { Metadata } from 'next';
import './globals.css';
import { getSiteUrl } from '@/lib/site';

/**
 * Bu layout yalnızca `/` (dil middleware'ine yönlendirir) ve global 404'ü sarar;
 * asıl içerik `app/[locale]/layout.tsx` altındadır.
 *
 * ⚠️ BURADA BİLEREK `<html>` / `<body>` YOK — "eksik" gibi görünüyor ama
 * taşımak hatalı olur. Sebep: document elementi `lang` + `dir` taşır ve bu iki
 * değer ancak `[locale]` segmenti okunduktan sonra bilinir (`i18n.config.ts` →
 * `rtlLocales: ['ar','fa']`). Root layout `[locale]`'in ÜSTÜNDE olduğu için
 * orada `lang`/`dir` karar veremez; sabit bir `lang="tr"` basmak RTL dilleri
 * (ar, fa) bozar — ekran okuyucular ters yönde okur, CSS mantıksal özellikleri
 * yanlış çözülür. Bu yüzden Next.js 14'te "missing <html> and <body> tags in
 * layout" uyarısı istemcide görünür, derlemeyi bozmaz; bizim durumumuzda zaten
 * belge `app/[locale]/layout.tsx:110-116` tarafından üretilir.
 *
 * Doğrulama (dev): `curl -s localhost:<port>/ar/rapor` → `<html lang="ar" dir="rtl">`,
 * `/tr` → `<html lang="tr" dir="ltr">`, `/_not-found` middleware'de
 * `/tr/_not-found`'a 307 atar ve o da aynı belgeyi üretir.
 *
 * `robots` da burada tanımlanmıyor: Next.js 404 rotasına zaten otomatik
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
