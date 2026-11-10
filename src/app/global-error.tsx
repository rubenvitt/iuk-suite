"use client";

/**
 * DER LETZTE RÜCKFALL (IDA-392): ein Fehler IM Root-Layout selbst, den `app/error.tsx` nicht fangen kann.
 *
 * Diese Seite ersetzt das Root-Layout und hat damit nichts davon: kein antd, keine Schriften, kein
 * `data-theme`, keine `globals.css`. Deshalb eigenes, kleinstes Markup mit Inline-Stilen und
 * `color-scheme: light dark` — die Systemfarben des Browsers tragen beide Modi, ohne dass eine Farbe hier
 * steht, die im anderen Modus falsch wäre. Deutsch und mit Rückweg, statt der englischen Seite von Next.
 */
export default function GlobalerFehler({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="de" style={{ colorScheme: "light dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "24px 16px",
          boxSizing: "border-box",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <title>Fehler</title>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Da ist etwas schiefgegangen.</h1>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 16px", font: "inherit" }}>
            Nochmal versuchen
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- ein voller Seitenaufruf ist hier
              gewollt: der Router, der gerade geworfen hat, soll nicht weiterlaufen. */}
          <a href="/" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 16px", color: "LinkText" }}>
            Zur Startseite
          </a>
        </div>
      </body>
    </html>
  );
}
