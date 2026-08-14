import type { PersonRow } from "./_db/schema";
import { getDb, type DB } from "./_db/client";
import { isoTag } from "./_lib/datum";
import { personFuerSeite, subFuerSitzung } from "./_lib/zugang";
import { EinstiegBufdi } from "./_ui/EinstiegBufdi";
import { EinstiegKoordination } from "./_ui/EinstiegKoordination";
import { NichtEingetragenSeite } from "./_ui/NichtEingetragenSeite";
import { SeitenKopf } from "./_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * DER ROLLENABHAENGIGE VERTEILER (Spec §8, Aufgabe 13) — ERSETZT DEN PLATZHALTER AUS AUFGABE 1.
 *
 * DER EINSTIEG IST ROLLENABHAENGIG, NICHT EIN DASHBOARD FUER ALLE MIT AUSGEGRAUTEN TEILEN (Spec
 * §8): jede Fassung antwortet auf "was muss ich jetzt tun?", nicht auf "was gibt es alles?". Diese
 * Datei bleibt DUENN — sie loest die Person auf und verzweigt, die eigentliche Arbeit liegt in
 * `_ui/EinstiegBufdi.tsx` (fuer `bufdi`), `_ui/EinstiegKoordination.tsx` (fuer `koordination`, seit
 * Aufgabe 14) bzw. in `EinstiegAuftrag`, das Aufgabe 15 hier einhaengt.
 *
 * `aufgabenInhalt` IST DIE REINE, EXPORTIERTE VERZWEIGUNGSFUNKTION (Vorbild `routinenInhalt` in
 * `routinen/page.tsx`) — `page.test.tsx` ruft sie fuer die Rollenpruefung direkt, ohne eine Sitzung
 * zu stellen. Nur der Default-Export braucht `personFuerSession` und tritt deshalb NICHT im
 * gewoehnlichen Testpfad auf.
 */
export function aufgabenInhalt(
  db: DB,
  person: PersonRow,
  heute: string,
  searchParams: { woche?: string; tag?: string },
) {
  switch (person.rolle) {
    case "bufdi":
      return (
        <EinstiegBufdi
          db={db}
          person={person}
          heute={heute}
          wocheParam={searchParams.woche}
          tagParam={searchParams.tag}
        />
      );
    case "koordination":
      return <EinstiegKoordination db={db} person={person} heute={heute} />;
    case "auftrag":
      return <EinstiegPlatzhalter titel="Meine Aufträge" person={person} />;
    default: {
      // Unerreichbar nach heutigem `Rolle`-Typ (`ROLLEN` in `_db/schema.ts` kennt nur drei Werte)
      // — ein Wurf statt eines stillen `undefined`, falls eine vierte Rolle je dazukommt, ohne
      // dass diese Verzweigung mitgezogen wird. Laut ist besser als still.
      const unerreichbar: never = person.rolle;
      throw new Error(`Unbekannte Rolle "${unerreichbar as string}".`);
    }
  }
}

/**
 * PROVISORISCH — nur bis Aufgabe 15 (`EinstiegAuftrag`, Route `/neu`) ihre echte Fassung einhaengt.
 * KEINE leere Seite (die wie ein Fehler aussaehe) und KEIN Vorgriff auf Funktionsumfang, den diese
 * Aufgabe nicht baut — nur ein ehrlicher, mit Namen angesprochener Hinweis, dass der Bereich
 * existiert und in Kuerze folgt. Die Verzweigung in `aufgabenInhalt` oben aendert sich beim
 * Einhaengen NICHT, nur der `auftrag`-Zweig tauscht seinen Rueckgabewert gegen die echte Komponente
 * (Aufgabe 14 hat das gerade fuer `koordination` getan, unveraendert an dieser Stelle).
 */
function EinstiegPlatzhalter({ titel, person }: { titel: string; person: PersonRow }) {
  return (
    <SeitenKopf
      brotkrume={[{ label: "Aufgaben" }]}
      titel={titel}
      kontext={`Hallo ${person.name} — dieser Bereich entsteht in einer der nächsten Aufgaben.`}
    />
  );
}

export default async function AufgabenPage({
  searchParams,
}: {
  searchParams: Promise<{ woche?: string; tag?: string }>;
}) {
  const db = getDb();
  const person = await personFuerSeite(db);
  const heute = isoTag(new Date());
  const params = await searchParams;
  // `data-testid="aufgaben-content"` bleibt aus Aufgabe 1 stehen — `e2e/aufgaben.spec.ts`s erster
  // Test prueft ihn bereits, und ein Wegfall haette diesen bestehenden Vertrag stillschweigend
  // gebrochen, ohne dass irgendein Gate aus Aufgabe 1-12 das noch sieht.
  //
  // `person === null` (Modulzugang, aber keine `personen`-Zeile, Spec-Nachtrag 2026-08-14): die
  // Erklaerseite statt `notFound()` — s. `_lib/zugang.ts`s `personFuerSeite`.
  return (
    <div data-testid="aufgaben-content">
      {person ? (
        aufgabenInhalt(db, person, heute, params)
      ) : (
        <NichtEingetragenSeite sub={await subFuerSitzung()} />
      )}
    </div>
  );
}
