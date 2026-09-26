import type { Metadata } from 'next';

// 404 asla dizine girmez: Next.js bu rotaya zaten otomatik `noindex` ekliyor,
// bu yüzden burada `robots` tanımlanmıyor (iki meta etiketi basılmasın).
//
// Bu DOSYA artık son çare: dil BİLİNMEYEN durumlar için (örn. `/xx/sayfa`)
// kullanılır, çünkü `notFound()` `app/[locale]/layout.tsx` içinde çağrıldığında
// o segment'in kendi `not-found.tsx`'i (app/[locale]/not-found.tsx) devreye
// giremiyor. Bilinen bir dil için 404 locale segment'inde render edilir.
export const metadata: Metadata = {
  title: 'Sayfa bulunamadı / Page not found — TrueReviews'
};

export default function NotFound() {
  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#f5efe3',
          color: '#1f1c17',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0
        }}
      >
        <main style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 14, letterSpacing: 2, color: '#17463c' }}>404</p>
          <h1 style={{ fontSize: 28, margin: '8px 0' }}>Bu sayfa bulunamadı / Page not found</h1>
          <p>
            {/* Dil burada bilinmiyor; `/` locale middleware'ine düşer ve tarayıcı
                diline (NEXT_LOCALE → Accept-Language → tr) göre `/xx`'ye yönlendirir. */}
            <a href="/" style={{ color: '#17463c', fontWeight: 700 }}>
              Ana sayfaya dön / Home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
