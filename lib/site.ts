/** Merkezi site URL'si. Sadece server-side kullanılır (private env). */
export function getSiteUrl(): string {
  return (process.env.APP_URL || 'https://get-truereviews.vercel.app').replace(/\/+$/, '');
}

export type SocialKey = 'github' | 'instagram' | 'x';

export type SocialLink = {
  key: SocialKey;
  /** Platform adı — erişilebilirlik ve tooltip için, çevirilemez marka adı. */
  label: string;
  href: string;
};

/**
 * Footer'daki sosyal bağlantılar. Marka hesap adresleri değişmediği için
 * çeviri sözlüğüne değil buraya konur — tek kaynak, 10 dilde aynı linkler.
 * Sıra görsel okuma sırası (GitHub → Instagram → X).
 */
export const SOCIAL_LINKS: SocialLink[] = [
  { key: 'github', label: 'GitHub', href: 'https://kcguner.github.io/profile/' },
  { key: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/kaancang1/' },
  { key: 'x', label: 'X', href: 'https://x.com/Kaancang1' }
];

/** İletişim e-postası. Boşsa footer/iletişimde e-posta bloğu gizlenir. */
export function getContactEmail(): string | null {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;
}
