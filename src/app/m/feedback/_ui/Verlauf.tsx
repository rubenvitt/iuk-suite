"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Dropdown, Input, Modal, Popconfirm, Table, Tag } from "antd";
import { SPACE, TAP } from "@/core/theme/tokens";
import { activateSurveyAction, createEveningAction, deleteEveningAction } from "../actions";
import { NOTEN_FENSTER, fensterMittel, notenSatz } from "../_lib/noten";
import { Altbestandsfussnote, Notenfunke, Notenpille } from "./Noten";
import { AbendBearbeiten } from "./AbendBearbeiten";
import { formatDatumLang, formatWochentag } from "./datum";
import { T } from "./typo";

/**
 * ZONE d — DER VERLAUF (Entwurf §2.5).
 *
 * Er beantwortet „was war letzte Woche, was vor drei Wochen" ohne Seitenwechsel.
 * Vorher stand hier eine Liste nackter Links: kein Ruecklauf, kein Durchschnitt,
 * kein Zustand — man musste jeden Abend anklicken, um zu erfahren, was drinsteht.
 *
 * WARUM CLIENT (§2.5): `columns[].render`, `onRow`, `Dropdown`-`items` und die
 * `Popconfirm`-Handler sind FUNKTIONEN. Eine Server Component kann sie nicht
 * uebergeben („Functions cannot be passed to Client Components"). Genau darum
 * tragen auch die Gruppenkarten des Einstiegs `"use client"`, obwohl `Table` und
 * `Card` selbst als RSC-sicher gelten.
 *
 * FUENF ENTSCHEIDUNGEN, DIE HIER UND NUR HIER LIEGEN:
 *
 * 1. DIE ORDNUNG GEHOERT DIESER KOMPONENTE. Sie sortiert selbst nach Datum
 *    absteigend, obwohl `listEvenings` heute `ORDER BY date DESC` traegt und
 *    `cockpitZustand` zusaetzlich sortiert: die Reihenfolge ist fachlich tragend
 *    und darf nicht an einer Abfrage haengen, die jemand spaeter um einen Filter
 *    erweitert. Sortiert wird auf einer KOPIE — die Liste gehoert der Seite.
 *    BEWUSST KEIN antd-`sorter`: der wuerde die Ordnung an antd abgeben, und die
 *    Zusage waere dann nur noch eine Vorgabe im Spaltenkopf.
 * 2. DIE ZAHLEN KOMMEN FERTIG AN. Aggregiert wird in der Seite (`abendStats` →
 *    `computeDAStats`, EINE Aggregationsstelle); hier steht keine Rechnung ausser
 *    dem Ruecklaufanteil des Balkens.
 * 3. KEIN ROT. Der Ruecklaufbalken ist eigenes Markup in `--fb-ink`, nicht
 *    `Progress` — dessen Vorgabe ist `colorPrimary`, und `theme.ts` setzt
 *    `colorPrimary === colorError === #c8000f`. Ein roter Balken auf einer
 *    Datenflaeche liest sich als Alarm (Farb-Klausel §4.9).
 * 4. KEIN `useBreakpoint()` UND KEIN HORIZONTAL SCROLLENDES `Table` (§2.5):
 *    beide Darstellungen liegen im HTML, `@media (min-width: 768px)` in
 *    `feedback.css` schaltet. `useBreakpoint()` liefert beim ersten Rendern alle
 *    Werte `false` und liesse die Zone einen Wimpernschlag leer.
 * 5. DER LAUFENDE ABEND STEHT NICHT HIER. Das entscheidet `cockpitZustand`
 *    (`verlauf` schliesst ihn aus, §2.2) — derselbe Abend zweimal auf einer Seite
 *    ist genau die Unschaerfe, die den Ist-Zustand unlesbar macht.
 */

export type VerlaufZeile = {
  eveningId: number;
  /** `null`, wenn zum Abend keine Umfrage existiert (nur dokumentierter Abend). */
  surveyId: number | null;
  /** Mitternacht UTC, wie `evenings.date` es speichert. */
  datum: Date;
  thema: string | null;
  /**
   * `notes` des Abends — nur die Zeilenbearbeitung liest und schreibt sie. §2.3
   * hat das Feld aus dem Startformular genommen („ein viertes Feld ohne Leser")
   * und ausdruecklich hierher verwiesen. Optional, weil keine Darstellung der Zone
   * es zeigt: eine Zeile ohne den Wert bleibt vollstaendig lesbar.
   */
  notizen?: string | null;
  rueckmeldungen: number;
  /** Der Nenner der Ruecklaufquote — `null` heisst: es gibt keinen (§2.3). */
  teilnehmer: number | null;
  /** `avgSchulnote` (§4.12), NIE `overallAvg`. */
  avgSchulnote: number | null;
  hasLegacyScale: boolean;
  /** Altbestands-Entwurf (§2.2, Belegung E) — nie in der Lagekarte, nur hier. */
  entwurf: boolean;
};

export type VerlaufProps = {
  groupId: number;
  zeilen: VerlaufZeile[];
  /** Heute in `Europe/Berlin` als `YYYY-MM-DD` — Vorbelegung von „nachtragen". */
  heute: string;
};

export function Verlauf({ groupId, zeilen, heute }: VerlaufProps) {
  const [nachtragen, setNachtragen] = useState(false);

  // Eigene Ordnung auf einer KOPIE (Entscheidung 1). `sort` mutiert sonst die
  // Liste der Seite, und die Kopfzone rechnet mit derselben.
  const sortiert = [...zeilen].sort((a, b) => b.datum.getTime() - a.datum.getTime());

  /*
   * Der Ø der Kopfzeile und der Funke lesen DASSELBE Fenster (`fensterMittel`
   * aus `_lib/noten.ts`) wie die Kontextzeile der Kopfzone (§4.2). Zwei
   * Rechnungen waeren zwei Fenster, und niemand wuerde merken, dass die eine
   * Zeile fuenf und die andere sechs Abende mittelt.
   */
  const mittel = fensterMittel(sortiert.map((z) => z.avgSchulnote));
  // Der Funke laeuft chronologisch: AELTESTER links. `slice` vor `reverse`,
  // damit es dasselbe Fenster ist wie beim Ø.
  const funkenNoten = sortiert
    .slice(0, NOTEN_FENSTER)
    .map((z) => z.avgSchulnote)
    .filter((n): n is number => n !== null)
    .reverse();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      <div
        data-testid="verlauf-kopf"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: SPACE.md,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.md }}>
          <span style={T.kicker}>VERLAUF</span>
          {/* 132×28 am Laptop, 56px volle Breite am Handy (§2.5) — zwei
              Groessen, eine Komponente, geschaltet von derselben Medienabfrage
              wie die Tabelle. */}
          {funkenNoten.length >= 2 && (
            <>
              <span className="fb-nur-breit">
                <Notenfunke noten={funkenNoten} />
              </span>
              <span className="fb-nur-schmal" style={{ width: "100%" }}>
                <Notenfunke noten={funkenNoten} hoehe={56} volleBreite />
              </span>
            </>
          )}
          {mittel && (
            <span style={T.meta}>
              Ø{" "}
              {mittel.anzahl === NOTEN_FENSTER
                ? "der letzten sechs Abende"
                : `aus ${mittel.anzahl} ${mittel.anzahl === 1 ? "Abend" : "Abenden"}`}
              : {notenSatz(mittel.mittel)}
            </span>
          )}
        </div>

        {/*
         * Drei LEISE Textknoepfe (§2.5): der Primaerknopf der Seite ist immer die
         * Zustandsaktion der Lagekarte, hier gibt es keinen zweiten. „Trend" und
         * „CSV" sind echte `href` — ein Tabstop, ein Fokusring, und beide
         * funktionieren ohne JavaScript.
         *
         * `fb-knopfzeile` ergaenzt 2026-07-27: unterhalb von 768px stehen sie
         * gestapelt und in voller Breite. Gemessen vorher bei 390px: 68 / 146 /
         * 251px nebeneinander, alle ohne Rahmen — die Trefferflaechen waren
         * weder erkennbar noch gleich breit.
         */}
        <div className="fb-knopfzeile">
          <Button
            type="text"
            href={`/m/feedback/groups/${groupId}/trend`}
            className="fb-block-mobil"
          >
            Trend
          </Button>
          <Button
            type="text"
            href={`/m/feedback/groups/${groupId}/export.csv`}
            className="fb-block-mobil"
          >
            CSV (alle Abende)
          </Button>
          {/*
           * Der Fall, den der Ein-Klick-Start sonst wegnimmt: einen Dienstabend
           * DOKUMENTIEREN, ohne Feedback zu erheben. Bewusst ein leiser
           * Textknopf und kein zweites Formular auf der Seite — die Felder
           * erscheinen erst auf Verlangen.
           */}
          <Button type="text" onClick={() => setNachtragen(true)} className="fb-block-mobil">
            Abend ohne Feedback nachtragen
          </Button>
        </div>
      </div>

      {/*
       * BEIDE DARSTELLUNGEN LIEGEN IM HTML (§2.5). Die Klassen schalten in
       * `feedback.css` bei 768px; `display` steht deshalb NICHT inline — eine
       * Klasse mit `display: none` kann ein inline gesetztes `display` nicht
       * schlagen (dieselbe Falle, die `.fb-legende-woerter` dokumentiert).
       */}
      <div className="fb-verlauf-breit">
        <BreiteTabelle groupId={groupId} zeilen={sortiert} />
      </div>
      <div className="fb-verlauf-schmal">
        <SchmaleListe groupId={groupId} zeilen={sortiert} />
      </div>

      <NachtragenDialog
        groupId={groupId}
        heute={heute}
        offen={nachtragen}
        schliessen={() => setNachtragen(false)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Das Ziel einer Zeile
// ---------------------------------------------------------------------------

/**
 * DAS ZIEL EINER VERLAUFSZEILE — EINE Stelle fuer beide Darstellungen.
 *
 * §2.5 nennt in der Aktionsspalte den Link „Auswertung" und macht in der
 * Schmalvariante die ganze 68px-Flaeche zu diesem Ziel. Das setzt eine Umfrage
 * voraus, und genau die fehlt bei einem Abend aus „Abend ohne Feedback
 * nachtragen": `createEveningAction` legt nur den Abend an, nie eine Umfrage.
 * `.../auswertung` antwortet fuer solche Abende mit 404 („ohne Umfrage nichts
 * auszuwerten").
 *
 * FRUEHER FUEHRTE DIESE ZEILE AUF `evenings/[eveningId]`. Diese Seite gibt es
 * nicht mehr als eigenen Screen (§4.16: „Redirect auf die Auswertung") — und sie
 * war der falsche Ort ohnehin: sie trug ausschliesslich die abgeschaffte
 * Umfragesteuerung und kein einziges Feld des Abends. Ein Weg, der „Bearbeiten"
 * heisst und nichts bearbeiten kann; heute waere er ueber den Redirect derselbe
 * 404 wie oben, nur mit Umweg.
 *
 * ALSO: MIT Umfrage ein `<Link>` auf die Auswertung, OHNE Umfrage ein Knopf, der
 * die ZEILENBEARBEITUNG oeffnet — dieselbe, die das „…"-Menue oeffnet. Beide
 * Darstellungen benutzen dasselbe Bauteil, weil zwei Kopien der Weg sind, auf
 * dem dieser Fehler zurueckkommt.
 *
 * Ein umfrageloser Abend traegt damit zwei `AbendBearbeiten`-Instanzen (hier und
 * im Menue). Der `Modal` steht auf `destroyOnHidden`, rendert geschlossen also
 * NICHTS: es gibt zu jedem Zeitpunkt hoechstens einen Dialog im DOM.
 */
const AUSWERTUNG = (groupId: number, eveningId: number) =>
  `/m/feedback/groups/${groupId}/evenings/${eveningId}/auswertung`;

/**
 * Der Knopf soll wie sein Link-Geschwister aussehen, nicht wie ein Knopf. Die
 * Vorgaben des Browsers (Rahmen, Flaeche, eigene Schrift, `padding`, zentrierter
 * Text) muessen dafuer ALLE weg — sonst steht in der Aktionsspalte ein grauer
 * Kasten neben lauter Links, und in der Schmalvariante zentriert der Block seinen
 * Text und weicht sichtbar von seinen Nachbarn ab. Ein `style` des Aufrufers
 * gewinnt (er wird spaeter gespreizt): die Schmalvariante setzt ihr eigenes
 * `padding`.
 */
const KNOPF_WIE_LINK: React.CSSProperties = {
  appearance: "none",
  background: "none",
  border: 0,
  padding: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

function Zeilenziel({
  groupId,
  zeile,
  style,
  children,
}: {
  groupId: number;
  zeile: VerlaufZeile;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);

  if (zeile.surveyId !== null) {
    return (
      <Link className="fb-fokus" style={style} href={AUSWERTUNG(groupId, zeile.eveningId)}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fb-fokus"
        style={{ ...KNOPF_WIE_LINK, ...style }}
        onClick={() => setBearbeiten(true)}
      >
        {children}
      </button>
      <AbendBearbeiten
        abend={zeile}
        offen={bearbeiten}
        schliessen={() => setBearbeiten(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Die breite Darstellung — Tabelle ohne Karte, direkt auf dem Seitengrund
// ---------------------------------------------------------------------------

/**
 * „Die Tabelle steht ohne Karte direkt auf dem Seitengrund" (§2.5): eine Tabelle
 * in einer Karte auf einer Seite ist der dritte Rahmen fuer dieselbe Aussage.
 */
function BreiteTabelle({ groupId, zeilen }: { groupId: number; zeilen: VerlaufZeile[] }) {
  return (
    <Table<VerlaufZeile>
      rowKey="eveningId"
      dataSource={zeilen}
      size="middle"
      pagination={{ pageSize: 12, hideOnSinglePage: true, size: "small" }}
      locale={{ emptyText: LEER_TEXT }}
      columns={[
        {
          title: "Datum",
          key: "datum",
          width: 140,
          render: (_, z) => (
            <span style={{ display: "block" }}>
              <span style={{ ...T.body, fontWeight: 600 }}>{formatDatumLang(z.datum)}</span>
              <span style={{ ...T.meta, display: "block" }}>{formatWochentag(z.datum)}</span>
            </span>
          ),
        },
        {
          title: "Thema",
          key: "thema",
          ellipsis: true,
          // Leer → „—" in `--fb-muted`, NIE „(ohne Thema)": die Klammerform
          // liest sich als Fehlermeldung ueber den Abend.
          render: (_, z) =>
            z.thema ? (
              <span style={T.body}>{z.thema}</span>
            ) : (
              <span style={{ ...T.body, color: "var(--fb-muted)" }}>—</span>
            ),
        },
        {
          title: "Rücklauf",
          key: "rueckmeldungen",
          width: 110,
          align: "right",
          render: (_, z) => <Ruecklauf zeile={z} />,
        },
        {
          // Der Spaltenkopf traegt die Richtung: ohne „(1 = beste)" liest sich
          // eine 2,0 wie eine schwache Bewertung (§4.11).
          title: "Ø Note (1 = beste)",
          key: "note",
          width: 150,
          render: (_, z) => (
            <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
              <Notenpille note={z.avgSchulnote} />
              {z.hasLegacyScale && <Altbestandsfussnote />}
            </span>
          ),
        },
        {
          title: "Zustand",
          key: "zustand",
          width: 150,
          // Nur belegt, wenn es etwas zu sagen gibt: ein „abgeschlossen" in jeder
          // Zeile ist Rauschen, das den einen abweichenden Fall verdeckt.
          render: (_, z) =>
            z.entwurf ? (
              <Tag bordered={false} style={T.meta}>
                Entwurf (Altbestand)
              </Tag>
            ) : null,
        },
        {
          title: "Aktion",
          key: "aktion",
          width: 130,
          align: "right",
          render: (_, z) => (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: SPACE.sm,
              }}
            >
              {/*
               * Die Beschriftung wandert mit dem Ziel: ein Link „Auswertung",
               * der nicht in der Auswertung landet, ist derselbe Fehler in
               * anderem Gewand.
               */}
              <Zeilenziel groupId={groupId} zeile={z} style={T.body}>
                {z.surveyId !== null ? "Auswertung" : "Bearbeiten"}
              </Zeilenziel>
              {z.entwurf && z.surveyId !== null && <StartenKnopf surveyId={z.surveyId} />}
              <AbendMenue zeile={z} />
            </span>
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Die schmale Darstellung — ein Block je Abend, die ganze Flaeche ein Link
// ---------------------------------------------------------------------------

/**
 * 390px (§2.5): pro Abend ein Block, die ganze Flaeche ein Link — Ziel aus
 * `zielFuer`, also nur bei vorhandener Umfrage die Auswertung. Sonst waere die
 * GANZE 68px-Flaeche eines nachgetragenen Abends ein 404 und die Zeile am Handy
 * nur noch ueber „…" → Bearbeiten erreichbar.
 * Haarlinien zwischen den Zeilen, KEINE Karte pro Zeile — sechs Karten
 * untereinander sind sechs Rahmen fuer eine Liste.
 *
 * Das „…"-Menue liegt in einem 44px-Bereich rechts und stoppt die Ausbreitung
 * des Klicks, damit es nicht mit dem Zeilenlink kollidiert.
 */
function SchmaleListe({ groupId, zeilen }: { groupId: number; zeilen: VerlaufZeile[] }) {
  if (zeilen.length === 0) return <p style={{ ...T.meta, margin: 0 }}>{LEER_TEXT}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {zeilen.map((z) => (
        <div
          key={z.eveningId}
          data-testid="verlauf-block"
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACE.sm,
            borderTop: "1px solid var(--fb-split)",
          }}
        >
          <Zeilenziel
            groupId={groupId}
            zeile={z}
            style={{
              flex: 1,
              minHeight: 68,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: SPACE.xs,
              color: "inherit",
              padding: `${SPACE.sm}px 0`,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
              <span style={{ ...T.body, fontWeight: 600, flex: 1 }}>
                {formatDatumLang(z.datum)}
              </span>
              <Notenpille note={z.avgSchulnote} />
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
              <span
                style={{
                  ...T.meta,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {z.thema ?? "—"}
              </span>
              <Ruecklauf zeile={z} ohneBalken />
            </span>
            {z.entwurf && (
              <Tag bordered={false} style={T.meta}>
                Entwurf (Altbestand)
              </Tag>
            )}
            {z.hasLegacyScale && <Altbestandsfussnote />}
          </Zeilenziel>
          {/*
           * Rechts neben dem Zeilenlink, als GESCHWISTER und nicht darin. §2.5
           * nennt hier `stopPropagation` — das braucht nur, wer das Menue
           * INNERHALB der Linkflaeche haengt. Ein Geschwister kollidiert nicht:
           * ein Klick auf das „…" erreicht den Link nie, und der Link bleibt ein
           * einziges, zusammenhaengendes Ziel (§4.14). Ein Knopf IM `<a>` waere
           * zudem verschachtelt Interaktives.
           *
           * „Jetzt starten" steht NEBEN dem Menue und ersetzt es nicht: sonst
           * waeren Bearbeiten und Loeschen am Handy genau fuer die Zeilen
           * unerreichbar, die am haeufigsten aufgeraeumt werden muessen.
           */}
          {z.entwurf && z.surveyId !== null && <StartenKnopf surveyId={z.surveyId} />}
          <span style={{ width: 44, display: "flex", justifyContent: "center" }}>
            <AbendMenue zeile={z} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bauteile der Zeile
// ---------------------------------------------------------------------------

/** §4.3, wortgenau. Keine Illustration, kein zweiter Startaufruf. */
const LEER_TEXT = "Noch keine vergangenen Dienstabende.";

/**
 * „14 / 18" plus 60px-Balken — und ohne Teilnehmerzahl „14" plus T.meta „—"
 * (§2.5). ES WIRD NIE EIN NENNER ERFUNDEN: ohne `participantCount` gibt es
 * keinen Anteil, keinen Prozentwert und keinen Balken. Ein erfundener Nenner
 * waere eine Quote, die jemand in einem Bericht zitiert.
 */
function Ruecklauf({ zeile, ohneBalken = false }: { zeile: VerlaufZeile; ohneBalken?: boolean }) {
  if (zeile.teilnehmer === null || zeile.teilnehmer <= 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: SPACE.xs }}>
        <span style={T.body}>{zeile.rueckmeldungen}</span>
        <span style={T.meta}>—</span>
      </span>
    );
  }

  const anteil = Math.min(1, zeile.rueckmeldungen / zeile.teilnehmer);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={T.body}>
        {zeile.rueckmeldungen} / {zeile.teilnehmer}
      </span>
      {!ohneBalken && (
        <span
          data-testid="verlauf-balken"
          style={{
            width: 60,
            height: 4,
            marginTop: SPACE.xs,
            borderRadius: 2,
            background: "var(--fb-fill)",
            overflow: "hidden",
          }}
        >
          {/* Eigenes Markup in `--fb-ink`, nicht `Progress`: dessen Vorgabe ist
              `colorPrimary` — also DRK-Rot auf einer Datenflaeche (§4.9). */}
          <span
            style={{
              display: "block",
              width: `${anteil * 100}%`,
              height: "100%",
              background: "var(--fb-ink)",
            }}
          />
        </span>
      )}
    </span>
  );
}

/**
 * „Jetzt starten" fuer einen Altbestands-Entwurf (§2.5). `Popconfirm`, weil es
 * eine laufende Umfrage ersetzen wuerde — und der Satz nennt die Folge, statt
 * „Sind Sie sicher?" zu fragen.
 *
 * Uebergeben wird die SURVEY-Kennung, nicht die des Abends: `activateSurveyAction`
 * rechnet die Frist mit `computeClosesAt(evening.date, …)` und nicht ab jetzt —
 * genau der Fix, ohne den ein am Mittwoch gestarteter Montagsabend bis Donnerstag
 * gelaufen waere.
 */
function StartenKnopf({ surveyId }: { surveyId: number }) {
  const [laeuft, starte] = useTransition();

  const starten = () =>
    starte(async () => {
      const daten = new FormData();
      daten.set("id", String(surveyId));
      await activateSurveyAction(daten);
    });

  return (
    <Popconfirm
      title="Diesen Entwurf jetzt starten?"
      description="Läuft bereits ein Feedback, ersetzt dieser Abend es als aktive Umfrage."
      okText="Starten"
      cancelText="Abbrechen"
      okButtonProps={{ loading: laeuft }}
      onConfirm={starten}
    >
      <Button type="text" loading={laeuft}>
        Jetzt starten
      </Button>
    </Popconfirm>
  );
}

/**
 * Das „…"-Menue der Zeile (§2.5). „Bearbeiten" oeffnet die ZEILENBEARBEITUNG —
 * frueher fuehrte der Punkt auf die alte Abendseite, die ausschliesslich die
 * Umfragesteuerung traegt und kein einziges Feld des Abends: ein Weg, der
 * „Bearbeiten" heisst und nichts bearbeiten kann. „Loeschen" fragt nach und nennt
 * die Folge — es nimmt die Rueckmeldungen mit.
 */
/**
 * §4.6 wortgenau, mit der ECHTEN Zahl der Zeile. Der Nullfall bekommt einen
 * eigenen Satz: „und seine 0 Rueckmeldungen" liest sich wie ein Fehler in der
 * Zaehlung und nicht wie „an diesem Abend hat niemand geantwortet".
 */
function loeschsatz(rueckmeldungen: number): string {
  if (rueckmeldungen === 0) return "Löscht den Abend. Rückmeldungen gibt es zu ihm keine.";
  if (rueckmeldungen === 1) return "Löscht den Abend und seine 1 Rückmeldung.";
  return `Löscht den Abend und seine ${rueckmeldungen} Rückmeldungen.`;
}

function AbendMenue({ zeile }: { zeile: VerlaufZeile }) {
  const [offen, setOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [laeuft, starte] = useTransition();

  const loeschen = () =>
    starte(async () => {
      const daten = new FormData();
      daten.set("id", String(zeile.eveningId));
      await deleteEveningAction(daten);
    });

  return (
    <>
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            { key: "bearbeiten", label: "Bearbeiten", onClick: () => setBearbeiten(true) },
            { key: "loeschen", label: "Löschen", onClick: () => setOffen(true) },
          ],
        }}
      >
        <Button
          type="text"
          /*
           * `minWidth: TAP` ist der Punkt dieser Zeile, nicht das entfernte
           * `size`. Gemessen bei 390px VOR dieser Aenderung: 24px breit, 42px
           * hoch — und das ist das EINZIGE Bedienelement der Verlaufszeile
           * („Bearbeiten", „Loeschen"). Ein Auslassungszeichen ist schmal; die
           * Trefferflaeche darf es nicht sein.
           *
           * NACHHER PASST DER KNOPF NICHT IN SEINEN CONTAINER, ER RAGT HERAUS —
           * und das ist gemessen, kein Uebersehen: ohne `size` faellt der Knopf
           * auf antds `controlHeight` (56) zurueck, `minWidth: TAP` erzwingt
           * dieselben 56px in der Breite. Der umgebende Container in Zeile 488
           * bleibt bei 44px (eigene `getBoundingClientRect`-Messung), der Knopf
           * also 56×56 in einem 44px-Rahmen — 6px Ueberstand je Seite. Das
           * bleibt folgenlos, weil die Zeile ein Flex-Container mit
           * `gap: SPACE.sm` (8px) zwischen den Geschwistern ist: 8px ≥ 6px
           * Ueberstand, der Zwischenraum nimmt ihn vollstaendig auf. Gemessen
           * bei 390px ohne diesen Ueberstand als Regression: kein seitliches
           * Scrollen (`document.documentElement.scrollWidth` blieb 390) und
           * unveraenderte Zeilenhoehe ([69, 68] vor wie nach dieser Aenderung).
           */
          style={{ minWidth: TAP }}
          aria-label={`Aktionen für den ${formatDatumLang(zeile.datum)}`}
        >
          …
        </Button>
      </Dropdown>
      {/*
       * Der `Popconfirm` haengt NICHT am Menuepunkt: antd schliesst das Menue
       * beim Klick, und ein Bestaetigungsfenster an einem verschwindenden Anker
       * schliesst mit. Deshalb ein eigener, unsichtbarer Anker mit `open`.
       *
       * ROT IM okButton IST HIER RICHTIG (§4.6, Zeile „Abend loeschen
       * (Verlaufszeile) | `Popconfirm`, `danger`-okButton"): die Farb-Klausel
       * verbietet Rot auf einer DATENFLAECHE und erlaubt es ausdruecklich „am
       * Knopfrand und im okButton des Dialogs". Der Menuepunkt selbst bleibt
       * farblos — ein rotes „Loeschen" in der Liste waere die Datenflaeche.
       *
       * UND DER SATZ NENNT DIE ZAHL (§4.6 wortgenau: „Loescht den Abend und
       * seine 14 Rueckmeldungen."). „Die Rueckmeldungen dieses Abends" liess
       * offen, ob es drei oder dreissig sind — die Zahl ist der einzige Teil der
       * Warnung, der die Entscheidung wirklich traegt, und sie liegt in der Zeile
       * bereit.
       */}
      <Popconfirm
        open={offen}
        title="Diesen Dienstabend löschen?"
        description={loeschsatz(zeile.rueckmeldungen)}
        okText="Löschen"
        cancelText="Abbrechen"
        okButtonProps={{ danger: true, loading: laeuft }}
        onConfirm={() => {
          setOffen(false);
          loeschen();
        }}
        onCancel={() => setOffen(false)}
      >
        <span />
      </Popconfirm>
      {/* Dieselbe Zeilenbearbeitung, die auch die Lagekarte oeffnet (2.4) — EIN
          Dialog, ein Satz Felder, ein Aufruf von `updateEveningAction`. */}
      <AbendBearbeiten
        abend={zeile}
        offen={bearbeiten}
        schliessen={() => setBearbeiten(false)}
      />
    </>
  );
}

/**
 * „Abend ohne Feedback nachtragen" (§2.5). Zwei Felder, kein `useActionState`:
 * §4.4 nennt GENAU DREI Formulare mit Feldfehlern, und dieses ist keins davon —
 * das Datum ist ein `<input type="date">` und damit vom Browser gepruefte
 * Eingabe.
 *
 * Vorbelegt mit `heute` in `Europe/Berlin`, das die SEITE gerechnet hat: eine
 * Vorbelegung aus `toISOString()` kippt zwischen 00:00 und 02:00 Ortszeit auf den
 * Vortag, und der Abend von gestern wuerde ein zweites Mal angelegt (§4.5).
 */
function NachtragenDialog({
  groupId,
  heute,
  offen,
  schliessen,
}: {
  groupId: number;
  heute: string;
  offen: boolean;
  schliessen: () => void;
}) {
  return (
    <Modal
      open={offen}
      onCancel={schliessen}
      title="Abend ohne Feedback nachtragen"
      footer={null}
      destroyOnHidden
    >
      <form
        data-testid="verlauf-nachtragen"
        /*
         * GESCHLOSSEN WIRD DANACH, nicht im `onSubmit`. Mit `destroyOnHidden` baut
         * der `Modal` sein Kind aus, sobald `open` auf `false` faellt — ein
         * `onSubmit={schliessen}` riss das Formular also mitten aus der laufenden
         * Action. Der Knopf haette weiter geklickt, nur nichts mehr angelegt, und
         * genau das ist schlimmer als ein fehlender Knopf.
         */
        action={async (daten: FormData) => {
          await createEveningAction(daten);
          schliessen();
        }}
        className="fb-form"
        style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <p style={{ ...T.meta, margin: 0 }}>
          Der Abend wird nur dokumentiert — es wird kein Feedback erhoben und kein QR-Code gültig.
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <span style={T.kicker}>Datum</span>
          <Input type="date" name="date" defaultValue={heute} required />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <span style={T.kicker}>Thema</span>
          <Input name="topic" placeholder="z. B. Funkübung" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <span style={T.kicker}>Teilnehmerzahl</span>
          <Input type="number" name="participantCount" min={0} placeholder="optional" />
        </label>
        <Button type="primary" htmlType="submit">
          Abend eintragen
        </Button>
      </form>
    </Modal>
  );
}
