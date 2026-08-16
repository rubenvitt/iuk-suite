import { notFound } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { verteilDaten } from "../_db/queries";
import type { AufgabeRow } from "../_db/schema";
import { isoTag } from "../_lib/datum";
import { akteurFuerSeite, darfVerteilen, subFuerSitzung, type Akteur } from "../_lib/zugang";
import { AnsichtWahl, alsAnsicht } from "../_ui/AnsichtWahl";
import { AufgabenListe, type AufgabenListeZeile } from "../_ui/AufgabenListe";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { VerteilBoard } from "../_ui/VerteilBoard";
import { ZuweisenInline } from "../_ui/ZuweisenInline";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "../_ui/aufgaben.module.css";

export const dynamic = "force-dynamic";

/*
 * `/verteilen` — POSTEINGANG UND VERTEILUNG (Spec §8, §8.2, §8.3, Aufgabe 14), NEU GESETZT IN DER
 * ZWEITEN OBERFLAECHEN-RUNDE (2026-08-16).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WAS HIER STAND UND WARUM ES GEHT: `_ui/VerteilenDialog.tsx`s `VerteilenTabelle` — eine
 * antd-`Table` mit sieben Spalten und `scroll={{ x: "max-content" }}`, deren Aktionsspalte im
 * Bildschirmabzug bei 1280px RECHTS AUS DEM FENSTER LIEF. Drei Befunde auf einmal:
 *
 *   1. SIE WAR DIE EINZIGE FLAECHE DES MODULS IN EINER ANDEREN FORMSPRACHE. Vier von fuenf
 *      Flaechen zeigen Aufgaben als `.zeilenListe`-Zeile (Titel · Zustand · Prioritaet · Frist ·
 *      Dauer · Rollenzusatz, ausgerichtete Spuren, Aktionsspalte rechts); diese eine zeigte eine
 *      Tabelle mit Kopfzeile, Zebrastreifen und eigener Geometrie. Der Auftrag dieser Runde nennt
 *      das Zeilenraster ausdruecklich als „die wichtigste einzelne Aenderung".
 *   2. „ZEHN AM STUECK VERTEILEN" WAR ZEHNMAL VIER SCHRITTE. Knopf → Modal → Radiofeld →
 *      Absenden, je Aufgabe, mit einer Ebene, die sich dazwischenschiebt und den Stapel verdeckt.
 *      Der Zeilenweg macht daraus einen Klick (bzw. drei mit Zeitvorschlag), und der Stapel bleibt
 *      dabei sichtbar.
 *   3. `scroll={{ x: "max-content" }}` ist kein Layout, sondern eine Kapitulation davor: die
 *      Aktion, derentwegen die Seite existiert, lag ausserhalb des Bildes.
 *
 * WAS SICH FACHLICH NICHT AENDERT — und das ist die Liste, an der man es nachprueft:
 *   · dieselbe Ladefunktion `verteilDaten(db, heute)`, die auch `_ui/EinstiegKoordination.tsx`
 *     ruft (Fix-Runde 1: keine zweite Fassung desselben Ladeblocks),
 *   · dieselbe Zielliste aus `bufdis()` — nie `aktivePersonen()` (§11.3),
 *   · dieselbe `verteilenAction` mit denselben Formularschluesseln (`aufgabeId`, `zielId`,
 *     `vorschlagDatum`, `vorschlagUhrzeit`),
 *   · derselbe 404-Riegel ueber `darfVerteilen` im Default-Export (Spec §8.3),
 *   · dieselbe Testmarke `verteilen-<id>` am Ausloeser (s. `ZuweisenInline.tsx`).
 *
 * WAS DIE ZEILE NICHT MEHR NENNT — AUSDRUECKLICH BENANNT, DAMIT ES NICHT ALS VERSEHEN DURCHGEHT:
 * die Tabelle hatte eine Spalte „Nachweispflicht" (Ja/Nein). Die Zeilenform des Moduls fuehrt
 * GENAU EINE Zusatzangabe je Zeile (§3.6, `AufgabenZeile.tsx`: „zwei Zusaetze in einer Zeile lesen
 * sich als zwei Aussagen ueber verschiedene Dinge"), und die ist hier der Auftraggeber — dieselbe
 * Wahl, die die Zone `koordPosteingang` auf der Koordinationsflaeche schon trifft und die der
 * Betreiber dort gesehen und bestaetigt hat. Die Angabe ist NICHT verloren: die Fuehrungskarte
 * nennt sie fuer die benannte Aufgabe („Nachweis: Text" / „ohne Nachweis"), und `/a/<id>` fuehrt
 * sie im Metablock. Eine achte Angabe in der Zeile waere die Informationsarchitektur, nicht die
 * Gestalt — und der Auftrag lautete auf die Gestalt.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `verteilenInhalt` BLEIBT DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) — sie
 * bekommt `heute` bereits aufgeloest und braucht keine Sitzung; `page.test.tsx` ruft sie direkt.
 *
 * DIESE DATEI IST EINE SERVER COMPONENT UND BLEIBT ES: der Zeilenweg ist eine CLIENT-INSEL
 * (`ZuweisenInline`), die hier DIREKT importiert wird und ausschliesslich serialisierbare Daten
 * bekommt. Es geht keine Funktion ueber die RSC-Grenze (Falle 9) — genau der Fehler, den die
 * `columns[].render`-Tabelle vorher nur deshalb nicht ausloeste, weil sie selbst `"use client"`
 * trug.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ZWEI SICHTEN AUF DIESELBEN DATEN (Nachtrag „mehr Diversitaet im UI/UX", VIERTE
 * Oberflaechen-Runde 2026-08-16) — `?ansicht=liste` (Vorgabe) UND `?ansicht=brett`.
 *
 * ══ DER AUFTRAG NENNT NOTION, UND DAS EIGENTLICHE MERKMAL VON NOTION SIND UMSCHALTBARE SICHTEN AUF
 *    DENSELBEN DATEN. Das Modul hatte davon keine einzige: jede Flaeche zeigte GENAU EINE Form, und
 *    welche das war, entschied die Datei, nicht die Person davor. `/verteilen` ist der Ort dafuer,
 *    weil hier „zehn am Stueck verteilen" zaehlt (§4.4) und ein Brett mit Personenspalten genau die
 *    Frage beantwortet, die dabei gestellt wird: wer traegt schon wie viel.
 *
 * ══ DREI ABWEICHUNGEN VON DER SPEC, ALLE DREI BENANNT STATT STILL GENOMMEN:
 *
 *      1. §4.4 SAGT „`/verteilen` BLEIBT EINE REINE TABELLE — keine Fuehrungskarte, keine Achse,
 *         keine Zonen." Der TABELLEN-Halbsatz ist bereits mit der zweiten Oberflaechen-Runde
 *         abgelaufen (Nachtrag A: die Zeilenliste). Der ACHSEN-Halbsatz faellt hier — aber nur fuer
 *         die Sicht, die man ausdruecklich waehlt. OHNE Parameter ist die Seite WOERTLICH die, die
 *         sie vorher war; das ist der Grund, warum `liste` die Vorgabe ist und nicht `brett`.
 *
 *      2. §1.3 VERWIRFT „DIE TAFEL (dreimal `Wochenplan`) — auf `/verteilen`", weil der Stapelplatz
 *         „die leichteste Seite des Moduls bleiben" muss und drei gestapelte Wochenachsen sie zur
 *         schwersten machten. DAS BRETT IST NICHT DIESE TAFEL, und der Unterschied ist genau der
 *         Grund der Ablehnung: eine Personenspalte traegt EINE Zahl, EINEN Balken und ihre offenen
 *         Karten — keine fuenf Tagesspalten mit Routinenbloecken, keine `data-rolle`, die von einer
 *         Identitaet zu einer Klasse wuerde. Und sie ist ein ZUSATZ hinter einem Parameter, kein
 *         Gewicht, das die Vorgabesicht mitschleppt.
 *
 *      3. §8 VERWIRFT „ZIEHEN UEBER PERSONENGRENZEN" — DIESE RUNDE HAELT SICH DARAN. Alle drei
 *         Gruende gelten weiter (Falle 11, die Geste gaebe es erst ab 768px, sie ist kein Bedienweg
 *         fuer eine Hilfstechnik), und ein Brett, dessen einziger Weg das Ziehen waere, waere auf
 *         360px unbedienbar. Das Brett wird deshalb ausschliesslich ueber Ausloeser und
 *         Namensknoepfe bedient — dieselbe Insel wie die Liste.
 *
 * ══ DIE WAHL LEBT IN DER ADRESSE, NICHT IN EINEM CLIENT-ZUSTAND (Auftrag, nicht verhandelbar):
 *    serverseitig gelesen, in EINEM Zug gerendert, ueberlebt jeden Neuladen, teilbar als Link. KEIN
 *    `Grid.useBreakpoint` und keine Ansichtswahl per JS-Breakpoint — die Breite entscheidet die eine
 *    Medienabfrage im Stylesheet, die WAHL entscheidet die Person (die volle Begruendung steht im
 *    Kopfkommentar von `_ui/AnsichtWahl.tsx`).
 *
 * ══ ES RENDERT IMMER NUR EINE SICHT INS HTML, und das ist der Unterschied zur
 *    `.wochenGitter`/`.tagesListe`-Umschaltung: dort rendern BEIDE Ausprägungen und CSS blendet eine
 *    aus, weil die Frage die BREITE ist und der Server sie nicht kennt. Hier ist die Frage die WAHL,
 *    und die kennt der Server — zwei gerenderte Sichten waeren doppelte Arbeit, doppelte
 *    `data-testid`-Marken (`verteilen-<id>` gaebe es zweimal) und ein zweiter Ort, an dem dieselbe
 *    Aufgabe steht.
 *
 * ══ WAS FACHLICH GLEICH BLEIBT, IN BEIDEN SICHTEN: dieselbe Ladefunktion `verteilDaten(db, heute)`,
 *    dieselbe Zielliste aus `bufdis()` (§11.3 — bei einem Brett mit PERSONENSPALTEN besonders
 *    scharf: eine falsche Quelle waere eine sichtbare Spalte fuer die Koordination selbst), dieselbe
 *    `verteilenAction` mit denselben Formularschluesseln, derselbe 404-Riegel ueber `darfVerteilen`,
 *    dieselbe Testmarke `verteilen-<id>` am Ausloeser. Der Zeitvorschlag bleibt ein VORSCHLAG
 *    (`vorschlagDatum`, nie `planDatum`) — die Spalten sind Personen, nicht Tage.
 *
 * ══ `akteur` IST SEIT DIESER RUNDE EIN PARAMETER VON `verteilenInhalt`, UND ZWAR NUR FUER EINE
 *    EINZIGE FRAGE: darf diese Karte in eine andere Personenspalte wandern
 *    (`aktionsOptionen(a, akteur, heute).umverteilen`)? Er ist NICHT der Riegel — der steht
 *    unveraendert im Default-Export. Die Liste braucht ihn nicht und bekommt ihn auch nicht.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function verteilenInhalt(db: DB, heute: string, akteur: Akteur, ansichtParam?: string) {
  const { posteingang: zuVerteilenListe, erstellerNamen, bufdis: bufdisListe, auslastung } =
    verteilDaten(db, heute);
  const ansicht = alsAnsicht(ansichtParam);

  const kontext =
    zuVerteilenListe.length === 0
      ? "Posteingang leer — alles verteilt."
      : `${zuVerteilenListe.length} Aufgabe${zuVerteilenListe.length === 1 ? "" : "n"} zu verteilen.`;

  /*
   * DER ROLLENZUSATZ IST DER AUFTRAGGEBER — ein STRING, in dieser Server Component fertig
   * formatiert, nie eine Funktion (Falle 9). WORTGLEICH mit `EinstiegKoordination.tsx`s
   * `koordZusatz` fuer denselben Anlass („Von <Name>"): dieselbe Zeile darf auf zwei Flaechen nicht
   * zwei verschiedene Saetze tragen.
   */
  const zeilen: AufgabenListeZeile[] = zuVerteilenListe.map((a: AufgabeRow) => ({
    aufgabe: a,
    rollenZusatz: `Von ${erstellerNamen[a.erstellerId] ?? "—"}`,
    /*
     * DIE AKTION STEHT AN JEDER ZEILE, WEIL DER RIEGEL SCHON GEFALLEN IST: der Default-Export hat
     * `darfVerteilen(akteur, heute)` ueber `notFound()` durchgesetzt — wer hier ankommt, IST eine
     * aktive Koordinationsperson. Die frueher noetige `darfVerteilen`-Prop der Tabelle entfaellt
     * damit, und mit ihr ein Schalter, der an ZWEI Orten dieselbe Frage beantwortete.
     */
    aktionen: (
      <ZuweisenInline
        aufgabe={a}
        bufdis={bufdisListe}
        auslastung={auslastung}
        art="verteilen"
      />
    ),
  }));

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Verteilen" }]}
        titel="Verteilen"
        kontext={kontext}
      />
      {/*
       * DIE WAHL STEHT UEBER DEM INHALT UND UNTER DEM SEITENKOPF — sie gehoert weder in die
       * `aktionen`-Zeile des Kopfes (das sind AKTIONEN, und eine Sicht zu wechseln aendert nichts)
       * noch in die Zone (sie gilt fuer die ganze Flaeche, nicht fuer einen Abschnitt darin).
       */}
      <AnsichtWahl ansicht={ansicht} basis="/verteilen" />
      {ansicht === "brett" ? (
        <div style={{ marginBlockStart: SPACE.xl }}>
          <VerteilBoard
            db={db}
            akteur={akteur}
            heute={heute}
            posteingang={zuVerteilenListe}
            erstellerNamen={erstellerNamen}
            bufdis={bufdisListe}
            auslastung={auslastung}
          />
        </div>
      ) : (
        <section style={{ marginBlockStart: SPACE.xl }}>
          {/*
           * DER ZONENKOPF ALS KICKER MIT HAARLINIE — dieselbe Klasse und dieselbe Rolle der
           * Schriftleiter wie auf allen vier anderen Flaechen. Die Zahl steht mit im Kopf, wie bei
           * jeder Zone: sie ist die Antwort auf „wie viel liegt hier".
           */}
          <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
            Posteingang ({zuVerteilenListe.length})
          </h2>
          {/*
           * DER LEERZUSTAND BLEIBT AUSGESCHRIEBEN (Spec §9.8) UND WORTGLEICH — er kommt jetzt aus
           * `AufgabenListe`s `leerText`-Pflichtprop statt aus einem eigenen Zweig. `data-testid` war
           * an der frueheren Tabelle; die Zusicherung haengt am SATZ, nicht an der Marke. DAS BRETT
           * SAGT DENSELBEN SATZ (s. `_ui/VerteilBoard.tsx`): zwei Sichten auf dieselben Daten
           * duerfen fuer denselben Bestand nicht zwei verschiedene Saetze sagen.
           */}
          <AufgabenListe
            zeilen={zeilen}
            heute={heute}
            leerText="Posteingang leer — alles verteilt"
          />
        </section>
      )}
    </>
  );
}

export default async function VerteilenPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE (Spec §8.3, Brief): "/verteilen antwortet einer
  // auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
  // dasselbe Praedikat aus derselben Quelle." — `darfVerteilen` ist genau das Praedikat, das auch
  // `verteilenAction` (`actions.ts`, ueber `uebergang()`) durchsetzt.
  //
  // DER RIEGEL STEHT VOR DEM AUSLESEN DES SUCHPARAMETERS, UND DAS IST KEINE STILFRAGE: `?ansicht=`
  // darf an keiner Entscheidung ueber ZUGANG beteiligt sein. Wer hier ankommt, kommt mit jeder
  // Ansicht hinein; wer nicht darf, bekommt 404 — mit jeder Ansicht.
  if (!darfVerteilen(akteur, heute)) notFound();
  const { ansicht } = await searchParams;
  return verteilenInhalt(db, heute, akteur, ansicht);
}
