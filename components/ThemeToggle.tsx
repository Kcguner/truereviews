'use client';
import { useTranslations } from 'next-intl';
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon } from './Icons';

/**
 * İkon React state'ine değil `<html class="dark">` sınıfına bağlıdır
 * (tailwind `darkMode: 'class'`). ThemeScript sınıfı ilk boyamadan önce
 * uyguladığı için ikon İLK kareden itibaren doğrudur; hydration uyuşmazlığı
 * ve gece modunda bir karelik ay/gunes titremesi oluşmaz.
 *
 * ⚠️ Buraya Tailwind'in `block`/`hidden`/`flex` gibi display utility'lerinden
 * BİRİ daha eklenirse dikkat: `app/globals.css` rapor blokları için kendi
 * `.block` sınıfını tanımlıyor (`.block { margin-bottom: 42px }`) ve
 * `@tailwind utilities`'ten SONRA geldiği için aynı özgüllükte utility'yi
 * EZER. Ay ikonu `block` taşıdığı için 42px'lik alt boşluk flex ortalama
 * hesabına giriyor ve ikon daireyi 21px yukarı taşıyordu ("daire içinde
 * değil" görünümü). Bu yüzden ikonlarda `display` utility'si KULLANILMAZ;
 * `display` zaten preflight'ta `svg { display: block }` ve flex öğesi
 * zaten bloklaştırılır. Görünürlük yalnızca `hidden` / `dark:*` ile
 * yönetilir, `shrink-0` ile de asla sıkışmazlar.
 */
export default function ThemeToggle() {
  const t = useTranslations('theme');
  const { toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label={t('toggle')} title={t('toggle')} className="theme-btn">
      <MoonIcon className="h-4 w-4 shrink-0 dark:hidden" />
      <SunIcon className="h-4 w-4 shrink-0 hidden dark:block" />
    </button>
  );
}
