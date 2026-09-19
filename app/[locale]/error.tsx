'use client';

export default function LocaleError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="screen">
      <div className="wrap">
        <div className="load">
          <div className="load__card" role="alert">
            <div className="load__biz">
              <h2>Bir şeyler ters gitti.</h2>
              <p>Something went wrong. Lütfen tekrar deneyin.</p>
            </div>
            <button className="btn btn--primary" type="button" onClick={reset} style={{ marginTop: 16 }}>
              Tekrar dene / Retry
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
