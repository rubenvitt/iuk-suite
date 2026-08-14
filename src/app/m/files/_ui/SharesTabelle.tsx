"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, Button, Card, Popconfirm, Skeleton, Table } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  QuestionCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";

import { shareLoeschenAction, type ShareFormZustand } from "../(verwaltung)/actions";
/*
 * TYP-IMPORT, und der bleibt es auch. `_db/queries` zieht `better-sqlite3` und
 * die Ablage nach; ein WERT von dort in dieser Datei waere ein Serverpaket im
 * Client-Bundle. `import type` wird vom Uebersetzer geloescht — und es ist der
 * einzige Weg, den Wertebereich des AV-Sammelwerts NICHT ein zweites Mal
 * hinzuschreiben. Eine abgeschriebene Liste driftet gegen `sammelwert()`, und
 * der fehlende Fall waere ein leeres Feld statt einer Meldung.
 */
import type { AvSammelwert } from "../_db/queries";
import { QrDialog } from "./QrDialog";

/**
 * DIE FREIGABEN-TABELLE (Spec §7.3, §10.1, §10.2; Plan T36).
 *
 * WARUM DIESE DATEI `"use client"` TRAEGT UND DIE SEITE TROTZDEM RSC BLEIBT:
 * `columns` mit `render`-Funktionen reicht FUNKTIONEN ueber die RSC-Grenze, und
 * das scheitert unabhaengig von der antd-Compound-Falle. Dazu kommen
 * Zeilenaktionen, ein Bestaetigungsdialog und der QR-Dialog — alles Zustand.
 * `SharesUebersicht` laedt und rechnet, diese Insel bedient. Praezedenzfall im
 * Repo: `feedback/_ui/Verlauf.tsx:1` traegt `"use client"`, obwohl es als
 * Vorbild fuer die CSS-Umschaltung zitiert wird.
 *
 * DIE ZEILEN KOMMEN FERTIG HEREIN — Text, keine `Date`-Objekte, keine
 * Drizzle-Rows, keine Funktionen. Drei Gruende, und keiner davon ist Geschmack:
 *  1. `password_hash` ueberquert die Grenze nicht. Die Alt-App selektierte alle
 *     Spalten, spreadete sie und uebergab sie an die Client-Komponente, die
 *     `passwordHash: string | null` deklarierte und nur den Wahrheitswert
 *     benutzte (Analyse Falle 11). Hier gibt es `hatPasswort: boolean`, und der
 *     Hash wird nicht „spaeter weggelassen", sondern nie geholt.
 *  2. Der ZUSTAND „abgelaufen" haengt an einer Uhr. Rechnete ihn der Browser,
 *     entschieden Server und Client an der Ablaufsekunde verschieden — die Zeile
 *     stuende auf „gueltig", waehrend jeder Download 410 antwortet.
 *  3. Groeszen- und Zeittexte entstehen an EINER Stelle. Zwei Formatierer
 *     ergeben zwei Wahrheiten ueber dieselbe Zahl (MiB gegen MB, Faktor
 *     1,048576 — im Modul `files` schon einmal teuer geworden).
 *
 * BEIDE DARSTELLUNGEN STEHEN IM MARKUP, CSS blendet eine aus. Die Umschaltung
 * ist CSS, NIE JavaScript: ein JS-Breakpoint zeigt beim ersten Render die
 * falsche Variante. Die Klassen `nurDesktop`/`nurMobil` und der vorangestellte
 * `fi-liste` kommen aus `_ui/files.css` (T18) — der Praefix ist dort kein
 * Ballast, sondern der ganze Punkt: `.nurDesktop` allein ist (0,1,0) und damit
 * im Gleichstand mit `.ant-table-wrapper`, und bei Gleichstand gewinnt antds
 * spaeteres Stylesheet (`docs/design/README.md`, Falle 5).
 */

export type ShareZeile = {
  id: string;
  titel: string;
  /** „Datei" oder „Ordner" — der Rohwert `file`/`folder` ist keine Anzeige. */
  typText: string;
  /** VOLLSTAENDIG uebertragene Dateien. */
  anzahlDateien: number;
  /** Zeilen ohne Bytes (§4.4) — sichtbar statt still. */
  anzahlUnvollstaendig: number;
  /** Summe AUS DEN ZEILEN, nie `shares.total_size` (§7.3). */
  groesseText: string;
  ablaufText: string;
  /** Serverseitig entschieden — siehe Kopfkommentar, Grund 2. */
  abgelaufen: boolean;
  /** `n / m` bzw. `n / ∞` (§7.3). */
  downloadsText: string;
  hatPasswort: boolean;
  avSammelwert: AvSammelwert;
  /** Fertiger Text; der Platzhalter des Altbestands ist schon uebersetzt. */
  erstelltVonText: string;
  /** `<entschaerfter-titel>-qr.png`, serverseitig gebildet (§7.9). */
  qrDateiname: string;
};

const LOESCHEN_START: ShareFormZustand = { ok: false, feldFehler: {}, werte: {} };

/**
 * BEDEUTUNG NIE ALLEIN UEBER FARBE (`docs/design/README.md:133-137`): jeder
 * Sammelwert traegt einen SATZ. Das Symbol steht daneben und ist die
 * verzichtbare Schicht — deshalb `aria-hidden`, sonst liest eine Sprachausgabe
 * dieselbe Aussage zweimal.
 *
 * KEINE FARBE, und das ist hier mehr als Vorsicht: `colorError === colorPrimary
 * === #c8000f`. Ein rotes Tag fuer „gesperrt" saehe auf einer Datenflaeche aus
 * wie eine Primaeraktion (§10.1).
 */
const AV_TEXT: Record<AvSammelwert, string> = {
  leer: "Noch keine übertragene Datei",
  freigegeben: "geprüft — freigegeben",
  wirdGeprueft: "wird geprüft",
  gesperrt: "gesperrt — Fund",
  pruefungFehlt: "Prüfung nicht möglich",
  ungeprueft: "nicht geprüft",
};

function AvZustand({ wert }: { wert: AvSammelwert }) {
  const symbol = {
    leer: <MinusCircleOutlined aria-hidden />,
    freigegeben: <CheckCircleOutlined aria-hidden />,
    wirdGeprueft: <ClockCircleOutlined aria-hidden />,
    gesperrt: <StopOutlined aria-hidden />,
    pruefungFehlt: <ExclamationCircleOutlined aria-hidden />,
    ungeprueft: <QuestionCircleOutlined aria-hidden />,
  }[wert];
  return (
    <span>
      {symbol} {AV_TEXT[wert]}
    </span>
  );
}

function fehlerText(zustand: ShareFormZustand): string | null {
  if (zustand.ok) return null;
  const werte = Object.values(zustand.feldFehler);
  return werte.length === 0 ? null : werte.join(" ");
}

// ---------------------------------------------------------------------------

/**
 * Die Spalten, EINMAL — und die Ueberschriften des Skeletts lesen dieselbe
 * Quelle (siehe `SPALTEN_TITEL`). Zwei getippte Listen wuerden auseinanderlaufen,
 * und das Skelett waere dann das Skelett einer anderen Tabelle.
 */
function spalten(qrOeffnen: (zeile: ShareZeile) => void) {
  return [
    { key: "titel", title: "Titel", dataIndex: "titel" },
    { key: "typ", title: "Typ", dataIndex: "typText" },
    {
      key: "dateien",
      title: "Dateien",
      render: (_: unknown, zeile: ShareZeile) => <Dateimenge zeile={zeile} />,
    },
    { key: "groesse", title: "Größe", dataIndex: "groesseText" },
    {
      key: "ablauf",
      title: "Ablauf",
      render: (_: unknown, zeile: ShareZeile) => <Ablauf zeile={zeile} />,
    },
    { key: "downloads", title: "Downloads", dataIndex: "downloadsText" },
    {
      key: "passwort",
      title: "Passwort",
      // Ja/Nein als WORT: ein Schloss-Symbol allein traegt die Aussage nicht.
      render: (_: unknown, zeile: ShareZeile) => <span>{zeile.hatPasswort ? "Ja" : "Nein"}</span>,
    },
    {
      key: "av",
      title: "AV-Zustand",
      render: (_: unknown, zeile: ShareZeile) => <AvZustand wert={zeile.avSammelwert} />,
    },
    { key: "erstelltVon", title: "Erstellt von", dataIndex: "erstelltVonText" },
    {
      key: "aktionen",
      title: "",
      render: (_: unknown, zeile: ShareZeile) => (
        <ZeilenAktionen zeile={zeile} kennung="tabelle" qrOeffnen={qrOeffnen} />
      ),
    },
  ];
}

/** Die Ueberschriften AUS den Spalten, nicht daneben getippt. */
const SPALTEN_TITEL: string[] = spalten(() => undefined).map((spalte) => spalte.title);

function Dateimenge({ zeile }: { zeile: ShareZeile }) {
  return (
    <span>
      {zeile.anzahlDateien}
      {/* §4.4: der Zwischenzustand „Zeile ohne Bytes" ist SICHTBAR. In der
          Alt-App war er unsichtbar und dauerhaft. */}
      {zeile.anzahlUnvollstaendig > 0 && <> ({zeile.anzahlUnvollstaendig} unvollständig)</>}
    </span>
  );
}

function Ablauf({ zeile }: { zeile: ShareZeile }) {
  return (
    <span>
      {zeile.ablaufText}
      {zeile.abgelaufen && <> — abgelaufen</>}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function SharesTabelle({ zeilen }: { zeilen: ShareZeile[] }) {
  /*
   * EIN Dialog fuer beide Darstellungen. Zwei — je einer pro Darstellung —
   * traegen dieselbe `data-testid` doppelt im Dokument und zeigen im
   * Zweifel beide dasselbe Bild uebereinander.
   */
  const [qrZeile, setQrZeile] = useState<ShareZeile | null>(null);

  return (
    <div className="fi-liste" data-testid="files-shares-tabelle">
      <div className="nurDesktop" data-testid="files-shares-tabelle-desktop">
        <Table<ShareZeile>
          rowKey="id"
          dataSource={zeilen}
          columns={spalten(setQrZeile)}
          pagination={false}
          /*
           * `max-content` ist die einzige ehrliche Angabe, weil die Spalten keine
           * `width` tragen — jede Pixelzahl waere erfunden. Und KEINE Spalte
           * traegt `fixed`, keine kuerzt mit Auslassungspunkten, `scroll.y` ist
           * nicht gesetzt: rc-table schaltet sonst auf `table-layout: fixed`,
           * verteilt die Spalten gleichmaeszig und das DESKTOP-Bild aendert sich,
           * ohne dass irgendwo etwas ueberlaeuft (`lib/Table.js:426-442`).
           */
          scroll={{ x: "max-content" }}
        />
      </div>

      {/*
       * DIE KARTENLISTE, und sie steht IMMER im Markup. Unter 767.98px blendet
       * `files.css` die Tabelle aus und diese Liste ein — eine umgebrochene
       * Tabellenzeile ist unlesbarer als eine gescrollte, und eine gescrollte
       * Zeile mit zehn Spalten ist auf 390px keine Liste mehr.
       */}
      <div className="nurMobil" data-testid="files-shares-karten">
        {zeilen.map((zeile) => (
          <Karte key={zeile.id} zeile={zeile} qrOeffnen={setQrZeile} />
        ))}
      </div>

      {qrZeile !== null && (
        <QrDialog
          shareId={qrZeile.id}
          titel={qrZeile.titel}
          qrDateiname={qrZeile.qrDateiname}
          offen
          schliessen={() => setQrZeile(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * DAS SKELETT IST TABELLENFOERMIG. Ein Ladekringel an dieser Stelle saehe aus
 * wie ein leeres Modul; ein Skelett mit denselben Spaltenueberschriften sagt
 * „hier kommt gleich eine Tabelle, und zwar diese" (§10.1, Spalte „Warten").
 * Gerendert wird es als `Suspense`-Ersatz in `SharesUebersicht` — deshalb liegt
 * es HIER: `Skeleton.Button` ist ein Compound-Zugriff und in einer Server
 * Component HTTP 500.
 */
export function SharesTabelleSkelett() {
  return (
    <div
      className="fi-liste"
      data-testid="files-uebersicht-skelett"
      aria-busy="true"
      aria-label="Freigaben werden geladen"
    >
      {/* Eigenes Markup ohne eigenes Stylesheet: die Tabelle traegt hier keine
          Gestaltung, sondern nur die Form. Deshalb die eine Breitenangabe
          inline statt eines `*.module.css` fuer eine einzige Regel. */}
      <table style={{ width: "100%" }}>
        <thead>
          <tr>
            {SPALTEN_TITEL.map((titel, i) => (
              <th key={i}>{titel}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((zeilenNummer) => (
            <tr key={zeilenNummer}>
              {SPALTEN_TITEL.map((_, i) => (
                <td key={i}>
                  {/* `size="small"` bleibt hier: das ist ein Ladeplatzhalter,
                      kein Bedienelement — nicht interaktiv, keine Tapflaeche.
                      Die neue `size="small"`-Regel (Aufgabe 12) gilt echten
                      Zeilenaktionen, nicht ihrem Skelett. */}
                  <Skeleton.Button active block size="small" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Karte({
  zeile,
  qrOeffnen,
}: {
  zeile: ShareZeile;
  qrOeffnen: (zeile: ShareZeile) => void;
}) {
  return (
    <Card title={zeile.titel} data-testid={`files-share-karte-${zeile.id}`}>
      <p>
        {zeile.typText} · {zeile.anzahlDateien}{" "}
        {zeile.anzahlDateien === 1 ? "Datei" : "Dateien"}
        {zeile.anzahlUnvollstaendig > 0 && (
          <> ({zeile.anzahlUnvollstaendig} unvollständig)</>
        )}{" "}
        · {zeile.groesseText}
      </p>
      <p>
        Ablauf: <Ablauf zeile={zeile} />
      </p>
      <p>Downloads: {zeile.downloadsText}</p>
      <p>Passwort: {zeile.hatPasswort ? "Ja" : "Nein"}</p>
      <p>
        <AvZustand wert={zeile.avSammelwert} />
      </p>
      <p>Erstellt von: {zeile.erstelltVonText}</p>
      <ZeilenAktionen zeile={zeile} kennung="karte" qrOeffnen={qrOeffnen} />
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * DIE DREI EINSTIEGSPUNKTE EINER ZEILE (§10.2). „Bearbeiten" und „Löschen"
 * stehen laut §10.2 in Tabelle UND auf der Detailseite — ohne diese Haelfte
 * haetten `bearbeitenAction` und `shareLoeschenAction` in der Liste gar keinen
 * Weg in der Oberflaeche, und eine Action ohne Aufrufer ist kein Feature.
 *
 * `kennung` trennt Tabelle und Karte, weil BEIDE Darstellungen im Markup stehen:
 * ohne sie traegt jede `data-testid` zweimal, und ein Test wuesste nicht, welche
 * der beiden er gerade bedient.
 */
function ZeilenAktionen({
  zeile,
  kennung,
  qrOeffnen,
}: {
  zeile: ShareZeile;
  kennung: "tabelle" | "karte";
  qrOeffnen: (zeile: ShareZeile) => void;
}) {
  const [zustand, abschicken] = useActionState(shareLoeschenAction, LOESCHEN_START);
  const formular = useRef<HTMLFormElement>(null);
  const fehler = fehlerText(zustand);

  /*
   * KEIN `size="small"` MEHR AN ZEILENAKTIONEN (korrigiert Aufgabe 12, nach
   * Aufgabe 8): die alte Ausnahme galt der 56px-`controlHeight` — eine
   * 44px-Zeilenaktion (`ARBEITSDICHTE`) sprengt keine Zeile mehr, waehrend
   * `size="small"` auf 24px faellt und die Mindesttapflaeche unterbietet
   * (`docs/design/README.md`, Falle 4). In der Karte bleibt `block` bestehen —
   * unter 768px stehen Handlungsknoepfe untereinander und in voller Breite,
   * ein 630px breiter Knopf liest sich als Flaeche, nicht als Ziel.
   */
  const inTabelle = kennung === "tabelle";
  const masz = inTabelle ? {} : ({ block: true } as const);

  return (
    <div>
      {/*
       * KORREKTUR (Aufgabe 12): dieser Kommentar behauptete, das Ziel entstehe
       * erst in T42 (Welle 7) und der Knopf fuehre bis dahin in einen 404 aus
       * ABWESENHEIT — das war zum Zeitpunkt des Kommentars richtig, ist aber
       * seit T42s Umsetzung UEBERHOLT: `/shares/<id>/bearbeiten` existiert
       * (`shares/[id]/bearbeiten/page.tsx`) und ist selbst Teil dieses
       * Zuschnitts. Der Riegel-Teil der Begruendung bleibt gueltig: es gibt
       * genau EINE Zugriffsstufe, und wer die Tabelle sieht, darf auch
       * bearbeiten (§2.4) — die Gegenprobe „kein Einstiegspunkt fuehrt dorthin,
       * wo die aufrufende Person nicht hindarf" ist damit weiterhin erfuellt,
       * nur nicht mehr ueber eine Abwesenheit, sondern ueber ein bestehendes Ziel.
       */}
      <Button
        {...masz}
        href={`/shares/${zeile.id}/bearbeiten`}
        data-testid={`files-share-bearbeiten-${kennung}-${zeile.id}`}
      >
        Bearbeiten
      </Button>
      <Button
        {...masz}
        onClick={() => qrOeffnen(zeile)}
        data-testid={`files-share-qr-${kennung}-${zeile.id}`}
      >
        QR
      </Button>

      <form action={abschicken} ref={formular}>
        <input type="hidden" name="id" value={zeile.id} />
        <Popconfirm
          title="Freigabe löschen?"
          /*
           * DATEIZAHL UND GROESZE, beide (§7.3). „2 Dateien" allein sagt nicht,
           * was verloren geht, und eine Groesze allein nicht, wie viele Empfaenger
           * ins Leere laufen. Das Zugriffsprotokoll wird ausdruecklich genannt,
           * weil es NICHT mitstirbt (§4.5) — sonst zoegert jemand vor dem
           * Loeschen aus einem falschen Grund.
           */
          description={`„${zeile.titel}" mit ${zeile.anzahlDateien} ${
            zeile.anzahlDateien === 1 ? "Datei" : "Dateien"
          } (${zeile.groesseText}) wird mit allen Dateien gelöscht. ` +
            `Das Zugriffsprotokoll bleibt erhalten.`}
          okText="Löschen"
          cancelText="Abbrechen"
          onConfirm={() => formular.current?.requestSubmit()}
        >
          {/*
           * `danger` OHNE `type="primary"`: `colorError === colorPrimary ===
           * #c8000f`, ein roter Vollknopf waere pixelgleich mit einer
           * Primaeraktion. Rot bleibt am Rand.
           */}
          <Button {...masz} danger data-testid={`files-share-loeschen-${kennung}-${zeile.id}`}>
            Löschen
          </Button>
        </Popconfirm>
      </form>

      {fehler !== null && (
        /*
         * `type="warning"` und NICHT `type="error"`: die Fehlerfarbe ist die
         * Primaerfarbe, ein roter Kasten auf einer Datenflaeche saehe aus wie
         * eine Handlungsaufforderung (`docs/design/README.md`, Falle 3).
         * Und ein Fehler ohne Ausweg waere eine Sackgasse — deshalb der
         * Wiederholen-Knopf, der DASSELBE Formular noch einmal abschickt.
         */
        <Alert
          type="warning"
          showIcon
          data-testid={`files-share-fehler-${kennung}-${zeile.id}`}
          message={fehler}
          action={
            // Kein `size="small"` mehr — siehe Kommentar an `masz` oben.
            <Button
              data-testid={`files-share-wiederholen-${kennung}-${zeile.id}`}
              onClick={() => formular.current?.requestSubmit()}
            >
              Wiederholen
            </Button>
          }
        />
      )}
    </div>
  );
}
