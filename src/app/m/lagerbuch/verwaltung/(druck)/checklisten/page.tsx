import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { requireLagerbuchHost } from "../../../_lib/host";
import { checklistenDaten, standDatum } from "../../../_lib/lesepfade/checkliste";
import { requireLagerbuchAdmin } from "../../../_lib/zugang";
import { ChecklistenBogen } from "./ChecklistenBogen";

export const dynamic = "force-dynamic";

/**
 * DIE FAHRZEUG-CHECKLISTEN ZUM AUSDRUCKEN → /verwaltung/checklisten.
 *
 * Route-Gruppen erscheinen nicht in der URL: diese Seite liegt unter `(druck)`
 * und loest deshalb auf /verwaltung/checklisten auf, nicht auf
 * /verwaltung/fahrzeuge/…. Sie belegt damit keinen Pfad doppelt — `(arbeit)`
 * fuehrt kein `checklisten`-Segment, und genau darauf laeuft die
 * Kollisionspruefung in `etiketten/druck.test.ts` hinaus (zwei Gruppen, ein
 * aufgeloester Pfad, Bau-Abbruch).
 *
 * WARUM UNTER `(druck)` UND NICHT UNTER `(arbeit)`: dort druckten `FullShell`s
 * Kopfzeile und App-Umschalter mit, und ihr `minHeight: 100vh` erzeugte hinter
 * jedem Blatt eine leere Folgeseite — bei zehn Fahrzeugen zehn leere Blaetter.
 * Dieselbe Begruendung wie beim Etikettenbogen; deshalb dieselbe Gruppe.
 *
 * ZWEITE LINIE DER RIEGEL. Das `(druck)`-Layout riegelt bereits Host und
 * Gruppe; diese Seite tut beides noch einmal. Beides ist Pflicht, weil
 * `requiresAuth: false` gilt und die Middleware hier nicht gatet (§8.4, 8-H) —
 * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d). Der aeussere
 * Host-Riegel laeuft vor dem Personen-Riegel, damit ein anonymer Aufruf auf
 * fremdem Host die Verwaltungsroute nicht ueber einen Login-Umweg verraet.
 *
 * KEIN antd UND KEIN ZEICHEN IN DIESER DATEI. Sie ist eine Server Component:
 * ein Compound-Zugriff (`Typography.Title` & Geschwister) ergaebe HTTP 500
 * (Falle 1), ein `@ant-design/icons`-Import ebenfalls — und zwar SCHON BEIM
 * IMPORT, waehrend `typecheck`, `build` und Vitest gruen bleiben (Falle 7).
 * Was antd braucht, steht in der Insel daneben.
 */
export default async function ChecklistenSeite({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string | string[] }>;
}) {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  const { fz } = await searchParams;

  /**
   * `?fz=` ist WIEDERHOLBAR und optional.
   *
   * Ohne Angabe: alle AKTIVEN Fahrzeuge — der Regelfall „ich drucke die
   * Blaetter fuer den Samstag". Mit Angabe: genau diese, auch stillgelegte —
   * wer den Weg von der Fahrzeugseite aus geht, meint dieses eine.
   *
   * ⚠️ LEERE WERTE FALLEN HERAUS, und ein `?fz=` ohne Wert ist damit dasselbe
   * wie gar kein Parameter. Ohne diese Zeile suchte `checklistenDaten` nach
   * einem Fahrzeug mit der ID `""`, faende keins und lieferte einen leeren
   * Bogen — eine leere Seite, die wie ein Datenverlust aussieht und keiner ist.
   */
  const gewaehlt = (fz === undefined ? [] : Array.isArray(fz) ? fz : [fz])
    .map((wert) => wert.trim())
    .filter((wert) => wert !== "");

  const blaetter = checklistenDaten(
    getDb(),
    gewaehlt.length === 0 ? null : gewaehlt,
    new Date(),
  );

  /**
   * §11.7: jeder gestaltete Zustand traegt einen benannten Weg zurueck — und
   * `DruckRahmen` hat konstruktionsbedingt KEINE Navigation. Ohne diesen Link
   * waere die leere Seite eine Sackgasse. Dieselbe Entscheidung und derselbe
   * Aufbau wie im leeren Etikettenbogen (`etiketten/page.tsx`).
   */
  if (blaetter.length === 0) {
    return (
      <div className="lb-nichtDrucken">
        <h1>Checklisten</h1>
        <p>
          {gewaehlt.length === 0
            ? "Es ist kein aktives Fahrzeug angelegt. Sobald ein Fahrzeug mit "
              + "Soll-Bestückung gepflegt ist, gibt es hier ein Blatt je Fahrzeug."
            : "Zu dieser Auswahl gehört kein Fahrzeug. Der Link zeigt vermutlich "
              + "auf ein gelöschtes Fahrzeug."}
        </p>
        <p>
          <a href="/verwaltung/fahrzeuge">Zurück zu den Fahrzeugen</a>
        </p>
      </div>
    );
  }

  return <ChecklistenBogen blaetter={blaetter} stand={standDatum(new Date())} />;
}
