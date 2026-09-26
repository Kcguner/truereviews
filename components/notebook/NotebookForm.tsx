'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import TurnstileWidget from '../TurnstileWidget';
import ShopIllo from './ShopIllo';
import ReportView from './ReportView';
import { getFaqHeading, getFaqs } from '@/lib/faq';
import type { NbPreview, NbReport } from './types';

const STAGE_KEYS = ['load.s1', 'load.s2', 'load.s3', 'load.s4', 'load.s5', 'load.s6'] as const;
const MIN_LOAD_MS = 3600;

// Gerçek süreyle uyumlu sahne eşikleri (sn): Apify indirme en uzun adım,
// Gemma analizi onun arkasından gelir. Son sahnede TAKILIR — bitişi
// yalnızca API yanıtı tetikler, animasyon asla önden bitmez.
const STAGE_AT = [0, 3, 14, 20, 25, 29];

function stageFor(elapsedMs: number): number {
  const s = elapsedMs / 1000;
  let idx = 0;
  for (let i = 0; i < STAGE_AT.length; i++) {
    if (s >= STAGE_AT[i]) idx = i;
  }
  return Math.min(idx, STAGE_AT.length - 1);
}
const LAST_EMAIL_KEY = 'tr-last-email';
const ADMIN_KEY_STORE = 'tr-admin-key';

const ERROR_TR: Record<string, string> = {
  invalid_url: 'Geçerli bir Google Maps işletme linki yapıştırın (maps, goo.gl veya g.page linki).',
  no_reviews: 'Bu işletme için yorum bulunamadı — başka bir işletme linki deneyin.',
  not_found: 'Rapor bulunamadı — sayfayı yenileyip linki tekrar analiz edin.',
  invalid_or_expired: 'Onay linki geçersiz veya süresi dolmuş.',
  bot_check_failed: 'Bot doğrulaması başarısız, tekrar deneyin.',
  rate_limited: 'Çok sık denediniz, 1 saat sonra tekrar deneyin.',
  daily_quota_exceeded: 'Günlük analiz kotası doldu, yarın tekrar deneyin.',
  invalid_email: 'Geçerli bir e-posta girin.',
  disposable_email: 'Geçici e-posta adresleri kabul edilmiyor.',
  server_error: 'Sunucuda hata oluştu, tekrar deneyin.'
};

function friendlyErr(data: { message?: string; error?: string } | null): string {
  if (!data) return 'Hata';
  if (data.message) return data.message;
  if (data.error && ERROR_TR[data.error]) return ERROR_TR[data.error];
  return data.error || 'Hata';
}

function looksLikeLink(v: string): boolean {
  const s = v.trim();
  return s.length > 8 && /(maps|goo\.gl|google|g\.page|place|search|business)/i.test(s);
}

export default function NotebookForm() {
  const t = useTranslations('nb');
  const locale = useLocale();
  const [screen, setScreen] = useState<'intro' | 'loading' | 'preview'>('intro');
  const [url, setUrl] = useState('');
  const [linkErr, setLinkErr] = useState('');
  // Yalnızca giriş ekranının widget'ı: sadece /api/analyze'a gider.
  const [introTurnstile, setIntroTurnstile] = useState('');
  const [stageIdx, setStageIdx] = useState(0);
  const [bizLabel, setBizLabel] = useState('');
  const [preview, setPreview] = useState<NbPreview | null>(null);
  const [full, setFull] = useState<NbReport | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [reportId, setReportId] = useState('');
  const [mailSent, setMailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [mockMail, setMockMail] = useState(false);
  const [devUrl, setDevUrl] = useState('');
  // Sunucu render'ında localStorage'a DOKUNULMAZ: `useState` lazy initializer
  // hem sunucuda hem istemcide çalışır, sunucu `''` basarken istemci ilk
  // render'da kayıtlı anahtarı basar → hydration uyuşmazlığı (#418) ve
  // "Test anahtarı ●" işareti için görünür titreme. Bu yüzden başlangıç her
  // iki tarafta da `''`, gerçek değer mount sonrası efektte gelir.
  const [adminKey, setAdminKey] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADMIN_KEY_STORE);
      if (stored) setAdminKey(stored);
    } catch {
      /* saklanamazsa sessiz geç */
    }
  }, []);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Sahne geçiş gecikmesi `await`'tan SONRA kuruluyor; ilk cleanup onu
  // kapsamıyordu ve unmount sonrası `window.scrollTo` çalıştırıyordu.
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `startAnalysis` unmount sonrasında da devam edebiliyor; bu bayrak
  // kalan adımları kesiyor.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  async function startAnalysis(raw: string) {
    const v = raw.trim();
    if (!looksLikeLink(v)) {
      setLinkErr(t('input.err'));
      return;
    }
    setLinkErr('');
    try {
      setBizLabel(new URL(v).hostname);
    } catch {
      setBizLabel(v.slice(0, 42));
    }
    setScreen('loading');
    setStageIdx(0);
    const t0 = Date.now();
    // Hızlı yeniden gönderimlerde önceki interval sızmasın.
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setStageIdx(stageFor(Date.now() - t0)), 500);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          placeUrl: v,
          locale,
          turnstileToken: introTurnstile,
          ...(adminKey.trim() ? { adminKey: adminKey.trim() } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(friendlyErr(data));
      const elapsed = Date.now() - t0;
      if (elapsed < MIN_LOAD_MS) await new Promise((r) => setTimeout(r, MIN_LOAD_MS - elapsed));
      if (!alive.current) return;
      if (timer.current) clearInterval(timer.current);
      setStageIdx(6);
      setPreview(data.preview);
      setReportId(data.reportId);
      setFull(null);
      setUnlocked(false);
      setMailSent(false);
      setDevUrl('');
      scrollTimer.current = setTimeout(() => {
        setScreen('preview');
        window.scrollTo({ top: 0 });
      }, 450);
    } catch (e) {
      if (timer.current) clearInterval(timer.current);
      if (!alive.current) return;
      setScreen('intro');
      setLinkErr(e instanceof Error ? e.message : 'Hata');
    }
  }

  // turnstileToken kilit duvarındaki widget'tan gelir; giriş ekranının token'ı
  // tek kullanımlık olduğu için burada yeniden kullanılamaz.
  async function unlock(email: string, turnstileToken: string): Promise<string | null> {
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reportId,
          email,
          locale,
          turnstileToken,
          adminKey: adminKey.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) return friendlyErr(data);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, email);
      } catch {
        /* saklanamazsa sessiz geç */
      }
      // Admin bypass: onay e-postası beklenmez, tam rapor hemen açılır.
      if (data.adminBypass && data.report) {
        setFull(data.report);
        setUnlocked(true);
        setSentEmail(email);
        setMailSent(true);
        setMockMail(false);
        setDevUrl('');
        window.scrollTo({ top: 0 });
        return null;
      }
      setSentEmail(email);
      setMailSent(true);
      setMockMail(Boolean(data.mockEmail));
      if (data.devPreviewUrl) setDevUrl(data.devPreviewUrl);
      return null;
    } catch {
      return 'Hata';
    }
  }

  function reset() {
    setScreen('intro');
    setUrl('');
    setLinkErr('');
    setPreview(null);
    setFull(null);
    setUnlocked(false);
    setReportId('');
    setMailSent(false);
    setDevUrl('');
    window.scrollTo({ top: 0 });
  }

  async function pasteFromClipboard() {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) {
        setUrl(txt.trim());
        setLinkErr('');
      }
    } catch {
      /* izin yoksa sessiz geç */
    }
  }

  /* ---------- LOADING ---------- */
  if (screen === 'loading') {
    const pct = Math.min(100, Math.round(((stageIdx + 0.5) / 6) * 100));
    return (
      <section className="screen">
        <div className="wrap">
          <div className="load">
            <div className="load__card">
              <div className="load__top">
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
                  <rect x="6" y="4" width="40" height="44" rx="3" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.4" />
                  <path d="M16 4v44" stroke="var(--ink)" strokeWidth="1.8" />
                  <g stroke="var(--line-2)" strokeWidth="2">
                    <path d="M22 16h18M22 24h18M22 32h12" />
                  </g>
                  <circle cx="38" cy="38" r="9" fill="var(--amber)" stroke="var(--ink)" strokeWidth="2.4" />
                  <path d="M44.5 44.5L49 49" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className="load__biz">
                  <h2>{t('load.reading')}</h2>
                  <p dir="ltr">{bizLabel}</p>
                </div>
              </div>
              <div className="load__track">
                <div className="load__fill" style={{ width: `${pct}%` }} />
              </div>
              <ul className="load__stages">
                {STAGE_KEYS.map((k, i) => (
                  <li key={k} className={`stage${i < stageIdx ? ' is-done' : ''}${i === stageIdx ? ' is-now' : ''}`}>
                    <span className="stage__dot">
                      {i < stageIdx && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1.5 5.2l2.3 2.3L8.5 2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
              <p className="load__foot">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', marginTop: 3 }} aria-hidden="true">
                  <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 7.2v4M8 4.8v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>{t('load.foot')}</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ---------- PREVIEW ---------- */
  if (screen === 'preview' && preview) {
    return (
      <section className="screen">
        <ReportView
          preview={preview}
          report={full}
          unlocked={unlocked}
          email={sentEmail}
          mailSent={mailSent}
          isMockMail={mockMail}
          devUrl={devUrl}
          onUnlock={unlock}
          onReset={reset}
        />
      </section>
    );
  }

  /* ---------- INTRO ---------- */
  return (
    <section className="screen">
      <div className="wrap wrap--wide hero">
        <div className="hero__grid">
          <div className="hero__main">
            <p className="eyebrow eyebrow--tick">{t('intro.eyebrow')}</p>
            <h1 className="hero__h1">
              <span>{t('intro.h1a')}</span>
              <span>{t.rich('intro.h1b', { hl: (c) => <span className="hl">{c}</span> })}</span>
            </h1>
            <p className="hero__lede">{t.rich('intro.lede', { strong: (c) => <strong>{c}</strong> })}</p>

            <form
              className="paste"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                startAnalysis(url);
              }}
            >
              <label className="field__label" htmlFor="nb-link">
                {t('input.label')}
              </label>
              <div className="input-row">
                <input
                  id="nb-link"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  placeholder="https://maps.app.goo.gl/…"
                  aria-describedby={linkErr ? 'nb-link-err' : undefined}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (linkErr) setLinkErr('');
                  }}
                />
                <button
                  className="icon-btn"
                  type="button"
                  title={t('input.paste')}
                  aria-label={t('input.paste')}
                  onClick={pasteFromClipboard}
                >
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="4.5" y="3.5" width="11" height="14" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M7.5 3.5V2.6a1 1 0 011-1h3a1 1 0 011 1v.9" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M7.6 9h4.8M7.6 12h4.8" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {linkErr && (
                <p className="field__err" id="nb-link-err" role="alert">
                  {linkErr}
                </p>
              )}
              <div className="paste__turnstile">
                <TurnstileWidget onToken={setIntroTurnstile} />
              </div>
              <div className="paste__cta">
                <button className="btn btn--primary btn--big btn--full" type="submit">
                  <span>{t('input.cta')}</span>
                  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M2.5 9h12M10 4.2L14.8 9 10 13.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="paste__foot">
                <button
                  className="linkish"
                  type="button"
                  onClick={() => {
                    const demo = 'https://www.google.com/maps/place/Ornek+Ev+Yemekleri';
                    setUrl(demo);
                    startAnalysis(demo);
                  }}
                >
                  {t('input.demo')}
                </button>
                <span className="paste__hint">{t('input.hint')}</span>
              </div>
              {/* Admin test anahtarı (ADMIN_BYPASS_TOKEN): bilen için kota/limit yok.
                  Değer yalnızca bu tarayıcıda saklanır, sunucuya kodla gitmez. */}
              <details className="paste__foot">
                <summary className="linkish" style={{ cursor: 'pointer', fontSize: 12 }}>
                  Test anahtarı{adminKey.trim() ? ' ●' : ''}
                </summary>
                <div className="input-row" style={{ marginTop: 8 }}>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ADMIN_BYPASS_TOKEN"
                    aria-label="Test anahtarı"
                    value={adminKey}
                    onChange={(e) => {
                      setAdminKey(e.target.value);
                      try {
                        if (e.target.value.trim()) localStorage.setItem(ADMIN_KEY_STORE, e.target.value.trim());
                        else localStorage.removeItem(ADMIN_KEY_STORE);
                      } catch {
                        /* saklanamazsa sessiz geç */
                      }
                    }}
                  />
                </div>
              </details>
            </form>
          </div>

          <aside className="hero__aside">
            <ShopIllo />
            <div className="float-score" aria-hidden="true">
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                {t('float.cap')}
              </p>
              <div className="float-score__row">
                <span className="float-score__n">
                  71<small>/100</small>
                </span>
                <span className="delta delta--up" style={{ fontSize: 12 }}>
                  ▲ 3
                </span>
              </div>
              <div className="float-score__bar">
                <i style={{ width: '58%', background: 'var(--moss)' }} />
                <i style={{ width: '24%', background: 'var(--amber)' }} />
                <i style={{ width: '18%', background: 'var(--clay)' }} />
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 10 }}>{t('float.note')}</p>
            </div>
          </aside>
        </div>

        <div className="strip">
          {(['1', '2', '3'] as const).map((n) => (
            <div className="strip__row" key={n}>
              <span className="strip__n">0{n}</span>
              <div>
                <h4>{t(`step${n}.t`)}</h4>
                <p>{t(`step${n}.d`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="gets">
          <div className="gets__h">
            <p className="eyebrow">{t('gets.h')}</p>
            <span className="rule" />
          </div>
          <div className="gets__grid">
            <div className="get">
              <svg className="get__ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 6.6v5.6l3.8 2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div>
                <h5>{t('get1.t')}</h5>
                <p>{t('get1.d')}</p>
              </div>
            </div>
            <div className="get get--clay">
              <svg className="get__ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3.5 18.5h17M5 18.5V9.8l7-5.3 7 5.3v8.7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M9.6 18.5v-5h4.8v5" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <div>
                <h5>{t('get2.t')}</h5>
                <p>{t('get2.d')}</p>
              </div>
            </div>
            <div className="get get--amber">
              <svg className="get__ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3.2l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.2 6.8 19.1 8 13.3l-4.4-4 5.9-.7z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <h5>{t('get3.t')}</h5>
                <p>{t('get3.d')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="gets">
          <div className="gets__h">
            <p className="eyebrow">{getFaqHeading(locale)}</p>
            <span className="rule" />
          </div>
          <div className="gets__grid">
            {getFaqs(locale).map((f) => (
              <details className="get" key={f.q}>
                <summary>
                  <h5>{f.q}</h5>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="assure">
          <p>{t('assure.text')}</p>
          <p className="sig">{t('assure.sig')}</p>
        </div>
      </div>
    </section>
  );
}
