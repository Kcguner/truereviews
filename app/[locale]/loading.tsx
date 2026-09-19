export default function LocaleLoading() {
  return (
    <section className="screen" aria-busy="true" aria-label="Yükleniyor">
      <div className="wrap">
        <div className="load">
          <div className="load__card">
            <div className="load__track">
              <div className="load__fill" style={{ width: '35%' }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
