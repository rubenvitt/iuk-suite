"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, Popconfirm, Radio, Table } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";

import {
  inboxLoeschenAction,
  type PosteingangFormZustand,
} from "../(verwaltung)/posteingang/actions";
/*
 * DIE ZWEITE ACTION DIESER INSEL, und sie kommt aus der Fileshare-Verwaltung:
 * `avWiederholenAction` bedient BEIDE Tabellen mit AV-Zustand (§4.6, §10.2).
 * Eine eigene Fassung in `posteingang/actions.ts` waere ein zweites
 * Statusmodell — genau der belegte Preis von E18.
 *
 * Ein Import aus einem `"use server"`-Modul in eine Client-Insel reicht KEINEN
 * Wert herein, sondern eine Aktionsreferenz; `_lib/av.ts` mit seinem
 * `node:net` kommt darueber nicht ins Client-Bundle.
 */
import { avWiederholenAction } from "../(verwaltung)/actions";
/*
 * WERT-IMPORTE AUS EINEM MODUL OHNE `"use client"` — und die Richtung ist die
 * ganze Zusage: `_lib/kategorien.ts` traegt kein `"use client"`, deshalb liest
 * das Abgabeformular (Client) und der Posteingang (Server wie Client) DIESELBE
 * Liste. Andersherum waere es ein Defekt: ein Wert aus einem Client-Modul kommt
 * in einer Server Component als Client-Referenz an, HTTP 500 fuer die ganze
 * Seite (`docs/design/README.md`, Falle 6).
 *
 * Die Filterliste kommt damit aus DERSELBEN Quelle wie die Schreib-Validierung
 * (T6) und nie aus einer zweiten Aufzaehlung: heiszen die realen
 * Kategorie-Verzeichnisse anders (§13.1 Frage 5), aendert sich EINE Liste.
 */
import { SCHREIBBARE_KATEGORIEN, anzeigeKategorie } from "../_lib/kategorien";
/*
 * TYP-IMPORT, und der bleibt es auch. `_lib/av.ts` importiert `node:net`; ein
 * WERT von dort truege das in dieses Client-Bundle. `import type` wird vom
 * Uebersetzer geloescht — und es ist zugleich der einzige Weg, den Wertebereich
 * des AV-Status NICHT ein zweites Mal hinzuschreiben: `Record<AvStatus, string>`
 * unten ist ohne einen fehlenden Fall nicht uebersetzbar.
 */
import type { AvStatus } from "../_lib/av";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import styles from "./posteingang.module.css";

/**
 * DIE POSTEINGANG-TABELLE (Spec §8.6, §10.1, §10.2; Plan T43).
 *
 * NEUBAU, KEINE PORTIERUNG: `drop` hat keinen Endpunkt, der Uploads listet oder
 * ausliefert. Diese Ansicht ist die Betreiberentscheidung E14 (a) — keine
 * Sidecar-`.txt`, keine META-JSON, kein SSH-Abholweg. Was das erlaubt, ist die
 * fachliche Zusage darunter: **Löschen entfernt Zeile UND Bytes**.
 *
 * WARUM DIESE DATEI `"use client"` TRAEGT UND DIE SEITE TROTZDEM RSC BLEIBT:
 * `columns` mit `render`-Funktionen reicht FUNKTIONEN ueber die RSC-Grenze, und
 * das scheitert unabhaengig von der antd-Compound-Falle. Dazu kommen vier
 * Filter, die Mehrfachauswahl und zwei Bestaetigungsdialoge — alles Zustand.
 * Die Seite laedt und rechnet, diese Insel bedient. Praezedenzfall im Repo:
 * `feedback/_ui/Verlauf.tsx:1`.
 *
 * DIE ZEILEN KOMMEN FERTIG HEREIN — Text, keine `Date`-Objekte, keine
 * Drizzle-Rows. Die Zeit steht zusaetzlich als **Unix-SEKUNDE** daneben, weil
 * der Zeitraumfilter rechnen muss und ein formatiertes deutsches Datum sich
 * nicht vergleichen laesst; verglichen wird gegen `jetztSekunden` aus derselben
 * Serverantwort, nicht gegen die Uhr des Browsers. Die Einheit steht im NAMEN
 * (§9.1): `Date.getTime()` liefert Millisekunden, die Spalte fuehrt Sekunden
 * (`mode: "timestamp"`), und ein Faktor-1000-Fehler waere hier still — „vor
 * einer Stunde" saehe als „vor 1000 Stunden" immer noch plausibel aus.
 */

export type PosteingangAbgabelink = {
  id: string;
  /** Die ersten sieben Zeichen im Klartext — genug zum Wiedererkennen. */
  tokenStart: string;
  name: string;
};

export type PosteingangZeile = {
  id: string;
  /** Unix-SEKUNDEN aus `empfangen_at`; der Anker des Zeitraumfilters. */
  empfangenSekunden: number;
  /** Fertiger Text derselben Zeit — serverseitig formatiert. */
  empfangenText: string;
  dateiname: string;
  /**
   * ROH in Byte. Formatiert wird in dieser Insel und NICHT auf der Seite —
   * anders als in `zugangslinks/page.tsx`, und mit Grund: die Bestaetigung der
   * Mehrfachauswahl nennt die SUMME der Auswahl (§8.6), und die Auswahl ist
   * Zustand des Browsers. Zwei Formatierer ueber derselben Zahl waeren zwei
   * Wahrheiten (MiB gegen MB, Faktor 1,048576 — im Modul `files` schon einmal
   * teuer geworden), also formatiert genau einer, und zwar hier.
   */
  groesseBytes: number;
  /** ROHWERT der Spalte, auch wenn er unbekannt ist (Anzeige-Toleranz, T6). */
  kategorieRoh: string | null;
  hinweis: string | null;
  avStatus: AvStatus;
  /**
   * SERVERSEITIG mit `istFreigegeben` entschieden (§6.2). Hier stuende sonst
   * ein zweites Statusmodell: `_lib/av.ts` ist aus einem Client-Modul nicht als
   * WERT importierbar, ein `avStatus === "clean"` in dieser Datei waere also
   * eine abgeschriebene Regel, die gegen die Route driften kann.
   */
  herunterladbar: boolean;
  /** `token_id IS NULL` → `null` → „Altbestand" (§4.6). */
  abgabelink: PosteingangAbgabelink | null;
};

export type PosteingangTabelleProps = {
  zeilen: PosteingangZeile[];
  /** Die SERVERUHR in Unix-Sekunden — der Zeitraumfilter misst gegen sie. */
  jetztSekunden: number;
};

const START: PosteingangFormZustand = { ok: false, feldFehler: {} };

/** Der Wert, der „nicht filtern" bedeutet — an einer Stelle. */
const ALLE = "alle";
/** Der Filterwert fuer Zeilen ohne Abgabelink. */
const ALTBESTAND = "altbestand";

/**
 * BEDEUTUNG NIE ALLEIN UEBER FARBE (`docs/design/README.md:133-137`): jeder
 * Zustand traegt einen SATZ. Das Symbol steht daneben und ist die verzichtbare
 * Schicht — deshalb `aria-hidden`, sonst liest eine Sprachausgabe dieselbe
 * Aussage zweimal.
 *
 * KEINE FARBE, und das ist hier mehr als Vorsicht: `colorError === colorPrimary
 * === #c8000f`. Ein rotes Tag fuer „gesperrt" saehe auf einer Datenflaeche aus
 * wie eine Primaeraktion (§10.1).
 *
 * `Record<AvStatus, string>` ist die einzige Aufzaehlung des Wertebereichs in
 * dieser Datei: ein sechster Status faellt im Typecheck auf, statt still als
 * leere Zelle zu erscheinen. „Prüfung nicht möglich" ist woertlich die Fassung
 * aus `SharesTabelle` — zwei Texte fuer denselben Zustand waeren zwei Aussagen.
 */
const AV_TEXT: Record<AvStatus, string> = {
  clean: "freigegeben",
  scanning: "wird geprüft",
  infected: "gesperrt — Fund",
  error: "Prüfung nicht möglich",
  unscanned: "nicht geprüft",
};

const AV_SYMBOL: Record<AvStatus, React.ReactNode> = {
  clean: <CheckCircleOutlined aria-hidden />,
  scanning: <ClockCircleOutlined aria-hidden />,
  infected: <StopOutlined aria-hidden />,
  error: <ExclamationCircleOutlined aria-hidden />,
  unscanned: <QuestionCircleOutlined aria-hidden />,
};

/** Die Filterwerte des AV-Status AUS der Textzuordnung, nie daneben getippt. */
const AV_WERTE = Object.keys(AV_TEXT) as AvStatus[];

/**
 * Die Zeitfenster. Die Einheit steht im NAMEN — `fensterSekunden`, weil die
 * Zeilen Sekunden fuehren; `null` heiszt „ohne Grenze".
 */
const ZEITRAEUME = [
  { wert: ALLE, beschriftung: "Alle", fensterSekunden: null },
  { wert: "24h", beschriftung: "24 Stunden", fensterSekunden: 24 * 60 * 60 },
  { wert: "7t", beschriftung: "7 Tage", fensterSekunden: 7 * 24 * 60 * 60 },
  { wert: "30t", beschriftung: "30 Tage", fensterSekunden: 30 * 24 * 60 * 60 },
] as const;

/**
 * BINAERE Praefixe, und das Wort dazu — dieselbe Leiter wie in
 * `zugangslinks/page.tsx`. Eine Beschriftung „1,0 MB" fuer 1.048.576 Byte waere
 * dieselbe Zahl unter einem anderen Namen, und genau dieses Paar (MiB gegen MB,
 * Faktor 1,048576) ist im Modul `files` schon einmal teuer geworden (§9.1).
 */
const BYTE_EINHEITEN = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

function byteText(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN[stufe]}`;
}

function fehlerText(zustand: PosteingangFormZustand): string | null {
  if (zustand.ok) return null;
  const werte = Object.values(zustand.feldFehler);
  return werte.length === 0 ? null : werte.join(" ");
}

// ---------------------------------------------------------------------------

export function PosteingangTabelle({ zeilen, jetztSekunden }: PosteingangTabelleProps) {
  const [kategorie, setKategorie] = useState<string>(ALLE);
  const [avStatus, setAvStatus] = useState<string>(ALLE);
  const [zeitraum, setZeitraum] = useState<string>(ALLE);
  const [abgabelink, setAbgabelink] = useState<string>(ALLE);
  const [ausgewaehlt, setAusgewaehlt] = useState<ReadonlySet<string>>(new Set());

  /**
   * Die Abgabelinks, die in den Zeilen VORKOMMEN — hier ist Ableitung aus den
   * Daten richtig, anders als bei der Kategorie: ein Filter auf einen Link, zu
   * dem es keine Abgabe gibt, waere immer leer, und die Liste aller je
   * angelegten Links stuende auf `/zugangslinks`.
   *
   * NACH NAMEN SORTIERT und nicht in der Reihenfolge des Auftretens: sonst
   * springt derselbe Filtereintrag an eine andere Stelle, sobald eine Abgabe
   * dazukommt — eine Bedienleiste, deren Reihenfolge sich unter der Hand
   * aendert, ist keine.
   */
  const links = useMemo(() => {
    const gesehen = new Map<string, PosteingangAbgabelink>();
    for (const zeile of zeilen) {
      if (zeile.abgabelink !== null && !gesehen.has(zeile.abgabelink.id)) {
        gesehen.set(zeile.abgabelink.id, zeile.abgabelink);
      }
    }
    return [...gesehen.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [zeilen]);

  const gefiltert = useMemo(() => {
    const fenster = ZEITRAEUME.find((z) => z.wert === zeitraum)?.fensterSekunden ?? null;
    return (
      zeilen
        .filter((zeile) => kategorie === ALLE || zeile.kategorieRoh === kategorie)
        .filter((zeile) => avStatus === ALLE || zeile.avStatus === avStatus)
        .filter(
          (zeile) => fenster === null || zeile.empfangenSekunden >= jetztSekunden - fenster,
        )
        .filter((zeile) => {
          if (abgabelink === ALLE) return true;
          if (abgabelink === ALTBESTAND) return zeile.abgabelink === null;
          return zeile.abgabelink?.id === abgabelink;
        })
        /*
         * NEUESTE ZUERST, und zwar HIER: die Seite sortiert zwar auch (der Index
         * `idx_inbox_empfangen` traegt genau diese Ordnung), aber nach dem
         * Filtern ist diese Insel die einzige Stelle, an der die ANGEZEIGTE
         * Reihenfolge entsteht. `id` als zweites Kriterium, weil zwei Abgaben
         * derselben Sekunde sonst in zufaelliger Ordnung stuenden.
         */
        .sort(
          (a, b) =>
            b.empfangenSekunden - a.empfangenSekunden || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )
    );
  }, [zeilen, kategorie, avStatus, zeitraum, abgabelink, jetztSekunden]);

  /*
   * DIE AUSWAHL GILT NUR, SOWEIT SIE SICHTBAR IST. Wer eine Zeile waehlt und
   * dann filtert, sieht sie nicht mehr — ein Sammelloeschen ueber die rohe
   * Auswahl entfernte sie trotzdem, und zwar ohne dass sie je in der Rueckfrage
   * gestanden haette. Der Schnitt mit den angezeigten Zeilen ist deshalb keine
   * Bequemlichkeit, sondern der Schutz vor einer Loeschung, die niemand
   * bestaetigt hat.
   */
  const aktive = gefiltert.filter((zeile) => ausgewaehlt.has(zeile.id));
  const aktiveIds = aktive.map((zeile) => zeile.id);
  const aktiveBytes = aktive.reduce((summe, zeile) => summe + zeile.groesseBytes, 0);

  function umschalten(id: string, an: boolean): void {
    setAusgewaehlt((vorher) => {
      const naechste = new Set(vorher);
      if (an) naechste.add(id);
      else naechste.delete(id);
      return naechste;
    });
  }

  function alleUmschalten(an: boolean): void {
    setAusgewaehlt((vorher) => {
      const naechste = new Set(vorher);
      for (const zeile of gefiltert) {
        if (an) naechste.add(zeile.id);
        else naechste.delete(zeile.id);
      }
      return naechste;
    });
  }

  function filterZuruecksetzen(): void {
    setKategorie(ALLE);
    setAvStatus(ALLE);
    setZeitraum(ALLE);
    setAbgabelink(ALLE);
  }

  /*
   * DER LEERZUSTAND KOMMT VOR ALLEM ANDEREN. Filter ueber null Zeilen waeren
   * vier Bedienelemente ohne Gegenstand, und eine leere Tabelle daneben saehe
   * aus wie ein Ladefehler.
   */
  if (zeilen.length === 0) {
    return (
      <div className={styles.seite} data-testid="files-posteingang-leer">
        {/* Punkt 1 der Pruefliste: `Seitenkopf` statt eines nackten `<h1>`.
            Kein `zurueck` — diese Seite ist ein Navigationseintrag der
            Modulleiste (`FILES_NAV`), keine Detailseite. */}
        <Seitenkopf titel="Posteingang" />
        <Card>
          <p>Noch keine Abgabe eingegangen.</p>
          <p className={styles.hinweis}>
            Abgaben entstehen ausschließlich über einen Abgabelink: er wird angelegt, einmal als
            Code und QR ausgegeben und weitergegeben. Danach erscheint hier jede Datei mit Zeit,
            Hinweis und Prüfzustand.
          </p>
          {/*
           * DER WEG AUS DEM LEERZUSTAND. Ohne ihn waere diese Seite eine
           * Sackgasse — und `/zugangslinks` liegt in derselben Route-Group mit
           * demselben Riegel, fuehrt also fuer niemanden in ein `notFound()`.
           */}
          <Button type="primary" href="/zugangslinks">
            Zu den Abgabelinks
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.seite}>
      {/* Punkt 1 der Pruefliste — Begruendung an der leeren Fassung oben. */}
      <Seitenkopf titel="Posteingang" />

      <div className={styles.filterleiste} data-testid="files-posteingang-filter">
        <FilterGruppe
          kennung="kategorie"
          beschriftung="Kategorie"
          wert={kategorie}
          setzen={setKategorie}
          /*
           * AUS DER SCHREIBLISTE, nie aus den geladenen Zeilen: eine unbekannte
           * Kategorie wird ANGEZEIGT (Toleranz, T6), bekommt aber keinen
           * Filtereintrag — sonst waere die Filterleiste eine Liste der
           * Import-Altlasten und aenderte sich mit jeder Abgabe.
           */
          optionen={SCHREIBBARE_KATEGORIEN.map((k) => ({
            wert: k.wert,
            beschriftung: k.beschriftung,
          }))}
        />
        <FilterGruppe
          kennung="avstatus"
          beschriftung="Prüfzustand"
          wert={avStatus}
          setzen={setAvStatus}
          optionen={AV_WERTE.map((status) => ({ wert: status, beschriftung: AV_TEXT[status] }))}
        />
        <FilterGruppe
          kennung="zeitraum"
          beschriftung="Zeitraum"
          wert={zeitraum}
          setzen={setZeitraum}
          alleWeglassen
          optionen={ZEITRAEUME.map((z) => ({ wert: z.wert, beschriftung: z.beschriftung }))}
        />
        <FilterGruppe
          kennung="abgabelink"
          beschriftung="Abgabelink"
          wert={abgabelink}
          setzen={setAbgabelink}
          optionen={[
            { wert: ALTBESTAND, beschriftung: "Altbestand" },
            ...links.map((link) => ({
              wert: link.id,
              beschriftung: `${link.tokenStart}… ${link.name}`,
            })),
          ]}
        />
      </div>

      <SammelAktionen
        ids={aktiveIds}
        bytes={aktiveBytes}
        aufheben={() => setAusgewaehlt(new Set())}
      />

      {gefiltert.length === 0 && (
        <Card data-testid="files-posteingang-kein-treffer">
          <p>Keine Abgabe passt zu diesen Filtern.</p>
          {/* Eine leere Tabelle ohne Ausweg waere eine Sackgasse — und von
              „noch keine Abgabe eingegangen" nicht zu unterscheiden. */}
          <Button
            data-testid="files-posteingang-filter-zuruecksetzen"
            onClick={filterZuruecksetzen}
          >
            Filter zurücksetzen
          </Button>
        </Card>
      )}

      <div className="fi-liste" data-testid="files-posteingang">
        <div className="nurDesktop" data-testid="files-posteingang-tabelle">
          <Table<PosteingangZeile>
            rowKey="id"
            dataSource={gefiltert}
            columns={[
              auswahlSpalte(gefiltert, ausgewaehlt, umschalten, alleUmschalten),
              ...spalten(),
            ]}
            pagination={false}
            /*
             * `max-content` ist die einzige ehrliche Angabe, weil die Spalten
             * keine `width` tragen — jede Pixelzahl waere erfunden. Und KEINE
             * Spalte traegt `fixed` oder `ellipsis`, `scroll.y` ist nicht
             * gesetzt: rc-table schaltet sonst auf `table-layout: fixed`,
             * verteilt die Spalten gleichmaeszig und das DESKTOP-Bild aendert
             * sich, ohne dass irgendwo etwas ueberlaeuft
             * (`lib/Table.js:426-442`).
             */
            scroll={{ x: "max-content" }}
          />
        </div>

        {/*
         * DIE KARTENLISTE, und sie steht IMMER im Markup. Unter 767.98px blendet
         * `files.css` die Tabelle aus und diese Liste ein — die Umschaltung ist
         * CSS, nie JavaScript: ein JS-Breakpoint zeigt beim ersten Render die
         * falsche Variante, und `Grid.useBreakpoint` ist ohnehin verboten.
         * Neun Spalten sind auf 390px keine Liste mehr.
         */}
        <div className="nurMobil" data-testid="files-posteingang-karten">
          {gefiltert.map((zeile) => (
            <Karte
              key={zeile.id}
              zeile={zeile}
              gewaehlt={ausgewaehlt.has(zeile.id)}
              umschalten={umschalten}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * EINE ECHTE RADIOGRUPPE, kein Knopfreihen-Nachbau: ein Tabstop je Gruppe, die
 * Pfeiltasten waehlen nativ (`docs/design/README.md:143-145`). `fieldset` und
 * `legend` tragen die Beschriftung fuer die Sprachausgabe — ein danebenstehender
 * Text gehoerte zu keiner Gruppe.
 *
 * „Alle" ist Teil JEDER Gruppe: ohne den Wert waere ein einmal gesetzter Filter
 * nicht mehr abzuwaehlen. Nur der Zeitraum bringt ihn selbst mit
 * (`alleWeglassen`), weil dort „Alle" bereits die erste seiner vier Stufen ist.
 */
function FilterGruppe({
  kennung,
  beschriftung,
  wert,
  setzen,
  optionen,
  alleWeglassen = false,
}: {
  kennung: string;
  beschriftung: string;
  wert: string;
  setzen: (wert: string) => void;
  optionen: { wert: string; beschriftung: string }[];
  alleWeglassen?: boolean;
}) {
  const alle = alleWeglassen ? [] : [{ wert: ALLE, beschriftung: "Alle" }];
  return (
    <fieldset className={styles.filtergruppe} data-testid={`files-inbox-filter-${kennung}`}>
      <legend className={styles.legende}>{beschriftung}</legend>
      <Radio.Group value={wert} onChange={(e) => setzen(e.target.value)}>
        {[...alle, ...optionen].map((option) => (
          <Radio key={option.wert} value={option.wert}>
            {option.beschriftung}
          </Radio>
        ))}
      </Radio.Group>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------

/**
 * Die AUSWAHLspalte. Sie steht bewusst NICHT in `spalten()`: §8.6 nennt acht
 * Spalten, und diese traegt keinen Wert der Abgabe, sondern die Mehrfachauswahl.
 *
 * Eigene Kaestchen statt `rowSelection`: die Kartenliste unter 768px braucht
 * dieselbe Auswahl, und `rowSelection` gibt es nur in der Tabelle — zwei
 * Auswahlmechanismen waeren zwei Zustaende ueber derselben Sache.
 */
function auswahlSpalte(
  sichtbar: PosteingangZeile[],
  ausgewaehlt: ReadonlySet<string>,
  umschalten: (id: string, an: boolean) => void,
  alleUmschalten: (an: boolean) => void,
) {
  const gewaehlt = sichtbar.filter((zeile) => ausgewaehlt.has(zeile.id)).length;
  return {
    key: "auswahl",
    title: (
      <span data-testid="files-inbox-auswahl-alle">
        <Checkbox
          checked={sichtbar.length > 0 && gewaehlt === sichtbar.length}
          indeterminate={gewaehlt > 0 && gewaehlt < sichtbar.length}
          onChange={(e) => alleUmschalten(e.target.checked)}
          aria-label="Alle sichtbaren Abgaben auswählen"
        />
      </span>
    ),
    render: (_: unknown, zeile: PosteingangZeile) => (
      <span data-testid={`files-inbox-auswahl-tabelle-${zeile.id}`}>
        <Checkbox
          checked={ausgewaehlt.has(zeile.id)}
          onChange={(e) => umschalten(zeile.id, e.target.checked)}
          aria-label={`${zeile.dateiname} auswählen`}
        />
      </span>
    ),
  };
}

/**
 * DIE ACHT SPALTEN AUS §8.6, in ihrer Reihenfolge. `data-spalte` traegt jede
 * Zelle, weil ein Test sonst ueber Textinhalte raten muesste — und „Altbestand"
 * stuende dann irgendwo in der Zeile statt in DIESER Spalte.
 *
 * SPALTENKÖPFE ÜBER `SCHRIFT.kicker` (Punkt 4, zweiter Halbsatz, nachgezogen
 * in der Review-Runde zu Aufgabe 12 — beim ersten Durchgang übersehen): jeder
 * Kopf ein `<span style={SCHRIFT.kicker}>` statt eines nackten Strings, nie
 * CSS gegen `.ant-table-thead`. Die Auswahlspalte (`auswahlSpalte()` oben)
 * bleibt ausgenommen — ihr Kopf ist eine Checkbox, kein Text, die Rolle wäre
 * dort ohne Wirkung.
 */
function spalten() {
  return [
    {
      key: "zeit",
      title: <span style={SCHRIFT.kicker}>Zeit</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="zeit" className={styles.zahlen}>
          {zeile.empfangenText}
        </span>
      ),
    },
    {
      key: "dateiname",
      title: <span style={SCHRIFT.kicker}>Dateiname</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="dateiname">{zeile.dateiname}</span>
      ),
    },
    {
      key: "groesse",
      title: <span style={SCHRIFT.kicker}>Größe</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="groesse" className={styles.zahlen}>
          {byteText(zeile.groesseBytes)}
        </span>
      ),
    },
    {
      key: "kategorie",
      title: <span style={SCHRIFT.kicker}>Kategorie</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        // ROH, auch wenn der Wert unbekannt ist: der Altbestand traegt, was
        // `sanitizeCategory` durchliess. Eine Zeile zu verwerfen, deren Datei
        // sehr wohl da ist, waere der teurere Fehler (T6).
        <span data-spalte="kategorie">{anzeigeKategorie(zeile.kategorieRoh)}</span>
      ),
    },
    {
      key: "hinweis",
      title: <span style={SCHRIFT.kicker}>Hinweis</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="hinweis" className={styles.hinweistext}>
          {zeile.hinweis ?? "—"}
        </span>
      ),
    },
    {
      key: "avstatus",
      title: <span style={SCHRIFT.kicker}>AV-Status</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="avstatus">
          <AvZustand status={zeile.avStatus} />
        </span>
      ),
    },
    {
      key: "abgabelink",
      title: <span style={SCHRIFT.kicker}>Abgabelink</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <span data-spalte="abgabelink">
          <Abgabelink link={zeile.abgabelink} />
        </span>
      ),
    },
    {
      key: "aktionen",
      title: <span style={SCHRIFT.kicker}>Aktionen</span>,
      render: (_: unknown, zeile: PosteingangZeile) => (
        <ZeilenAktionen zeile={zeile} kennung="tabelle" />
      ),
    },
  ];
}

function AvZustand({ status }: { status: AvStatus }) {
  return (
    <span>
      {AV_SYMBOL[status]} {AV_TEXT[status]}
    </span>
  );
}

/**
 * `token_id IS NULL` heiszt „Altbestand" — ein benannter Wert und keine leere
 * Zelle: eine leere Zelle ist von „Spalte vergessen" nicht zu unterscheiden,
 * und der gesamte `drop`-Bestand traegt keinen Token (`req.shareKey` wurde
 * gesetzt und nie gelesen, §4.6).
 */
function Abgabelink({ link }: { link: PosteingangAbgabelink | null }) {
  if (link === null) return <>Altbestand</>;
  return (
    <>
      <span className={styles.zahlen}>{link.tokenStart}…</span> {link.name}
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * DIE ZWEI SAMMELAKTIONEN (§8.6). Beide sind bei leerer Auswahl deaktiviert —
 * ein ZIP-Aufruf ohne eine einzige ID waere ein leeres Archiv, ein Loeschen
 * ohne Auswahl eine Rueckfrage ohne Gegenstand.
 */
function SammelAktionen({
  ids,
  bytes,
  aufheben,
}: {
  ids: string[];
  bytes: number;
  aufheben: () => void;
}) {
  const [zustand, abschicken] = useActionState(inboxLoeschenAction, START);
  const formular = useRef<HTMLFormElement>(null);
  const fehler = fehlerText(zustand);
  const leer = ids.length === 0;

  return (
    <div className={styles.knopfzeile} data-testid="files-inbox-sammelaktionen">
      <span className={styles.hinweis}>
        {leer ? "Keine Abgabe ausgewählt" : `${ids.length} ausgewählt (${byteText(bytes)})`}
      </span>

      {/*
       * EIN ANKER, KEIN FORMULAR: `Content-Disposition` und ein gestroemtes
       * Archiv brauchen eine Navigation. Der Endpunkt ist DERSELBE wie in T49,
       * mit derselben Ausschlussregel und derselben `_HINWEIS.txt` — eine
       * zweite Zusammenstellung waere eine zweite Wahrheit darueber, was
       * „freigegeben" heiszt (§6.2).
       *
       * `href` STEHT IMMER, `disabled` entscheidet. antd baut nur dann einen
       * Anker, wenn `href !== undefined` (`button.js:281`), und setzt bei
       * `disabled` `href: undefined` samt `aria-disabled` (`button.js:287,292`)
       * — die Adresse ist also auch per Mittelklick nicht erreichbar. Waere
       * `href` selbst weggelassen, entstuende bei leerer Auswahl ein `<button>`
       * und bei gefuellter ein `<a>`: zwei verschiedene Elemente fuer denselben
       * Knopf, mit Fokusverlust beim ersten Haekchen.
       */}
      <Button
        href={`/api/inbox/zip?ids=${ids.join(",")}`}
        disabled={leer}
        data-testid="files-inbox-zip"
      >
        Ausgewählte herunterladen
      </Button>

      <form action={abschicken} ref={formular}>
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <Popconfirm
          title="Ausgewählte Abgaben löschen?"
          description={`${ids.length} ${ids.length === 1 ? "Abgabe" : "Abgaben"} (${byteText(
            bytes,
          )}) werden mit ihren Dateien endgültig gelöscht.`}
          okText="Löschen"
          cancelText="Abbrechen"
          disabled={leer}
          onConfirm={() => formular.current?.requestSubmit()}
        >
          {/*
           * `danger` OHNE `type="primary"`: `colorError === colorPrimary ===
           * #c8000f`, ein roter Vollknopf waere pixelgleich mit einer
           * Primaeraktion. Rot bleibt am Rand.
           */}
          {/*
           * `className` UND NICHT `block`: `block` waere hier auch auf dem
           * Desktop vollbreit. Die Klasse traegt die Breite nur unter 768px —
           * dort, wo die Knopfzeile stapelt (`posteingang.module.css`). Sie
           * steht AM KNOPF, weil der Kindselektor der Knopfzeile am `<form>`
           * haengenbliebe.
           */}
          <Button
            danger
            disabled={leer}
            className={styles.knopf}
            data-testid="files-inbox-loeschen-auswahl"
          >
            Ausgewählte löschen
          </Button>
        </Popconfirm>
      </form>

      {!leer && (
        <Button data-testid="files-inbox-auswahl-aufheben" onClick={aufheben}>
          Auswahl aufheben
        </Button>
      )}

      {fehler !== null && (
        // `type="warning"` und NICHT `type="error"`: die Fehlerfarbe ist die
        // Primaerfarbe (`docs/design/README.md`, Falle 3).
        <Alert
          type="warning"
          showIcon
          data-testid="files-inbox-sammelfehler"
          message={fehler}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * DIE ZWEI EINSTIEGSPUNKTE EINER ZEILE (§10.2): Download und Löschen.
 *
 * `kennung` trennt Tabelle und Karte, weil BEIDE Darstellungen im Markup
 * stehen: ohne sie truege jede `data-testid` zweimal, und ein Test wuesste
 * nicht, welche der beiden er gerade bedient.
 */
function ZeilenAktionen({
  zeile,
  kennung,
}: {
  zeile: PosteingangZeile;
  kennung: "tabelle" | "karte";
}) {
  const [zustand, abschicken] = useActionState(inboxLoeschenAction, START);
  const formular = useRef<HTMLFormElement>(null);
  const fehler = fehlerText(zustand);

  /*
   * KEIN `size="small"` MEHR AN ZEILENAKTIONEN (korrigiert Aufgabe 12, nach
   * Aufgabe 8): die alte Ausnahme galt der 56px-`controlHeight` — eine
   * 44px-Zeilenaktion (`ARBEITSDICHTE`) sprengt keine Zeile mehr, waehrend
   * `size="small"` auf 24px faellt und die Mindesttapflaeche unterbietet
   * (`docs/design/README.md`, Falle 4). In der Karte bleibt `block` bestehen —
   * unter 768px stehen Handlungsknoepfe untereinander und in voller Breite.
   */
  const inTabelle = kennung === "tabelle";
  const masz = inTabelle ? {} : ({ block: true } as const);
  /* Der Wiederholen-Knopf in der Alert-Aktion braucht keine eigene Ausnahme
     mehr — ohne `size` steht `controlHeight` (44) an beiden Stellen. */
  const maszAlert = {};

  return (
    <div>
      {/*
       * DER DOWNLOAD BLEIBT BIS `clean` GESPERRT (§6.3). Ein Knopf, der immer
       * 403 bekaeme, waere eine Sackgasse — der Zustand in der Nachbarspalte
       * sagt, warum er nicht geht. Die Entscheidung faellt SERVERSEITIG
       * (`herunterladbar`), nicht hier.
       *
       * `href` steht immer, `disabled` entscheidet — dieselbe Begruendung wie
       * beim ZIP-Knopf: antd nimmt die Adresse bei `disabled` heraus und setzt
       * `aria-disabled`, und der Knopf bleibt in beiden Zustaenden dasselbe
       * Element.
       */}
      <Button
        {...masz}
        href={`/api/inbox/${zeile.id}`}
        disabled={!zeile.herunterladbar}
        data-testid={`files-inbox-download-${kennung}-${zeile.id}`}
      >
        Herunterladen
      </Button>

      <form action={abschicken} ref={formular}>
        <input type="hidden" name="ids" value={zeile.id} />
        <Popconfirm
          title="Abgabe löschen?"
          /*
           * NAME UND GROESZE, beide (§8.6). Der Name allein sagt nicht, was
           * verloren geht; die Groesze allein nicht, welche Datei gemeint ist.
           * Und ausdruecklich „endgültig": es gibt keinen Papierkorb, die Bytes
           * sind danach weg.
           */
          description={`„${zeile.dateiname}" (${byteText(
            zeile.groesseBytes,
          )}) wird mit der Datei endgültig gelöscht.`}
          okText="Löschen"
          cancelText="Abbrechen"
          onConfirm={() => formular.current?.requestSubmit()}
        >
          <Button {...masz} danger data-testid={`files-inbox-loeschen-${kennung}-${zeile.id}`}>
            Löschen
          </Button>
        </Popconfirm>
      </form>

      {/*
       * DIE PRUEFUNG WIEDERHOLEN — nur an einer Zeile in `error` (§6.2, §10.2).
       *
       * Das Praedikat ist der STATUS und nicht `!herunterladbar`: Letzteres ist
       * fuer `scanning`, `infected` und `unscanned` ebenso wahr, und aus diesen
       * dreien fuehrt kein Weg hierher — `clean` und `infected` sind
       * Endzustaende, `scanning` laeuft schon, und `unscanned → scanning`
       * gehoert ausschliesslich dem Nachscan-Lauf aus Spec 2. Dieselbe
       * Bedingung steht als `WHERE av_status = 'error'` in der Action:
       * Oberflaeche und Riegel wenden dasselbe Praedikat an.
       *
       * EIN NATIVES `<form>` MIT DER SERVER ACTION, kein `useActionState`: die
       * Action gibt nichts zurueck, was hier anzuzeigen waere. Die Rueckmeldung
       * ist die Auffrischung — die Zeile geht auf „wird geprüft", und der Knopf
       * verschwindet mit ihr.
       *
       * `htmlType="submit"` ausgeschrieben: antds Vorgabe ist `"button"`, und
       * ohne die Angabe schickte der Knopf still nichts ab.
       */}
      {zeile.avStatus === "error" && (
        <form action={avWiederholenAction}>
          {/* `inbox`, nicht `inbox_files`: die Action spricht die Sprache von
              `BlobZiel` (`_lib/storage.ts`), damit niemand unterwegs uebersetzt. */}
          <input type="hidden" name="art" value="inbox" />
          <input type="hidden" name="id" value={zeile.id} />
          <Button
            {...masz}
            htmlType="submit"
            data-testid={`files-inbox-av-wiederholen-${kennung}-${zeile.id}`}
          >
            Prüfung wiederholen
          </Button>
        </form>
      )}

      {fehler !== null && (
        <Alert
          type="warning"
          showIcon
          data-testid={`files-inbox-fehler-${kennung}-${zeile.id}`}
          message={fehler}
          action={
            <Button
              {...maszAlert}
              data-testid={`files-inbox-wiederholen-${kennung}-${zeile.id}`}
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

// ---------------------------------------------------------------------------

function Karte({
  zeile,
  gewaehlt,
  umschalten,
}: {
  zeile: PosteingangZeile;
  gewaehlt: boolean;
  umschalten: (id: string, an: boolean) => void;
}) {
  return (
    <Card title={zeile.dateiname} data-testid={`files-inbox-karte-${zeile.id}`}>
      <div className={styles.karte}>
        <span data-testid={`files-inbox-auswahl-karte-${zeile.id}`}>
          <Checkbox checked={gewaehlt} onChange={(e) => umschalten(zeile.id, e.target.checked)}>
            Auswählen
          </Checkbox>
        </span>
        <p className={styles.zahlen}>
          {zeile.empfangenText} · {byteText(zeile.groesseBytes)}
        </p>
        <p>Kategorie: {anzeigeKategorie(zeile.kategorieRoh)}</p>
        {zeile.hinweis !== null && <p className={styles.hinweistext}>Hinweis: {zeile.hinweis}</p>}
        <p>
          <AvZustand status={zeile.avStatus} />
        </p>
        <p>
          Abgabelink: <Abgabelink link={zeile.abgabelink} />
        </p>
        <ZeilenAktionen zeile={zeile} kennung="karte" />
      </div>
    </Card>
  );
}
