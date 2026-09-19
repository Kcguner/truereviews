import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YorumAnalizi — Google Yorum Analizi',
    short_name: 'YorumAnalizi',
    description: 'Google Maps yorumlarınızın dürüst özeti: skor, tekrar eden konular ve tek somut adım.',
    start_url: '/tr',
    display: 'standalone',
    background_color: '#f5efe3',
    theme_color: '#17463c',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  };
}
