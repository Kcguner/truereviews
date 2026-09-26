/** Merkezi site URL'si. Sadece server-side kullanılır (private env). */
export function getSiteUrl(): string {
  return (process.env.APP_URL || 'https://get-truereviews.vercel.app').replace(/\/+$/, '');
}
