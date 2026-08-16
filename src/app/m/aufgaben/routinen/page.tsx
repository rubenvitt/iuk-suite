import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "antd";
import { getDb, type DB } from "../_db/client";
import { routinenFuer } from "../_db/queries";
import type { PersonRow } from "../_db/schema";
import { isoTag } from "../_lib/datum";
import { akteurFuerSeite, darfRoutinenVerwalten, subFuerSitzung } from "../_lib/zugang";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { RoutineFormular } from "../_ui/RoutineFormular";
import { RoutinenTabelle } from "../_ui/RoutinenTabelle";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/**
 * DER INHALT ALS REINE, EXPORTIERTE FUNKTION (Brief, Muster `verwaltungInhalt(db, jetzt)` in
 * `lagerbuch/verwaltung/(arbeit)/page.tsx`) — nur so ist die Seite unter Vitest pruefbar, ohne eine
 * Sitzung zu stellen. `page.test.tsx` ruft ausschliesslich diese Funktion, nie den Default-Export.
 *
 * ABWEICHUNG VOM VORBILD, BEGRUENDET (nicht still uebernommen — s. Bericht): kein `jetzt`-Parameter.
 * `verwaltungInhalt(db, jetzt)` braucht `jetzt`, weil seine Kopfzeile einen Zeitstempel traegt und
 * seine Kennzahlen vom Kalendertag abhaengen; diese Seite zeigt Routinen unabhaengig vom aktuellen
 * Tag (keine Budgetrechnung, keine Faelligkeit) — ein ungenutzter Parameter waere hier Attrappe, kein
 * Vertrag. Die Aufloesung des Akteurs bleibt trotzdem AUSSERHALB dieser Funktion (im Default-Export
 * unten): genau das ist der Teil, der eine Sitzung braucht und den Vitest nicht stellen soll.
 *
 * `bearbeitenId` KOMMT ALS ARGUMENT, NICHT AUS `searchParams` HIER DRIN — Vorbild `qr/admin/page.tsx`:
 * ein Link `?bearbeiten=<id>` waehlt aus, welche Routine das Formular oben zeigt, das Bearbeiten
 * selbst aendert nichts. Eine unbekannte oder fremde `id` ergibt schlicht das Anlege-Formular (ueber
 * die bereits geladene, auf die eigene Person gefilterte Liste gesucht, keine zweite Datenbankabfrage
 * mit einer ungeprueften id aus der URL) — kein Fehler, kein IDOR-Pfad.
 */
export function routinenInhalt(db: DB, person: PersonRow, bearbeitenId?: string) {
  const meineRoutinen = routinenFuer(db, person.id);
  const bearbeiten = bearbeitenId
    ? (meineRoutinen.find((r) => r.id === bearbeitenId) ?? null)
    : null;

  const anzahl = meineRoutinen.length;
  const ruhend = meineRoutinen.filter((r) => !r.aktiv).length;
  const kontext =
    anzahl === 0
      ? "Noch keine Routinen angelegt."
      : `${anzahl} eigene Routine${anzahl === 1 ? "" : "n"}, davon ${ruhend} ruhend.`;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Routinen" }]}
        titel="Routinen"
        hilfe="routinen"
        kontext={kontext}
      />

      <section id="routine-formular" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>
          {bearbeiten ? `Routine „${bearbeiten.titel}“ ändern` : "Neue Routine anlegen"}
        </h2>
        <RoutineFormular routine={bearbeiten ?? undefined} key={bearbeiten?.id ?? "neu"} />
        {bearbeiten ? (
          <Link href="/routinen" style={{ display: "inline-block", marginBlockStart: SPACE.sm }}>
            Abbrechen
          </Link>
        ) : null}
      </section>

      {anzahl === 0 ? (
        // LEERZUSTAND AUSGESCHRIEBEN, MIT ANLEGE-KNOPF (Spec §9.8): eine leere Flaeche sieht aus wie
        // ein Ladefehler. Der Knopf springt zum immer sichtbaren Formular oben — er ist keine zweite
        // Formularstrecke, nur ein Anker.
        <div>
          <p style={SCHRIFT.text}>Noch keine Routinen angelegt.</p>
          <Button type="primary" href="#routine-formular">
            Routine anlegen
          </Button>
        </div>
      ) : (
        // DIE TABELLE IST EINE EIGENE CLIENT-KOMPONENTE (`_ui/RoutinenTabelle.tsx`), NICHT INLINE
        // HIER: antds `Table` ist selbst eine Client-Komponente, und `columns[].render`-Funktionen,
        // die HIER in der Server Component entstuenden, waeren PLAIN FUNCTIONS ueber die
        // Server/Client-Grenze — React lehnt das beim ECHTEN Abruf ab ("Functions cannot be passed
        // directly to Client Components"), ein Fehler, den weder `pnpm build` noch Vitest sehen
        // (Bericht dokumentiert den Fund). `meineRoutinen` ist reine, serialisierbare Nutzlast.
        <RoutinenTabelle routinen={meineRoutinen} />
      )}
    </>
  );
}

export default async function RoutinenPage({
  searchParams,
}: {
  searchParams: Promise<{ bearbeiten?: string }>;
}) {
  const db = getDb();
  // `akteurFuerSeite` statt `akteurFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14, `_lib/zugang.ts`).
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  // AUFGABE 13 (offener Punkt aus Aufgabe 11, s. Kommentar bei `darfRoutinenVerwalten`): Spec §8
  // nennt `/routinen` ausdruecklich "für bufdi" — ohne dieses Gate waere die Route fuer
  // eine koordinierende oder eine `auftrag`-Person per direkter URL trotzdem erreichbar, auch wenn keine Navigation
  // dorthin verlinkt. Eine ROLLENFRAGE, keine Fassung der Modulzugang-Ausnahme oben — bleibt
  // `notFound()`.
  if (!darfRoutinenVerwalten(akteur, isoTag(new Date()))) notFound();
  const { bearbeiten } = await searchParams;
  // `routinenInhalt` STELLT KEINE RECHTEFRAGE — es bekommt weiterhin die reine Zeile, nicht den
  // Akteur: die Berechtigung ist oben, an der Route, bereits entschieden.
  return routinenInhalt(db, akteur.person, bearbeiten);
}
