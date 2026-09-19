/** Merkezi site URL'si. Üretimde NEXT_PUBLIC_APP_URL set edilmeli. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ornek.vercel.app').replace(/\/+$/, '');
}
