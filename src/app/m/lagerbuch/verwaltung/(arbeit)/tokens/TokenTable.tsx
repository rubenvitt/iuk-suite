"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  filterAktiv,
  type Filterwert,
  type FilterZustand,
  nachDatum,
  nachJaNein,
  nachText,
  useEntprellt,
  wendeFilterAn,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { Einheitenart } from "../../../_lib/konstanten";
import { setzeOrtCodeZurueck } from "../../../_actions/ortCodes";
import { setTokenAktiv } from "../../../_actions/tokens";
import { falte } from "../../../_lib/suche";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";

const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";

export type ZielFilter = "fahrzeug" | "artikel" | "liste";

/** DRK-406: „gehört einer Karte" gegen „von Hand angelegt". */
export type ArtFilter = "ortscode" | "altbestand";

export type TokenAnzeigeZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  lastUsedIso: string | null;
  /** DRK-406: der Ort, dem der Code gehoert. `null` = Altbestand. */
  ortId: string | null;
  ortName: string | null;
  /** „Lager" · „Fahrzeug · HN-DRK-1101" · „Tasche". Fertig vom Server. */
  ortMeta: string | null;
  /**
   * DARF DIESER CODE NEU ERZEUGT WERDEN? Der Server entscheidet das, weil er
   * die Menge der Ortskarten kennt — ein Code an einer STILLGELEGTEN Einheit
   * hat eine `ortId` und trotzdem keine Karte mehr (Begruendung an der
   * Zeilenquelle, `page.tsx`).
   */
  zuruecksetzbar: boolean;
  /**
   * DRK-406 — „ersetzt am 17.9.2026", oder `null` fuer jeden Code, der nie
   * ersetzt wurde. Fertig formatiert vom Server (Zeitzone ist Fachvertrag).
   */
  ersetztText: string | null;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
  /** Die Beizeile des ZIELS — `null`, wo es keine Einheit ist. Vom Server. */
  zielMeta: string | null;
  /**
   * ⚠️ SIE IST NICHT `zielTyp` (DRK-309) und traegt hier genau eine Aufgabe:
   * das ZEICHEN des Ziel-Chips. `tokens.ziel_typ` steht fuer jede Tasche auf
   * „fahrzeug"; ohne dieses Feld bekaeme eine Tasche den Lastwagen.
   */
  zielEinheitenart: Einheitenart | null;
};

export function zielVon(z: TokenAnzeigeZeile): ZielFilter {
  return z.zielTyp ?? "liste";
}

export function artVon(z: TokenAnzeigeZeile): ArtFilter {
  return z.ortId === null ? "altbestand" : "ortscode";
}

/**
 * DARF DIESER GESPERRTE CODE WIEDER GELTEN? Nur der Altbestand darf — DRK-406.
 *
 * ⚠️ ZWEI BEDINGUNGEN, UND DIE ZWEITE IST NICHT DIE ERSTE NOCH EINMAL. `ortId`
 * faengt den Code, der heute zu einer Karte gehoert; `ersetztText` den, der es
 * einmal tat. Beim Loeschen einer Einheit MUSS `ort_id` geleert werden
 * (Fremdschluessel), und ohne die zweite Bedingung saehe ihr verbrannter Code
 * danach aus wie ein laminiertes Kaertchen von Hand.
 *
 * Dieselbe Entscheidung faellt serverseitig in `_actions/tokens.ts` — diese
 * Funktion ist die Anzeige davon, nicht der Riegel.
 */
export function kannReaktivieren(z: TokenAnzeigeZeile): boolean {
  return z.ortId === null && z.ersetztText === null;
}

/**
 * SUCHFELDMENGE 6 VON 6: Code · Label · Zielname · Art des Ziels (DRK-309) —
 * UND der Ort samt seiner Beizeile (DRK-406).
 *
 * ⚠️ OHNE DIE ART FINDET „tasche" KEIN EINZIGES KAERTCHEN. Der Zielname ist
 * der Name der Einheit, und der traegt das Wort nicht zwangslaeufig; `zielTyp`
 * steht fuer jede Tasche auf „fahrzeug" und hilft hier gar nicht.
 *
 * ⚠️ UND OHNE DEN ORT FINDET „handlager" KEINEN. Der Handlager-Code hat gar
 * kein Ziel — er traegt seinen Namen ausschliesslich im Ortsfeld, und das ist
 * der Code, nach dem am haeufigsten gesucht wird.
 */
export function sucheTrifft(z: TokenAnzeigeZeile, begriff: string): boolean {
  const nadel = falte(begriff.trim());
  return !nadel
    || falte([z.code, z.label, z.zielName ?? "", z.zielMeta ?? "",
      z.ortName ?? "", z.ortMeta ?? ""].join(" ")).includes(nadel);
}

/**
 * ⚠️ DIE SCHLUESSEL SIND DATENBANKWERTE, DIE TEXTE NICHT (DRK-309).
 * `tokens.ziel_typ` kennt nur „fahrzeug" und „artikel"; ein Kärtchen an einer
 * Tasche traegt deshalb „fahrzeug" — und wuerde in dieser Spalte als
 * „Fahrzeug" ausgewiesen, obwohl es an einer Tasche klebt. Die Spalte nennt
 * daneben ohnehin den NAMEN des Ziels; hier steht die Gruppe, und die heisst
 * nach beidem.
 */
const ZIEL_TEXT: Record<ZielFilter, string> = {
  fahrzeug: "Fahrzeug oder Tasche",
  artikel: "Artikel",
  liste: "Artikel-Liste",
};

const ART_TEXT: Record<ArtFilter, string> = {
  ortscode: "Ortscode",
  altbestand: "Von Hand angelegt",
};

const STATUS_FILTER = zustandsFilter<TokenAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "gesperrt", text: "gesperrt", trifft: (zeile) => !zeile.aktiv },
]);

/**
 * DIE ZUGANGS-CODES — DRK-406.
 *
 * ENTSCHEIDUNG 8-F (§8.3): Der Namensraum der Zugangs-Codes ist gesperrt — ein
 * Code kann nur noch gesperrt, nie mehr gelöscht werden. Hier stand bis T160
 * ein `LoeschButton art="token"`; der Aufruf ist entfallen, übrig blieb
 * „Sperren"/„Reaktivieren".
 *
 * ⚠️ SEIT DRK-406 GIBT ES KEINEN ANLEGEKNOPF MEHR, und daneben einen zweiten,
 * der WIE ein Anlegeknopf aussieht: „Neu erzeugen". Der Unterschied ist die
 * ganze Sicherheitsaussage dieses Tickets und steht deshalb im Bestätigungstext
 * ausgeschrieben — neu erzeugen heißt SPERREN UND ERSETZEN. Wer ihn für „noch
 * einen dazu" hält, drückt ihn an einem Fahrzeug, dessen Karte gerade gilt, und
 * wundert sich am nächsten Morgen.
 *
 * ⚠️ DER ALTBESTAND BLEIBT IN DERSELBEN TABELLE, nicht in einer zweiten
 * darunter (Betreiberentscheidung 17.09.2026). Zwei Tabellen wären zwei Suchen,
 * zwei Sortierungen und zwei Orte, an denen man „ist dieser Code noch gültig?"
 * nachsieht — die Frage ist für beide Arten dieselbe. Unterschieden werden sie
 * über einen Spaltenfilter, also dort, wo die Tabelle ihre anderen Prädikate
 * auch führt.
 */
export function TokenTable({ zeilen }: { zeilen: TokenAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung.
  const sucheNachlauf = useEntprellt(suche);
  /**
   * ⚠️ DER ZUSTAND WIRD GEMERKT, NICHT DIE LISTE (Falle 15). `onChange` feuert
   * nur bei Bedienung DER TABELLE — tippt jemand daneben in die Suche, filtert
   * antd zwar neu, meldet es aber nicht. Die angezeigte Menge folgt deshalb aus
   * dem Zustand, bei jeder Aenderung neu.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  const [fehler, setFehler] = useState<string | null>(null);
  /**
   * DER ZULETZT NEU ERZEUGTE CODE — DRK-406.
   *
   * ⚠️ ER STEHT AM SCHIRM UND NICHT NUR IN DER TABELLE, und der Grund ist die
   * Lage, in der man zurücksetzt: ein Code wurde missbraucht, die Karte muss
   * JETZT neu gedruckt werden. Die Tabelle zeigt ihn nach der Revalidierung
   * zwar auch — aber irgendwo zwischen zwanzig anderen Zeilen, und welche der
   * sechsstelligen Zahlen die neue ist, sieht man ihr nicht an.
   */
  const [neuerCode, setNeuerCode] = useState<{ ort: string; code: string } | null>(null);
  const [laeuft, startTransition] = useTransition();

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [sucheNachlauf, zeilen],
  );

  const hatFilter = sucheNachlauf.trim() !== "" || filterAktiv(spaltenFilter);

  function statusAendern(zeile: TokenAnzeigeZeile): void {
    setFehler(null);
    setNeuerCode(null);
    startTransition(async () => {
      try {
        const ergebnis = await setTokenAktiv({ id: zeile.id, aktiv: !zeile.aktiv });
        /*
         * ⚠️ DER SATZ DES SERVERS, NICHT DER FESTE — DRK-406, Codex-Befund P2.
         * Hier stand `setFehler(STATUS_FEHLER)` für JEDEN abgelehnten Ausgang,
         * und das war richtig, solange der Server nur einen kannte. Seit dem
         * Ticket kennt er einen zweiten: „für diesen Ort gilt bereits ein
         * neuerer Code" — ein NORMALZUSTAND mit einem Weg heraus, den die Action
         * ausdrücklich formuliert. Ihn hier durch „Status konnte nicht geändert
         * werden" zu ersetzen hieße, die Erklärung auf dem letzten Meter
         * wegzuwerfen; die Verwaltende sähe einen Defekt statt einer Absicht.
         *
         * ⚠️ DIE HÜLLE IST KEIN FREIBRIEF FÜR SERVERTEXTE. Sie zeigt, was die
         * Action als `fehler` zurückgibt — und das sind ausschließlich feste,
         * deutsche Sätze aus der Aktionsdatei, nie eine Datenbankmeldung
         * (§11.2 d). `STATUS_FEHLER` bleibt der Rückfall für den Wurf darunter,
         * wo es keinen Satz gibt.
         */
        if (!ergebnis.ok) setFehler(ergebnis.fehler || STATUS_FEHLER);
      } catch {
        setFehler(STATUS_FEHLER);
      }
    });
  }

  function neuErzeugen(zeile: TokenAnzeigeZeile): void {
    if (!zeile.ortId) return;
    /*
     * ⚠️ EINE RÜCKFRAGE, UND SIE NENNT DIE FOLGE STATT SIE ZU UMSCHREIBEN.
     * „Bist du sicher?" wäre hier wertlos: die Handlung ist nicht gefährlich,
     * weil sie schwer rückgängig zu machen ist, sondern weil ihre Wirkung
     * ANDERSWO eintritt — an einer laminierten Karte am Fahrzeug, die ab
     * diesem Klick ins Leere führt.
     */
    const ort = zeile.ortName ?? "diesen Ort";
    if (!window.confirm(
      `Für ${ort} einen neuen Code erzeugen?\n\n`
      + `Der bisherige Code ${zeile.code} wird dauerhaft gesperrt. Die Karte am `
      + `Ort muss danach neu gedruckt werden — bis dahin führt ein Scan aufs `
      + `Anmeldefeld.`,
    )) return;

    setFehler(null);
    setNeuerCode(null);
    startTransition(async () => {
      try {
        const ergebnis = await setzeOrtCodeZurueck({ ortId: zeile.ortId });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setNeuerCode({ ort, code: ergebnis.wert.code });
      } catch {
        setFehler("Der Code konnte nicht neu erzeugt werden.");
      }
    });
  }

  const spalten: NonNullable<TableProps<TokenAnzeigeZeile>["columns"]> = [
    {
      title: "Code",
      dataIndex: "code",
      sorter: nachText<TokenAnzeigeZeile>((zeile) => zeile.code),
      render: (code: string) => (
        <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{code}</span>
      ),
    },
    {
      /*
       * DIE ORTSSPALTE STEHT VOR DER ZIELSPALTE — DRK-406. Sie beantwortet die
       * Frage, mit der man diese Seite öffnet („welchen Code hat das RTW?");
       * das Ziel beantwortet eine zweite, seltenere („wo komme ich damit
       * raus?"). Für jeden Ortscode einer Einheit sagen beide dasselbe; für den
       * Handlager-Code sagt nur diese hier etwas.
       */
      title: "Ort",
      dataIndex: "ortName",
      sorter: nachText<TokenAnzeigeZeile>((zeile) => zeile.ortName ?? ""),
      filters: [
        { text: ART_TEXT.ortscode, value: "ortscode" },
        { text: ART_TEXT.altbestand, value: "altbestand" },
      ],
      onFilter: (wert: Filterwert, zeile: TokenAnzeigeZeile) => artVon(zeile) === wert,
      render: (_wert: unknown, zeile) =>
        zeile.ortName === null ? (
          /*
           * ⚠️ DER ALTBESTAND BEKOMMT EINEN NAMEN, KEIN „—". Ein Strich sähe
           * nach fehlenden Daten aus und lüde dazu ein, ihn „reparieren" zu
           * wollen. Diese Codes sind vollständig; sie gehören nur keiner Karte,
           * und genau das sagt die Beschriftung.
           */
          <Chip ton="grau" zeichen="schluessel">{ART_TEXT.altbestand}</Chip>
        ) : (
          <div>
            <div>{zeile.ortName}</div>
            {zeile.ortMeta ? <div style={SCHRIFT.neben}>{zeile.ortMeta}</div> : null}
          </div>
        ),
    },
    {
      title: "Bezeichnung",
      dataIndex: "label",
      sorter: nachText<TokenAnzeigeZeile>((zeile) => zeile.label),
    },
    {
      title: "Ziel",
      dataIndex: "zielTyp",
      // Die Zielart ist fachlich fest (drei Werte) und stammt deshalb
      // ausnahmsweise nicht aus den Daten.
      filters: [
        { text: ZIEL_TEXT.fahrzeug, value: "fahrzeug" },
        { text: ZIEL_TEXT.artikel, value: "artikel" },
        { text: ZIEL_TEXT.liste, value: "liste" },
      ],
      onFilter: (wert: Filterwert, zeile: TokenAnzeigeZeile) =>
        zielVon(zeile) === wert,
      render: (_wert: unknown, zeile) => {
        const ziel = zielVon(zeile);
        return (
          /*
           * ⚠️ DAS ZEICHEN FOLGT DER ART, NICHT `zielTyp` (DRK-309): ein
           * Kaertchen an einer Tasche traegt `ziel_typ = "fahrzeug"` und
           * bekaeme sonst den Lastwagen. Wo die Art fehlt, bleibt es beim
           * Lastwagen — er ist dort kein Befund, sondern die Gruppe, und ein
           * eigenes Zeichen fuer „weiss nicht" gibt es nicht.
           */
          <Chip
            ton="grau"
            zeichen={ziel === "fahrzeug"
              ? (zeile.zielEinheitenart ?? "fahrzeug")
              : ziel === "artikel" ? "objekt" : "liste"}
          >
            {ziel === "liste"
              ? ZIEL_TEXT.liste
              : ziel === "fahrzeug" && zeile.zielName
                ? `${zeile.zielName} · ${zeile.zielMeta ?? ""}`
                : (zeile.zielName ?? "—")}
          </Chip>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<TokenAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (aktiv: boolean) => (
        <Chip ton={aktiv ? "ok" : "rot"}>{aktiv ? "aktiv" : "gesperrt"}</Chip>
      ),
    },
    {
      title: "Zuletzt benutzt",
      dataIndex: "lastUsedText",
      // ⚠️ Ueber `lastUsedIso`, nie ueber den Anzeigetext — Begruendung an der
      // Zeilenquelle (`tokens/page.tsx`).
      sorter: nachDatum<TokenAnzeigeZeile>((zeile) => zeile.lastUsedIso),
      render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
    },
    {
      title: "",
      key: "aktionen",
      render: (_wert: unknown, zeile) => (
        <Flex gap={SPACE.sm} align="center">
          {/* KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
              docs/design/README.md) ist mit der Arbeitsdichte gefallen --
              44px ist hier bereits die volle wie die halbe Bediendichte,
              "small" unterbietet die Mindesttapflaeche (WCAG 2.5.5). */}
          {/* EINSTEIGEN: derselbe Weg wie der gescannte QR (`t/[code]/route.ts`),
              also echte Einloesung mit Helfer-Sitzung, `lastUsedAt` und
              Protokollzeile. Neuer Tab, damit die Verwaltung offen bleibt.
              Nur fuer AKTIVE Codes: ein gesperrter landete am Gate und
              buchte einen Fehlversuch in den geteilten Eimer. */}
          {zeile.aktiv ? (
            <Button
              href={`/t/${encodeURIComponent(zeile.code)}`}
              target="_blank"
              rel="noopener noreferrer"
              icon={<Ikone name="pfeil-rechts" groesse={16} />}
            >
              Einsteigen
            </Button>
          ) : null}
          {/*
            ⚠️ „NEU ERZEUGEN" STEHT NUR AN AKTIVEN ORTSCODES. An einem
            GESPERRTEN wäre er sinnlos — dessen Ort hat längst einen neuen
            aktiven Code, und ein zweiter Klick sperrte den. Am Altbestand gibt
            es keinen Ort, an den ein neuer Code gehen könnte.
          */}
          {zeile.aktiv && zeile.zuruecksetzbar ? (
            <Button
              disabled={laeuft}
              onClick={() => neuErzeugen(zeile)}
              icon={<Ikone name="erneut" groesse={16} />}
            >
              Neu erzeugen
            </Button>
          ) : null}
          {/*
            ⚠️ „REAKTIVIEREN" GIBT ES NUR AM ALTBESTAND — DRK-406, gefunden in
            der Durchsicht. Ein Code, der zu einer Ortskarte gehört oder gehört
            HAT, kommt nie zurück: sein Nachschub sind die Ortsetiketten, nicht
            dieser Knopf. Die Action lehnt genau so ab; hier steht derselbe
            Riegel nur früher, damit niemand einen Knopf drückt, der nichts tun
            kann.

            ⚠️ AN SEINER STELLE STEHT EINE AUSKUNFT, KEINE LÜCKE. Eine leere
            Zelle liest sich wie ein vergessener Knopf. „Ersetzt am …"
            beantwortet dazu die Frage, die am Tresen wirklich gestellt wird,
            wenn jemand mit einem alten Foto auftaucht.

            ⚠️ „SPERREN" BLEIBT FÜR JEDEN CODE. Es ist der Griff, der wirkt,
            wenn eine Karte verschwindet — auch an einem Ortscode.
          */}
          {zeile.aktiv || kannReaktivieren(zeile) ? (
            <Button
              disabled={laeuft}
              onClick={() => statusAendern(zeile)}
            >
              {zeile.aktiv ? "Sperren" : "Reaktivieren"}
            </Button>
          ) : (
            <span style={SCHRIFT.neben}>
              {zeile.ersetztText ? `ersetzt am ${zeile.ersetztText}` : "dauerhaft gesperrt"}
            </span>
          )}
        </Flex>
      ),
    },
  ];

  // Was WIRKLICH in der Tabelle steht: Suche UND Spaltenfilter. antd wendet
  // dieselben Praedikate danach noch einmal an — beide Schritte sind idempotent.
  const angezeigt = wendeFilterAn(gefiltert, spalten, spaltenFilter);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Code, Ort, Bezeichnung oder Ziel suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
      </Flex>

      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}

      {neuerCode ? (
        <Alert
          type="success"
          showIcon={false}
          title={`Neuer Code für ${neuerCode.ort}: ${neuerCode.code}`}
          description="Die Ortskarte muss jetzt neu gedruckt werden — Verwaltung → Ortsetiketten."
          style={{ marginBlockEnd: SPACE.md }}
          data-testid="lb-token-neuer-code"
        />
      ) : null}

      <Datentabelle<TokenAnzeigeZeile>
        rowKey="id"
        aria-label="Zugangs-Codes"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{
          emptyText: hatFilter
            ? "Kein Code passt zu Suche und Filter."
            : "Noch keine Codes. Öffne Verwaltung → Ortsetiketten — dort entstehen sie.",
        }}
        columns={spalten}
      />
    </>
  );
}
