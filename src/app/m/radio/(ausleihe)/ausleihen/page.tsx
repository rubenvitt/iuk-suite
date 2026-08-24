// src/app/m/radio/(ausleihe)/ausleihen/page.tsx
import { getDb } from "../../_db/client";
import { geraeteMitLeihstand } from "../../_db/leihen";
import { AUSWAHL_PARAMETER, auswahlLesen } from "../../_lib/auswahl";
import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import { AusleihRahmen } from "../../_ui/AusleihRahmen";
import { AusleihVorgang, type AuswahlGeraet } from "../../_ui/AusleihVorgang";
import s from "../../_ui/ausleihe.module.css";

/**
 * DIE AUSLEIHE — der aeussere Pfad `/ausleihen` (Spec 1 §4.3, Zeilen 3417-3516; Routenkarte
 * Kapitel 1 §1.2.1, Spec:273-284).
 *
 * ⛔ DER RIEGEL IST DIE ERSTE ANWEISUNG, obwohl `(ausleihe)/layout.tsx` ihn ebenfalls ruft
 * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
 * Layout kann einer Seite keine Props reichen — diese Seite braucht `zugang` fuer den
 * Rahmen UND fuer die Vorbelegung des Namens (⬜ A-L2, unten).
 * ⛔ DER HOST-RIEGEL WIRD NICHT ZUSAETZLICH GERUFEN (Spec:3408-3413, Pflicht 16): das
 * Praedikat ruft ihn intern als erste Anweisung. `riegel.test.ts` Klausel (f) haelt beides
 * fest — seit der Fix-Runde 2 zu A18 auf der ERSTEN ANWEISUNG, nicht der ersten Zeile
 * (`.superpowers/sdd/planteil3/progress.md:715-730`) —, `page.test.tsx` misst die Wirkung.
 *
 * ⛔ DIES IST EINE SERVER COMPONENT: kein `Typography.Title`, kein `Form.Item`, kein
 * `Input.TextArea` — Compound-Zugriff ist HTTP 500 (Falle 1, `CLAUDE.md:11-13`,
 * Spec:3349-3351). Die Ueberschrift ist ein nacktes `<h1>`. ⛔ Kein `@ant-design/icons`
 * (Falle 7, Entscheidung E5) und keine `Table` (Entscheidung E4).
 *
 * ⛔ KEINE `<Shell>` (Entscheidung E9): der Rahmen ist `_ui/AusleihRahmen.tsx`.
 *
 * ⛔ `sub` WIRD NICHT IN DIE LEIHZEILE GESCHRIEBEN (§3.5.4, Zusage §3.10 Nr. 3): kein
 * `entliehen_von_sub`, kein `created_by` auf `loans` — der Vorgang bleibt anonym, in BEIDEN
 * Wegen. Das Schema fuehrt die Spalte gar nicht erst (`_db/schema.ts`), und diese Seite
 * reicht `sub` an keine Insel: `AusleihVorgang` bekommt aus `zugang` ausschliesslich den
 * ANZEIGENAMEN, und auch den nur als Vorbelegung eines freien Textfeldes.
 */

/**
 * ⛔ ERSATZ FUER `staleTime: 30_000` UND `keepPreviousData` DES ALT-KIOSK (§4.7,
 * Spec:3826-3829). ⛔ BEIDES, NICHT EINES VON BEIDEN
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:415-424`, Fund F26): DIESE Zeile verhindert,
 * dass die SERVERANTWORT vorgerendert ist; `revalidatePath("/geraete")` in
 * `_actions/ausleihe.ts:184` entwertet zusaetzlich den ROUTER-CACHE DES CLIENTS.
 * ⚠️ SIE TRAEGT HIER MEHR ALS AUF DER UEBERSICHT: die Insel schreibt ihre Auswahl mit
 * `router.replace` in `?geraete=` zurueck (Spec:3426), und diese WEICHE Navigation laesst
 * den Server die Pruefung aus §4.3.3 erneut fahren. Eine vorgerenderte Antwort haette die
 * Vorwahl von vorhin geprueft.
 *
 * ⛔ WAS DIE ERNEUTE PRUEFUNG DABEI TUT UND WAS NICHT — sonst stuende hier eine Zusicherung
 * ohne Deckung: sie WARNT, sie KORRIGIERT NICHT. `_ui/AusleihVorgang.tsx` haelt die Auswahl
 * in `useState(vorauswahl)`, und React behaelt diesen Zustand ueber eine weiche Navigation.
 * Wird ein Geraet mitten im Vorgang vergeben, erscheint der Verlustsatz unten, waehrend die
 * Insel es weiterhin angetippt zeigt und mitschickt. ⛔ DAS IST KEIN LOCH, SONDERN DIE
 * ARBEITSTEILUNG: der Server lehnt den Vorgang dann mit `grund: "nicht-verfuegbar"` ab und
 * bucht NICHTS (`_db/leihen.ts:515`, eine Transaktion), und ein Zuruecksetzen bei jedem
 * `replace` verwuerfe genau die eingetragenen Werte, um derentwillen E12 gebaut ist.
 * ⬜ Wer die Auswahl doch angleichen will, braucht dafuer eine Betreiberentscheidung ueber
 * den Preis — und einen Eigentuemer; diese Aufgabe hat keinen.
 */
export const dynamic = "force-dynamic";

/**
 * ⛔ DER VERLUST WIRD ANGEZEIGT, NICHT VERSCHLUCKT (§4.3.3, Spec:3486-3488, woertlich):
 * „Ungueltige IDs werden serverseitig aussortiert und der Verlust wird angezeigt … Heute
 * prueft die Seite gar nichts, der Fehler faellt erst beim Buchen auf."
 *
 * ⛔ EIN SATZ, KEINE AUFZAEHLUNG DER VERLORENEN KENNUNGEN. Eine Geraete-Id ist die
 * technische Kennung, die Regel 2 der Konfliktsprache vom Bildschirm fernhaelt
 * (Spec:3549-3550); und den Rufnamen eines Geraets, das inzwischen vergeben ist, in einer
 * URL-Vorwahl nachzuschlagen, hiesse zu erklaeren, wer es hat — das ist die Auskunft der
 * Uebersicht, nicht die dieser Zeile.
 */
const VERLUST_SATZ = "Ein vorgewähltes Gerät ist nicht mehr frei und wurde aus der Auswahl entfernt.";

export default async function AusleihenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const zugang = await requireAusleihZugang(getDb());

  /*
   * DIE FERTIGEN ZEILEN (Spec:3423). ⛔ `suchschluessel` IST HIER SCHON VORBERECHNET
   * (`_db/leihen.ts`, §4.5.2 Spec:3629-3632) — die Insel sucht darin. ⛔ UND DIE
   * SERIENNUMMER REIST NICHT ALS EIGENES FELD MIT (§4.1 Punkt 2, Spec:3343-3348): sie geht
   * nur in den Suchschluessel ein. `page.test.tsx` misst das an dieser RSC-Grenze.
   */
  const alle = geraeteMitLeihstand(getDb());

  /*
   * ⛔ SERVERSEITIG WIRD EXISTENZ UND VERFUEGBARKEIT JEDER VORGEWAEHLTEN KENNUNG GEPRUEFT
   * (§4.3.3, Spec:3484-3488). ⛔ NICHT NUR EXISTENZ: ein Geraet, das seit dem Antippen auf
   * der Uebersicht vergeben wurde, ist genau der Fall, den der Bestand erst beim Buchen
   * bemerkt.
   * ⛔ `auswahlLesen` WIRFT NIE (`_lib/auswahl.ts:91-93`): der Wert ist Nutzereingabe, und
   * eine handgetippte Adresse darf kein HTTP 500 sein. Der Deckel `AUSWAHL_MAX` steckt
   * bereits darin — hier steht KEINE zweite Zahl.
   */
  const parameter = await searchParams;
  const gewuenscht = auswahlLesen(parameter[AUSWAHL_PARAMETER]);

  /*
   * ⛔ WAS UEBER DIE RSC-GRENZE GEHT, WIRD HIER AUFGEZAEHLT UND NICHT DURCHGEREICHT. Der
   * Lesepfad liefert mehr Felder, als die Insel braucht; ein `...geraet` machte jedes neue
   * Feld des Lesemodells still zu einem Feld im Client-Payload (§4.1 Punkt 2).
   */
  const geraete: AuswahlGeraet[] = alle.map((g) => ({
    id: g.id,
    rufname: g.rufname,
    geraetetyp: g.geraetetyp,
    standort: g.standort,
    status: g.status,
    suchschluessel: g.suchschluessel,
  }));

  const freieIds = new Set(alle.filter((g) => g.status === "AVAILABLE").map((g) => g.id));
  const vorauswahl = gewuenscht.filter((id) => freieIds.has(id));
  const verlust = vorauswahl.length < gewuenscht.length;

  /*
   * ⬜ A-L2 — DIE VORBELEGUNG DES NAMENS. §3.5.4 (Spec:2738-2748), woertlich: „`sub` und
   * `name` aus `weg: "suite"` duerfen ausschliesslich das Feld VORAUSFUELLEN. Ein
   * `defaultValue`, ueberschreibbar, kein `readOnly`, keine Herkunftsmarkierung in der
   * Zeile. Was gespeichert wird, ist ausschliesslich das ABGESENDETE Feld."
   *
   * ⛔ DIES IST DIE EINE ZEILE, DIE FAELLT, WENN DER BETREIBER „nein" SAGT (Spec:3955-3961,
   * §4.10: „Faellt die Antwort auf nein, aendert sich genau eine Zeile in `ausleihen/page.tsx`
   * (die Vorbelegung des `defaultValue`) — nichts weiter haengt daran"). Dann steht hier
   * `const namensVorbelegung = null;` und sonst nichts. Der genannte Gegengrund ist real und
   * steht mit: wer fuer eine Kollegin ausleiht, bucht sonst versehentlich auf den eigenen
   * Namen.
   * ⛔ BEIM CODE-WEG GIBT ES NICHTS VORZUBELEGEN: `AusleihZugang` traegt dort `codeId` und
   * `bezeichnung` (`_lib/ausleihZugang.ts`), also die Herkunft des ZUGANGS und keinen
   * Personennamen. Die Bezeichnung des Aufstellers in ein Namensfeld zu setzen waere ein
   * Entleiher, den es nicht gibt.
   */
  const namensVorbelegung = zugang.weg === "suite" ? zugang.name : null;

  return (
    <AusleihRahmen zugang={zugang} aktiv="ausleihen">
      <div className={s.uebersichtKopf}>
        <h1 className={s.uebersichtTitel}>Gerät ausleihen</h1>
      </div>

      {verlust && (
        /*
          ⛔ `role="alert"` OHNE `aria-live`, und die Wahl ist begruendet statt uebernommen.
          Das Ruling `.superpowers/sdd/planteil3/progress.md:603-634` nennt als Kriterium,
          WANN eine Region in den Baum kommt: entsteht sie nach einem Antippen OHNE
          Seitenwechsel, traegt sie `alert` (Punkt 1); kommt sie mit einem FRISCHEN Dokument
          nach einer Weiterleitung, `status`/`polite` (Punkt 2). ⚠️ DIESE ZEILE KANN BEIDES:
          beim ersten Aufruf kommt sie mit dem Dokument, aber die Insel schreibt ihre Auswahl
          mit `router.replace` zurueck (`_ui/AusleihVorgang.tsx`), und diese WEICHE
          Navigation rendert die Seite neu, ohne ein neues Dokument zu laden — ein Geraet,
          das inzwischen vergeben wurde, laesst den Satz dann mitten im Vorgang erscheinen.
          Das ist der gemessene Anlass der A11-Entscheidung. ⛔ Und sie meldet einen VERLUST
          an der Auswahl der Person, gehoert also zu den „echten Fehler-Meldungsorten", fuer
          die A19 laut demselben Ruling Punkt 1 traegt.
          ⛔ KEIN `Alert type="error"` auf einer Datenflaeche: `colorError === colorPrimary`
          (`src/core/theme/theme.ts:32-33`, Falle 3).
        */
        <p className={s.verlust} role="alert" data-rolle="radio-verlust">
          {VERLUST_SATZ}
        </p>
      )}

      <AusleihVorgang
        geraete={geraete}
        vorauswahl={vorauswahl}
        namensVorbelegung={namensVorbelegung}
      />
    </AusleihRahmen>
  );
}
