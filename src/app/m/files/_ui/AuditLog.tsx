import Link from "next/link";
import { Card, Table } from "antd";

/**
 * DAS AUDIT-LOG DER SHARE-DETAILSEITE (Spec §7.8, §4.5; Plan T41 Punkt 4).
 *
 * SIE IST EINE SERVER COMPONENT UND BLEIBT ES — ohne `"use client"`, und das ist
 * eine Festlegung, keine Sparsamkeit:
 *
 *  - **„mehr laden" ist ein LINK auf `?logs=<n>`**, ein Suchparameter der Server
 *    Component. Keine Server Action (die läge in `(verwaltung)/actions.ts`, einer
 *    Datei, die T41 nicht besitzt) und kein Route Handler. Ohne benannten Weg
 *    wäre die stille Alternative, **alle** Zeilen an den Client zu liefern und
 *    dort aufzuklappen — bei einem Protokoll genau das Falsche.
 *  - **Die Spalten tragen KEINE `render`-Funktion**, nur `dataIndex`. Eine
 *    Funktion in `columns` reicht eine Funktion über die RSC-Grenze an
 *    `Table` (eine Client-Komponente) und ergibt HTTP 500 — unsichtbar für
 *    `pnpm build`, `pnpm typecheck` und Vitest. Der Text jeder Zelle entsteht
 *    deshalb **vorher**, in `zeilen()` unten und in der Seite.
 *  - `Card` und `Table` sind in einer Server Component sicher;
 *    `Typography.Title`, `Card.Meta` und Geschwister sind es nicht
 *    (`docs/design/README.md`, Falle 1). Die Überschrift ist deshalb `title` der
 *    Karte, nicht `Typography.Title`.
 *
 * WAS HIER NICHT ENTSCHIEDEN WIRD: **die Klemmung von `?logs=<n>`**. Sie gehört
 * der Seite, die den Suchparameter entgegennimmt — `_db/queries.ts:ladeAuditLog`
 * sagt das ausdrücklich („sie kennt ihren Nachladeweg, diese Funktion nicht").
 * Diese Komponente bekommt den fertigen `mehrHref` und die erreichte Obergrenze.
 */

export type AuditLogZeile = {
  id: number;
  /** Fertiger deutscher Zeitpunkt MIT Sekunden — zwei Downloads derselben
   *  Minute sind sonst nicht auseinanderzuhalten. */
  zeitText: string;
  /** `null` = ZIP des GANZEN Shares, ein 1:1-pflichtiger Magic Value (§4.5). */
  dateiId: string | null;
  /** Der Name zur `dateiId`, oder `null`, wenn es die Zeile nicht mehr gibt.
   *  `download_logs` trägt keinen Fremdschlüssel und kein Cascade — das Log
   *  überlebt seine Datei, und das ist Absicht. */
  dateiname: string | null;
  /** Schon gekürzt gespeichert (§4.5); `—`, wenn nichts protokolliert wurde. */
  ipText: string;
  agentText: string;
};

export type AuditLogProps = {
  zeilen: AuditLogZeile[];
  /** `?logs=<n+Seite>`, oder `null` — dann gibt es nichts nachzuladen bzw. die
   *  Obergrenze ist erreicht. */
  mehrHref: string | null;
  /** Gesetzt, wenn es ältere Einträge gibt, die Ansicht aber schon an ihrer
   *  Obergrenze steht. Ein weiterhin angebotenes „mehr laden" wäre dann ein
   *  Bedienelement ohne Wirkung — also eine Sackgasse
   *  (`docs/design/README.md:236-249`). */
  obergrenzeZeilen: number | null;
};

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
 *  von Hand gepflegte Zahl liefe bei der ersten Breitenänderung auseinander. */
const TABELLE_BREITE_PX =
  SPALTE_ZEIT_PX + SPALTE_WAS_PX + SPALTE_IP_GEKUERZT_PX + SPALTE_AGENT_PX;

type AnzeigeZeile = AuditLogZeile & { wasText: string };

/**
 * KEINE `render`-Funktion, nur `dataIndex` — Begründung im Kopfkommentar. Und
 * keine Spalte trägt `fixed` oder `ellipsis`, `scroll.y` bleibt ungesetzt: sonst
 * schaltet rc-table auf `table-layout: fixed`, verteilt die Spalten gleichmäßig
 * und das Desktop-Bild ändert sich, ohne dass irgendwo etwas überläuft
 * (`lib/Table.js:426-442`).
 */
const SPALTEN = [
  { key: "zeit", title: "Zeit", dataIndex: "zeitText", width: SPALTE_ZEIT_PX },
  { key: "was", title: "Was", dataIndex: "wasText", width: SPALTE_WAS_PX },
  {
    /*
     * DER WORTLAUT IST DIE ZUSAGE (§7.8). `client_ip_unbestaetigt` kommt ohne
     * Trusted-Proxy-Prüfung vom Client und ist gekürzt gespeichert; ohne beide
     * Wörter liest die Spalte sich wie eine belastbare Adresse und trüge eine
     * Aussage, die sie nicht hat.
     */
    key: "ip",
    title: "IP (unbestätigt, gekürzt)",
    dataIndex: "ipText",
    width: SPALTE_IP_GEKUERZT_PX,
  },
  { key: "agent", title: "Browser/Gerät", dataIndex: "agentText", width: SPALTE_AGENT_PX },
];

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

export function AuditLog({ zeilen, mehrHref, obergrenzeZeilen }: AuditLogProps) {
  const anzeige: AnzeigeZeile[] = zeilen.map((zeile) => ({ ...zeile, wasText: wasText(zeile) }));

  return (
    <Card title="Zugriffsprotokoll" data-testid="files-auditlog">
      {/*
       * DER KOPF SAGT, WAS DIE ADRESSE IST. Die Spaltenüberschrift trägt es
       * knapp, dieser Satz die Begründung — ohne ihn steht in der Tabelle eine
       * Zahl, deren Belastbarkeit niemand einschätzen kann.
       */}
      <p>
        Protokolliert wird jede ausgelieferte Datei und jedes ZIP der ganzen Freigabe. Die Adresse
        stammt aus dem Anfrage-Kopf und ist deshalb <strong>nicht bestätigt</strong>; gespeichert
        wird sie <strong>gekürzt</strong> (letztes Oktett bzw. /48). Vorschauen werden nicht
        protokolliert.
      </p>

      {anzeige.length === 0 ? (
        <p data-testid="files-auditlog-leer">Noch kein Zugriff protokolliert.</p>
      ) : (
        <Table<AnzeigeZeile>
          rowKey="id"
          dataSource={anzeige}
          columns={SPALTEN}
          pagination={false}
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
      )}

      {mehrHref !== null && (
        <p>
          <Link href={mehrHref} data-testid="files-auditlog-mehr">
            Ältere Einträge laden
          </Link>
        </p>
      )}

      {obergrenzeZeilen !== null && (
        <p data-testid="files-auditlog-grenze">
          Es gibt ältere Einträge. Diese Ansicht zeigt höchstens {obergrenzeZeilen} Zeilen.
        </p>
      )}
    </Card>
  );
}
