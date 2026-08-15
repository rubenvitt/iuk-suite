import { getDb, type DB } from "./_db/client";
import { isoTag } from "./_lib/datum";
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
 * `_ui/EinstiegBufdi.tsx` (fuer `bufdi`), `_ui/EinstiegKoordination.tsx` (fuer `koordination`, seit
 * Aufgabe 14) bzw. `_ui/EinstiegAuftrag.tsx` (fuer `auftrag`, seit Aufgabe 15 — ersetzt den
 * benannten Platzhalter aus Aufgabe 13).
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
  switch (akteur.person.rolle) {
    case "bufdi":
      return (
        <EinstiegBufdi
          db={db}
          akteur={akteur}
          heute={heute}
          wocheParam={searchParams.woche}
          tagParam={searchParams.tag}
        />
      );
    case "koordination":
      return <EinstiegKoordination db={db} akteur={akteur} heute={heute} />;
    case "auftrag":
      return <EinstiegAuftrag db={db} akteur={akteur} heute={heute} />;
    default: {
      // Unerreichbar nach heutigem `Rolle`-Typ (`ROLLEN` in `_db/schema.ts` kennt nur drei Werte)
      // — ein Wurf statt eines stillen `undefined`, falls eine vierte Rolle je dazukommt, ohne
      // dass diese Verzweigung mitgezogen wird. Laut ist besser als still.
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
