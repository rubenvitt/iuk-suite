"use client";

import { useMemo } from "react";
import { Datentabelle, nachDatum, nachText, werteAlsFilter, trifftWert, zustandsFilter } from "@/core/tabelle";
import type { AuditLogZeile } from "./AuditLog";

/**
 * DIE TABELLE DES ZUGRIFFSPROTOKOLLS — eine Client-Insel, und das ist seit der
 * Umstellung auf `@/core/tabelle` keine Wahl mehr:
 *
 * Sortierung und Filter sind FUNKTIONEN in `columns` (`sorter`, `onFilter`), und
 * eine Funktion überquert die RSC-Grenze nicht (`CLAUDE.md`, Falle 9). Die
 * Spalten standen deshalb bis hierher ohne jede Funktion in `AuditLog.tsx` —
 * einer Server Component, die es bleibt. Sie reicht nur noch die fertigen,
 * serialisierbaren Zeilen herein; was eine Zelle zeigt, entsteht wieder hier.
 * Vorbild ist `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx`.
 */

/**
 * SPALTENBREITEN IN PIXELN, und die Einheit steht im Namen (§9.1).
 *
 * Die Adressspalte **rechnet mit `0` am Ende** (§7.8): gespeichert ist das
 * letzte Oktett als `0` bzw. das IPv6-Präfix als `/48`, also `192.168.178.0`
 * oder `2001:db8:1234::/48` — nicht eine vollständige IPv6-Adresse mit 39
 * Zeichen. Wer hier für eine volle Adresse Platz reservierte, verschöbe die
 * Tabelle um über hundert Pixel für einen Wert, den es nicht gibt.
 */
const SPALTE_ZEIT_PX = 190;
const SPALTE_WAS_PX = 280;
const SPALTE_IP_GEKUERZT_PX = 190;
const SPALTE_AGENT_PX = 340;

/** Die SUMME, gerechnet statt getippt: tragen die Spalten `width`, ist sie die
 *  einzige ehrliche `scroll.x`-Angabe (`docs/design/README.md:176-182`). Eine
 *  von Hand gepflegte Zahl liefe bei der ersten Breitenänderung auseinander.
 *  Sie bleibt gesetzt — die Vorgabe `{ x: "max-content" }` der `Datentabelle`
 *  gilt Tabellen OHNE Spaltenbreiten, diese hier trägt welche. */
const TABELLE_BREITE_PX =
  SPALTE_ZEIT_PX + SPALTE_WAS_PX + SPALTE_IP_GEKUERZT_PX + SPALTE_AGENT_PX;

type AnzeigeZeile = AuditLogZeile & { wasText: string };

/**
 * Die Spalte „Was" — drei Fälle, und der dritte ist der, den das Datenmodell
 * erzwingt: `download_logs` hat keinen Fremdschlüssel (§4.5), und ein Abbruch
 * über `DELETE /api/upload/<fileId>` entfernt eine einzelne `share_files`-Zeile.
 * Ohne benannten Rückfall stünde im Protokoll „Datei undefined".
 */
function wasText(zeile: AuditLogZeile): string {
  if (zeile.dateiId === null) return "ZIP";
  if (zeile.dateiname === null) return "Datei (nicht mehr vorhanden)";
  return `Datei ${zeile.dateiname}`;
}

/**
 * DER FILTER DER SPALTE „WAS" GEHT ÜBER DIE ART, NICHT ÜBER DEN TEXT. Ein
 * `werteAlsFilter` über `wasText` böte je Dateiname einen eigenen Eintrag — bei
 * einer Freigabe mit vierzig Dateien eine Liste, die so lang ist wie die
 * Tabelle. Die Frage an ein Zugriffsprotokoll ist „ZIP oder Einzeldatei?", und
 * das sind drei Zustände; abgeleitete Zustände sind genau der Fall für
 * `zustandsFilter`.
 */
const ART_FILTER = zustandsFilter<AnzeigeZeile>([
  { wert: "zip", text: "ZIP der ganzen Freigabe", trifft: (zeile) => zeile.dateiId === null },
  {
    wert: "datei",
    text: "Einzelne Datei",
    trifft: (zeile) => zeile.dateiId !== null && zeile.dateiname !== null,
  },
  {
    wert: "weg",
    text: "Datei nicht mehr vorhanden",
    trifft: (zeile) => zeile.dateiId !== null && zeile.dateiname === null,
  },
]);

export function AuditLogTabelle({ zeilen }: { zeilen: AuditLogZeile[] }) {
  const anzeige: AnzeigeZeile[] = useMemo(
    () => zeilen.map((zeile) => ({ ...zeile, wasText: wasText(zeile) })),
    [zeilen],
  );

  /**
   * ⚠️ SORTIERT WIRD ÜBER `zeitIso`, NIE ÜBER `zeitText`. Der Anzeigetext ist
   * „25.07.2026, 12:00:03" und sortierte als Zeichenkette den 2. eines Monats
   * vor den 14. des vorigen. Deshalb trägt die Zeile beide Werte: einen zum
   * Lesen und einen zum Ordnen.
   *
   * `descend` als Vorgabe: die Frage an ein Zugriffsprotokoll ist „was ist
   * zuletzt passiert?", und `ladeAuditLog` liefert schon in dieser Ordnung —
   * eine andere Startordnung wären zwei Aussagen über dieselbe Liste.
   *
   * Die Kicker-Rolle der Spaltenköpfe setzt `Datentabelle` selbst; `title` ist
   * hier eine gewöhnliche Zeichenkette (`docs/design/README.md`).
   */
  const spalten = useMemo(
    () => [
      {
        key: "zeit",
        title: "Zeit",
        dataIndex: "zeitText",
        width: SPALTE_ZEIT_PX,
        sorter: nachDatum<AnzeigeZeile>((zeile) => zeile.zeitIso),
        defaultSortOrder: "descend" as const,
      },
      {
        key: "was",
        title: "Was",
        dataIndex: "wasText",
        width: SPALTE_WAS_PX,
        sorter: nachText<AnzeigeZeile>((zeile) => zeile.wasText),
        ...ART_FILTER,
      },
      {
        /*
         * DER WORTLAUT IST DIE ZUSAGE (§7.8). `client_ip_unbestaetigt` kommt ohne
         * Trusted-Proxy-Prüfung vom Client und ist gekürzt gespeichert; ohne beide
         * Wörter liest die Spalte sich wie eine belastbare Adresse und trüge eine
         * Aussage, die sie nicht hat.
         *
         * Die Filterliste entsteht AUS DEN ZEILEN: gefragt wird „welche Zugriffe
         * kamen aus diesem Netz?", und die vorkommenden Netze sind wenige und
         * wiederkehrend. Eine gepflegte Liste gäbe es hier ohnehin nicht.
         */
        key: "ip",
        title: "IP (unbestätigt, gekürzt)",
        dataIndex: "ipText",
        width: SPALTE_IP_GEKUERZT_PX,
        sorter: nachText<AnzeigeZeile>((zeile) => zeile.ipText),
        filters: werteAlsFilter(anzeige, (zeile) => zeile.ipText),
        onFilter: trifftWert<AnzeigeZeile>((zeile) => zeile.ipText),
      },
      {
        /* Kein Filter: ein User-Agent ist eine lange, fast zeilenweise
           verschiedene Zeichenkette — eine Filterliste daraus wäre so lang wie
           die Tabelle und läse sich schlechter als sie. Sortieren gruppiert
           gleiche Geräte trotzdem zusammen. */
        key: "agent",
        title: "Browser/Gerät",
        dataIndex: "agentText",
        width: SPALTE_AGENT_PX,
        sorter: nachText<AnzeigeZeile>((zeile) => zeile.agentText),
      },
    ],
    [anzeige],
  );

  return (
    <Datentabelle<AnzeigeZeile>
      rowKey="id"
      dataSource={anzeige}
      columns={spalten}
      /* `size="small"` verdichtet die ZEILEN einer Tabelle und ist etwas
         anderes als `size` auf einem Bedienelement (dort wäre `large` 72px
         und `controlHeight` 56 schon richtig, `docs/design/README.md:59-62`).
         Ein Protokoll mit hundert Zeilen liest sich verdichtet besser. */
      size="small"
      /* Die Summe der Spaltenbreiten — siehe `TABELLE_BREITE_PX`. Eine
         Tabelle scrollt auf schmalen Geräten, sie bricht nicht um
         (`docs/design/README.md:174`). */
      scroll={{ x: TABELLE_BREITE_PX }}
    />
  );
}
