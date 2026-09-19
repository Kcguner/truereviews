export default function NotFound() {
  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#f5efe3',
          color: '#1f1c17',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0
        }}
      >
        <main style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 14, letterSpacing: 2, color: '#17463c' }}>404</p>
          <h1 style={{ fontSize: 28, margin: '8px 0' }}>Bu sayfa bulunamadı / Page not found</h1>
          <p>
            <a href="/tr" style={{ color: '#17463c', fontWeight: 700 }}>
              Ana sayfaya dön / Home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
