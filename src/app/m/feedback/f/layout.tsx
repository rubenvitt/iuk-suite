// Eigenständiges Layout für die anonyme Teilnahme: keine Suite-Shell, kein
// App-Switcher.
//
// RANDLOS, absichtlich: hier stand `maxWidth: 640` / `margin: 0 auto` /
// `padding: 16`. Alles drei ist entfallen, weil die 3px-Fahne am Kopf der Seite
// von Fensterkante zu Fensterkante laufen muss — ein Innenabstand auf der Hülle
// setzt sie ab, und das sieht kein Typecheck. Die Zeilenbreite wird deshalb
// weiter innen begrenzt, wo sie zum Text gehört, nicht zur Hülle
// (`docs/design/feedback-oeffentliche-ansicht.md` §3.11, gesichert durch
// `layout.test.tsx`).
//
// KEIN antd auf dieser Route: das Route-JS-Budget ist < 15 KB gz, und der
// globale `AntdProvider` läuft ohnehin schon im Root-Layout
// (`src/app/layout.tsx`, das jede Route der App wraps) — hier NICHT erneut
// einbinden. Der echte Export verlangt ein `initialMode: ThemeMode`-Prop (aus
// dem Theme-Cookie gelesen); ein zweiter, hier neu aufgesetzter ConfigProvider
// wäre nur totes Gewicht und würde die Root-Konfiguration duplizieren statt sie
// zu nutzen. `layout.test.tsx` hält die antd-Freiheit als Quelltext-Assertion
// fest, damit ein späterer "schneller Import" sie nicht unbemerkt bricht.
export default function PublicFeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main>{children}</main>;
}
