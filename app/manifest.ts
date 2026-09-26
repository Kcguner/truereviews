import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    // Dil nötr İngilizce: manifest tek dosyadır ve tüm locale'lerde aynı URL'den
    // servis edilir. start_url kök olmalı; /tr sabitlemek diğer dilleri yanlış yola
    // yönlendiriyordu.
    name: 'TrueReviews — Google Review Analysis',
    short_name: 'TrueReviews',
    description:
      'An honest one-page summary of your Google Maps reviews: satisfaction score, recurring praise and complaints, one concrete weekly action.',
    lang: 'en',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    categories: ['business', 'productivity', 'utilities'],
    background_color: '#f5efe3',
    theme_color: '#17463c',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  };
}
