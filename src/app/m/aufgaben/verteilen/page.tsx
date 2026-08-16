import { notFound } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { verteilDaten } from "../_db/queries";
import type { AufgabeRow } from "../_db/schema";
import { isoTag } from "../_lib/datum";
import { akteurFuerSeite, darfVerteilen, subFuerSitzung } from "../_lib/zugang";
import { AufgabenListe, type AufgabenListeZeile } from "../_ui/AufgabenListe";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";
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
 */
export function verteilenInhalt(db: DB, heute: string) {
  const { posteingang: zuVerteilenListe, erstellerNamen, bufdis: bufdisListe, auslastung } =
    verteilDaten(db, heute);

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
         * an der frueheren Tabelle; die Zusicherung haengt am SATZ, nicht an der Marke.
         */}
        <AufgabenListe
          zeilen={zeilen}
          heute={heute}
          leerText="Posteingang leer — alles verteilt"
        />
      </section>
    </>
  );
}

export default async function VerteilenPage() {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE (Spec §8.3, Brief): "/verteilen antwortet einer
  // auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
  // dasselbe Praedikat aus derselben Quelle." — `darfVerteilen` ist genau das Praedikat, das auch
  // `verteilenAction` (`actions.ts`, ueber `uebergang()`) durchsetzt.
  if (!darfVerteilen(akteur, heute)) notFound();
  return verteilenInhalt(db, heute);
}
