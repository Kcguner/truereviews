'use client';
import { useTranslations } from 'next-intl';
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon } from './Icons';

export default function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label={t('toggle')} title={t('toggle')} className="theme-btn">
      {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
