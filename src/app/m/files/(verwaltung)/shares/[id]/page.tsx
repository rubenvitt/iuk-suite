import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Button, Card, Table } from "antd";

import { ladeAuditLog, ladeShareDetail, type ShareDatei } from "../../../_db/queries";
import type { AvStatus } from "../../../_lib/av";
import { oeffentlicheUrl } from "../../../_lib/hostRolle";
import { entschaerfeTitel } from "../../../_lib/zip";
import { AuditLog, type AuditLogZeile } from "../../../_ui/AuditLog";
import { ShareDetailAktionen } from "../../../_ui/ShareDetailAktionen";

/**
 * `/shares/[id]` — DIE DETAILSEITE EINER FREIGABE (Spec §7.3, §7.8, §7.9,
 * §10.1, §10.2; Plan T41).
 *
 * SIE IST EINE SERVER COMPONENT UND BLEIBT ES. Alles Interaktive liegt in
 * `_ui/ShareDetailAktionen.tsx` (Bestätigung, Aufstocken, QR-Dialog, Kopieren)
 * und `_ui/AuditLog.tsx` ist selbst wieder eine Server Component. Zwei Fallen,
 * die HTTP 500 für die ganze Seite ergeben und die weder `pnpm build` noch
 * `pnpm typecheck` noch ein Vitest findet:
 *
 * 1. **Compound-Zugriff auf antd in RSC.** `Typography.Title`,
 *    `Descriptions.Item`, `List.Item`, `Card.Meta` sind hier die naheliegende
 *    Wahl und in einer Server Component `undefined`
 *    (`docs/design/README.md:39-44`). Deshalb ein nacktes `<h1>` und Absätze in
 *    einer `Card` statt `Descriptions`. `Card`, `Table` und `Button` sind sicher.
 * 2. **Eine `render`-Funktion in `columns`** reicht eine FUNKTION über die
 *    RSC-Grenze an `Table`. Die Spalten unten tragen deshalb nur `dataIndex`;
 *    was eine Zelle zeigt, entsteht **vorher** in `zuAnzeige()`. React-Elemente
 *    (das Zustandssymbol) sind dagegen serialisierbar — Funktionen sind es nicht.
 * 3. **`@ant-design/icons` darf eine Server Component NICHT importieren.** Das
 *    Paket trägt kein `"use client"` (der Kommentar in `core/shell/icons.ts`
 *    hält das fest), also evaluiert Next das Modul in der RSC-Umgebung — und
 *    dort ruft es `createContext` auf Modulebene. Ergebnis: `TypeError: (0 ,
 *    _react.createContext) is not a function`, **HTTP 500 für die ganze Seite**.
 *    Gemessen am 2026-08-01 beim ersten echten Abruf dieser Route; `pnpm build`,
 *    `pnpm typecheck` und Vitest waren dabei alle grün — unter Vitest gibt es
 *    die RSC-Bedingung nicht, dort ist `createContext` schlicht vorhanden. Die
 *    Zustandssymbole unten sind deshalb **eigenes Inline-SVG**. In einer
 *    Client-Insel (`_ui/SharesTabelle.tsx`, `_ui/ShareDetailAktionen.tsx`) sind
 *    die antd-Icons unverändert richtig — die Regel gilt nur hier.
 *
 * KEIN ZWEITER RIEGEL HIER. Host-Rolle und Zugriff stehen in
 * `(verwaltung)/layout.tsx` (`requireRolle("verwaltung", …)` und
 * `requireFilesAccess()`); jede Server Action ruft `requireFilesAccess()`
 * außerdem selbst (§2.4). Eine dritte Fassung wäre eine dritte Wahrheit.
 *
 * DIE ALT-ROUTE `GET /api/shares/[id]/logs` WIRD NICHT PORTIERT (§7.8): sie
 * prüfte nur `if (!session)`, lieferte zu **jeder** shareId aus der URL bis zu
 * 100 Einträge mit IP und User-Agent, die Middleware gatete den Pfad nicht, und
 * die UI rief sie nirgends auf. Diese Seite liest direkt aus der Datenbank, so
 * wie die Alt-Detailseite es auch schon tat.
 */

/** Der Platzhalter, den der Import (Spec 2) jeder Altzeile in `created_by` gibt.
 *  `created_by` ist reine Anzeige — es gibt KEINE Ownership-Prüfung (§2.4). */
const ALTBESTAND = "import:easy-filesharing";

/**
 * BINÄRE Präfixe, und das Wort dazu. Beide „500" unterscheiden sich um den
 * Faktor 1,048576 (476,8 MiB gegen 500,0 MB) — dieses Paar ist im Modul `files`
 * schon einmal teuer geworden (§9.1). Der Name trägt die Einheit, damit die
 * Verwechslung beim Lesen auffällt und nicht erst beim Rechnen.
 *
 * Dieselbe Leiter steht in `_ui/SharesUebersicht.tsx` und
 * `(verwaltung)/zugangslinks/page.tsx`. Die Doppelung ist bewusst und dort schon
 * benannt: eine gemeinsame Stelle läge in `_lib/`, und die drei Dateien gehören
 * verschiedenen Tasks — sie zusammenzulegen ist eine eigene, kleine Änderung mit
 * drei Bearbeitern, kein Nebenprodukt dieser hier.
 */
const BYTE_EINHEITEN_BINAER = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

function byteTextBinaer(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN_BINAER.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN_BINAER[stufe]}`;
}

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Das Protokoll führt SEKUNDEN mit: zwei Downloads derselben Minute wären sonst
 *  nicht auseinanderzuhalten, und genau die Reihenfolge ist die Frage, die man
 *  an ein Zugriffsprotokoll stellt. */
const ZEITPUNKT_GENAU = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "medium",
});

/**
 * DER NACHLADEWEG DES PROTOKOLLS, und er ist festgelegt: **ein Suchparameter
 * dieser Server Component**, keine Server Action und kein Route Handler (§7.8,
 * Plan T41 Punkt 4). Eine Action landete in `(verwaltung)/actions.ts` — einer
 * Datei, die dieser Task nicht besitzt —, und ohne benannten Weg wäre die stille
 * Alternative, **alle** Zeilen an den Client zu liefern und dort aufzuklappen.
 *
 * Drei Bedingungen, und die Zahlen stehen in den NAMEN:
 *  - `LOG_SEITE_ZEILEN` ist Vorgabe **und** Schrittweite: geklemmt wird auf ein
 *    Vielfaches, damit `?logs=137` nicht eine dritte, nirgends erreichbare
 *    Seitengröße erzeugt.
 *  - `LOG_MAX_ZEILEN` ist die Obergrenze. Ohne sie wäre `?logs=10000000` eine
 *    Abfrage- und Renderlast, die jeder anonyme… — nein, hier eben jeder
 *    Angemeldete auslösen könnte, und die Seite baute Zehntausende `<tr>`.
 *
 * `Number()` wäre hier falsch: `Number("0x10")` ist 16 und `Number("1e1")` ist
 * 10. Dieselbe Bauform wie `GANZZAHL` in `(verwaltung)/actions.ts`.
 */
const LOG_SEITE_ZEILEN = 100;
const LOG_MAX_ZEILEN = 1000;
const GANZZAHL = /^\d+$/;

function geklemmteLogGrenze(roh: string | string[] | undefined): number {
  // Ein doppelt gesetzter Suchparameter kommt als Array; der erste Wert gilt.
  const text = (Array.isArray(roh) ? roh[0] : roh)?.trim() ?? "";
  if (!GANZZAHL.test(text)) return LOG_SEITE_ZEILEN;
  const vielfaches = Math.floor(Number(text) / LOG_SEITE_ZEILEN) * LOG_SEITE_ZEILEN;
  return Math.min(LOG_MAX_ZEILEN, Math.max(LOG_SEITE_ZEILEN, vielfaches));
}

// ---------------------------------------------------------------------------
// Der Zustand einer Datei — TEXT plus SYMBOL, nie Farbe allein
// ---------------------------------------------------------------------------

/**
 * KEINE FARBE, und das ist hier mehr als Vorsicht: `colorError === colorPrimary
 * === #c8000f`. Ein rotes `Tag` für „infiziert" sähe auf einer Datenfläche aus
 * wie eine Primäraktion (§10.1, `docs/design/README.md`, Falle 3). Die Wortwahl
 * ist 1:1 die des AV-Sammelwerts in `_ui/SharesTabelle.tsx` — Liste und
 * Detailseite dürfen denselben Zustand nicht verschieden benennen.
 */
const AV_TEXT: Record<AvStatus, string> = {
  clean: "geprüft — freigegeben",
  scanning: "wird geprüft",
  infected: "gesperrt — Fund",
  error: "Prüfung nicht möglich",
  unscanned: "nicht geprüft",
};

/**
 * DIE ZUSTANDSSYMBOLE ALS EIGENES INLINE-SVG — siehe Falle 3 im Kopfkommentar:
 * `@ant-design/icons` ruft beim Auswerten `createContext`, und in der
 * RSC-Umgebung gibt es das nicht. Ein Import hier ergibt HTTP 500 für die ganze
 * Seite, und zwar erst beim ECHTEN Abruf.
 *
 * Jedes Symbol ist ein Kreis plus eine Innenform, alle in derselben
 * 16er-Zeichenfläche und in `currentColor`, damit sie mit dem Text der Zelle
 * hell/dunkel mitgehen (kein `--ant-*` in eigenem Markup — antd deklariert
 * seine Variablen auf seiner eigenen Scope-Klasse, `docs/design/README.md`,
 * Falle 2).
 *
 * DAS SYMBOL IST DIE VERZICHTBARE SCHICHT. Bedeutung nie allein über Farbe oder
 * Form (`docs/design/README.md:133-137`) — der TEXT daneben trägt die Aussage,
 * deshalb steht das SVG auf `aria-hidden`.
 */
const SYMBOL_INNEN = {
  /** Haken. */
  haken: "M5 8.2 l2.2 2.2 L11.2 5.8",
  /** Uhrzeiger. */
  uhr: "M8 4.8 V8.2 L10.4 9.6",
  /** Querbalken — „gesperrt". */
  balken: "M4.8 8 H11.2",
  /** Ausrufezeichen: Strich plus Punkt (zwei Teilpfade). */
  ruf: "M8 4.6 V8.8 M8 10.8 v0.01",
  /** Schrägstrich — „nicht da". */
  strich: "M5.2 10.8 L10.8 5.2",
  /** Drei Punkte — „noch in Arbeit". */
  punkte: "M5.4 8 h0.01 M8 8 h0.01 M10.6 8 h0.01",
} as const;

type SymbolName = keyof typeof SYMBOL_INNEN;

function Zustandssymbol({ name }: { name: SymbolName }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.6" />
      <path d={SYMBOL_INNEN[name]} />
    </svg>
  );
}

const AV_SYMBOL: Record<AvStatus, SymbolName> = {
  clean: "haken",
  scanning: "uhr",
  infected: "balken",
  error: "ruf",
  unscanned: "strich",
};

/**
 * DIE REIHENFOLGE IST DIE AUSSAGE, und sie ist dieselbe wie im Byte-Weg
 * (`_db/queries.ts:ladeShare`, Stufe 4): erst „keine Bytes", dann der
 * AV-Zustand, **dann** der fehlende Blob.
 *
 *  - `vollstaendig` zuerst: für eine Zeile ohne Bytes ist das Fehlen des Blobs
 *    der ERWARTETE Zustand, kein Befund (§4.4).
 *  - AV **vor** dem Blob: eine infizierte Datei, deren Blob schon weg ist, bleibt
 *    „gesperrt". Andersherum verschwiege die Ansicht den Fund.
 *  - Und `blobFehlt` **vor** dem Freigabe-Fall: eine `clean`-Zeile ohne Blob
 *    stünde sonst auf „freigegeben", während jeder Download 404 antwortet
 *    (§10.1: „Datei nicht auffindbar" **statt einer Größe").
 */
function zustand(datei: ShareDatei): { text: string; symbol: SymbolName } {
  if (!datei.vollstaendig) {
    return { text: "nicht vollständig übertragen", symbol: "punkte" };
  }
  if (!datei.freigegeben) {
    return { text: AV_TEXT[datei.avStatus], symbol: AV_SYMBOL[datei.avStatus] };
  }
  if (datei.blobFehlt) {
    return { text: "Datei nicht auffindbar", symbol: "ruf" };
  }
  return { text: AV_TEXT.clean, symbol: AV_SYMBOL.clean };
}

type DateiZeile = {
  id: string;
  dateiname: string;
  /** `—`, wo es nichts zu zeigen gibt: ohne Bytes und ohne Blob wäre eine Zahl
   *  eine Behauptung über Bytes, die niemand ausliefern kann. */
  groesseText: string;
  zustandInhalt: React.ReactNode;
};

/**
 * SPALTENBREITEN IN PIXELN — die Einheit steht im Namen (§9.1). Die Summe wird
 * gerechnet, nicht getippt: tragen die Spalten `width`, ist sie die einzige
 * ehrliche `scroll.x`-Angabe (`docs/design/README.md:176-182`).
 */
const SPALTE_NAME_PX = 340;
const SPALTE_GROESSE_PX = 160;
const SPALTE_ZUSTAND_PX = 280;
const DATEI_TABELLE_BREITE_PX = SPALTE_NAME_PX + SPALTE_GROESSE_PX + SPALTE_ZUSTAND_PX;

/** Nur `dataIndex`, keine `render`-Funktion — Begründung im Kopfkommentar. Und
 *  keine Spalte trägt `fixed` oder `ellipsis`, `scroll.y` bleibt ungesetzt:
 *  sonst schaltet rc-table auf `table-layout: fixed` (`lib/Table.js:426-442`). */
const DATEI_SPALTEN = [
  { key: "name", title: "Datei", dataIndex: "dateiname", width: SPALTE_NAME_PX },
  { key: "groesse", title: "Größe", dataIndex: "groesseText", width: SPALTE_GROESSE_PX },
  { key: "zustand", title: "Zustand", dataIndex: "zustandInhalt", width: SPALTE_ZUSTAND_PX },
];

function zuAnzeige(datei: ShareDatei): DateiZeile {
  const { text, symbol } = zustand(datei);
  return {
    id: datei.id,
    dateiname: datei.dateiname,
    // Die Bytezahl AUS DER ZEILE, nie die gemessene Länge: dieselbe Spalte, aus
    // der auch die Summe entsteht. Zwei Quellen ergäben zwei Zahlen (§7.3).
    groesseText: datei.vollstaendig && !datei.blobFehlt ? byteTextBinaer(datei.groesse) : "—",
    zustandInhalt: (
      <span>
        <Zustandssymbol name={symbol} /> {text}
      </span>
    ),
  };
}

// ---------------------------------------------------------------------------

export default async function ShareDetailSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const detail = await ladeShareDetail(id);
  // `notFound()` und kein Wurf: das Modul verrät die Existenz einer Freigabe
  // nirgends, und die 404-Seite der Suite ist `src/app/not-found.tsx`.
  if (detail === null) notFound();

  const grenze = geklemmteLogGrenze((await searchParams).logs);
  const { zeilen: logZeilen, gibtMehr } = await ladeAuditLog(id, grenze);

  /*
   * DER ÖFFENTLICHE LINK TRÄGT DEN HOST DER ROLLE, nicht den des Requests
   * (§3.2): auf der Inbox-Domain erzeugt trüge er sonst `drop.…`, funktionierte
   * sofort, sähe richtig aus — und würde beim Abschalten eines Hosts ungültig,
   * auf Papier, das dann längst verteilt ist. Hier ist die Rolle ohnehin
   * `verwaltung` (Group-Layout), der Aufruf ist also nicht „nur zur Sicherheit",
   * sondern die EINE Stelle, an der die Adresse entsteht.
   */
  const oeffentlicheAdresse = oeffentlicheUrl("verwaltung", `/s/${id}`, await headers());

  const dateiZeilen = detail.dateien.map(zuAnzeige);
  const anzahlVollstaendig = detail.dateien.length - detail.anzahlUnvollstaendig;
  const groesseText = byteTextBinaer(detail.gesamtGroesse);

  // Der Name je Logzeile kommt aus DIESEN Zeilen — `download_logs` trägt keinen
  // Fremdschlüssel (§4.5), die Auflösung kann also ins Leere gehen. Genau dafür
  // hat `AuditLog` seinen benannten Rückfall.
  const nameJeDatei = new Map(detail.dateien.map((datei) => [datei.id, datei.dateiname]));
  const protokoll: AuditLogZeile[] = logZeilen.map((zeile) => ({
    id: zeile.id,
    zeitText: ZEITPUNKT_GENAU.format(zeile.zeit),
    dateiId: zeile.dateiId,
    dateiname: zeile.dateiId === null ? null : (nameJeDatei.get(zeile.dateiId) ?? null),
    ipText: zeile.clientIpUnbestaetigt ?? "—",
    agentText: zeile.userAgent ?? "—",
  }));

  /*
   * EINE Uhr, und sie steht SERVERSEITIG. Rechnete der Browser den Zustand,
   * entschieden Server und Client an der Ablaufsekunde verschieden — die Seite
   * stünde auf „gültig", während jeder Download 410 antwortet. Gleichstand zählt
   * als abgelaufen, dieselbe Festlegung wie in `_db/queries.ts:ladeShare`:
   * `expires_at` bezeichnet das Ende der Laufzeit, nicht den letzten gültigen
   * Augenblick.
   */
  const jetzt = new Date();
  const abgelaufen = detail.ablaufAt.getTime() <= jetzt.getTime();

  return (
    <div data-testid="files-share-detail">
      {/* DER WEG ZURÜCK. Jede Verwaltungsseite führt zurück, sonst ist sie eine
          Sackgasse (`docs/design/README.md:244`). */}
      <p>
        <Link href="/" data-testid="files-detail-zurueck">
          ← Alle Freigaben
        </Link>
      </p>

      {/* Ein nacktes `<h1>` und NICHT `Typography.Title`: der Compound-Zugriff
          ist in RSC `undefined` und ergibt HTTP 500. */}
      <h1>{detail.titel}</h1>
      {detail.beschreibung !== null && <p>{detail.beschreibung}</p>}

      <Card title="Freigabe" data-testid="files-detail-metadaten">
        <p>Typ: {detail.typ === "file" ? "Datei" : "Ordner"}</p>
        <p>
          Dateien: {anzahlVollstaendig}
          {detail.anzahlUnvollstaendig > 0 && <> ({detail.anzahlUnvollstaendig} unvollständig)</>}
        </p>
        {/* Die Summe kommt AUS DEN ZEILEN; `total_size` wird daneben NICHT
            angezeigt (§7.3) — heute zeigen Dashboard und Detailseite dieselbe
            Größe aus ZWEI Quellen und können verschiedene Zahlen zeigen. */}
        <p>Größe: {groesseText}</p>
        <p>
          Ablauf: {ZEITPUNKT.format(detail.ablaufAt)}
          {abgelaufen && <> — abgelaufen</>}
        </p>
        {/* `null` = UNBEGRENZT, nicht 0 und nicht −1 (§4.2) — deshalb `??` und
            niemals `||`. */}
        <p>Downloads: {`${detail.downloadCount} / ${detail.maxDownloads ?? "∞"}`}</p>
        <p>Passwort: {detail.hatPasswort ? "Ja" : "Nein"}</p>
        <p>
          Erstellt von:{" "}
          {detail.erstelltVon === ALTBESTAND
            ? "Altbestand — nicht zuordenbar"
            : detail.erstelltVon}{" "}
          am {ZEITPUNKT.format(detail.erstelltAt)}
        </p>
      </Card>

      <ShareDetailAktionen
        shareId={detail.id}
        titel={detail.titel}
        anzahlDateien={anzahlVollstaendig}
        groesseText={groesseText}
        /* Die Entschärfung 1:1 aus `_lib/zip.ts`, und sie läuft HIER: `zip.ts`
           zieht über `_lib/av.ts` `node:net` nach, ein Import von dort in ein
           `"use client"`-Modul trüge das ins Client-Bundle (§7.9). */
        qrDateiname={`${entschaerfeTitel(detail.titel)}-qr.png`}
        oeffentlicheAdresse={oeffentlicheAdresse}
        /* NICHT die Zahl selbst: `0` ist ein gesetztes (erschöpftes) Limit, und
           eine Wahrheitsprüfung blendete das Aufstocken genau dort aus, wo es
           gebraucht wird (§4.2). */
        hatDownloadLimit={detail.maxDownloads !== null}
      />

      {/*
       * DER LEERZUSTAND MIT BEIDEN WEGEN (§10.1, §10.2). Er steht NEBEN der
       * Dateiliste, nicht statt ihrer: die unvollständigen Zeilen bleiben
       * sichtbar (§4.4 — in der Alt-App war dieser Zustand unsichtbar und
       * dauerhaft).
       */}
      {detail.alleUnvollstaendig && (
        <Card data-testid="files-detail-leer">
          <p>Keine Datei vollständig übertragen.</p>
          <p>
            Entweder ist der Upload abgebrochen, oder er läuft noch. Es gibt hier nichts
            herunterzuladen — der öffentliche Link zeigt Empfängern denselben Zustand.
          </p>
          {/*
           * ZWEI WEGE: „Löschen" steht als Knopf oben in der Handlungszeile,
           * „Erneut hochladen" führt auf `/shares/neu`. Einen Weg, die BYTES
           * einer bestehenden Freigabe nachzureichen, gibt es im Modul nicht —
           * `/shares/neu` legt eine neue Freigabe an, und das ist das einzige
           * Ziel, das nicht in einen 404 läuft.
           */}
          <Button type="primary" href="/shares/neu">
            Erneut hochladen
          </Button>
        </Card>
      )}

      <Card title="Dateien" data-testid="files-detail-dateien">
        {dateiZeilen.length === 0 ? (
          <p>Diese Freigabe hat keine Dateizeile.</p>
        ) : (
          <Table<DateiZeile>
            rowKey="id"
            dataSource={dateiZeilen}
            columns={DATEI_SPALTEN}
            pagination={false}
            /* Die Summe der Spaltenbreiten: eine Tabelle scrollt auf schmalen
               Geräten, sie bricht nicht um (`docs/design/README.md:174`). */
            scroll={{ x: DATEI_TABELLE_BREITE_PX }}
          />
        )}
      </Card>

      <AuditLog
        zeilen={protokoll}
        mehrHref={
          gibtMehr && grenze < LOG_MAX_ZEILEN
            ? `/shares/${id}?logs=${grenze + LOG_SEITE_ZEILEN}`
            : null
        }
        /* Ein „mehr laden", das nichts mehr nachlädt, wäre ein Bedienelement
           ohne Wirkung — also eine Sackgasse (`docs/design/README.md:236-249`).
           An der Obergrenze wird der Zustand deshalb BENANNT. */
        obergrenzeZeilen={gibtMehr && grenze >= LOG_MAX_ZEILEN ? LOG_MAX_ZEILEN : null}
      />
    </div>
  );
}
