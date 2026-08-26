"use client";

// src/app/m/radio/admin/(arbeit)/zugaenge/CodeTabelle.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Popconfirm, Space, Table, Tag, type TableColumnType } from "antd";
import type { CodeZeile } from "../../../_lib/lesepfade/codes";
import { erstelleCode, setzeCodeAktiv } from "../../../_actions/codes";
import s from "../../../_ui/verwaltung.module.css";

/**
 * INSEL 8 — DIE ZUGANGSVERWALTUNG (`Spec:4510`, §5.13; Aufgabe V20).
 *
 * ⛔ SIE HAT KEIN ALT-VORBILD, UND DAS IST GEMESSEN. §5.6.1s Insel-Tabelle traegt in der
 * Spalte „erbt von" fuer diese eine Zeile woertlich „Kapitel 3" statt einer Alt-Datei
 * (`.superpowers/sdd/planteil4/E1-spec-kapitel5.md:434`), und der Alt-Bestand kennt die
 * Zugangscodes nicht (die Messung steht im Kopf von `_lib/lesepfade/codes.ts`). ⛔ ES GIBT
 * HIER ALSO KEINE 1:1-SPALTENPFLICHT ZUM ABSCHREIBEN — die fuenf Spalten und ihre Reihenfolge
 * stammen aus dem Auftragsbrief (`.superpowers/sdd/planteil4/briefs/V20.md:38-40`), und die
 * Regeln dahinter aus `_db/schema.ts:147-192`.
 *
 * ⛔ WARUM CLIENT — **Falle 9** (Bauform-Zulaessigkeitstafel Nr. 1, `CLAUDE.md`): jede der
 * fuenf Spalten fuehrt eine `render`-Funktion. Eine `render`-Funktion, die in einer Server
 * Component entstuende, ist eine gewoehnliche Funktion — keine Server Action —, und React
 * lehnt ab, sie ueber die RSC-Grenze zu reichen (`Error: Functions cannot be passed directly
 * to Client Components`). ⛔ DAZU FAENGT DIE FLAECHE ZUSTAND EIN: den Eingabetext des
 * Anlegefeldes, die zwei laufenden Vorgaenge und den Fehlerabsatz. ⚠️ Weder `typecheck` noch
 * `lint` noch `build` sehen das, und jsdom kann es STRUKTURELL nicht sehen — dort gibt es
 * keine RSC-Grenze. Der Waechter ist der Playwright-Fall (`Spec:4881-4882`), Fall 9 in
 * `e2e/radio-verwaltung.spec.ts`, Eigentuemer Aufgabe V23.
 *
 * ⛔ **EINE EINZIGE DATEI, UND DAS IST DIE BEGRUENDETE ABWEICHUNG VON INSEL 3.** Dort liegt
 * das Anlegefeld in einer eigenen Datei (`versionen/NeuVersion.tsx`), weil es mit der Tabelle
 * KEINEN Zustand teilt (Vorabscan-Fund F22). ⛔ HIER TEILEN SIE ZWEI DINGE: den EINEN
 * Fehlerabsatz und das Nachladen der Liste. Nach E-V6s eigenem Kriterium
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:603-633`, „die Inselgrenze ist die FLAECHE")
 * sind sie damit eine Insel — und die Files-Zeile des Auftrags fuehrt folgerichtig genau eine
 * Datei (`.superpowers/sdd/planteil4/briefs/V20.md:3-4`).
 *
 * ⛔ DIE ZWEI AKTIONEN WERDEN DIREKT IMPORTIERT, nicht als Prop gereicht
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`; Vorbild
 * `aufgaben/_ui/RoutinenTabelle.tsx:4`). ⛔ SIE STAMMEN AUS PLANTEIL 3 (NS-A6,
 * `_actions/codes.ts:78`, `:121`) und NICHT aus `admin/actions.ts` — V20 fasst `_actions/`
 * nicht an (`.superpowers/sdd/planteil4/VORABSCAN.md:640`).
 *
 * ⛔ **DESHALB LAEDT DIESE FLAECHE SELBST NACH.** `erstelleCode` und `setzeCodeAktiv` rufen
 * KEIN `revalidatePath` — `/usr/bin/grep -n revalidatePath src/app/m/radio/_actions/codes.ts`
 * liefert nichts (gemessen 2026-08-26). Ohne `router.refresh()` stuende nach dem Anlegen keine
 * neue Zeile da und nach dem Sperren der alte Zustand; die Flaeche saehe aus, als haette der
 * Griff nichts getan. ⚠️ `router.refresh()` ist dafuer die HAUSFORM, keine Erfindung dieser
 * Aufgabe (`lagerbuch/verwaltung/(arbeit)/geraete/NeuGeraet.tsx:112`,
 * `.../geraete/[id]/GeraetForm.tsx:103`). ⛔ ES WIRKT, WEIL DIE SEITE DYNAMISCH IST:
 * `requireRadioAdmin()` liest `headers()` (`_lib/zugang.ts:459-461`).
 *
 * ⛔ **DIE ZWEI AKTIONEN LIEFERN KEIN `{ ok, fehler }`.** `erstelleCode` liefert `{ code }`
 * und WIRFT (`_actions/codes.ts:99-103`), `setzeCodeAktiv` liefert `void`. Die Flaeche faengt
 * also und zeigt ihren EIGENEN Text — ⛔ UND NIEMALS DIE GEFANGENE MELDUNG. Das ist die
 * Umsetzung von `.superpowers/sdd/planteil4/briefs/V20.md:35` („Er darf in keiner
 * Protokollzeile und keiner Fehlermeldung landen"): eine geworfene Server Action erreicht den
 * Browser in Produktion nur als Digest, unter `next dev` aber mit ihrem Text, und der
 * naechste, der `_actions/codes.ts` erweitert, koennte einen Code hineinschreiben. Der
 * Waechter dagegen ist der Fehlerpfad-Block in `CodeTabelle.test.tsx`.
 *
 * ⛔ **ES GIBT KEINE LOESCHFUNKTION UND ES WIRD KEINE GEBAUT** (NS-A6). Die drei Gruende
 * stehen ausgeschrieben in `_actions/codes.ts:20-52` und in `Spec:2204-2221`; die kuerzeste
 * Fassung: der Code ist der Anzeigeschluessel der Leihhistorie ueber `loans.zugangscode_id`,
 * und ein freigegebener Wert an einem spaeter ausgestellten Kaertchen liesse HISTORISCHE
 * Zeilen unter dem neuen Namen erscheinen. ⛔ Der EINZIGE Widerruf ist `aktiv`
 * (`_db/schema.ts:180-183`).
 *
 * ⛔ KEIN ROTTON UND KEIN `danger` — **Falle 3**: `colorError === colorPrimary === FARBEN.rot`
 * (`src/core/theme/theme.ts:32-33`). Sperren LOESCHT NICHTS und ist umkehrbar; der
 * Entsperr-Knopf daneben ist der Beweis. Rot bliebe den zerstoerenden Knoepfen vorbehalten —
 * und die hat diese Flaeche ausdruecklich nicht.
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul mehrfach ausgeschrieben
 * (`geraete/NeuGeraetModal.tsx:40-45`, `geraete/[id]/GeraetLoeschen.tsx:46-49`). Sichtbar
 * bleibt der Erfolg trotzdem: die Liste laedt nach, die neue Zeile steht oben, das Feld ist
 * leer.
 *
 * ⛔ KEINE ZEICHEN AN DEN KNOEPFEN. `_ui/ikonen.tsx` ist die EINE Zeichenquelle des Moduls
 * (Entscheidung E-V7, NS-A8b) und auf zwoelf Namen festgenagelt (`_ui/ikonen.test.tsx:108`);
 * ein dreizehnter gehoerte in eine Aufgabe, die jene Datei fuehrt, und ein
 * `react-icons`-Import in einer fremden Datei waere Falle 7. Die Beschriftungen tragen die
 * Aussage allein — dieselbe Wahl wie in `geraete/GeraeteTabelle.tsx`,
 * `software/UpdateSuche.tsx` und `versionen/VersionenTabelle.tsx`.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER FLAECHE, in EINER benannten Liste und nicht inline verstreut
 * (⛔ die Global Constraint steht in `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`: „Sie
 * liegen in EINER benannten Konstantenliste je Flaeche"). ⚠️ Sie tragen ihre Umlaute — es
 * sind Bildschirmtexte, keine Bezeichner.
 *
 * ⚠️ **KEINER VON IHNEN STAMMT AUS DER 1:1-TAFEL ABSCHNITT E**, und das ist kein Versehen:
 * die Tafel (`.superpowers/sdd/planteil4/briefs/KOPF.md:1322-1339`) fuehrt dreizehn Zeilen,
 * KEINE davon aus einer Codeverwaltung — es gibt im Alt-Bestand keine. Jeder Satz hier ist
 * eine Zutat der Suite, ⛔ und deshalb steht an keinem eine `SoftwareVersionsPage.tsx`-artige
 * Belegzeile: eine erfundene waere genau die Klasse, gegen die die eiserne Regel steht.
 *
 * ⛔ NICHT EXPORTIERT (REVIEW-V17, Fund F4): es gibt keinen Verbraucher — der Test schreibt
 * die Texte bewusst aus, ein Import waere tautologisch. Dieselbe Form und derselbe Grund wie
 * in `software/UpdateSuche.tsx:91` (`UPDATE_TEXTE`) und `versionen/VersionenTabelle.tsx`
 * (`VERSIONEN_TEXTE`).
 */
const CODE_TEXTE = {
  /** Die fuenf Spaltenueberschriften, in der Reihenfolge des Auftragsbriefs (`V20.md:38-40`). */
  spalteBezeichnung: "Bezeichnung",
  spalteCode: "Code",
  spalteZustand: "Zustand",
  spalteZuletzt: "Zuletzt benutzt",
  spalteAktionen: "Aktionen",
  /** Die zwei Zustaende als WORT, nicht als Farbe (Falle 3). */
  aktiv: "aktiv",
  gesperrt: "gesperrt",
  /**
   * ⛔ WANN UND VON WEM, IN EINEM SATZ (`_db/schema.ts:184-187`: die zwei Felder existieren,
   * „WEIL die Zeile dauerhaft in der Liste steht und erklaeren muss, warum sie tot ist").
   *
   * ⛔ **DREI FASSUNGEN, WEIL DAS SCHEMA DREI ZUSTAENDE ZULAESST.** `gesperrt_am` und
   * `gesperrt_von` sind EINZELN nullable (`_db/schema.ts:186-187`); kein heutiger Schreibweg
   * fuellt nur eines (`_actions/codes.ts:129-133` schreibt beide, `_lib/seedLokal.ts:183-185`
   * ebenso), eine Datenuebernahme kann es. ⛔ DANN WIRD DIE BEKANNTE HAELFTE GEZEIGT UND NICHT
   * DIE GANZE ZEILE VERSCHWIEGEN — „gesperrt am 22.06.2026" sagt mehr als nichts, und ein
   * Satz mit einer offenen Luecke („von ") saehe nach einem Fehler der Flaeche aus statt nach
   * einer Luecke im Bestand. ⚠️ Der Waechter darueber ist der Fall „eine halb gefuellte
   * Sperrangabe zeigt die bekannte Haelfte" in `CodeTabelle.test.tsx`; er entstand aus einer
   * Sonde, die 0 rot ergab (S-V20-I24, 2026-08-26).
   */
  gesperrtSeit: (wann: string, wer: string) => `gesperrt am ${wann} von ${wer}`,
  gesperrtAm: (wann: string) => `gesperrt am ${wann}`,
  gesperrtVon: (wer: string) => `gesperrt von ${wer}`,
  /** ⛔ EIN Knopf mit ZWEI Beschriftungen — `setzeCodeAktiv(id, aktiv)` ist EINE Action. */
  sperren: "Sperren",
  entsperren: "Entsperren",
  sperrFrage: "Diesen Zugang wirklich sperren?",
  entsperrFrage: "Diesen Zugang wieder freigeben?",
  ja: "Ja",
  abbrechen: "Abbrechen",
  platzhalter: "Neuer Zugang, z. B. Aufsteller Funkraum",
  feldName: "Bezeichnung des neuen Zugangs",
  anlegen: "Anlegen",
  /** Der zugaengliche Name der Tabelle. ⚠️ Nicht wortgleich mit der Ueberschrift der Seite. */
  tabelleName: "Ausgestellte Zugänge",
  /** Die leere Liste — Hausform (`ausleihen/AusleihenTabelle.tsx:359-360`). */
  leer: "Kein Zugang ausgestellt",
  /**
   * ⛔ DIE ZWEI FEHLERTEXTE SIND HAUSTEXTE UND KEINE SERVERTEXTE. Es gibt hier kein
   * `{ ok, fehler }` zum Durchreichen — und die gefangene Meldung darf nicht auf den
   * Bildschirm, siehe den Kopf dieser Datei.
   */
  fehlerAnlegen: "Der Zugang konnte nicht ausgestellt werden.",
  fehlerSchalten: "Der Zustand konnte nicht gespeichert werden.",
} as const;

/**
 * DIE SPERRANGABE EINER ZEILE — ⛔ DREI ZWEIGE UND EIN `null`, weil das Schema genau vier
 * Zustaende zulaesst (`_db/schema.ts:186-187`, beide Spalten einzeln nullable).
 *
 * ⛔ SIE STEHT AUSSERHALB DER KOMPONENTE, WEIL SIE KEINEN ZUSTAND BRAUCHT — und ⛔ NICHT unter
 * `_lib/`: sie liest `CODE_TEXTE`, und das ist ein Wert aus einer `"use client"`-Datei
 * (Falle 6, `CLAUDE.md`). Ein Bildschirmtext gehoert ohnehin auf diese Seite der Grenze.
 *
 * ⛔ DIE REIHENFOLGE DER ZWEIGE IST TRAGEND: der vollstaendige Satz zuerst, sonst faenge der
 * Zeit-Zweig ihn ab und die Person verschwaende still.
 */
function sperrangabe(z: CodeZeile): string | null {
  if (z.gesperrtAmText !== "" && z.gesperrtVonText !== "") {
    return CODE_TEXTE.gesperrtSeit(z.gesperrtAmText, z.gesperrtVonText);
  }
  if (z.gesperrtAmText !== "") return CODE_TEXTE.gesperrtAm(z.gesperrtAmText);
  if (z.gesperrtVonText !== "") return CODE_TEXTE.gesperrtVon(z.gesperrtVonText);
  return null;
}

export type CodeTabelleProps = {
  /** ⛔ Der ganze Vertrag, `Spec:4510`. Alles darin ist skalar und vorformatiert. */
  zeilen: CodeZeile[];
};

export function CodeTabelle({ zeilen }: CodeTabelleProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [legtAn, setLegtAn] = useState(false);
  const [schaltet, setSchaltet] = useState(false);

  const anlegen = async () => {
    /*
     * ⛔ GETRIMMT, und ein leerer Wert laeuft gar nicht erst los: `bezeichnung` ist
     * `.notNull()` (`_db/schema.ts:174`), aber NICHT gegen die leere Zeichenkette geschuetzt —
     * ein leerer Anzeigename erzeugte eine Zeile, die niemand mehr zuordnen kann.
     * ⚠️ DIE WAHRHEIT WAERE DIE SERVERSEITIGE PRUEFUNG („eine Regel, die nur im Client steht,
     * ist keine Regel", `Spec:3583-3585`). ⛔ SIE IST HEUTE NICHT GEBAUT: `erstelleCode`
     * prueft `bezeichnung` nicht (`_actions/codes.ts:78-104`), und V20 fasst `_actions/` nicht
     * an. ⬜ Benannte Leerstelle, Eigentuemer ClickUp-Board — sie gehoert in die Aufgabe, die
     * `_actions/` ohnehin oeffnet.
     */
    const sauber = name.trim();
    if (sauber === "") return;
    setLegtAn(true);
    setFehler(null);
    try {
      await erstelleCode(sauber);
      /* ⛔ NUR DER ERFOLGSFALL LEERT — sonst tippt der Bedienende seine Korrektur neu. */
      setName("");
      router.refresh();
    } catch {
      /*
       * ⛔ OHNE BINDUNG. Die gefangene Ausnahme wird NICHT gelesen, NICHT protokolliert und
       * NICHT angezeigt — sie koennte einen Klartext-Code tragen (`V20.md:35`). Der Haustext
       * sagt, was zu tun ist; was schiefging, steht im Serverprotokoll.
       */
      setFehler(CODE_TEXTE.fehlerAnlegen);
    } finally {
      setLegtAn(false);
    }
  };

  const umschalten = async (id: string, aktiv: boolean) => {
    setSchaltet(true);
    setFehler(null);
    try {
      await setzeCodeAktiv(id, aktiv);
      router.refresh();
    } catch {
      /* ⛔ Dieselbe Sperre wie oben: die gefangene Meldung verlaesst diese Zeile nicht. */
      setFehler(CODE_TEXTE.fehlerSchalten);
    } finally {
      setSchaltet(false);
    }
  };

  /**
   * DIE FUENF SPALTEN (`.superpowers/sdd/planteil4/briefs/V20.md:38-40`) — in dieser
   * Reihenfolge.
   *
   * ⛔ SIE ENTSTEHEN IM RUMPF UND NICHT AUF MODULEBENE: die Aktionsspalte faengt den laufenden
   * Vorgang ein. ⛔ UND SIE DUERFEN NICHT NACH `_lib/` (Bauform-Zulaessigkeitstafel Nr. 2,
   * `Spec:4512-4521`) — dort waeren sie Falle 6 UND Falle 9 zugleich.
   *
   * ⛔ KEINE TRAEGT EINEN `sorter`. Die Reihenfolge IST die des Lesepfads (`desc(createdAt)`,
   * `_lib/lesepfade/codes.ts`) — ein antd-internes Sortieren daneben zeigte eine andere
   * Ordnung als die, aus der V21 das Druckblatt setzt.
   */
  const spalten: TableColumnType<CodeZeile>[] = [
    {
      title: CODE_TEXTE.spalteBezeichnung,
      key: "bezeichnung",
      render: (_: unknown, z: CodeZeile) => (
        <span data-rolle="radio-code-bezeichnung">{z.bezeichnung}</span>
      ),
    },
    {
      title: CODE_TEXTE.spalteCode,
      key: "code",
      /*
       * ⛔ DER KLARTEXT-CODE STEHT DA (`Spec:2180-2182`): er ist kein Einmalgeheimnis, sondern
       * ein Dauerausweis. Ohne ihn koennte niemand ein verlorenes Kaertchen der richtigen
       * Zeile zuordnen — und genau das ist der Weg, auf dem ein Zugang gesperrt wird.
       * ⛔ ER IST ZUGLEICH DER GRUND, WARUM DIESE SEITE AUF DER ADMIN-STUFE LIEGT
       * (`Spec:2251-2253`: „die Codeliste IST das Geheimnis"), nicht ihre Kuer.
       */
      render: (_: unknown, z: CodeZeile) => <code data-rolle="radio-code-wert">{z.code}</code>,
    },
    {
      title: CODE_TEXTE.spalteZustand,
      key: "zustand",
      /*
       * ⛔ DER ZUSTAND WANDERT ALS WORT, NICHT ALS FARBE (Falle 3,
       * `.superpowers/sdd/planteil4/briefs/KOPF.md:1379-1380`): `color="success"` fuer den
       * gueltigen Zugang, `default` fuer den gesperrten — ⛔ KEIN `error`, das waere derselbe
       * Ton wie die Primaeraktion (`src/core/theme/theme.ts:32-33`). Ein gesperrter Zugang ist
       * kein Fehler, sondern ein absichtlicher Zustand.
       *
       * ⛔ UND DIE ANGABEN STEHEN DABEI, SOWEIT ES SIE GIBT (`_db/schema.ts:184-187`). Fehlen
       * BEIDE — das Schema laesst beide Spalten `NULL` zu —, steht die Marke allein da;
       * ⛔ NICHTS WIRD ERFUNDEN (die Leerstellenregel, und der `new Date(0)`-Praezedenzfall
       * steht im Ledger unter V-L6). Fehlt nur EINES, steht die bekannte Haelfte da: die
       * Begruendung und ihre Sonde stehen an `CODE_TEXTE.gesperrtSeit`.
       */
      render: (_: unknown, z: CodeZeile) => {
        const sperrText = sperrangabe(z);
        return (
          <Space direction="vertical">
            <Tag color={z.aktiv ? "success" : "default"} data-rolle="radio-code-zustand">
              {z.aktiv ? CODE_TEXTE.aktiv : CODE_TEXTE.gesperrt}
            </Tag>
            {sperrText !== null && (
              /* ⛔ DER ROHE `sub` IM `title`, NICHT IN DER ZELLE — dieselbe Bauform wie in der
                 Ereignisliste (`geraete/[id]/ereignisse/EreignisTabelle.tsx`). Ohne ihn waeren
                 zwei gleichnamige Personen nicht zu unterscheiden; in der Zelle waere er Laerm. */
              <small
                className={s.codeNeben}
                title={z.gesperrtVonSub}
                data-rolle="radio-code-gesperrt"
              >
                {sperrText}
              </small>
            )}
          </Space>
        );
      },
    },
    {
      title: CODE_TEXTE.spalteZuletzt,
      key: "zuletzt",
      /*
       * ⛔ VORFORMATIERT (Bauform-Zulaessigkeitstafel Nr. 7): kein `Date` ueber die Grenze, und
       * die Zone ist die des Servers (`_lib/anzeige.ts:87`). ⛔ „nie eingeloest" KOMMT AUS DEM
       * LESEPFAD und ist nie eine leere Zelle (`_db/schema.ts:190-191`); die Insel entscheidet
       * darueber nichts.
       */
      render: (_: unknown, z: CodeZeile) => (
        <span data-rolle="radio-code-zuletzt">{z.zuletztText}</span>
      ),
    },
    {
      title: CODE_TEXTE.spalteAktionen,
      key: "aktionen",
      align: "right",
      /*
       * ⛔ **EIN KNOPF MIT ZWEI BESCHRIFTUNGEN, NIE ZWEI KNOEPFE.** `setzeCodeAktiv(codeId,
       * aktiv)` ist EINE Action mit einem Wahrheitswert (`_actions/codes.ts:121`); zwei Wege
       * in denselben Zustand heissen, dass einer beim naechsten Umbau vergessen wird.
       *
       * ⛔ **UND ES GIBT KEINEN ZWEITEN KNOPF DANEBEN** (NS-A6): kein Loeschen, in keiner
       * Form. Der Fall „es gibt keinen Loeschknopf" in `CodeTabelle.test.tsx` zaehlt die
       * Knoepfe je Zeile und ist der Waechter dieser Zeile.
       *
       * ⛔ MIT RUECKFRAGE IN BEIDEN RICHTUNGEN. Sperren nimmt einen Aufsteller aus dem Betrieb
       * — die Sperre wirkt binnen des naechsten Aufrufs, lesend wie schreibend
       * (`Spec:2229-2232`). Entsperren gibt ein Kaertchen wieder frei, das gesperrt wurde,
       * „weil ein Kaertchen verschwunden ist" (`_db/schema.ts:180-183`). Beide Richtungen sind
       * einen Fehlgriff wert.
       *
       * ⛔ KEIN `danger` AM KNOPF UND KEIN `danger` AM JA-KNOPF (Falle 3): hier wird nichts
       * zerstoert, und Rot saehe aus wie die Primaeraktion.
       */
      render: (_: unknown, z: CodeZeile) => (
        <Popconfirm
          title={z.aktiv ? CODE_TEXTE.sperrFrage : CODE_TEXTE.entsperrFrage}
          okText={CODE_TEXTE.ja}
          cancelText={CODE_TEXTE.abbrechen}
          onConfirm={() => umschalten(z.id, !z.aktiv)}
        >
          <Button loading={schaltet} data-rolle="radio-code-umschalten">
            {z.aktiv ? CODE_TEXTE.sperren : CODE_TEXTE.entsperren}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div data-rolle="radio-zugaenge-flaeche">
      {/* ⛔ OHNE `style` — Masse dieses Moduls stehen im Stylesheet
          (`_ui/verwaltung.module.css`, `.suchfeld`), nicht im Markup. */}
      <div className={s.werkzeugleiste}>
        <Space.Compact className={s.suchfeld}>
          <Input
            placeholder={CODE_TEXTE.platzhalter}
            aria-label={CODE_TEXTE.feldName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={anlegen}
            data-rolle="radio-neucode-eingabe"
          />
          <Button
            type="primary"
            loading={legtAn}
            onClick={anlegen}
            data-rolle="radio-neucode-anlegen"
          >
            {CODE_TEXTE.anlegen}
          </Button>
        </Space.Compact>
      </div>
      <Table<CodeZeile>
        rowKey="id"
        columns={spalten}
        dataSource={zeilen}
        /*
          ⛔ `pagination={false}`: die Tabelle liegt in der Groessenordnung „Zahl der
          Aufsteller" — das schreibt das Schema an derselben Stelle aus, an der es den Index
          auf `aktiv` ablehnt (`_db/schema.ts:193-195`). Eine Blaetterung schnitte ausserdem
          die Liste, aus der V21 das Druckblatt setzt, in Seiten.
        */
        pagination={false}
        /* ⛔ `x: "max-content"` — ohne `scroll` bricht eine antd-Tabelle auf 390 px
           (`aufgaben/_ui/RoutinenTabelle.tsx:34-35`); Platz schafft das, nicht `size`
           (Falle 4). */
        scroll={{ x: "max-content" }}
        aria-label={CODE_TEXTE.tabelleName}
        locale={{ emptyText: CODE_TEXTE.leer }}
      />
      {fehler !== null && (
        /*
          ⛔ KEIN `Alert type="error"` UND KEIN ROTTON: `colorError === colorPrimary`
          (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die
          Primaeraktion (Falle 3). Dieselbe Form wie `versionen/VersionenTabelle.tsx`.
        */
        <p className={s.dialogFehler} role="alert" data-rolle="radio-zugaenge-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}
