// src/app/m/radio/(ausleihe)/rueckgabe/page.tsx
import { Empty } from "antd";
import { getDb } from "../../_db/client";
import { offeneAusleihen } from "../../_db/leihen";
import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import { AusleihRahmen } from "../../_ui/AusleihRahmen";
import { RueckgabeListe, type ListenAusleihe } from "../../_ui/RueckgabeListe";
import s from "../../_ui/ausleihe.module.css";

/**
 * DIE RUECKGABE — der aeussere Pfad `/rueckgabe` (Spec 1 §4.4, Zeilen 3554-3594; Routenkarte
 * Kapitel 1 §1.2.1, Spec:273-284).
 *
 * ⛔ DER RIEGEL IST DIE ERSTE ANWEISUNG, obwohl `(ausleihe)/layout.tsx` ihn ebenfalls ruft
 * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
 * Layout kann einer Seite keine Props reichen — diese Seite braucht `zugang` fuer den Rahmen.
 * ⛔ DER HOST-RIEGEL WIRD NICHT ZUSAETZLICH GERUFEN (Spec:3408-3413, Pflicht 16): das
 * Praedikat ruft ihn intern als erste Anweisung. `riegel.test.ts` Klausel (f) haelt beides
 * fest — seit der Fix-Runde 2 zu A18 auf der ERSTEN ANWEISUNG, nicht der ersten Zeile
 * (`.superpowers/sdd/planteil3/progress.md:715-730`) —, `page.test.tsx` misst die Wirkung.
 *
 * ⛔ DIES IST EINE SERVER COMPONENT: kein `Typography.Title`, kein `Card.Meta`, kein
 * `Input.TextArea` — Compound-Zugriff ist HTTP 500 (Falle 1, `CLAUDE.md:11-13`,
 * Spec:3349-3351). Die Ueberschrift ist ein nacktes `<h1>`, und `Empty` wird NACKT benutzt:
 * ein `Empty.PRESENTED_IMAGE_SIMPLE` waere derselbe Compound-Zugriff. Das Notizfeld mit
 * seinem `Input.TextArea` liegt deshalb ausschliesslich in `_ui/RueckgabeDialog.tsx`
 * (`"use client"`). ⛔ Kein `@ant-design/icons` (Falle 7, Entscheidung E5) und keine `Table`
 * (Entscheidung E4).
 *
 * ⛔ KEINE `<Shell>` (Entscheidung E9): der Rahmen ist `_ui/AusleihRahmen.tsx`.
 *
 * ⛔ KEINE SEITENBLAETTERUNG (§4.9.6): `offeneAusleihen` kennt weder `take` noch `skip`
 * (`_db/leihen.ts:333`), obwohl die Alt-API beides kann — die Oberflaeche benutzt es nicht,
 * und unter hundert Leihen waere Blaetterwerk Mechanik ohne Anlass.
 */

/**
 * ⛔ ERSATZ FUER `staleTime: 30_000` UND `keepPreviousData` DES ALT-KIOSK (§4.7,
 * Spec:3826-3829). ⛔ BEIDES, NICHT EINES VON BEIDEN
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:415-424`, Fund F26): DIESE Zeile verhindert,
 * dass die SERVERANTWORT vorgerendert ist; `revalidatePath("/rueckgabe")` in
 * `_actions/ausleihe.ts:185` entwertet zusaetzlich den ROUTER-CACHE DES CLIENTS — und nur
 * dadurch verschwindet die zurueckgegebene Karte, ohne dass jemand die Seite neu laedt
 * (Spec:3562, Schritt 5).
 * ⛔ EINE VORGERENDERTE ANTWORT WAERE HIER BESONDERS TEUER: sie zeigte eine Leihe, die
 * jemand anders vor Minuten zurueckgegeben hat, und der Dialog scheiterte dann an
 * `schon-zurueck` (`_db/leihen.ts:673-674`) — der Konflikt aus §4.3.2 in seiner
 * Rueckgabe-Gestalt.
 */
export const dynamic = "force-dynamic";

/**
 * Der Leerzustand, woertlich aus `LoanedDeviceList.tsx:59`/`:61` (§4.4 Schritt 6,
 * Spec:3563: „`LoanedDeviceList.tsx:54-63` woertlich").
 *
 * ⚠️ ER STEHT HIER UND NICHT IN `_lib/meldungen.ts` — dieselbe Begruendung wie bei
 * `MELDUNG_AUSNAHME` (`_ui/GateFormular.tsx:57-65`) und `VERLUST_SATZ`
 * (`(ausleihe)/ausleihen/page.tsx:62-72`): jene Datei fuehrt die Saetze zu den dreizehn
 * `grund`-Werten der zwei Ergebnistypen, und dies ist keiner davon. `KEINE_GERAETE_ERFASST`
 * liegt dort, weil ZWEI Flaechen ihn lesen; diesen liest genau eine.
 */
const KEINE_AUSLEIHEN = "Keine Geräte ausgeliehen";

export default async function RueckgabePage() {
  const zugang = await requireAusleihZugang(getDb());

  /*
   * DIE FERTIGEN ZEILEN (§4.1 Punkt 1, Spec:3336-3341; Projektion Spec:4084). ⛔ KEIN `Date`
   * IN DEN CLIENT: `seitText` kommt als Zeichenkette aus `datumMitUhrzeit`
   * (`_db/leihen.ts:333-351`), in der festgenagelten Zone Europe/Berlin — ein `Date` truege
   * im Browser dessen Zeitzone, und die Flaeche zeigte je nach Geraet eine andere Uhrzeit
   * fuer denselben Vorgang.
   * ⛔ HIER WIRD NICHT SORTIERT UND NICHT GEFILTERT: die Ordnung („neueste zuerst") und der
   * Filter auf `returned_at IS NULL` haben ihren einzigen Ort in `offeneAusleihen`.
   */
  const offene = offeneAusleihen(getDb());

  /*
   * ⛔ WAS UEBER DIE RSC-GRENZE GEHT, WIRD HIER AUFGEZAEHLT UND NICHT DURCHGEREICHT
   * (§4.1 Punkt 2, Spec:3343-3348). Ein `...ausleihe` machte jedes neue Feld des Lesemodells
   * still zu einem Feld im Client-Payload — `page.test.tsx` misst `Object.keys()` auf
   * GLEICHHEIT und nicht auf Teilmenge (Spec:5254-5258).
   */
  const zeilen: ListenAusleihe[] = offene.map((a) => ({
    id: a.id,
    rufname: a.rufname,
    entleiher: a.entleiher,
    seitText: a.seitText,
  }));

  return (
    <AusleihRahmen zugang={zugang} aktiv="rueckgabe">
      <div className={s.uebersichtKopf}>
        <h1 className={s.uebersichtTitel}>Geräte zurückgeben</h1>
      </div>

      {zeilen.length === 0 ? (
        /*
          ⛔ `Empty` NACKT, kein `Empty.PRESENTED_IMAGE_SIMPLE` — Compound-Zugriff in einer
          Server Component ist HTTP 500 (Falle 1). Vorbild:
          `(ausleihe)/geraete/page.tsx` und `lagerbuch/verwaltung/(arbeit)/page.tsx:130`.
          ⛔ UND DIE INSEL ERSCHEINT DANN GAR NICHT: eine Suchzeile ueber nichts ist eine
          Bedienflaeche ohne Gegenstand (Spec:3559, `routes/return.tsx:60`).

          ⬜ WAS DIESER ZUSCHNITT KOSTET, und es steht hier statt nur im Bericht: raeumt eine
          Person die LETZTE Ausleihe ab, entwertet `revalidatePath("/rueckgabe")` diese Seite,
          sie rendert neu — und der Erfolgssatz „<Rufname> zurückgegeben." verschwindet mit der
          Insel, die ihn haelt (`_ui/RueckgabeListe.tsx`). Was bleibt, ist die verschwundene
          Karte und dieser Leerzustand; ein stiller Fehlschlag ist es also nicht. Der Bestand
          haette den Verlust nicht, weil sein Toast ausserhalb haengt
          (`routes/return.tsx:43`) — ein Toast-System gibt es in dieser Suite aber nicht
          (Entscheidung E6). ⛔ DIE GEGENFORM WAERE, DEN LEERZUSTAND IN DIE INSEL ZU ZIEHEN;
          das widerspraeche `briefs/A20.md:15` (Leerzustand auf der Seite) und der
          antd-Zuordnung, die `Empty` in der Server-Spalte fuehrt. Der Betreiber entscheidet.
        */
        <div data-rolle="radio-leer-ausleihen">
          <Empty description={KEINE_AUSLEIHEN} />
        </div>
      ) : (
        <RueckgabeListe ausleihen={zeilen} />
      )}
    </AusleihRahmen>
  );
}
