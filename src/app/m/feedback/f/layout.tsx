// Eigenständiges Layout für die anonyme Teilnahme: keine Suite-Shell, kein
// App-Switcher. `AntdProvider` läuft bereits global im Root-Layout
// (`src/app/layout.tsx`, das jede Route der App wraps) — hier NICHT erneut
// einbinden. Der echte Export verlangt ein `initialMode: ThemeMode`-Prop
// (aus dem Theme-Cookie gelesen); ein zweiter, hier neu aufgesetzter
// ConfigProvider wäre nur totes Gewicht und würde die Root-Konfiguration
// duplizieren statt sie zu nutzen.
export default function PublicFeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
      {children}
    </main>
  );
}
