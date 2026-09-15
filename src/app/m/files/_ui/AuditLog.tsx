import Link from "next/link";
import { Card } from "antd";
import { AuditLogTabelle } from "./AuditLogTabelle";

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
 *  - **Die TABELLE liegt in einer eigenen Client-Insel** (`AuditLogTabelle`).
 *    Bis zur Umstellung auf `@/core/tabelle` stand sie hier, mit Spalten ohne
 *    jede Funktion — genau deshalb ging das. Sortierung und Spaltenfilter SIND
 *    Funktionen (`sorter`, `onFilter`), und eine Funktion über der RSC-Grenze
 *    ergibt HTTP 500, unsichtbar für `pnpm build`, `pnpm typecheck` und Vitest
 *    (`CLAUDE.md`, Falle 9). Diese Komponente reicht nur noch serialisierbare
 *    Zeilen hinüber.
 *  - `Card` ist in einer Server Component sicher; `Typography.Title`,
 *    `Card.Meta` und Geschwister sind es nicht (`docs/design/README.md`,
 *    Falle 1). Die Überschrift ist deshalb `title` der Karte, nicht
 *    `Typography.Title`.
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
  /**
   * DERSELBE Zeitpunkt als ISO-Zeichenkette — allein für die Sortierung, nie
   * angezeigt. `zeitText` ist „25.07.2026, 12:00:03" und sortierte als
   * Zeichenkette den 2. eines Monats vor den 14. des vorigen.
   */
  zeitIso: string;
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

export function AuditLog({ zeilen, mehrHref, obergrenzeZeilen }: AuditLogProps) {
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

      {zeilen.length === 0 ? (
        <p data-testid="files-auditlog-leer">Noch kein Zugriff protokolliert.</p>
      ) : (
        <AuditLogTabelle zeilen={zeilen} />
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
