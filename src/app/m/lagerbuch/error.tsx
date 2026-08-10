"use client";
import s from "./_ui/fehler.module.css";
import { FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK } from "./_lib/zustandTexte";

/**
 * DIE FEHLERGRENZE DES MODULS (Spec §11.2).
 *
 * "use client" IN ZEILE 1, OHNE AUSNAHME: Next verlangt das fuer jede
 * Fehlergrenze, und `reset` ist eine Prop, die nur ein Client-Modul annehmen
 * kann. Sie ist damit die einzige "use client"-Datei ausserhalb von _ui/ — als
 * Segmentdatei muss sie neben der Route liegen. Das Verbot aus §2.1 richtet sich
 * gegen _lib/ (Falle 6) und bleibt unberuehrt.
 *
 * IHRE TEXTE KOMMEN AUS _lib/, IHRE ZEICHEN WAEREN INLINE-SVG (§11.6). Ein
 * Zustandstext, den sie selbst hielte, waere ein Wert aus einem Client-Modul und
 * damit Falle 6 fuer jede Server Component, die ihn mitliest; ein
 * @ant-design/icons-Import waere Falle 7 — und der Fehler entstuende BEIM
 * Import, nicht beim Rendern. Diese Grenze traegt gar kein Zeichen: ein
 * Warndreieck ist genau die Stelle, an der man reflexhaft importiert.
 *
 * KEIN antd (Festlegung J7): die Grenze faengt BEIDE Aeste — den bewusst
 * antd-freien Helfer-Weg (Entscheidung 28) und die antd-Verwaltung. Vorbild ist
 * src/app/not-found.tsx, das aus demselben Grund eigenes Markup und eine eigene
 * Modul-CSS-Datei fuehrt.
 *
 * KEIN TEXT AUS `error`: der Produktions-Deserialisierer im Browser-Buendel hat
 * fuer eine Fehlerzeile genau einen Zweig und baut einen Error mit dem festen
 * ENGLISCHEN Text ueber eine „server-side exception" (Falle 66). Was hier stuende,
 * waere in Produktion nicht der geworfene Satz.
 *
 * ⚠️ PRUEFPUNKT, KEINE BEHAUPTUNG (§11.2): dass eine Modul-error.tsx INNERHALB
 * von m/lagerbuch/layout.tsx rendert, ist im Repo an keinem Bestandsmodul
 * ablesbar — es gibt keine einzige. Der Nachweis ist ein echter Abruf gegen eine
 * absichtlich werfende Route (T175, Schritt 5). Faellt die Messung anders aus,
 * ist der Text trotzdem richtig, nur die Rahmung eine andere; die Entscheidung
 * kippt daran nicht. Da m/lagerbuch/layout.tsx ohnehin nur metadata.manifest
 * traegt (§7.1.1), ist der Unterschied klein.
 */
export default function LagerbuchFehlergrenze({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={s.seite}>
      <div className={s.karte}>
        <h1 className={s.titel}>{FEHLER_TITEL}</h1>
        <p className={s.text}>
          Bitte versuche es noch einmal. Bleibt es dabei, melde dich bei der
          Verwaltung.
        </p>
        <div className={s.aktionen}>
          <button
            type="button"
            className={s.knopf}
            data-testid="lb-fehler-erneut"
            onClick={() => reset()}
          >
            {FEHLER_ERNEUT}
          </button>
          {/*
            `/` und nicht der Modul-Host: unter dem Host-Rewrite fuehrt der
            relative Pfad an den Anfang GENAU DES Moduls, auf dem man steht —
            und der ist das Gate (Entscheidung 15, §3.6.6). Ein absoluter Link
            koennte das nicht zugleich.

            Ein `<a>`, kein `<Link>`: der Weg zurueck aus einer Fehlergrenze
            soll die geroutete Client-Seite verlassen und mit einem vollen
            Dokumentladen neu starten, statt per Soft-Navigation durch
            denselben Router zu gehen, der gerade geworfen hat. `<Link>`
            koennte im errorten Segment stehen bleiben — ein `<a>` kann das
            nicht. Vorbild: `_ui/Gate.tsx:210-212` waehlt aus einem anderen
            Grund (Ziel ausserhalb des Moduls) dieselbe Form.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              Absicht, siehe Kommentar oben: volle Dokumentnavigation statt
              Soft-Navigation aus einer Fehlergrenze heraus. */}
          <a className={s.zurueck} href="/" data-testid="lb-fehler-zurueck">
            {FEHLER_ZURUECK}
          </a>
        </div>
      </div>
    </main>
  );
}
