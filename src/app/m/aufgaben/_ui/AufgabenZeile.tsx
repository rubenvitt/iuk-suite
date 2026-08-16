import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDauer, vorschlagOffen } from "../_lib/anzeige";
import type { AufgabeRow } from "../_db/schema";
import { Frist } from "./Frist";
import { Ikone } from "./ikonen";
import { PrioritaetChip, StatusChip } from "./Chip";
import s from "./aufgaben.module.css";

/*
 * DIE EINE ZEILENFORM DES MODULS (Oberflaechen-Spec 2026-08-16 §3.6, §10 Prueffrage 7).
 *
 * DIESE DATEI IST EINE EXTRAKTION, KEIN NEUBAU: der `<li>`-Rumpf stand bis hierhin in
 * `_ui/AufgabenListe.tsx`. Die Huelle dort bleibt bestehen und ruft diese Zeile je Eintrag; die
 * fuenf heutigen Aufrufer von `AufgabenListe` wandern NICHT. `AufgabenListe.test.tsx` ist damit
 * zugleich die Gegenprobe, dass die Extraktion nichts verloren hat — sie ist unveraendert gruen.
 *
 * DIE REIHENFOLGE IST FEST (§10 Prueffrage 7) und deshalb hier und nicht an der Aufrufstelle:
 *
 *   Titel (Link auf /a/<id>) · [Zustand] · [Prioritaet] · <Frist> · Dauer · <Rollenzusatz>
 *
 * Damit traegt jede Zeile Status, Menge (Dauer) und Datum (Frist) — die drei Angaben, die die
 * Prueffrage verlangt —, und der Titel ist nie das Einzige, was dasteht.
 *
 * `rollenZusatz` IST EIN STRING ODER `null`, NIE EINE FUNKTION (Falle 9): „Functions cannot be
 * passed directly to Client Components" ist kein Fehler, den `typecheck`, `lint`, `build` oder
 * Vitest sehen — nur ein echter Abruf. Die EINE Angabe wird deshalb in der aufrufenden Server
 * Component fertig formatiert: BuFDi -> Zeitvorschlag bzw. Plantag · Koordination -> Zugewiesener ·
 * Auftrag -> „Empfaenger: X" bzw. „Noch nicht verteilt" · Freigabe -> „Nachweis (Text) liegt vor" ·
 * zurueckgewiesen -> die Begruendung woertlich. GENAU EINE, nicht mehrere: zwei Zusaetze in einer
 * Zeile lesen sich als zwei Aussagen ueber verschiedene Dinge.
 *
 * KEIN `style`-PROP UND KEIN INLINE-FLEX AM `<li>` — die Zeilenform steht in `.zeilenListe > li`
 * (`aufgaben.module.css`). Ein Inline-`style` schluege jede Stylesheet-Regel, auch die aus der
 * Medienabfrage; die Kartenform unter 768px (§5.3) waere damit strukturell nicht erreichbar.
 *
 * KEIN "use client": vier der Aufrufer sind Server Components. Kein Compound-Zugriff (Falle 1),
 * kein Icon ausser ueber `./ikonen` (Falle 7).
 */

export function AufgabenZeile({
  aufgabe,
  heute,
  rollenZusatz = null,
  href,
  aktionen,
  band,
}: {
  aufgabe: AufgabeRow;
  /** ISO-Tagesstring — fuer `<Frist>`. Kommt als Argument, nie aus `new Date()` hier. */
  heute: string;
  /** GENAU EINE vorformatierte Angabe, in der aufrufenden Server Component gebildet. */
  rollenZusatz?: string | null;
  /** Vorgabe `/a/<id>` — die aeussere Pfadform, nicht `/m/aufgaben/a/<id>`. */
  href?: string;
  /**
   * Fertig gerenderte Aktionen dieser Zeile. NICHT in §3.6s Props-Liste, aber Pflicht fuer die
   * Extraktion: `AufgabenListe.test.tsx:128-143` haelt fest, dass bei mehreren Zeilen NUR die mit
   * eigenen Aktionen einen Knopf traegt — eine Zeile ohne diese Prop koennte das nicht mehr.
   * Weiterhin gilt, was der Kopfkommentar von `AufgabenListe` begruendet: WER WAS DARF entscheiden
   * die Praedikate an der aufrufenden Seite, nie diese Komponente.
   */
  aktionen?: ReactNode;
  /**
   * ══ DAS BAND UNTER DER ZEILE (Oberflaechen-Runde 2026-08-16, zweite Haelfte) — HEUTE GENAU EIN
   *    AUFRUFER, UND ER IST DER GRUND, AUS DEM ES DIESE PROP GIBT: `_ui/FreigabeZone.tsx`.
   *
   *    Eine Freigabezeile traegt einen NACHWEIS: mehrzeiligen Text, kuenftig ein Bild. Der
   *    Kopfkommentar von `FreigabeZone` sagt seit jeher, warum das keine Tabellenzelle sein kann —
   *    „eine Tabellenzeile ist fuer Spaltenwerte gebaut, nicht fuer einen mehrzeiligen
   *    Nachweistext" —, und fuer eine RASTERZELLE gilt dasselbe: ein Absatz in der Meta-Spur zoege
   *    die Zeile auf und riss die Ausrichtung aller anderen mit.
   *
   *    DIE PROP BRICHT DAS RASTER NICHT, SIE BENUTZT ES: die Kopfzeile bleibt in den drei Spuren
   *    und fluchtet mit jeder anderen Zeile des Moduls; das Band ist die VIERTE Zelle und nimmt
   *    ueber `grid-column: 1 / -1` die volle Breite. `subgrid` platziert Kinder der Reihe nach, die
   *    vierte landet damit in Reihe 2 — ohne dass die Zeile ihre Spurendefinition aendern muesste.
   *
   *    OHNE AUFRUFER WIRD NICHTS GERENDERT, ALSO AENDERT SICH FUER DIE VIER ANDEREN FLAECHEN
   *    NICHTS: `undefined` heisst kein viertes Kind, und die Zeile bleibt exakt die dreizellige,
   *    die sie war. Ein LEERES viertes Kind waere hier anders als bei den drei Spuren KEIN
   *    Platzhalter, den man halten muesste — es gibt keine Reihe auszurichten.
   */
  band?: ReactNode;
}) {
  return (
    <li>
      {/*
       * DREI ZELLEN, IMMER ALLE DREI — AUCH LEER. Das ist die Bedingung, unter der das Raster
       * ueberhaupt eines ist: `.zeilenListe > li` traegt `grid-template-columns: subgrid`, und
       * `subgrid` platziert Kinder DER REIHE NACH in die Spuren der Liste. Eine Zeile ohne
       * Aktionen, die die dritte Zelle weglaesst, zoege ihre Meta-Angaben in die Aktionsspur —
       * genau der Versatz, gegen den dieses Raster geschrieben ist („die vier Knoepfe landen auf
       * vier verschiedenen X-Positionen"). Die leere Zelle kostet nichts: sie hat keinen Inhalt,
       * keinen Rahmen und keine Flaeche, und unter 768px blendet `.zeilenListe > li > *:empty` sie
       * aus, weil dort keine Spalte auszurichten ist.
       *
       * WARUM DREI UND NICHT FUENF (Chips/Frist/Meta je eigene Spur): die Fuenfer-Fassung ist bei
       * 820px geplatzt — die Titelspalte fiel auf einen Buchstaben Breite. Die volle Rechnung steht
       * an `.zeilenListe` in `aufgaben.module.css`.
       *
       * DIE REIHENFOLGE AUS §10 PRUEFFRAGE 7 IST UNVERAENDERT — Titel · Zustand · Prioritaet ·
       * Frist · Dauer · Rollenzusatz —, sie ist nur in Gruppen gefasst statt in sieben
       * Geschwistern. `AufgabenZeile.test.tsx` misst sie am Text der Zeile und deckt beides.
       */}
      <span className={s.zeilenZelle}>
        <Link href={href ?? `/a/${aufgabe.id}`} className={s.zeilenTitel}>
          {aufgabe.titel}
        </Link>
      </span>
      <span className={s.zeilenZelle}>
        <StatusChip status={aufgabe.status} />
        <PrioritaetChip prioritaet={aufgabe.prioritaet} />
        <Frist aufgabe={aufgabe} heute={heute} />
        <span>{fmtDauer(aufgabe.dauerMinuten)}</span>
        {rollenZusatz !== null ? <span data-rollen-zusatz>{rollenZusatz}</span> : null}
        {/*
         * `vorschlagOffen` KOMMT AUS `_lib/anzeige.ts` UND WIRD NICHT NEU GERECHNET — dieselbe
         * Ableitung traegt die Sprosse `bufdiWartetAufEinplanung` des Selektors. Zwei Fassungen
         * derselben Bedingung laufen auseinander, und der Fehler ist nicht sichtbar kaputt,
         * sondern nur falsch. Die Marke steht NACH dem Rollenzusatz und ist keiner: sie ist
         * abgeleitet, nicht uebergeben, und deshalb zaehlt sie nicht gegen „genau eine Angabe".
         */}
        {vorschlagOffen(aufgabe) ? (
          <span>
            <Ikone name="uhr" /> Zeitvorschlag offen
          </span>
        ) : null}
      </span>
      {/*
       * DIE AKTIONSSPALTE STEHT AUCH DANN DA, WENN SIE LEER IST — sie ist die rechte Spur, an der
       * sich alle Zeilen ausrichten. Sichtbar wird sie erst bei Zuwendung (`:hover`/`:focus-within`
       * an der Zeile, s. `.zeilenAktion`); unterhalb von 768px bleibt sie dauerhaft offen, weil
       * Touch kein Hover kennt.
       */}
      <span className={s.zeilenAktion}>{aktionen}</span>
      {/* s. die Prop `band` oben — nur gerendert, wenn ein Aufrufer eines reicht. */}
      {band !== undefined ? <div className={s.zeilenBand}>{band}</div> : null}
    </li>
  );
}
