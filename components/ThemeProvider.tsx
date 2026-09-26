'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}

/** Boyanmadan önce <html> class'ını ayarlayan betik (FOUC önler). Layout içinde body başına konur. */
/** Kural: kayıtlı tercih varsa o; yoksa varsayılan LIGHT. */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('ya-theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`
      }}
    />
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Sunucu da bu render'ı çalıştırır ve `<html>` sınıfını orada bilemez;
  // bu yüzden ilk değer her iki tarafta da 'light', gerçek tema mount
  // efektinde `<html>` sınıfından okunur (bkz. ThemeScript).
  const [theme, setTheme] = useState<Theme>('light');
  // Tema bu noktaya kadar güvenilir DEĞİL: yazma efektinin mount turunda
  // yanlışlıkla 'light' yazıp koyu temayı silmesini engeller.
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setSynced(true);
  }, []);

  // DOM ve depolama yan etkileri updater'ın İÇİNDE olmaz: setState updater'ı
  // saf olmak zorunda (StrictMode iki kez çağırır, React döndürülen değeri
  // atabilir). Tema değiştiğinde tek yerde uygulanır.
  //
  // Mount'ta da çalışır ama mount turu `synced === false` olduğu için atlanır;
  // bir sonraki turda `<html>` sınıfını değiştirmeden (zaten doğru) ve
  // kullanıcının tercihini `ya-theme`'e yazar. Yani ilk yüklemede de depolama
  // `<html>` ile aynı değere normalize edilir — ThemeScript'in okuduğu anahtar
  // bu, iki tarafın ayrışması imkânsız.
  useEffect(() => {
    if (!synced) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('ya-theme', theme);
    } catch {
      /* yoksay */
    }
  }, [synced, theme]);

  // Saf updater: yalnızca bir sonraki değeri hesaplar.
  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}
