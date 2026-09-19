import Script from 'next/script';

/**
 * Gizlilik-dostu analitik (Plausible). Env yoksa hiçbir şey render etmez.
 * Alternatif: NEXT_PUBLIC_PLAUSIBLE_SRC ile self-host Plausible.
 */
export default function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js';
  return <Script defer data-domain={domain} src={src} />;
}
