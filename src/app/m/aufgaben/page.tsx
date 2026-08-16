import { getDb, type DB } from "./_db/client";
import { isoTag, montagAusParam, wochenTage } from "./_lib/datum";
import { lage } from "./_lib/lage";
import { akteurFuerSeite, subFuerSitzung, type Akteur } from "./_lib/zugang";
import { EinstiegAuftrag } from "./_ui/EinstiegAuftrag";
import { EinstiegBufdi } from "./_ui/EinstiegBufdi";
import { EinstiegKoordination } from "./_ui/EinstiegKoordination";
import { NichtEingetragenSeite } from "./_ui/NichtEingetragenSeite";

export const dynamic = "force-dynamic";

/*
 * DER ROLLENABHAENGIGE VERTEILER (Spec §8, Aufgabe 13) — ERSETZT DEN PLATZHALTER AUS AUFGABE 1.
 *
 * DER EINSTIEG IST ROLLENABHAENGIG, NICHT EIN DASHBOARD FUER ALLE MIT AUSGEGRAUTEN TEILEN (Spec
 * §8): jede Fassung antwortet auf "was muss ich jetzt tun?", nicht auf "was gibt es alles?". Diese
 * Datei bleibt DUENN — sie loest den Akteur auf und verzweigt, die eigentliche Arbeit liegt in
 * `_ui/EinstiegBufdi.tsx` (fuer `bufdi`), `_ui/EinstiegKoordination.tsx` (fuer die Koordination,
 * seit Aufgabe 14) bzw. `_ui/EinstiegAuftrag.tsx` (fuer `auftrag`, seit Aufgabe 15 — ersetzt den
 * benannten Platzhalter aus Aufgabe 13).
 *
 * DIE GRUPPE WIRD ZUERST GEFRAGT, DIE ZEILE DANACH (Quellenwechsel 2026-08-15): `istKoordination`
 * kommt aus der Auth-Gruppe und liegt damit auf einer ANDEREN Achse als `rolle` — jede
 * koordinierende Person traegt in der Modultabelle zusaetzlich eine der zwei verbliebenen Rollen
 * (heute `auftrag`, s. `_db/schema.ts`s `ROLLEN`). Ein `switch` allein ueber `rolle` koennte den
 * Koordinationseinstieg deshalb nie mehr erreichen; die Gruppe SCHLAEGT die Zeile.
 *
 * `aufgabenInhalt` IST DIE REINE, EXPORTIERTE VERZWEIGUNGSFUNKTION (Vorbild `routinenInhalt` in
 * `routinen/page.tsx`) — `page.test.tsx` ruft sie fuer die Rollenpruefung direkt, ohne eine Sitzung
 * zu stellen. Nur der Default-Export braucht `akteurFuerSeite` und tritt deshalb NICHT im
 * gewoehnlichen Testpfad auf.
 */
export function aufgabenInhalt(
  db: DB,
  akteur: Akteur,
  heute: string,
  searchParams: { woche?: string; tag?: string },
) {
  /*
   * DER ZUSTANDS-SELEKTOR LAEUFT GENAU EINMAL, UND ZWAR HIER (Oberflaechen-Spec 2026-08-16 §4.1:
   * „`lage()` laeuft in `page.tsx`"). Nicht in den drei Einstiegen: dort waeren es drei Stellen,
   * an denen `tage` verschieden gerechnet werden koennte, und die Karte, die Kontextzeile und die
   * Achse liefen auseinander, ohne dass ein Test es saehe.
   *
   * `tage` IST DIE ANGEZEIGTE WOCHE, NICHT DIE LAUFENDE — EINE BENANNTE ABWEICHUNG VON §4.5. Die
   * Spec schreibt fuer `ohnePlatzInDerAchse` „immer die laufende Woche, nie die geblaetterte" vor,
   * mit der Begruendung, die Zahl duerfe sich beim Blaettern nicht aendern. Dieselben `tage` tragen
   * aber auch die KW-Marke, die Stundensumme und die Zahl der eingeplanten Aufgaben in der
   * Kontextzeile (`KONTEXT_TEXT.bufdi`) sowie den Vorbehalt „Abgeschlossene Woche" — mit der
   * laufenden Woche staende ueber einer geblaetterten Achse eine Kontextzeile, die eine ANDERE
   * Woche beschreibt. Der Preis der hier gewaehlten Fassung ist ausgeschrieben und nicht
   * verschwiegen: die Fusszeile „N Aufgaben liegen ausserhalb dieser Woche" aendert ihre Zahl beim
   * Blaettern. Sie sagt dann aber weiterhin die Wahrheit ueber die GEZEIGTE Woche — und genau das
   * ist die Aussage, die neben der Achse steht.
   */
  const montag = montagAusParam(searchParams.woche, heute);
  const tage = wochenTage(montag);
  const lageDerSeite = lage(db, akteur, heute, tage);

  if (akteur.istKoordination) {
    return <EinstiegKoordination db={db} akteur={akteur} heute={heute} lage={lageDerSeite} />;
  }
  switch (akteur.person.rolle) {
    case "bufdi":
      return (
        <EinstiegBufdi
          db={db}
          akteur={akteur}
          heute={heute}
          lage={lageDerSeite}
          wocheParam={searchParams.woche}
          tagParam={searchParams.tag}
        />
      );
    case "auftrag":
      return <EinstiegAuftrag db={db} akteur={akteur} heute={heute} lage={lageDerSeite} />;
    default: {
      // Unerreichbar nach heutigem `Rolle`-Typ (`ROLLEN` in `_db/schema.ts` kennt nur noch ZWEI
      // Werte, seit die Koordination aus der Gruppe kommt) — ein Wurf statt eines stillen
      // `undefined`, falls eine dritte DATENBANKROLLE je dazukommt, ohne dass diese Verzweigung
      // mitgezogen wird. Der Guard behaelt seinen Zweck, nur seinen Geltungsbereich nicht: er
      // bewacht die Rollen der Modultabelle, nicht die Koordination (die steht schon eine Zeile
      // darueber). Laut ist besser als still.
      const unerreichbar: never = akteur.person.rolle;
      throw new Error(`Unbekannte Rolle "${unerreichbar as string}".`);
    }
  }
}

export default async function AufgabenPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string; tag?: string }>;
}) {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  const heute = isoTag(new Date());
  const params = await searchParams;
  // `data-testid="aufgaben-content"` bleibt aus Aufgabe 1 stehen — `e2e/aufgaben.spec.ts`s erster
  // Test prueft ihn bereits, und ein Wegfall haette diesen bestehenden Vertrag stillschweigend
  // gebrochen, ohne dass irgendein Gate aus Aufgabe 1-12 das noch sieht.
  //
  // `akteur === null` (Modulzugang, aber keine `personen`-Zeile, Spec-Nachtrag 2026-08-14): die
  // Erklaerseite statt `notFound()` — s. `_lib/zugang.ts`s `personFuerSeite`.
  return (
    <div data-testid="aufgaben-content">
      {akteur ? (
        aufgabenInhalt(db, akteur, heute, params)
      ) : (
        <NichtEingetragenSeite sub={await subFuerSitzung()} />
      )}
    </div>
  );
}
