import { OffenerRahmen } from "../../_ui/offen/OffenerRahmen";

/**
 * Not-Found-Grenze der Statusseiten: fängt das `notFound()` aus `status/[code]/page.tsx` (Vorbild
 * `kommplan/t/not-found.tsx`). Kein Hinweis, ob es den Code je gab, ob er falsch geschrieben ist oder ob die
 * Anfrage gelöscht wurde — dieselbe Meldung für alles.
 */
export default function StatusNichtGefunden() {
  return (
    <OffenerRahmen kicker="Gemeinschaft · Bar">
      <h1 className="go-titel">Diese Anfrage gibt es nicht.</h1>
      <p className="go-text" style={{ marginTop: 8 }}>Prüf bitte den Link. Er steht auf der Seite, die nach dem Absenden kam.</p>
      <p className="go-meta" style={{ marginTop: 20 }}><a href="/bar">Zum Kalender der Bar</a></p>
    </OffenerRahmen>
  );
}
