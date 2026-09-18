'use client';
import { usePathname, useRouter } from 'next/navigation';
import { GlobeIcon } from './Icons';

export default function LanguageSwitcher({
  current,
  names
}: {
  current: string;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm transition-colors duration-200 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800">
      <GlobeIcon className="ms-0.5 text-slate-400 dark:text-slate-500" />
      <select
        aria-label="Language"
        value={current}
        onChange={(e) => {
          const next = e.target.value;
          const parts = pathname.split('/');
          parts[1] = next;
          router.push(parts.join('/') || `/${next}`);
        }}
        className="cursor-pointer bg-transparent font-medium text-slate-700 outline-none dark:bg-transparent dark:text-slate-200 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-100"
      >
        {Object.entries(names).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
