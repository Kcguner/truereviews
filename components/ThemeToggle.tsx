'use client';
import { useTranslations } from 'next-intl';
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon } from './Icons';

/**
 * İkon React state'ine değil `<html class="dark">` sınıfına bağlıdır
 * (tailwind `darkMode: 'class'`). ThemeScript sınıfı ilk boyamadan önce
 * uyguladığı için ikon İLK kareden itibaren doğrudur; hydration uyuşmazlığı
 * ve gece modunda bir karelik ay/gunes titremesi oluşmaz.
 */
export default function ThemeToggle() {
  const t = useTranslations('theme');
  const { toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label={t('toggle')} title={t('toggle')} className="theme-btn">
      <MoonIcon className="h-4 w-4 block dark:hidden" />
      <SunIcon className="h-4 w-4 hidden dark:block" />
    </button>
  );
}
