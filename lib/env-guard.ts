const warned = new Set<string>();

/**
 * Üretimde sessiz "mock/pasif" fallback'leri yüksek sesle loglar.
 * Geliştirmede sessiz kalır, prod'da hatayı gizlemez.
 */
export function warnProdOnce(key: string, msg: string): void {
  if (process.env.NODE_ENV === 'production' && !warned.has(key)) {
    warned.add(key);
    // eslint-disable-next-line no-console
    console.error(`[PROD-GUARD] ${msg}`);
  }
}
