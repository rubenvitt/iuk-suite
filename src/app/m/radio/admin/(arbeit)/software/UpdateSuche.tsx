"use client";

// src/app/m/radio/admin/(arbeit)/software/UpdateSuche.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AutoComplete, Button, Card, Empty, Input, Progress, Space, Tag, Typography } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { geraetAendernAction, notizAnfuegenAction } from "../../actions";
import { tagAusWert } from "../../../_lib/csv/spalten";
import type { UpdateKarteZeile } from "../../../_lib/lesepfade/geraete";
import type { UpdateStand } from "../../../_lib/updateStand";
import s from "../../../_ui/verwaltung.module.css";

/**
 * INSEL 7 — DER UPDATE-MODUS (`Spec:4509`, §5.6.1; Aufgabe V17).
 *
 * ⛔ DER PFAD IST `software/`, NICHT `update/` — B9 (`Spec:98`), Kapitel 1 §1.2.2 gewinnt bei
 * Pfadnamen. §5.6.1s Insel-Tabelle (`Spec:4509`) traegt noch den alten Namen und ist ueberholt.
 *
 * ⛔ WARUM DIE FLAECHE CLIENT IST — **FALLE 1**, und sie ist hier die ganze Begruendung:
 * `Typography.Title`, `Typography.Text`, `Input.Search` und `Space.Compact` sind
 * Compound-Zugriffe; aus einer Server Component gerendert ist das HTTP 500 beim Abruf
 * (`CLAUDE.md`, Falle 1). Dazu haelt die Flaeche drei Zustaende selbst: die gewaehlte
 * Zielversion, den getippten Suchtext und das aufgeklappte Anmerkungsfeld je Karte.
 *
 * ⛔ DIE ZWEI ACTIONS WERDEN DIREKT IMPORTIERT UND NICHT ALS PROP GEREICHT
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`; Vorbild `_ui/RoutinenTabelle.tsx:4`).
 * Sie sind das einzige, was ueber diese Grenze darf.
 *
 * ⛔ **ENTSCHEIDUNG E-V17 — REGIME B AUCH FUER `/admin/software`, UND SIE IST EINE BENANNTE
 * ABWEICHUNG VON `Spec:4509`.** Die Spec fuehrt fuer diese Insel genau vier Props
 * (`versionen`, `zielVersion`, `gesamt`, `aufZiel`) — ⛔ und KEINER davon kann ein Geraet
 * aufnehmen, waehrend dieselbe Stelle „Suche auf drei Feldern", „`pageSize: 25`" und „je
 * Geraet eine Karte" verlangt. Die drei denkbaren Quellen sind alle verschlossen:
 * `_lib/lesepfade/` traegt kein `"use client"` und nimmt `db` als ersten Parameter, also aus
 * einer Insel nicht rufbar; `admin/actions.ts` fuehrt GENAU NEUN Actions, alle schreibend
 * (`ACTION_ANZAHL = 9` mit `toBe`, `admin/actions.test.ts`); und einen Suchparameter-Vertrag
 * fuer diese Route nannte der Plan nicht. Gemessen und benannt als Vorabscan-Fund F4
 * (`.superpowers/sdd/planteil4/VORABSCAN.md:158-196`), der die hier gebaute Fassung
 * ausdruecklich vorschlaegt. ⛔ Die Insel bekommt deshalb ZWEI weitere Props — `zeilen` und
 * `suchtext` — und schreibt ihren Suchtext, 300 ms entprellt, in die ADRESSZEILE; der Server
 * liest ihn und laedt. Dieselbe Bauform wie Insel 1 (`geraete/GeraeteTabelle.tsx`) und wie
 * `lagerbuch/verwaltung/(arbeit)/journal/`.
 *
 * ⛔ `suchtext` IST NICHT BUCHHALTUNG, SONDERN LASTTRAGEND: an ihm haengt der Leerzweig
 * („ohne Suchtext wird NICHTS gezeigt", `UpdateMode.tsx:67-68`). Ein rein innerer Zustand
 * liefe gegen die Adresszeile auseinander, sobald jemand `/admin/software?q=…` teilt oder
 * zurueckspringt.
 *
 * ⛔ DIE FLAECHE IST FUER BEIDE STUFEN OFFEN (`Spec:4374`, Rechtetafel `Spec:4444-4454`:
 * „Update-Modus (`softwareVersion`, `lastUpdatedAt`, `status`) | ja | ja") — und die Felder,
 * die sie schreibt, sind eine TEILMENGE von `UPDATER_FELDER`
 * (`radio-admin/shared/src/editable-fields.ts:3`, in der Suite `_lib/rollen.ts:79`). ⛔ Das ist
 * kein Zufall, sondern der Zweck der zweiten Stufe: `filterSchreibbareFelder`
 * (`_lib/rollen.ts:106`) verwirft STILL, was darueber hinausginge — ein viertes Feld im Patch
 * verschwaende fuer eine Updater-Person geraeuschlos, waehrend der Knopf Erfolg meldete.
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), dieselbe Linie wie in
 * `geraete/[id]/NotizFeld.tsx:35-38`: die `message.success`/`message.error`-Paare des Bestands
 * (`UpdateDeviceCard.tsx:25`, `:27`, `:35`, `:39`) entfallen als benannte Abweichung. Der
 * Fehlertext kommt aus der Action; nach dem Erfolg schreibt sie `revalidatePath` auf diese
 * Seite, und der neu gerechnete Update-Stand steht im naechsten Server-Rendering auf der Karte.
 *
 * ⚠️ ZWEI WEITERE BENANNTE ABWEICHUNGEN, BEIDE AUS DER HAUSFORM:
 *   * ⛔ KEIN `size="small"` an der Karte (`UpdateDeviceCard.tsx:44`) — Falle 4: `FullShell`
 *     traegt `controlHeight: 44` (`src/core/theme/theme.ts:207-209`), auch auf dem Telefon.
 *   * ⛔ KEINE ZEICHEN AN DEN ZWEI KNOEPFEN (`FiCheck`, `FiAlertTriangle`,
 *     `UpdateDeviceCard.tsx:56`, `:59`). `_ui/ikonen.tsx` ist die EINE Zeichenquelle des Moduls
 *     und auf zwoelf Namen festgenagelt (`_ui/ikonen.test.tsx:108`); ein dreizehnter gehoerte
 *     in eine Aufgabe, die jene Datei fuehrt. Die Beschriftungen tragen die Aussage allein —
 *     dieselbe Wahl und derselbe Grund wie in `geraete/GeraeteTabelle.tsx`.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER FLAECHE, in EINER benannten Liste und nicht inline verstreut
 * (`Spec:4815-4832`, 1:1-Tafel Abschnitt E). ⚠️ Sie tragen ihre Umlaute — es sind
 * Bildschirmtexte, keine Bezeichner.
 */
export const UPDATE_TEXTE = {
  /** ⛔ Woertlich `UpdateMode.tsx:40`. */
  hinweis:
    "Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte, die du wirklich aktualisiert hast.",
  /** ⛔ Woertlich `UpdateMode.tsx:68` — die Aufforderung, nicht die Abwesenheit von Zeilen. */
  leerOhneSuche: "Gerät suchen, um es zu aktualisieren",
  /** ⛔ Woertlich `UpdateMode.tsx:76`. */
  leerOhneTreffer: "Kein Gerät gefunden",
  /** ⛔ Woertlich `UpdateDeviceCard.tsx:60`. */
  anmerkungKnopf: "ISSI weicht ab / Anmerkung",
  /** ⛔ Woertlich `UpdateDeviceCard.tsx:66`. */
  anmerkungPlatzhalter: "z. B. echte ISSI am Gerät / Abweichung",
  /** ⛔ Woertlich `UpdateMode.tsx:61` (Platzhalter des Suchfelds). */
  suchePlatzhalter: "ISSI / Rufname / OPTA suchen…",
  /** ⛔ Woertlich `UpdateMode.tsx:43`. */
  zielEtikett: "Zielversion",
  /** ⛔ Woertlich `UpdateMode.tsx:50`. */
  zielPlatzhalter: "Zielversion wählen",
  /** ⛔ Woertlich `UpdateMode.tsx:37`. */
  titel: "Update-Modus",
} as const;

/** ⛔ 300 ms, 1:1 aus `UpdateMode.tsx:25`. */
const ENTPRELLUNG_MS = 300;

/**
 * ⛔ DER UPDATE-STAND WANDERT ALS WORT, NICHT ALS FARBE (Falle 3, `Spec:4555-4561`; Regel 4
 * der Insel-Tafel). `colorError === colorPrimary` (`src/core/theme/theme.ts:32-33`) — ein rotes
 * Zeichen auf einer Datenflaeche saehe aus wie eine Primaeraktion. ⛔ Der Alt-Rotton `#cf1322`
 * (`radio-admin/client/src/features/dashboard/Dashboard.tsx:41`) entfaellt, und ein zweiter
 * Hexsatz waere ausserdem NS-A8b (`_lib/status.ts:125`).
 *
 * ⚠️ DIESELBE TAFEL STEHT IN `geraete/GeraeteTabelle.tsx` — und sie steht dort ein zweites
 * Mal, weil beide Inseln eigene Client-Teilbaeume sind und `_lib/` sie nicht tragen darf, ohne
 * dass die Server-Seite sie mitzoege. Die WOERTER sind der Vertrag, und
 * `UpdateSuche.test.tsx` misst alle drei.
 */
const STAND_TON: Record<UpdateStand, "success" | "warning" | undefined> = {
  aktuell: "success",
  veraltet: "warning",
  unbekannt: undefined,
};

const STAND_WORT: Record<UpdateStand, string> = {
  aktuell: "Aktuell",
  veraltet: "Veraltet",
  unbekannt: "Unbekannt",
};

export type UpdateSucheProps = {
  /** Die Werte aller Softwareversionen (`versionenMitGeraetezahl`, V5). */
  versionen: string[];
  /** Der Wert der Zeile mit gesetzter Marke, sonst `null` (`zielVersion`, V5). */
  zielVersion: string | null;
  /** Alle Geraete (`geraeteKennzahlen.gesamt`, V6). */
  gesamt: number;
  /** Die Geraete auf der Zielversion (`geraeteKennzahlen.aktuell`, V6). */
  aufZiel: number;
  /** ⛔ **E-V17**, benannte Abweichung von `Spec:4509`: die gefundenen Geraete, vorformatiert. */
  zeilen: UpdateKarteZeile[];
  /** ⛔ **E-V17**: der Suchtext, wie er in der Adresszeile steht — der Traeger des Leerzweigs. */
  suchtext: string;
};

export function UpdateSuche({
  versionen,
  zielVersion,
  gesamt,
  aufZiel,
  zeilen,
  suchtext,
}: UpdateSucheProps) {
  const router = useRouter();
  const pfad = usePathname();

  /**
   * ⛔ DIE VORBELEGUNG MIT DER MARKIERTEN VERSION, 1:1 `UpdateMode.tsx:17-22` — dort ein
   * Effekt, weil die Liste erst nachlaedt; hier der Anfangswert, weil der Server sie schon
   * kennt (`zielVersion`, `_lib/lesepfade/versionen.ts:112`).
   *
   * ⛔ UND SIE IST KEINE SPERRE: `onChange` schreibt frei weiter (`UpdateMode.tsx:49`). Der
   * Fall „die Zielversion ist aenderbar" ist die Gegenprobe dazu.
   */
  const [ziel, setZiel] = useState(zielVersion ?? "");
  const [getipptes, setGetipptes] = useState(suchtext);
  const uebernommen = useRef(suchtext);

  /*
   * Der Tanz mit `uebernommen` unterscheidet eine EXTERNE Aenderung der Adresszeile (ein
   * geteilter Link, der Zurueck-Knopf) von der eigenen Schreibung. Nur die externe zieht das
   * Eingabefeld nach. Bauform 1:1 aus `geraete/GeraeteWerkzeugleiste.tsx:104-109` und
   * `lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.tsx:52-59`.
   */
  useEffect(() => {
    if (suchtext !== uebernommen.current) {
      uebernommen.current = suchtext;
      setGetipptes(suchtext);
    }
  }, [suchtext]);

  /**
   * ⛔ DER EINE SCHREIBWEG IN DIE ADRESSZEILE. `replace`, NICHT `push` (Vorbild
   * `lagerbuch/_ui/useUrlFilter.ts:27`): Sucheingaben gehoeren nicht in die Browser-Historie,
   * sonst kostet „zurueck" so viele Klicks, wie jemand Buchstaben getippt hat.
   */
  const schreibeUrl = useCallback(
    (begriff: string) => {
      router.replace(begriff ? `${pfad}?q=${encodeURIComponent(begriff)}` : pfad, {
        scroll: false,
      });
    },
    [router, pfad],
  );

  /*
   * ⛔ DIE ENTPRELLUNG VON 300 ms, 1:1 `UpdateMode.tsx:24-27`. In Regime B ist sie nicht
   * Kosmetik: ohne sie stiesse JEDER Tastenanschlag einen Serverlauf mit einer neuen Adresse
   * an. ⛔ Und der getrimmte Begriff ist der gesendete (`:25`, `search.trim() || undefined`).
   */
  useEffect(() => {
    const begriff = getipptes.trim();
    if (begriff === uebernommen.current) return;
    const uhr = setTimeout(() => {
      uebernommen.current = begriff;
      schreibeUrl(begriff);
    }, ENTPRELLUNG_MS);
    return () => clearTimeout(uhr);
    // `schreibeUrl` haengt an `router`/`pfad` und ist stabil; `getipptes` ist die Aussage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getipptes]);

  return (
    <div className={s.abstand} data-rolle="radio-update-flaeche">
      <Typography.Title level={3} className={s.titel}>
        {UPDATE_TEXTE.titel}
      </Typography.Title>

      {/* 1:1 `UpdateMode.tsx:38-41` — die fachliche Auflage der Flaeche. */}
      <Alert
        type="info"
        showIcon
        message={<span data-rolle="radio-update-hinweis">{UPDATE_TEXTE.hinweis}</span>}
      />

      <div>
        <Typography.Text strong>{UPDATE_TEXTE.zielEtikett}</Typography.Text>
        {/*
          ⛔ ANTD `AutoComplete` STATT DES EIGENBAU-`Combobox` (antd-Zuordnung; Planteil 3 hat
          die Form bereits gebaut, `_ui/EntleiherFeld.tsx:137`) — dieselbe Bauform, nicht eine
          zweite. ⛔ `allowCreate={false}` des Bestands (`UpdateMode.tsx:45`) hat in antd keine
          Entsprechung und braucht auch keine: die Liste ist ein VORSCHLAG, und der Bestand
          schreibt den getippten Wert ebenso frei weiter (`:49`).
        */}
        <AutoComplete
          id="radio-update-ziel"
          className={s.filterWeit}
          value={ziel}
          onChange={(wert) => setZiel(wert ?? "")}
          placeholder={UPDATE_TEXTE.zielPlatzhalter}
          options={versionen.map((v) => ({ value: v }))}
          /* jsdom kennt keine Elementhoehen; mit Virtualisierung rendert die Liste in Tests nie
             (`_ui/EntleiherFeld.tsx`, derselbe Grund). */
          virtual={false}
        />
      </div>

      {/*
        ⛔ NUR WENN ES UEBERHAUPT GERAETE GIBT, 1:1 `UpdateMode.tsx:53`. Ohne die Bedingung
        rechnete `Math.round((aufZiel / gesamt) * 100)` bei `gesamt === 0` ein `NaN` in den
        Balken. ⛔ UND DER FORTSCHRITT BLEIBT HIER — „Weitere Auswertungen entstehen nicht"
        (`Spec:4793-4794`).
      */}
      {gesamt > 0 && (
        <div data-rolle="radio-update-fortschritt">
          <Typography.Text type="secondary">
            <span data-rolle="radio-update-fortschritt-text">
              {aufZiel} von {gesamt} auf Zielversion
            </span>
          </Typography.Text>
          <Progress percent={Math.round((aufZiel / gesamt) * 100)} />
        </div>
      )}

      <Input.Search
        id="radio-update-suche"
        allowClear
        aria-label="Suche"
        placeholder={UPDATE_TEXTE.suchePlatzhalter}
        value={getipptes}
        onChange={(e) => setGetipptes(e.target.value)}
        onSearch={(wert) => {
          uebernommen.current = wert.trim();
          schreibeUrl(wert.trim());
        }}
      />

      {/*
        ⛔ DIE DREI ZWEIGE IN DIESER REIHENFOLGE, 1:1 `UpdateMode.tsx:65-77` — ohne den
        `Spin`-Zweig (`:65-66`), der mit TanStack Query entfaellt (`Spec:4583-4593`).
        ⛔ OHNE SUCHTEXT WIRD NICHTS GEZEIGT, und der Traeger ist der TEXT, nicht die leere
        Liste: der Bedienende soll aufgefordert werden, nicht ratlos vor einer leeren Flaeche
        stehen.
      */}
      {suchtext === "" ? (
        <Empty description={<span data-rolle="radio-update-leer">{UPDATE_TEXTE.leerOhneSuche}</span>} />
      ) : zeilen.length === 0 ? (
        <Empty
          description={<span data-rolle="radio-update-leer">{UPDATE_TEXTE.leerOhneTreffer}</span>}
        />
      ) : (
        <div className={s.abstand}>
          {zeilen.map((z) => (
            <UpdateKarte key={z.id} zeile={z} ziel={ziel} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * EINE KARTE — 1:1 `UpdateDeviceCard.tsx`.
 *
 * ⛔ KEINE EIGENE DATEI: die Insel hat GENAU EINE Grenze (Entscheidung E-V6), und
 * `UpdateSuche.test.tsx` misst die Dateimenge des Ordners mit `toEqual`. Die Karte teilt mit
 * der Flaeche die gewaehlte Zielversion und ist deshalb ihr Kind, keine zweite Insel.
 */
function UpdateKarte({ zeile, ziel }: { zeile: UpdateKarteZeile; ziel: string }) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  /** 1:1 `UpdateDeviceCard.tsx:48` — mit `||`, weil alle drei Freitext sind. */
  const name = zeile.rufname || zeile.opta || zeile.issi;

  const anwenden = async () => {
    setLaeuft(true);
    setFehler(null);
    /*
     * ⛔ **E-V11**: `{ softwareVersion: ziel, lastUpdatedAt: <Berliner Tag> }`. Der Bestand
     * setzt hier `Date.now()` (`UpdateDeviceCard.tsx:24`) — die Suite-Spalte ist
     * `text("last_updated_at")` mit `YYYY-MM-DD` (`_db/schema.ts:39`), und die Umrechnung
     * steht an GENAU EINER Stelle im Modul (`tagAusWert`, `_lib/csv/spalten.ts:207`,
     * E-V11 Punkt 4).
     *
     * ⛔ DER TYP FAENGT DIESEN FEHLER NICHT: die Spalte ist `text`, ihr Drizzle-Typ
     * `string | null` — jede uhrzeittragende Zeichenkette uebersetzt sauber. Der Waechter ist
     * der Fall „ein Tap sendet genau YYYY-MM-DD, keine Uhrzeit".
     *
     * ⛔ `tagAusWert` RECHNET IN `Europe/Berlin` UND NICHT IN DER SYSTEMZONE
     * (`_lib/csv/spalten.ts:125`, `:139-152`: `Intl.DateTimeFormat` mit ausdruecklicher Zone).
     * Genau deshalb darf die Zeile hier im Browser stehen: sie liefert denselben Tag,
     * gleichgueltig wie der Rechner des Bedienenden gestellt ist.
     */
    const ergebnis = await geraetAendernAction(zeile.id, {
      softwareVersion: ziel,
      lastUpdatedAt: tagAusWert(new Date()),
    });
    setLaeuft(false);
    if (!ergebnis.ok) setFehler(ergebnis.fehler);
  };

  const anhaengen = async () => {
    /* 1:1 `UpdateDeviceCard.tsx:32`, `:34`: leerer Text laeuft nicht los, gesendet wird der
       getrimmte. Die Wahrheit ist die Pruefung in `notizAnfuegenAction`. */
    const sauber = text.trim();
    if (sauber === "") return;
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await notizAnfuegenAction(zeile.id, sauber);
    setLaeuft(false);
    if (ergebnis.ok) {
      setText("");
      setOffen(false);
      return;
    }
    setFehler(ergebnis.fehler);
  };

  return (
    <Card className={s.mobilKarte} data-rolle="radio-update-karte">
      <div className={s.mobilKopf}>
        <div>
          <Typography.Text strong>
            <span data-rolle="radio-update-karte-name">{name}</span>
          </Typography.Text>
          <div>
            <Typography.Text type="secondary">
              {/* 1:1 `UpdateDeviceCard.tsx:49-51`. */}
              <span data-rolle="radio-update-karte-neben">
                ISSI {zeile.issi}
                {zeile.funktion ? ` · ${zeile.funktion}` : ""}
                {zeile.geraeteTyp ? ` · ${zeile.geraeteTyp}` : ""}
              </span>
            </Typography.Text>
          </div>
        </div>
        <Tag color={STAND_TON[zeile.updateStand]} data-rolle="radio-update-stand">
          {STAND_WORT[zeile.updateStand]}
        </Tag>
      </div>

      <Space wrap className={s.notizZeile}>
        {/* ⛔ `disabled={!ziel}`, 1:1 `UpdateDeviceCard.tsx:56`: ohne Zielversion schriebe ein
            Tap eine LEERE Version, und der Update-Stand fiele danach auf „unbekannt". */}
        <Button
          type="primary"
          data-rolle="radio-update-tap"
          loading={laeuft}
          disabled={!ziel}
          onClick={anwenden}
        >
          Auf {ziel || "—"} aktualisiert
        </Button>
        <Button data-rolle="radio-update-anmerkung-knopf" onClick={() => setOffen((o) => !o)}>
          {UPDATE_TEXTE.anmerkungKnopf}
        </Button>
      </Space>

      {offen && (
        <Space.Compact className={s.notizZeile}>
          <Input
            data-rolle="radio-update-anmerkung-feld"
            aria-label="Anmerkung"
            placeholder={UPDATE_TEXTE.anmerkungPlatzhalter}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={anhaengen}
          />
          <Button data-rolle="radio-update-anmerkung-speichern" loading={laeuft} onClick={anhaengen}>
            Speichern
          </Button>
        </Space.Compact>
      )}

      {/*
        ⛔ DIE GESPEICHERTE ANMERKUNG, 1:1 `UpdateDeviceCard.tsx:74-78` — der Posten, den der
        Port beinahe still verloren haette (Entscheidung **E-V17b**, `_lib/lesepfade/geraete.ts`,
        `updateKarten`). ⛔ `type="warning"` und nicht `danger`: Rot bleibt den zerstoerenden
        Knoepfen (Falle 3).
      */}
      {zeile.updateAnmerkung && (
        <Typography.Paragraph type="warning" className={s.notizText}>
          <span data-rolle="radio-update-anmerkung-text">{zeile.updateAnmerkung}</span>
        </Typography.Paragraph>
      )}

      {fehler !== null && (
        <Typography.Text type="danger">
          <span data-rolle="radio-update-fehler">{fehler}</span>
        </Typography.Text>
      )}
    </Card>
  );
}
