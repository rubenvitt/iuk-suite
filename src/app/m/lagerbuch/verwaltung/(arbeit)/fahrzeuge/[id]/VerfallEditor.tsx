"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, DatePicker, Dropdown, Flex, Select, type TableProps } from "antd";
import {
  Kartentabelle,
  nachDatum,
  nachText,
  nachZahl,
  TabellenVollhoehe,
  trifftWert,
  useEntprellt,
  werteAlsFilter,
} from "@/core/tabelle";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { verfallSetzen } from "../../../../_actions/lagerortVerfall";
import { fmtVerfall, type AmpelTon } from "../../../../_lib/format";
import type { ChargeZeile } from "../../../../_lib/lesepfade/artikel";
import { inDerEinheit, type Einheitenart } from "../../../../_lib/konstanten";
import { SCHRIFT } from "../../../../_lib/schrift";
import { AussondernDialog } from "./AussondernDialog";
import { RuecklaufDialog, type RuecklaufZiel } from "./RuecklaufDialog";
import { Chip } from "../../../../_ui/Chip";
import { Ikone } from "../../../../_ui/ikonen";
import { monatAusPicker } from "../../../../_ui/monat";
import { Suchfeld } from "../../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../../_ui/Trefferanzeige";
import {
  dringlichkeit,
  trifftStatus,
  unterSoll,
  zaehleStatus,
} from "./bestandStatus";
import { STATUS_FILTER, STATUS_TEXT, statusAus } from "./reiter";
import { useAdressParameter } from "./useAdressParameter";
import { useVerfallStand } from "./useVerfallStand";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";

const VERFALL_FEHLER = "Verfall konnte nicht gespeichert werden.";

export type VerfallAnzeigeZeile = {
  artikelId: string;
  artikelName: string;
  fachText: string;
  verfall: string | null;
  statusTon: AmpelTon | null;
  statusText: string | null;
  /**
   * IDA-232 — aus der QUELLE (`verfallFuerLagerort`), nicht aus dem Ton
   * abgeleitet: eine rote Meldung ist nicht immer abgelaufen (DRK-340). Ohne
   * das Feld könnte die Liste „abgelaufen" nicht so filtern, wie die Kachel
   * darüber zählt.
   */
  abgelaufen: boolean;
  /** Bestand des Artikels AN DIESEM Lagerort — die Obergrenze des Aussonderns. */
  bestand: number;
  /** IDA-232 — Summe der aktiven Soll-Positionen des Artikels (alle Fächer). */
  soll: number;
  einheit: string;
  /** Chargen mit Rest AN DIESEM Lagerort, FEFO sortiert. Leer ist zulässig:
   *  am Fahrzeug ist die Charge oft geraten (§5.3.3), die Auswahl daher optional. */
  chargen: ChargeZeile[];
};

/**
 * ⚠️ JEDE SPALTE TRÄGT EINE ZAHL, WEIL DIE LISTE AB `VIRTUELL_AB_ZEILEN`
 * VIRTUELL SCROLLT (Falle 14): ohne numerische Breiten fiele die Tabelle dort
 * auf ein Pixel zusammen, `Datentabelle` schaltet die Virtualisierung dann
 * lieber ab. Darunter misst die Tabelle wie bisher nach Inhalt.
 */
const BREITE = {
  artikel: 260,
  fach: 170,
  ist: 130,
  verfall: 150,
  status: 220,
  aktion: 90,
} as const;

/** Die Liste ordnet nach Dringlichkeit, danach nach Fach und Name. */
function geordnet(zeilen: readonly VerfallAnzeigeZeile[]): VerfallAnzeigeZeile[] {
  return [...zeilen].sort((a, b) =>
    dringlichkeit(a) - dringlichkeit(b)
    || a.fachText.localeCompare(b.fachText, "de")
    || a.artikelName.localeCompare(b.artikelName, "de"));
}

function sucheTrifft(zeile: VerfallAnzeigeZeile, suche: string): boolean {
  const muster = suche.trim().toLocaleLowerCase("de");
  if (!muster) return true;
  return `${zeile.artikelName} ${zeile.fachText}`.toLocaleLowerCase("de").includes(muster);
}

/**
 * DAS VERFALLSDATUM IST EIN TEXT, BIS MAN ES ANTIPPT (IDA-232).
 *
 * Vorher stand in jeder Zeile ein offener Monatswähler — bei zweihundert
 * Artikeln zweihundert Eingabefelder, von denen im Alltag keins gebraucht wird.
 * Jetzt zeigt die Zelle das Datum im Modulformat („03/27"); erst ein Tippen
 * öffnet den Wähler, und eine Wahl oder ein Klick daneben schließt ihn wieder.
 *
 * ⚠️ DER WERT KOMMT AUS `verfallVon`, NICHT AUS DER PROP — derselbe eine Stand
 * wie vorher (DRK-345); diese Zelle zeigt ihn nur anders an.
 */
function VerfallZelle({
  artikelName,
  monat,
  gesperrt,
  onWahl,
}: {
  artikelName: string;
  monat: string | null;
  gesperrt: boolean;
  onWahl: (wert: Parameters<typeof monatAusPicker>[0]) => void;
}) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const warOffen = useRef(false);

  /*
   * Der Fokus geht nach dem Schließen auf den Knopf zurück — aber nur, wenn er
   * verloren ist (Muster aus Falle 24): wer daneben geklickt hat, behält sein
   * neues Ziel.
   */
  useEffect(() => {
    if (warOffen.current && !offen) {
      const aktiv = document.activeElement;
      if (aktiv === null || aktiv === document.body) knopf.current?.focus();
    }
    warOffen.current = offen;
  }, [offen]);

  if (offen) {
    return (
      // KEIN size (Falle 4) — 44px Arbeitsdichte, wie der Knopf davor.
      <DatePicker
        open
        autoFocus
        picker="month"
        popupAlign={WAEHLER_IM_BILD}
        format="YYYY-MM"
        allowClear
        disabled={gesperrt}
        value={monat ? dayjs(`${monat}-01`) : null}
        onChange={(wert) => {
          setOffen(false);
          onWahl(wert);
        }}
        onOpenChange={(auf) => {
          if (!auf) setOffen(false);
        }}
        aria-label={`Verfall ${artikelName}`}
        style={{ width: BREITE.verfall - 24 }}
      />
    );
  }

  return (
    <Button
      ref={knopf}
      type="text"
      disabled={gesperrt}
      onClick={() => setOffen(true)}
      icon={<Ikone name="stift" groesse={14} />}
      iconPlacement="end"
      aria-label={`Verfall ${artikelName} ändern`}
      data-rolle="verfall"
    >
      {monat ? fmtVerfall(monat) : "eintragen"}
    </Button>
  );
}

type Zeilenaktion = { art: "aussondern" | "ruecklauf"; artikelId: string };

/**
 * DIE BESTANDSLISTE DES EINHEITENBLATTS — Bestand UND Verfall je Artikel in
 * einer Zeile (IDA-232; vorher „Verfall im Fahrzeug" ganz unten auf der Seite).
 *
 * Auffälliges steht oben (`dringlichkeit`): abgelaufen, läuft ab, unter Soll.
 * Der Statusfilter steht in der Adresse (`?status=`), damit die Kacheln im Kopf
 * genau diese Auswahl öffnen können.
 */
export function VerfallEditor({
  lagerortId,
  eintraege,
  einheitenart,
  ruecklaufZiele,
}: {
  lagerortId: string;
  eintraege: VerfallAnzeigeZeile[];
  /** DRK-366 — wohin der Rücklauf bucht: Handlager-Wurzel plus aktive Schränke. */
  ruecklaufZiele: RuecklaufZiel[];
  /**
   * DRK-309 — die Tabelle heisst nach der Art der Einheit, deren Verfall sie
   * zeigt. ⚠️ Fuer ein Fahrzeug bleibt der Name WORTGLEICH („im Fahrzeug");
   * art-bewusst heisst hier nicht „anders", sondern „richtig, sobald es keins
   * ist".
   */
  einheitenart: Einheitenart | null;
}) {
  /**
   * ⚠️ DER EINE STAND (DRK-345). Beide Schreibwege dieser Tabelle laufen durch
   * `schreibe`, und nur dort faellt ein Wert in den Stand — naemlich der, den
   * die Antwort meldet. Die Entscheidung dahinter steht in
   * `_lib/verfallStand.ts`, die Mechanik in `useVerfallStand.ts`; hier gibt es
   * bewusst keinen Setzer mehr, den eine zweite Stelle bedienen koennte.
   */
  const { verfallVon, schreibe, laeuft } = useVerfallStand();
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  const [statusRoh, setzeStatus] = useAdressParameter("status", "ersetzen");
  const status = statusAus(statusRoh);
  const [aktion, setAktion] = useState<Zeilenaktion | null>(null);

  const ordnung = useMemo(() => geordnet(eintraege), [eintraege]);
  const zahlen = useMemo(() => zaehleStatus(eintraege), [eintraege]);
  const gefiltert = useMemo(
    () => ordnung.filter((zeile) => trifftStatus(zeile, status) && sucheTrifft(zeile, sucheNachlauf)),
    [ordnung, status, sucheNachlauf],
  );
  const hatFilter = status !== null || sucheNachlauf.trim() !== "";
  const gewaehlt = aktion ? eintraege.find((z) => z.artikelId === aktion.artikelId) ?? null : null;

  async function monatSetzen(
    eintrag: VerfallAnzeigeZeile,
    wert: Parameters<typeof monatAusPicker>[0],
  ) {
    const monat = monatAusPicker(wert) ?? "";
    // DER GEWAEHLTE MONAT BLEIBT AUCH IM FEHLERFALL STEHEN — absichtlich, und
    // `VerfallEditor.test.tsx` haelt es fest. Die Eingabe einer Person zu
    // verwerfen, weil das Speichern scheiterte, ist schlimmer als die
    // Statusspalte, die bis zum naechsten Laden den alten Stand nennt. Den
    // Widerspruch aufloest der Fehlersatz, nicht das Zuruecksetzen. Getragen
    // wird die Zusage von `standNachAntwort`, das nur bei `ok` schreibt.
    try {
      const ergebnis = await schreibe(
        eintrag.artikelId,
        // Die Vorwegnahme — ohne sie spraenge das Feld bis zur Antwort zurueck.
        monat || null,
        () => verfallSetzen({
          lagerortId,
          artikelId: eintrag.artikelId,
          verfall: monat,
        }),
      );
      // Der Satz aus der Action statt der Modulkonstante: nur er
      // unterscheidet „Artikel steht an diesem Lagerort nicht im Soll." von
      // einem Schreibfehler. Im `catch` bleibt die Konstante — dort ist
      // `e.message` in Produktion Framework-Englisch.
      setFehler(ergebnis.ok ? null : ergebnis.fehler);
    } catch {
      setFehler(VERFALL_FEHLER);
    }
  }

  /*
   * DIE ZELLEN STEHEN EINMAL DA und werden von der Tabelle UND von der Karte
   * auf dem Telefon benutzt — zwei Fassungen desselben Knopfes liefen beim
   * nächsten Anfassen auseinander.
   */
  const istSoll = (eintrag: VerfallAnzeigeZeile) => (
    <span style={{ whiteSpace: "nowrap" }}>
      <span data-rolle="ist" style={SCHRIFT.zahl}>{eintrag.bestand}</span>
      <span style={SCHRIFT.neben}>{` / ${eintrag.soll} ${eintrag.einheit}`}</span>
    </span>
  );

  const verfallZelle = (eintrag: VerfallAnzeigeZeile) => (
    <VerfallZelle
      artikelName={eintrag.artikelName}
      monat={verfallVon(eintrag)}
      gesperrt={laeuft}
      onWahl={(wert) => monatSetzen(eintrag, wert)}
    />
  );

  const statusChips = (eintrag: VerfallAnzeigeZeile) => (
    // 6 liegt nicht auf der SPACE-Skala — enger Chip-Zeilenabstand wie in
    // der Fahrzeugliste.
    <Flex gap={6} wrap>
      {eintrag.statusText && eintrag.statusTon ? (
        <Chip ton={eintrag.statusTon}>{eintrag.statusText}</Chip>
      ) : (
        <Chip ton="grau">nicht erfasst</Chip>
      )}
      {unterSoll(eintrag) ? (
        // Dasselbe Wort und derselbe Ton wie in der Fahrzeugliste.
        <Chip ton="rot" zeichen="warnung">unter Soll</Chip>
      ) : null}
    </Flex>
  );

  /*
   * ⚠️ DIE AKTIONEN STEHEN IN DER ZEILE, NICHT ANDERSWO: „das ist
   * abgelaufen" und „das kommt raus" sind derselbe Handgriff, und eine
   * Aktion zwei Flächen entfernt vom Befund wird nicht benutzt. Seit IDA-232
   * hinter EINEM Knopf — zwei beschriftete Knöpfe je Zeile machten die
   * Liste breiter als jeden Telefonschirm.
   *
   * Die Sperren sind dieselben wie an den alten Knöpfen: Aussondern nur mit
   * Bestand, Zurückbuchen nur mit Charge und Ziel, beides nicht, solange
   * ein Schreibweg auf denselben Stand läuft (DRK-345).
   */
  const aktionsMenue = (eintrag: VerfallAnzeigeZeile) => (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "aussondern",
            icon: <Ikone name="kreuz" groesse={14} />,
            label: "Aussondern",
            disabled: laeuft || eintrag.bestand <= 0,
          },
          {
            key: "ruecklauf",
            icon: <Ikone name="pfeil-links" groesse={14} />,
            label: "Zurück ins Handlager",
            disabled: laeuft || eintrag.chargen.length === 0 || ruecklaufZiele.length === 0,
          },
        ],
        onClick: ({ key }) => setAktion({
          art: key as Zeilenaktion["art"],
          artikelId: eintrag.artikelId,
        }),
      }}
    >
      <Button
        aria-label={`Aktionen für ${eintrag.artikelName}`}
        icon={<Icons8Ikone name="more" groesse={18} />}
      />
    </Dropdown>
  );

  const spalten: TableProps<VerfallAnzeigeZeile>["columns"] = [
    {
      title: "Artikel",
      dataIndex: "artikelName",
      key: "artikel",
      width: BREITE.artikel,
      sorter: nachText<VerfallAnzeigeZeile>((eintrag) => eintrag.artikelName),
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: "Fach",
      dataIndex: "fachText",
      key: "fach",
      width: BREITE.fach,
      sorter: nachText<VerfallAnzeigeZeile>((eintrag) => eintrag.fachText),
      filters: werteAlsFilter(eintraege, (eintrag) => eintrag.fachText),
      onFilter: trifftWert<VerfallAnzeigeZeile>((eintrag) => eintrag.fachText),
    },
    {
      // DER IST STEHT GROSS, DAS SOLL DANEBEN KLEIN (DRK-315): der Ist ist der
      // Befund, das Soll sein Maßstab. KEINE Farbe für die Abweichung — Rot
      // gehört nicht auf eine Datenfläche (Falle 3); „unter Soll" sagt der
      // Status daneben in Worten.
      title: "Ist / Soll",
      dataIndex: "bestand",
      key: "ist",
      width: BREITE.ist,
      align: "right",
      sorter: nachZahl<VerfallAnzeigeZeile>((eintrag) => eintrag.bestand - eintrag.soll),
      render: (_bestand: number, eintrag) => istSoll(eintrag),
    },
    {
      title: "Verfall",
      dataIndex: "verfall",
      key: "verfall",
      width: BREITE.verfall,
      // ⚠️ SORTIERT WIRD UEBER DAS FELD, NICHT UEBER DIE ANZEIGE. `verfall` ist
      // „YYYY-MM" und ordnet als Zeichenkette bereits richtig. Der Spiegel
      // bleibt aussen vor: sortiert wird der gespeicherte Stand, sonst sprang
      // die Zeile waehrend der Wahl weg.
      sorter: nachDatum<VerfallAnzeigeZeile>((eintrag) => eintrag.verfall),
      render: (_verfall: string | null, eintrag) => verfallZelle(eintrag),
    },
    {
      title: "Status",
      dataIndex: "statusText",
      key: "status",
      width: BREITE.status,
      sorter: nachZahl<VerfallAnzeigeZeile>(dringlichkeit),
      render: (_statusText: string | null, eintrag) => statusChips(eintrag),
    },
    {
      // Begründung bei `aktionsMenue`.
      title: "Aktion",
      key: "aktion",
      width: BREITE.aktion,
      render: (_wert: unknown, eintrag) => aktionsMenue(eintrag),
    },
  ];

  const beschriftung = `Bestand und Verfall ${inDerEinheit(einheitenart)}`;

  return (
    /**
     * ⚠️ `minmax(0, 1fr)` STATT DER IMPLIZITEN `auto`-SPALTE (DRK-343). Eine
     * `auto`-Spalte waechst auf die MINDESTBREITE ihres Inhalts, und die ist bei
     * einer Tabelle die Summe der Spalten-Mindestbreiten; das `scroll.x` der
     * `Datentabelle` kaeme dann gar nicht zum Zug. Gemessen auf dem
     * Fahrzeugblatt: bei 375px lief das Dokument um 210px waagerecht ueber.
     * Nur ein echter Browser kennt die Zahl;
     * `e2e/lagerbuch-fahrzeugblatt-mobil.spec.ts` misst sie.
     */
    <div
      data-rolle="bestandsliste"
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      <TabellenVollhoehe
        mindestens={420}
        kopf={(
          <div style={{ display: "grid", gap: SPACE.md, marginBlockEnd: SPACE.md }}>
            <Flex gap={SPACE.md} wrap align="center">
              <Suchfeld
                wert={suche}
                onWert={setSuche}
                platzhalter="Artikel oder Fach suchen…"
              />
              <Select<string>
                aria-label="Status filtern"
                value={status ?? "alle"}
                onChange={(wert) => setzeStatus(wert === "alle" ? null : wert)}
                style={{ minWidth: 200 }}
                virtual={false}
                options={[
                  { value: "alle", label: `alle · ${eintraege.length}` },
                  ...STATUS_FILTER.map((schluessel) => ({
                    value: schluessel,
                    label: `${STATUS_TEXT[schluessel]} · ${zahlen[schluessel]}`,
                  })),
                ]}
              />
              <Trefferanzeige gezeigt={gefiltert.length} gesamt={eintraege.length} />
            </Flex>
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
          </div>
        )}
      >
        {(koerperHoehe) => (
          <Kartentabelle<VerfallAnzeigeZeile>
            rowKey="artikelId"
            virtuell={koerperHoehe}
            aria-label={beschriftung}
            dataSource={gefiltert}
            columns={spalten}
            /*
              ⚠️ EINE EIGENE, KNAPPE KARTE statt der aus den Spalten
              abgeleiteten: die hätte fünf Merkmale untereinander und das Menü
              in einer eigenen Zeile darunter — rund 275px je Artikel, bei
              einem großen Fahrzeug über 200 Karten. So steht das Menü neben
              dem Namen, Ist/Soll und Verfall teilen sich eine Zeile.
            */
            karte={(eintrag) => (
              <article
                style={{
                  border: "1px solid var(--iuk-linie)",
                  borderRadius: 6,
                  padding: SPACE.md,
                  display: "grid",
                  gap: SPACE.xs,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: SPACE.sm }}>
                  <div style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong>{eintrag.artikelName}</strong>
                    <div style={SCHRIFT.neben}>{eintrag.fachText}</div>
                  </div>
                  {aktionsMenue(eintrag)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.md }}>
                  {istSoll(eintrag)}
                  {verfallZelle(eintrag)}
                </div>
                {statusChips(eintrag)}
              </article>
            )}
            kartenHoehe={150}
            leer={{
              nichts: "Keine aktive Soll-Position. Bestand und Verfall werden je Soll-Artikel gepflegt.",
              gefiltert: "Kein Artikel passt zu Suche und Filter.",
              // Suche und Statusfilter sieht dieses Bauteil nicht — ohne den
              // Wink hielte es eine leergefilterte Liste für ein leeres Soll.
              aktiv: hatFilter || undefined,
            }}
          />
        )}
      </TabellenVollhoehe>
      {/*
        EIN DIALOG FÜR ALLE ZEILEN, geöffnet aus dem Zeilenmenü. `key` je Zeile:
        die Formularinstanz gehört der Dialogkomponente (Begründung dort), und ein
        Wechsel der Zeile soll mit leeren Feldern beginnen.
      */}
      {aktion?.art === "aussondern" && gewaehlt ? (
        <AussondernDialog
          key={`${aktion.art}-${gewaehlt.artikelId}`}
          offen
          onSchliessen={() => setAktion(null)}
          lagerortId={lagerortId}
          artikelId={gewaehlt.artikelId}
          artikelName={gewaehlt.artikelName}
          einheit={gewaehlt.einheit}
          bestand={gewaehlt.bestand}
          chargen={gewaehlt.chargen}
          // ⚠️ `verfallVon` UND NICHT `gewaehlt.verfall` — derselbe Zugriff, den
          // die Verfallszelle nutzt. Bis die Auffrischung nach einer Wahl zurück
          // ist, ist die Prop der ÄLTERE Stand; mit ihr stünde im Dialog der alte
          // Monat, und eine Teilaussonderung schriebe ihn über den gerade
          // gespeicherten zurück.
          verfall={verfallVon(gewaehlt)}
          einheitenart={einheitenart}
          gesperrt={laeuft}
          /*
           * Der zweite Schreibweg auf demselben Wert — und er bekommt keinen
           * eigenen Rueckkanal, sondern denselben Trichter. KEINE Vorwegnahme
           * (`undefined`): der Dialog kennt sein Ergebnis nicht, ob die Angabe
           * entfaellt, entscheidet die Transaktion am verbleibenden Bestand.
           */
          schreibe={(aktionFn) => schreibe(gewaehlt.artikelId, undefined, aktionFn)}
        />
      ) : null}
      {aktion?.art === "ruecklauf" && gewaehlt ? (
        <RuecklaufDialog
          key={`${aktion.art}-${gewaehlt.artikelId}`}
          offen
          onSchliessen={() => setAktion(null)}
          fahrzeugId={lagerortId}
          artikelId={gewaehlt.artikelId}
          artikelName={gewaehlt.artikelName}
          einheit={gewaehlt.einheit}
          chargen={gewaehlt.chargen}
          ziele={ruecklaufZiele}
          einheitenart={einheitenart}
          gesperrt={laeuft}
          // Derselbe Trichter wie beim Aussondern und aus demselben Grund: ob
          // die Verfallsangabe fällt, entscheidet die Transaktion.
          schreibe={(aktionFn) => schreibe(gewaehlt.artikelId, undefined, aktionFn)}
        />
      ) : null}
    </div>
  );
}
