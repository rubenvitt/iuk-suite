"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Skeleton } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import {
  Kartentabelle,
  Kurzkennung,
  Zeilenaktionen,
  nachDatum,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { SCHRIFT } from "@/core/theme/schrift";

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
import styles from "./sharesTabelle.module.css";

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
 * BEIDE DARSTELLUNGEN STEHEN IM MARKUP, CSS blendet eine aus — und zwar das
 * gemeinsame Bauteil `Kartentabelle` aus `core/tabelle` (DRK-422). Hier standen
 * vorher eine Tabelle und eine Kartenliste von Hand, mit eigenen
 * Sichtbarkeitsklassen in `_ui/files.css` und eigener Spezifitaetsbegruendung:
 * dieselbe Entscheidung wie im Bauteil, an einem zweiten Ort. Die Karte leitet
 * sich jetzt aus den Spalten ab, und die Spaltenfilter sind auf dem Telefon
 * ueber der Kartenliste zu erreichen (`Schmalsteuerung`) — vorher gab es sie
 * dort gar nicht.
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
  /**
   * ⚠️ DIESELBE SUMME ALS ZAHL — allein fuer die Sortierung, angezeigt wird
   * `groesseText`. „476,8 MiB" sortierte als Zeichenkette neben „11 KiB"
   * falsch, und zwar still.
   */
  groesseBytes: number;
  ablaufText: string;
  /**
   * ⚠️ DERSELBE Ablauf als ISO-Zeichenkette — allein fuer die Sortierung.
   * „31.07.2026, 14:00" sortierte als Zeichenkette den 2. Oktober vor den
   * 14. September.
   */
  ablaufIso: string;
  /** Serverseitig entschieden — siehe Kopfkommentar, Grund 2. */
  abgelaufen: boolean;
  /** `n / m` bzw. `n / ∞` (§7.3). */
  downloadsText: string;
  /**
   * ⚠️ DER ZAEHLER als Zahl — allein fuer die Sortierung. `downloadsText` ist
   * ein Bruch und sortierte als Zeichenkette „10 / 20" vor „3 / 5". Sortiert
   * wird ueber die GELADENE Menge, nicht ueber das Limit: die Frage an diese
   * Spalte ist „was wird abgerufen?", nicht „wo steht eine hohe Grenze?".
   */
  downloadsZahl: number;
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
    leer: <Icons8Ikone name="minus-circle" />,
    freigegeben: <Icons8Ikone name="ok" />,
    wirdGeprueft: <Icons8Ikone name="clock" />,
    gesperrt: <Icons8Ikone name="cancel" />,
    pruefungFehlt: <Icons8Ikone name="error" />,
    ungeprueft: <Icons8Ikone name="help" />,
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
 *
 * SPALTENKOEPFE SIND NACKTE ZEICHENKETTEN — die Kicker-Rolle setzt
 * `Datentabelle` selbst (`docs/design/README.md`: ueber `columns[].title`, nie
 * ueber CSS gegen `.ant-table-thead`). `aktionen` bleibt `title: ""`: kein Text,
 * keine Rolle mit Wirkung; die Aktionsspalte braucht keinen Kopf.
 *
 * ⚠️ SORTIERT WIRD NIE UEBER DEN ANZEIGETEXT. Groesze, Ablauf und Downloads
 * tragen dafuer je ein ROHFELD in der Zeile (`groesseBytes`, `ablaufIso`,
 * `downloadsZahl`) — „476,8 MiB" neben „11 KiB" und „31.07.2026" neben
 * „02.10.2026" ordneten als Zeichenkette falsch, und zwar still.
 *
 * DIE FILTER STEHEN, WO DIE WERTE WIEDERKEHREN: Typ, AV-Zustand und „Erstellt
 * von" sind kurze Listen aus den geladenen Zeilen (`werteAlsFilter`), Ablauf und
 * Passwort abgeleitete Zustaende (`zustandsFilter`). Keine Spalte bekommt eine
 * gepflegte Liste — ein Filtereintrag, den keine Zeile trifft, ist die
 * haeufigste Enttaeuschung an Spaltenfiltern.
 */
function spalten(
  zeilen: ShareZeile[],
  qrOeffnen: (zeile: ShareZeile) => void,
  linkBasis: string,
) {
  /*
   * BEI 1280px PASST DIE ZEILE IN DEN RAHMEN (IDA-393). Gemessen ragte sie 626px
   * hinaus. Deshalb: der AV-Zustand steht direkt hinter dem Titel, Typ und
   * Passwortschutz stehen leise unter dem Titel, die Dateizahl unter der Groesze,
   * die Downloads unter dem Ablauf, und die drei Aktionen liegen in einem Menue.
   * Keine Aussage ist weg — nur die eigenen Spalten (und damit deren Filter fuer
   * Typ und Passwort).
   */
  return [
    {
      key: "titel",
      title: "Titel",
      sorter: nachText<ShareZeile>((zeile) => zeile.titel),
      render: (_: unknown, zeile: ShareZeile) => <TitelZelle zeile={zeile} />,
    },
    {
      key: "av",
      title: "AV-Zustand",
      /* Sortiert und gefiltert wird ueber den SATZ aus `AV_TEXT`, nicht ueber
         den Sammelwert: `wirdGeprueft` und `pruefungFehlt` sind interne Namen,
         und eine Filterliste in dieser Schreibweise stuende neben einer Zelle,
         die etwas anderes sagt. */
      sorter: nachText<ShareZeile>((zeile) => AV_TEXT[zeile.avSammelwert]),
      filters: werteAlsFilter(zeilen, (zeile) => AV_TEXT[zeile.avSammelwert]),
      onFilter: trifftWert<ShareZeile>((zeile) => AV_TEXT[zeile.avSammelwert]),
      render: (_: unknown, zeile: ShareZeile) => <AvZustand wert={zeile.avSammelwert} />,
    },
    {
      key: "groesse",
      title: "Größe",
      /* ⚠️ Sortiert ueber die BYTES, nie ueber `groesseText` — „476,8 MiB"
         stuende als Zeichenkette vor „11 KiB". Die Dateizahl steht leise
         darunter (IDA-393: vorher eine eigene Spalte). */
      sorter: nachZahl<ShareZeile>((zeile) => zeile.groesseBytes),
      render: (_: unknown, zeile: ShareZeile) => <Dateimenge zeile={zeile} />,
    },
    {
      key: "ablauf",
      title: "Ablauf",
      sorter: nachDatum<ShareZeile>((zeile) => zeile.ablaufIso),
      /* „abgelaufen" ist ein ABGELEITETER Zustand und kein Feldwert — und er
         wird SERVERSEITIG entschieden (Kopfkommentar, Grund 2). Der Filter liest
         die Entscheidung, er trifft sie nicht: eine Uhr im Browser stellte die
         Zeile auf „gueltig", waehrend jeder Download 410 antwortet. */
      ...zustandsFilter<ShareZeile>([
        { wert: "gueltig", text: "gültig", trifft: (zeile) => !zeile.abgelaufen },
        { wert: "abgelaufen", text: "abgelaufen", trifft: (zeile) => zeile.abgelaufen },
      ]),
      render: (_: unknown, zeile: ShareZeile) => <Ablauf zeile={zeile} />,
    },
    {
      key: "erstelltVon",
      title: "Erstellt von",
      /* Eine Kontokennung ohne Leerzeichen (die `sub` aus der Anmeldung) ist
         lang und wird nur verglichen, nie gelesen — gekuerzt, mit Kopieren. */
      render: (_: unknown, zeile: ShareZeile) =>
        /\s/.test(zeile.erstelltVonText) || zeile.erstelltVonText.length <= 13
          ? zeile.erstelltVonText
          : <Kurzkennung wert={zeile.erstelltVonText} zeichen={8} was="Kennung" />,
      sorter: nachText<ShareZeile>((zeile) => zeile.erstelltVonText),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.erstelltVonText),
      onFilter: trifftWert<ShareZeile>((zeile) => zeile.erstelltVonText),
    },
    {
      key: "aktionen",
      title: "",
      render: (_: unknown, zeile: ShareZeile) => (
        <ZeilenAktionen zeile={zeile} qrOeffnen={qrOeffnen} adresse={`${linkBasis}${zeile.id}`} />
      ),
    },
  ];
}

/**
 * Die Ueberschriften AUS den Spalten, nicht daneben getippt.
 *
 * Seit der Umstellung auf `Datentabelle` sind es wieder ZEICHENKETTEN: die
 * Kicker-Rolle setzt die Tabelle selbst. Das Skelett ist aber keine
 * `Datentabelle`, sondern ein nacktes `<table>` — es wickelt den Titel deshalb
 * unten selbst ein. Ohne das saehen die Kopfzeilen des Skeletts anders aus als
 * die der Tabelle, die es ankuendigt.
 */
const SPALTEN_TITEL: string[] = spalten([], () => undefined, "").map((spalte) => spalte.title);

/** Die leise zweite Zeile einer Zelle — eigene Variable, kein `--ant-*` (Falle 2). */
const LEISE = { display: "block", fontSize: 12, color: "var(--iuk-gedaempft)" } as const;

function TitelZelle({ zeile }: { zeile: ShareZeile }) {
  // Lesebreite: ein langer Titel bricht um, statt die Zeile aus dem Rahmen zu schieben.
  return (
    <span style={{ display: "inline-block", maxWidth: "28ch" }}>
      {/* IDA-388: der Titel ist der Weg auf die Detailseite (Zugriffsprotokoll,
          Prüfung, Aufstocken). Vorher fuehrte nur „Bearbeiten → Abbrechen" dorthin. */}
      <Link
        href={`/shares/${zeile.id}`}
        className={styles.titelLink}
        data-testid={`files-share-detail-${zeile.id}`}
      >
        {zeile.titel}
      </Link>
      {/* Ja/Nein als WORT: ein Schloss-Symbol allein traegt die Aussage nicht. */}
      <span style={LEISE}>
        {zeile.typText} · {zeile.hatPasswort ? "mit Passwort" : "ohne Passwort"}
      </span>
    </span>
  );
}

function Dateimenge({ zeile }: { zeile: ShareZeile }) {
  return (
    <span>
      {zeile.groesseText}
      <span style={LEISE}>
        {zeile.anzahlDateien} {zeile.anzahlDateien === 1 ? "Datei" : "Dateien"}
        {/* §4.4: der Zwischenzustand „Zeile ohne Bytes" ist SICHTBAR. In der
            Alt-App war er unsichtbar und dauerhaft. */}
        {zeile.anzahlUnvollstaendig > 0 && <> ({zeile.anzahlUnvollstaendig} unvollständig)</>}
      </span>
    </span>
  );
}

function Ablauf({ zeile }: { zeile: ShareZeile }) {
  return (
    <span>
      {zeile.ablaufText}
      <span style={LEISE}>
        {zeile.abgelaufen ? `abgelaufen · ${zeile.downloadsText}` : `${zeile.downloadsText} Downloads`}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------

export function SharesTabelle({
  zeilen,
  linkBasis,
}: {
  zeilen: ShareZeile[];
  /** Öffentliche Adresse ohne Kennung (`…/s/`), serverseitig aus `oeffentlicheUrl`. */
  linkBasis: string;
}) {
  /*
   * EIN Dialog fuer beide Darstellungen. Zwei — je einer pro Darstellung —
   * traegen dieselbe `data-testid` doppelt im Dokument und zeigen im
   * Zweifel beide dasselbe Bild uebereinander.
   */
  const [qrZeile, setQrZeile] = useState<ShareZeile | null>(null);
  /* Gemerkt: `Kartentabelle` leitet Karte, Filter und angezeigte Liste aus den
     Spalten ab, und eine bei jedem Render neue Liste risse jede dieser
     Ableitungen mit. `setQrZeile` hat eine feste Identitaet. */
  const spaltenListe = useMemo(() => spalten(zeilen, setQrZeile, linkBasis), [zeilen, linkBasis]);

  return (
    <div data-testid="files-shares-tabelle">
      {/*
        * KEIN `scroll` UND KEIN `pagination`: beides ist Vorgabe der
        * `Datentabelle` — `{ x: "max-content" }` und „nicht blaettern".
        * `max-content` bleibt die einzige ehrliche Angabe, weil die Spalten
        * keine `width` tragen; und KEINE Spalte traegt `fixed`, keine kuerzt
        * mit Auslassungspunkten, `scroll.y` ist nicht gesetzt — rc-table
        * schaltet sonst auf `table-layout: fixed`, verteilt die Spalten
        * gleichmaeszig und das DESKTOP-Bild aendert sich, ohne dass irgendwo
        * etwas ueberlaeuft (`lib/Table.js:426-442`).
        *
        * Die Karte braucht keinen Wunsch: „Titel" ist die erste Spalte und
        * eine nackte Zeichenkette, die Knopfspalte ist die letzte ohne Titel —
        * beides findet `kartenaufbau` selbst.
        */}
      <Kartentabelle<ShareZeile>
        rowKey="id"
        aria-label="Freigaben"
        dataSource={zeilen}
        columns={spaltenListe}
        /* „Nichts angelegt" faengt `SharesUebersicht` vorher ab (eigener
           Leerzustand mit Weg zum Anlegen); hier bleibt nur der Filterfall. */
        leer={{ nichts: "Noch keine Freigaben", figur: "files", gefiltert: "Keine Freigabe passt zum Filter." }}
      />

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
              <th key={i}>
                <span style={SCHRIFT.kicker}>{titel}</span>
              </th>
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

/**
 * DIE EINSTIEGSPUNKTE EINER ZEILE (§10.2, IDA-388). „Bearbeiten" und „Löschen"
 * stehen laut §10.2 in Tabelle UND auf der Detailseite — ohne diese Haelfte
 * haetten `bearbeitenAction` und `shareLoeschenAction` in der Liste gar keinen
 * Weg in der Oberflaeche, und eine Action ohne Aufrufer ist kein Feature.
 *
 * ⚠️ DIESELBE SPALTE RENDERT TABELLENZELLE UND KARTE — also steht jede
 * `data-testid` hier ZWEIMAL im Dokument, und die Darstellung steht nicht mehr
 * im Namen (vor DRK-422 trug sie `-tabelle-`/`-karte-`). Ein Test rahmt deshalb
 * mit `[data-rolle="breitansicht"]` oder `[data-rolle="schmalkarten"]`, wie an
 * jeder `Kartentabelle` (Begruendung in `core/tabelle/Schmalkarten.tsx`).
 *
 * KEIN `size="small"` AN ZEILENAKTIONEN (korrigiert Aufgabe 12, nach Aufgabe
 * 8): die alte Ausnahme galt der 56px-`controlHeight` — eine 44px-Zeilenaktion
 * (`ARBEITSDICHTE`) sprengt keine Zeile mehr, waehrend `size="small"` auf 24px
 * faellt und die Mindesttapflaeche unterbietet (`docs/design/README.md`,
 * Falle 4). Und kein `block` mehr fuer die Karte: volle Breite und
 * Untereinander gibt dort `spaltenkarte.module.css` (`.aktionen`) vor.
 */
function ZeilenAktionen({
  zeile,
  qrOeffnen,
  adresse,
}: {
  zeile: ShareZeile;
  qrOeffnen: (zeile: ShareZeile) => void;
  /** Vollständige öffentliche Adresse dieser Freigabe. */
  adresse: string;
}) {
  const [zustand, abschicken] = useActionState(shareLoeschenAction, LOESCHEN_START);
  const { message } = App.useApp();
  // Aus dem Menü heraus sieht niemand einen Knopf „Kopiert ✓" — die Meldung sagt es, und
  // wenn die Zwischenablage nicht will, nennt sie die Adresse.
  const linkKopieren = async () => {
    try {
      await navigator.clipboard.writeText(adresse);
      void message.success("Link kopiert.");
    } catch {
      void message.info({ content: `Kopieren ging nicht. Link: ${adresse}`, duration: 15 });
    }
  };
  const formular = useRef<HTMLFormElement>(null);
  const fehler = fehlerText(zustand);

  return (
    <div>
      {/*
       * DIE DREI AKTIONEN IN EINEM MENUE (IDA-393): nebeneinander trugen sie die
       * Zeile bei 1280px aus dem Rahmen. „Bearbeiten" ist ein echter Anker auf
       * `/shares/<id>/bearbeiten` — es gibt genau EINE Zugriffsstufe, wer die
       * Tabelle sieht, darf auch bearbeiten (§2.4). „Löschen" fragt im Dialog
       * nach und schickt danach das Formular darunter ab.
       *
       * DATEIZAHL UND GROESZE in der Rueckfrage, beide (§7.3). „2 Dateien" allein
       * sagt nicht, was verloren geht, und eine Groesze allein nicht, wie viele
       * Empfaenger ins Leere laufen. Das Zugriffsprotokoll wird ausdruecklich
       * genannt, weil es NICHT mitstirbt (§4.5).
       */}
      <Zeilenaktionen
        name={zeile.titel}
        aktionen={[
          { key: "bearbeiten", label: "Bearbeiten", ikone: "pencil", href: `/shares/${zeile.id}/bearbeiten` },
          { key: "kopieren", label: "Link kopieren", ikone: "copy", onClick: () => linkKopieren() },
          { key: "qr", label: "QR", onClick: () => qrOeffnen(zeile) },
          {
            key: "loeschen",
            label: "Löschen",
            danger: true,
            bestaetigen: {
              titel: "Freigabe löschen?",
              text: `„${zeile.titel}" mit ${zeile.anzahlDateien} ${
                zeile.anzahlDateien === 1 ? "Datei" : "Dateien"
              } (${zeile.groesseText}) wird mit allen Dateien gelöscht. ` +
                `Das Zugriffsprotokoll bleibt erhalten.`,
              ok: "Löschen",
            },
            onClick: () => formular.current?.requestSubmit(),
          },
        ]}
      />

      <form action={abschicken} ref={formular}>
        <input type="hidden" name="id" value={zeile.id} />
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
          data-testid={`files-share-fehler-${zeile.id}`}
          message={fehler}
          action={
            // Kein `size="small"` — siehe Kommentar an `ZeilenAktionen`.
            <Button
              data-testid={`files-share-wiederholen-${zeile.id}`}
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
