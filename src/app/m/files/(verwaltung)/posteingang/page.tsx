import { desc, eq } from "drizzle-orm";

import { getDb } from "../../_db/client";
import { inboxFiles, zugangslinks } from "../../_db/schema";
import { AV_STATUS, istFreigegeben, type AvStatus } from "../../_lib/av";
import { PosteingangTabelle, type PosteingangZeile } from "../../_ui/PosteingangTabelle";

/**
 * DIE POSTEINGANG-SEITE (Spec §8.6, §10.1; Plan T43).
 *
 * SIE LAEDT UND RECHNET, DIE INSEL BEDIENT. Alles, was an der Datenbank, an
 * einer Uhr oder am AV-Wertebereich haengt, entsteht HIER; der Client bekommt
 * fertige Zeilen.
 *
 * ZEITSTEMPEL SIND UNIX-SEKUNDEN (`mode: "timestamp"`, `_db/schema.ts`).
 * Drizzle liefert `Date`-Objekte, und `Date.getTime()` liefert MILLISEKUNDEN —
 * deshalb steht die Einheit unten in jedem Namen und die Umrechnung genau
 * einmal. Ein Faktor-1000-Fehler waere hier still: der Zeitraumfilter „24
 * Stunden" zeigte dann entweder alles oder nichts, und beides sieht wie eine
 * plausible Datenlage aus.
 *
 * KEIN EIGENER ZUGRIFFSRIEGEL, und das ist entschieden: diese Seite liegt IN
 * der Route-Group `(verwaltung)`, deren Layout `requireRolle("verwaltung")` und
 * `requireFilesAccess()` als erste Anweisungen traegt. Die Wurzelseite
 * `page.tsx` ruft beides ein zweites Mal, weil sie AUSSERHALB aller Groups
 * liegt und das Group-Layout fuer sie nicht greift (§3.5) — hier greift es.
 * Die Action darunter ruft den Riegel trotzdem selbst: eine Seitenpruefung
 * erstreckt sich nicht auf Server Actions.
 *
 * `select()` OHNE ARGUMENT IST IM MODUL NICHT ERLAUBT (§7.3): die Spalten
 * werden aufgezaehlt. `client_ip_unbestaetigt` ueberquert die RSC-Grenze
 * deshalb gar nicht erst — sie steht in keiner Spalte aus §8.6, und eine
 * unbestaetigte IP eines anonymen Melders gehoert in kein Markup.
 */

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** `Date.getTime()` liefert MILLISEKUNDEN — die Insel rechnet in SEKUNDEN. */
const MILLISEKUNDEN_PRO_SEKUNDE = 1000;

/**
 * Der Wertebereich der Spalte laesst nur die fuenf Werte zu (§4.3, als
 * `CONSTRAINT inbox_files_av_status_check`). Ein sechster waere ein
 * Datenbankfehler und wird `error`, NICHT „unbekannt, also freigegeben" — genau
 * dieselbe Fassung wie in `api/inbox/[id]/route.ts` und `api/inbox/zip/route.ts`.
 */
function alsAvStatus(roh: string): AvStatus {
  return (AV_STATUS as readonly string[]).includes(roh) ? (roh as AvStatus) : "error";
}

export default async function FilesPosteingangSeite() {
  /*
   * EINE Uhr fuer alle Zeilen und fuer den Filter. Zwei Ablesungen liegen an
   * einer Sekundengrenze auseinander, und eine Zeile fiele dann aus einem
   * Fenster, in dem die Nachbarzeile derselben Sekunde noch steht.
   *
   * `new Date()` und nicht `Date.now()`: `react-hooks/purity` verbietet den
   * Aufruf einer unreinen Funktion im Render und ist im Projekt ein
   * Lint-FEHLER. Dieselbe Form wie in `zugangslinks/page.tsx`.
   */
  const jetzt = new Date();
  const jetztSekunden = Math.floor(jetzt.getTime() / MILLISEKUNDEN_PRO_SEKUNDE);

  const rohe = getDb()
    .select({
      id: inboxFiles.id,
      empfangenAt: inboxFiles.empfangenAt,
      dateiname: inboxFiles.dateiname,
      size: inboxFiles.size,
      kategorie: inboxFiles.kategorie,
      hinweis: inboxFiles.hinweis,
      avStatus: inboxFiles.avStatus,
      linkId: zugangslinks.id,
      linkTokenStart: zugangslinks.tokenStart,
      linkName: zugangslinks.name,
    })
    .from(inboxFiles)
    /*
     * LEFT JOIN, nie INNER: `token_id` ist NULL fuer den gesamten Altbestand —
     * dort ist keine Datei einem Token zuzuordnen (§4.6). Ein INNER JOIN liesze
     * genau die Zeilen verschwinden, die der Betreiber am ehesten sucht, und
     * zwar ohne jede Meldung.
     */
    .leftJoin(zugangslinks, eq(inboxFiles.tokenId, zugangslinks.id))
    .orderBy(desc(inboxFiles.empfangenAt), desc(inboxFiles.id))
    .all();

  const zeilen: PosteingangZeile[] = rohe.map((roh) => {
    const avStatus = alsAvStatus(roh.avStatus);
    return {
      id: roh.id,
      empfangenSekunden: Math.floor(roh.empfangenAt.getTime() / MILLISEKUNDEN_PRO_SEKUNDE),
      empfangenText: ZEITPUNKT.format(roh.empfangenAt),
      dateiname: roh.dateiname,
      groesseBytes: roh.size,
      // ROH weitergereicht: die Anzeige toleriert unbekannte Werte, das
      // Schreiben nicht (`_lib/kategorien.ts`, T6).
      kategorieRoh: roh.kategorie,
      hinweis: roh.hinweis,
      avStatus,
      /*
       * MIT `istFreigegeben`, nicht mit einem Vergleich auf `"clean"`: das ist
       * die EINE Stelle, an der „freigegeben" definiert ist (§6.2), und die
       * Insel kann sie nicht selbst lesen — `_lib/av.ts` zieht `node:net` nach
       * und darf in kein Client-Bundle.
       */
      herunterladbar: istFreigegeben(avStatus),
      abgabelink:
        roh.linkId === null || roh.linkTokenStart === null || roh.linkName === null
          ? null
          : { id: roh.linkId, tokenStart: roh.linkTokenStart, name: roh.linkName },
    };
  });

  return <PosteingangTabelle zeilen={zeilen} jetztSekunden={jetztSekunden} />;
}
