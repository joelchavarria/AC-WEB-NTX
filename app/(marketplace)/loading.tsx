export default function Loading() {
  return (
    <main className="page">
      <div className="shell stack">
        <div className="topbar loading-block" />
        <section className="hero hero-grid loading-panel">
          <div className="stack">
            <div className="loading-line short" />
            <div className="loading-line large" />
            <div className="loading-line medium" />
          </div>
          <div className="hero-panel stack">
            <div className="loading-line short" />
            <div className="loading-line medium" />
            <div className="loading-line medium" />
          </div>
        </section>
        <section className="grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card store-card stack loading-panel">
              <div className="store-art loading-block" />
              <div className="loading-line short" />
              <div className="loading-line medium" />
              <div className="loading-line medium" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
