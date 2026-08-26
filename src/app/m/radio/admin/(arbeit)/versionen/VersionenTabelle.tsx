"use client";

// src/app/m/radio/admin/(arbeit)/versionen/VersionenTabelle.tsx
import { useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, Tooltip, type TableColumnType } from "antd";
import type { VersionZeile } from "../../../_lib/lesepfade/versionen";
import {
  versionLoeschenAction,
  versionZielSetzenAction,
  versionenSortierenAction,
} from "../../actions";
import s from "../../../_ui/verwaltung.module.css";

/**
 * INSEL 3 — DIE SOFTWAREVERSIONEN DER VERWALTUNG (`Spec:4505`, §5.12; Aufgabe V19),
 * 1:1 aus `radio-admin/client/src/features/settings/SoftwareVersionsPage.tsx:84-208`.
 *
 * ⛔ WARUM CLIENT — **Falle 9** (Bauform-Zulaessigkeitstafel Nr. 1, `CLAUDE.md`): vier der
 * fuenf Spalten fuehren eine `render`-Funktion (`SoftwareVersionsPage.tsx:89`, `:110`, `:116`,
 * `:139`). Eine `render`-Funktion, die in einer Server Component entstuende, ist eine
 * gewoehnliche Funktion — keine Server Action —, und React lehnt ab, sie ueber die RSC-Grenze
 * zu reichen (`Error: Functions cannot be passed directly to Client Components`). Dazu kommt
 * **Falle 1**: `Space.Compact` (`:117`) ist ein Compound-Zugriff und aus einer Server
 * Component HTTP 500. ⛔ UND DIE AKTIONSSPALTE FAENGT ZUSTAND EIN — `rows.length` (`:129`),
 * die drei laufenden Vorgaenge (`:122`, `:147`, `:167`) und die drei Handhaben. ⚠️ Weder
 * `typecheck` noch `lint` noch `build` sehen das, und jsdom kann es STRUKTURELL nicht sehen —
 * dort gibt es keine RSC-Grenze. Der Waechter ist der Playwright-Fall (`Spec:4881-4882`),
 * Fall 8 in `e2e/radio-verwaltung.spec.ts`, Eigentuemer Aufgabe V23.
 *
 * ⛔ DIE DREI ACTIONS WERDEN DIREKT IMPORTIERT, nicht als Prop gereicht
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`). ⛔ `versionAnlegenAction` steht
 * NICHT hier, sondern in `NeuVersion.tsx` — die vierte Action gehoert zum Anlegefeld.
 *
 * ⛔ JEDE ZEILE KOMMT VORFORMATIERT: kein `Date` und kein Rohzeitstempel
 * (Bauform-Zulaessigkeitstafel Nr. 7, `Spec:4536-4539`) — `angelegtText` entsteht im Lesepfad
 * (`_lib/lesepfade/versionen.ts`, `datumMitUhrzeit`), sonst entschieden Server und Browser an
 * der Tagesgrenze verschieden. ⛔ DER TYP KOMMT ALS `import type` IN EINER EIGENEN ANWEISUNG:
 * `_lib/lesepfade/versionen.ts` importiert `_db/client` und `_db/schema` als WERT und zoege
 * sonst `drizzle-orm` und `better-sqlite3` in den Browser (`_lib/csv/klassifizieren.ts:6-9`).
 *
 * ⛔ DIE FUENF `size="small"` DES BESTANDS ENTFALLEN ERSATZLOS (`:119`, `:126`, `:145`, `:155`,
 * `:167`) — **Falle 4**: die Verwaltung laeuft in `FullShell` mit `controlHeight: 44`
 * (`src/core/theme/theme.ts:207-209`), auch auf dem Telefon. Platz schafft
 * `scroll={{ x: "max-content" }}`.
 *
 * ⚠️ ZWEI BENANNTE ABWEICHUNGEN, BEIDE AUS DER HAUSFORM:
 *   * ⛔ KEINE ZEICHEN AN DEN VIER KNOEPFEN (`FiArrowUp`, `FiArrowDown`, `FiCheck`, `FiTrash2`;
 *     `:120`, `:127`, `:146`, `:155`, `:167`) — ⛔ UND AUCH NICHT AN DER ZIEL-MARKE: der Bestand
 *     traegt dort `FiTarget` (`:93`, `<Tag color="green" icon={<FiTarget aria-hidden />}>`).
 *     Es ist die FUENFTE Zeichenstelle der Tabelle, sie ist DEKORATIV (`aria-hidden`), und die
 *     Beschriftung „Ziel" traegt die Aussage allein. `_ui/ikonen.tsx` ist die EINE Zeichenquelle des
 *     Moduls (Entscheidung E-V7, NS-A8b) und auf zwoelf Namen festgenagelt
 *     (`_ui/ikonen.test.tsx:108`); ein dreizehnter gehoerte in eine Aufgabe, die jene Datei
 *     fuehrt, und ein `react-icons`-Import waere Falle 7. Die Beschriftungen tragen die
 *     Aussage allein — dieselbe Wahl und derselbe Grund wie in `geraete/GeraeteTabelle.tsx`
 *     und `software/UpdateSuche.tsx`. ⚠️ Die zwei Reihenfolge-Knoepfe des Bestands sind reine
 *     Zeichenknoepfe mit `aria-label` (`:121`, `:128`); hier steht dasselbe Wort SICHTBAR,
 *     sonst waeren sie leer.
 *   * ⛔ `color="success"` STATT `color="green"` an den zwei Ziel-Marken (`:93`, `:142`): das
 *     Modul benennt seine Toene semantisch (`GeraeteTabelle.tsx:154` `color="warning"`,
 *     `AusleihenTabelle.tsx:97` `color="processing"`). Es ist derselbe gruene Ton aus antds
 *     Satz und ⛔ ausdruecklich KEIN zweiter Hexsatz, den NS-A8b verboete
 *     (`_lib/status.ts:125`).
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`). Damit entfallen „Zielversion gesetzt"
 * (`:46`) und „Version gelöscht" (`:55`) als benannte Abweichung; die FEHLERtexte kommen aus
 * `admin/actions.ts` und stehen am Ort der Aktion.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER FLAECHE, in EINER benannten Liste und nicht inline verstreut
 * (1:1-Tafel Abschnitt E, `Spec:4815-4832`; ⛔ die Global Constraint steht in
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`: „Sie liegen in EINER benannten
 * Konstantenliste je Flaeche"). ⚠️ Sie tragen ihre Umlaute und ihren Gedankenstrich — es sind
 * Bildschirmtexte, keine Bezeichner.
 *
 * ⛔ NICHT EXPORTIERT (REVIEW-V17, Fund F4): es gibt keinen Verbraucher — der Test schreibt die
 * Texte bewusst aus, ein Import waere tautologisch. Dieselbe Form und derselbe Grund wie in
 * `software/UpdateSuche.tsx:91` (`UPDATE_TEXTE`) und `import/ImportAssistent.tsx:113`
 * (`IMPORT_TEXTE`).
 *
 * ⚠️ `NeuVersion.tsx` FUEHRT SEINE EIGENE LISTE, und das ist kein zweiter Ort fuer denselben
 * Satz: die zwei Dateien teilen keinen Zustand und waeren nach E-V6s eigenem Kriterium zwei
 * Inseln (Vorabscan-Fund **F22**, `.superpowers/sdd/planteil4/VORABSCAN.md:520-537`). Eine
 * gemeinsame Liste brauchte einen Export ohne zweiten Verbraucher — gegen REVIEW-V17s Fund F4
 * — oder eine dritte Datei, die die Dateiliste dieses Auftrags nicht fuehrt. ⛔ KEIN SATZ STEHT
 * ZWEIMAL; jeder hat genau einen Ort. Der Waechter darueber ist der Fall „die Bildschirmtexte
 * stehen in EINER benannten Liste je Datei" in `VersionenTabelle.test.tsx`.
 */
const VERSIONEN_TEXTE = {
  /** ⛔ Die fuenf Spaltenueberschriften, woertlich `SoftwareVersionsPage.tsx:86`, `:101`,
   *  `:107`, `:113`, `:136` — und in DIESER Reihenfolge (1:1-Pflicht). */
  spalteVersion: "Version",
  spalteGeraete: "Geräte",
  spalteAngelegt: "Angelegt",
  spalteReihenfolge: "Reihenfolge",
  spalteAktionen: "Aktionen",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:94` — die Marke an der Zielversion. */
  zielMarke: "Ziel",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:121` / `:128`. Dort sind es `aria-label`, hier
   *  stehen sie SICHTBAR am Knopf: ohne Zeichen (E-V7) waere er sonst leer. */
  nachOben: "Nach oben",
  nachUnten: "Nach unten",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:142`. */
  aktuellesZiel: "aktuelles Ziel",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:150`. */
  alsZiel: "Als Ziel",
  /**
   * ⛔ DER SATZ DER 1:1-TAFEL ABSCHNITT E, woertlich `SoftwareVersionsPage.tsx:154`
   * (`briefs/KOPF.md:1327`). Er ist der EINZIGE Grund, den ein Bedienender fuer den toten
   * Loeschknopf bekommt — deshalb steht er hier und nicht im JSX, wo ihn die naechste
   * Formulierungsaenderung uebersaehe.
   */
  loeschSperre: (anzahl: number) => `Wird von ${anzahl} Gerät(en) genutzt — erst umstellen`,
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:156`/`:168` (Knopf) UND `:162` (`okText`) — EIN
   *  Wort, ein Ort. */
  loeschen: "Löschen",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:161`. */
  loeschFrage: "Version wirklich löschen?",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:164`. */
  abbrechen: "Abbrechen",
  /**
   * Der zugaengliche Name der Tabelle — eine Zutat der Suite, der Bestand fuehrt ihn nicht.
   * ⚠️ WORTGLEICH mit der Ueberschrift der Seite (`page.tsx`, `SEITEN_TEXTE.titel`), und das
   * ist die EINE benannte Ausnahme von „kein Satz steht zweimal": die Ueberschrift gehoert der
   * Seite, der zugaengliche Name der Tabelle, und ein anderes Wort machte fuer eine
   * Vorlesesoftware aus einer Flaeche zwei Themen.
   */
  tabelleName: "Softwareversionen",
  /** Die leere Liste — eine Zutat der Suite (Hausform `ausleihen/AusleihenTabelle.tsx:359-360`,
   *  `geraete/GeraeteTabelle.tsx:481-482`); der Bestand zeigt antds englisches „No data". */
  leer: "Keine Version angelegt",
} as const;

export type VersionenTabelleProps = {
  /** ⛔ Der ganze Vertrag, `Spec:4505`. Alles darin ist skalar und vorformatiert. */
  zeilen: VersionZeile[];
};

export function VersionenTabelle({ zeilen }: VersionenTabelleProps) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [sortiert, setSortiert] = useState(false);
  const [zielt, setZielt] = useState(false);
  const [loescht, setLoescht] = useState(false);

  /**
   * ⛔ VERSCHIEBEN TAUSCHT MIT DEM NACHBARN UND SCHREIBT DIE GANZE REIHENFOLGE — 1:1
   * `SoftwareVersionsPage.tsx:68-82`, samt des Bereichsschutzes (`:70`). ⛔ DAS IST KEINE
   * FORMSACHE: `versionenSortierenAction` vergibt `ids.length - index` (`admin/actions.ts`,
   * 1:1 `softwareVersionRepo.ts:131`) — bekaeme sie nur die eine verschobene Id, setzte sie
   * deren `sortOrder` auf 1 und liesse alle anderen stehen.
   */
  const verschieben = async (index: number, richtung: -1 | 1) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= zeilen.length) return;
    const ids = zeilen.map((z) => z.id);
    const a = ids[index];
    const b = ids[ziel];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[ziel] = a;
    setSortiert(true);
    setFehler(null);
    const ergebnis = await versionenSortierenAction(ids);
    setSortiert(false);
    if (!ergebnis.ok) setFehler(ergebnis.fehler);
  };

  const alsZiel = async (id: string) => {
    setZielt(true);
    setFehler(null);
    const ergebnis = await versionZielSetzenAction(id);
    setZielt(false);
    if (!ergebnis.ok) setFehler(ergebnis.fehler);
  };

  const loeschen = async (id: string) => {
    setLoescht(true);
    setFehler(null);
    const ergebnis = await versionLoeschenAction(id);
    setLoescht(false);
    if (!ergebnis.ok) setFehler(ergebnis.fehler);
  };

  /**
   * DIE FUENF SPALTEN, 1:1 AUS `SoftwareVersionsPage.tsx:84-175` — in dieser Reihenfolge.
   *
   * ⛔ SIE ENTSTEHEN IM RUMPF UND NICHT AUF MODULEBENE: die Aktions- und die
   * Reihenfolgespalte fangen `zeilen.length` und die drei laufenden Vorgaenge ein. ⛔ UND SIE
   * DUERFEN NICHT NACH `_lib/` (Bauform-Zulaessigkeitstafel Nr. 2, `Spec:4512-4521`) — dort
   * waeren sie Falle 6 UND Falle 9 zugleich.
   *
   * ⛔ KEINE TRAEGT EINEN `sorter`. Die Reihenfolge IST die Anzeigeordnung
   * (`desc(sortOrder)`, dann `desc(createdAt)`, `_lib/lesepfade/versionen.ts`), und sie wird
   * ueber die zwei Knoepfe geschrieben — ein antd-internes Sortieren daneben zeigte eine
   * andere Ordnung als die, die gespeichert ist.
   */
  const spalten: TableColumnType<VersionZeile>[] = [
    {
      title: VERSIONEN_TEXTE.spalteVersion,
      key: "wert",
      /* ⛔ FETT, WENN ZIEL — 1:1 `:91` (`<Typography.Text strong={item.isTarget}>`). Das
         antd-Bauteil weicht einem schlichten `<strong>`, wie ueberall in diesem Modul. */
      render: (_: unknown, z: VersionZeile) => (
        <Space>
          {z.isTarget ? (
            <strong data-rolle="radio-version-wert">{z.wert}</strong>
          ) : (
            <span data-rolle="radio-version-wert">{z.wert}</span>
          )}
          {z.isTarget && (
            <Tag color="success" data-rolle="radio-version-zielmarke">
              {VERSIONEN_TEXTE.zielMarke}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: VERSIONEN_TEXTE.spalteGeraete,
      key: "deviceCount",
      /* ⛔ RECHTSBUENDIG — 1:1 `:104`. Zahlen einer Spalte vergleicht man an der Einerstelle. */
      align: "right",
      render: (_: unknown, z: VersionZeile) => (
        <span data-rolle="radio-version-anzahl">{z.deviceCount}</span>
      ),
    },
    {
      title: VERSIONEN_TEXTE.spalteAngelegt,
      key: "angelegt",
      render: (_: unknown, z: VersionZeile) => (
        <span data-rolle="radio-version-angelegt">{z.angelegtText}</span>
      ),
    },
    {
      title: VERSIONEN_TEXTE.spalteReihenfolge,
      key: "reihenfolge",
      align: "center",
      /*
       * ⛔ AM RAND DEAKTIVIERT — 1:1 `:122` (`index === 0`) und `:129`
       * (`index === rows.length - 1`), jeweils UND `reorder.isPending`. Ohne die Sperre faellt
       * ein Griff auf „Nach oben" in der ersten Zeile still am Bereichsschutz heraus, die
       * Flaeche quittiert nichts, und der Bedienende haelt die Reihenfolge fuer gespeichert.
       */
      render: (_: unknown, _z: VersionZeile, index: number) => (
        <Space.Compact>
          <Button
            disabled={index === 0 || sortiert}
            onClick={() => verschieben(index, -1)}
            data-rolle="radio-version-hoch"
          >
            {VERSIONEN_TEXTE.nachOben}
          </Button>
          <Button
            disabled={index === zeilen.length - 1 || sortiert}
            onClick={() => verschieben(index, 1)}
            data-rolle="radio-version-runter"
          >
            {VERSIONEN_TEXTE.nachUnten}
          </Button>
        </Space.Compact>
      ),
    },
    {
      title: VERSIONEN_TEXTE.spalteAktionen,
      key: "aktionen",
      align: "right",
      /*
       * ⛔ ENTWEDER DIE MARKE ODER DER KNOPF, NIE BEIDES — 1:1 `:141-152`, ein Ternaer. Ein
       * „Als Ziel" an der Zeile, die bereits Ziel IST, riefe `versionZielSetzenAction` mit
       * derselben Id: der erste `UPDATE` traefe, der zweite raeumte alle anderen ab, und die
       * Flaeche saehe unveraendert aus. Der Fehler waere unsichtbar.
       *
       * ⛔ LOESCHEN IST GESPERRT, SOLANGE `deviceCount > 0` — 1:1 `:153-158`, mit dem
       * Hinweistext am Knopf. Der Alt-Kommentar gibt den Grund
       * (`softwareVersionRepo.ts:98-101`): „the admin must reassign those devices first, so
       * deletion can never orphan a device's version string." ⚠️ Die Sperre steht ausserdem
       * SERVERSEITIG (`admin/actions.ts`, `versionLoeschenAction`) — das hier spart den
       * Rundlauf und nennt den Grund, es ist nicht die Zusage.
       */
      render: (_: unknown, z: VersionZeile) => (
        <Space>
          {z.isTarget ? (
            <Tag color="success" data-rolle="radio-version-aktuellesziel">
              {VERSIONEN_TEXTE.aktuellesZiel}
            </Tag>
          ) : (
            <Button
              loading={zielt}
              onClick={() => alsZiel(z.id)}
              data-rolle="radio-version-alsziel"
            >
              {VERSIONEN_TEXTE.alsZiel}
            </Button>
          )}
          {z.deviceCount > 0 ? (
            /*
             * ⛔ **DIE `<span>`-HUELLE IST EINE GEMESSENE ABWEICHUNG UND KEIN SCHMUCK.** Der
             * Bestand haengt den `Tooltip` DIREKT an den deaktivierten Knopf (`:154-158`);
             * unter antd 5 zog das Bauteil dafuer selbst eine Huelle ein
             * (`getDisabledCompatibleChildren`). ⛔ ANTD 6 FUEHRT DIESE HILFE NICHT MEHR —
             * gemessen am 2026-08-26 an `antd@6.5.3` (`package.json:25`) mit einer Sonde in
             * jsdom: `Tooltip` direkt am `disabled`-Knopf ueberfahren → KEIN
             * `[role="tooltip"]`; dieselbe Sonde mit einer `<span>`-Huelle → der Text steht
             * da. Der Grund liegt in React: an einem deaktivierten Formularelement wird
             * `onMouseEnter` nicht ausgeliefert.
             * ⛔ OHNE DIE HUELLE WAERE DIE ZWEITE HAELFTE DER ZUSICHERUNG UNERFUELLBAR —
             * `Spec:4861-4862` verlangt „der Knopf ist deaktiviert UND der Text steht da", und
             * ein Knopf ohne Grund laesst den Bedienenden die Geraete nicht umstellen.
             */
            <Tooltip title={VERSIONEN_TEXTE.loeschSperre(z.deviceCount)}>
              <span data-rolle="radio-version-loeschen-huelle">
                <Button danger disabled data-rolle="radio-version-loeschen">
                  {VERSIONEN_TEXTE.loeschen}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Popconfirm
              title={VERSIONEN_TEXTE.loeschFrage}
              okText={VERSIONEN_TEXTE.loeschen}
              okButtonProps={{ danger: true }}
              cancelText={VERSIONEN_TEXTE.abbrechen}
              onConfirm={() => loeschen(z.id)}
            >
              <Button danger loading={loescht} data-rolle="radio-version-loeschen">
                {VERSIONEN_TEXTE.loeschen}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-rolle="radio-versionen-flaeche">
      <Table<VersionZeile>
        rowKey="id"
        columns={spalten}
        dataSource={zeilen}
        /*
          ⛔ `pagination={false}` — 1:1 `:206`. Der Bestand blaettert hier nicht, und die Liste
          ist die Anzeigeordnung selbst: eine Blaetterung darueber schnitte die Reihenfolge in
          Seiten, deren Nachbarn man nicht mehr tauschen kann.
        */
        pagination={false}
        /* ⛔ `x: "max-content"` STATT `x: true` (`:207`) — die staerkere Form
           (`aufgaben/_ui/RoutinenTabelle.tsx:34-35`); ohne `scroll` bricht eine antd-Tabelle
           auf 390 px. */
        scroll={{ x: "max-content" }}
        aria-label={VERSIONEN_TEXTE.tabelleName}
        locale={{ emptyText: VERSIONEN_TEXTE.leer }}
      />
      {fehler !== null && (
        /*
          ⛔ KEIN `Alert type="error"` UND KEIN ROTTON: `colorError === colorPrimary`
          (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die
          Primaeraktion (Falle 3). Dieselbe Form wie `geraete/[id]/GeraetLoeschen.tsx`.
        */
        <p className={s.dialogFehler} role="alert" data-rolle="radio-versionen-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}
