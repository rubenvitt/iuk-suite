"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Dayjs } from "dayjs";
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from "antd";
import { Datentabelle, nachRang, nachText, nachZahl, Zellentext } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { updateArtikel, setArtikelAktiv } from "../_actions/artikel";
import { bucheEntnahme, bucheUmlagerung, bucheZugang } from "../_actions/buchung";
import {
  getDetail,
  type ArtikelDetailBuchung,
  type ArtikelDetailCharge,
  type ArtikelDetailResult,
} from "../_actions/detail";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../_actions/loeschen";
import { ampelTon, fmtVerfall } from "../_lib/format";
import { einheitenartLabel, einheitLabels, type Einheitenart } from "../_lib/konstanten";
import { journalZeile } from "../_lib/journalZeile";
import { kategorieNormalisieren } from "../_lib/kategorie";
import { SCHRIFT } from "../_lib/schrift";
import { fmtTs } from "../_lib/zeit";
import { Chip } from "./Chip";
import { KategorieEingabe } from "./KategorieEingabe";
import { LoeschButton } from "./LoeschButton";
import { monatAusPicker } from "./monat";
import { OrtVerteilung } from "./OrtVerteilung";
import { Plakette } from "./Plakette";
import styles from "./verwaltung.module.css";

export const NEUE_CHARGE = "__neu__";

/**
 * Wo eine Meldung HINGEHOERT. Der Drawer ist lang; ein Fehler aus dem
 * Umlagern-Formular gehoert an dieses Formular, nicht 900px darueber.
 */
type Meldungsquelle = "allgemein" | "zugang" | "entnahme" | "umlagern";
const MINDEST_DEBOUNCE_MS = 400;

/** Rot vor gelb vor gruen: was Aufmerksamkeit verlangt, gehoert nach oben. */
const AMPEL_RANG = ["rot", "gelb", "gruen"] as const;

type SuchOption = {
  label?: ReactNode;
  keywords?: string;
};

/** Gemeinsame Suche fuer Charge und Fahrzeug: sichtbarer Text plus Kennung. */
export function zielFilter(eingabe: string, option?: SuchOption): boolean {
  const nadel = eingabe.trim().toLocaleLowerCase("de");
  const label = typeof option?.label === "string" ? option.label : "";
  const text = `${label} ${option?.keywords ?? ""}`.toLocaleLowerCase("de");
  return text.includes(nadel);
}

type Fahrzeug = {
  id: string;
  name: string;
  kennung: string | null;
  /**
   * DRK-309 — Fahrzeug oder Tasche, `null` heisst „noch nicht zugeordnet".
   *
   * ⚠️ PFLICHTFELD, KEIN OPTIONAL. Ein `einheitenart?` waere in jeder
   * vergessenen Aufrufstelle still `undefined`, und die Suche nach „tasche"
   * fande dort nichts — ohne dass ein Tor es meldete. Dieselbe Begruendung wie
   * bei `gebunden` in `CheckFlow.tsx`.
   */
  einheitenart: Einheitenart | null;
};

type ArtikelDrawerProps = {
  id: string;
  onSchliessen: () => void;
  fahrzeuge: Fahrzeug[];
  /** DRK-294 — Vorschlaege fuer das Kategoriefeld, je eine Schreibweise. */
  kategorien?: readonly string[];
};

type ZugangWerte = {
  menge: number;
  chargeId: string;
  chargenNr?: string;
  verfall?: Dayjs | null;
  zielLagerortId?: string;
};

type EntnahmeWerte = {
  menge: number;
  zielLagerortId?: string;
  kommentar?: string;
};

/** DRK-338 — beide Enden sind Orte des Handlagers, die Charge ist Pflicht. */
type UmlagerWerte = {
  chargeId: string;
  vonLagerortId: string;
  nachLagerortId: string;
  menge: number;
  kommentar?: string;
};

type ArtikelPatch = Partial<{
  mindestbestand: number;
  fach: string;
  einheit: string;
  /** `null` heisst „ohne Kategorie" (DRK-294). */
  kategorie: string | null;
}>;

export function ArtikelDrawer({
  id, onSchliessen, fahrzeuge, kategorien = [],
}: ArtikelDrawerProps) {
  const [detail, setDetail] = useState<ArtikelDetailResult>();
  /**
   * Die Meldung traegt ihre HERKUNFT, weil der Drawer lang ist.
   *
   * Ein Fehler aus „Entnahme buchen" stand bisher als einziger Kanal ganz oben
   * im Drawer — rund 700px ueber dem Knopf, hinter Kopf, Stammdaten und dem
   * ganzen Abschnitt „Zugang buchen", und es wird nicht dorthin gescrollt. Auf
   * einem schmalen Geraet sieht es aus, als reagiere der Knopf nicht, und der
   * Vorgang wird wiederholt. Formularfehler gehoeren deshalb an ihr Formular;
   * alles Uebrige (Laden, Stammdaten, Loeschen) bleibt oben.
   */
  const [meldung, setMeldung] = useState<
    { text: string; quelle: Meldungsquelle } | null
  >(null);
  function setFehler(
    text: string | null,
    quelle: Meldungsquelle = "allgemein",
  ): void {
    setMeldung(text === null ? null : { text, quelle });
  }

  const [busy, setBusy] = useState(false);
  const [mindestbestand, setMindestbestand] = useState<number | null>(null);
  const [fach, setFach] = useState("");
  const [einheit, setEinheit] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [loeschDialogGeneration, setLoeschDialogGeneration] = useState(0);
  const mindestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ladeGeneration = useRef(0);
  const mutationsKette = useRef<Promise<void>>(Promise.resolve());
  const offeneMutationen = useRef(0);
  const [zugangForm] = Form.useForm<ZugangWerte>();
  const [entnahmeForm] = Form.useForm<EntnahmeWerte>();
  const [umlagerForm] = Form.useForm<UmlagerWerte>();
  const ausgewaehlteCharge =
    Form.useWatch("chargeId", zugangForm) ?? NEUE_CHARGE;
  const umlagerCharge = Form.useWatch("chargeId", umlagerForm);
  const umlagerVon = Form.useWatch("vonLagerortId", umlagerForm);

  const laden = useCallback(async (): Promise<boolean> => {
    const generation = ++ladeGeneration.current;
    try {
      const ergebnis = await getDetail(id);
      if (generation !== ladeGeneration.current) return false;
      if (!ergebnis.ok) {
        setFehler(ergebnis.fehler);
        return false;
      }
      setDetail(ergebnis.wert);
      // Nach der Initialladung bleiben die drei Stammdaten lokale Spiegel.
      // Ein Reload darf keine neuere Eingabe ueberschreiben, waehrend der
      // vorherige Auto-Commit noch laeuft (Falle 45).
      return true;
    } catch {
      if (generation === ladeGeneration.current) {
        setFehler("Artikeldetails konnten nicht geladen werden.");
      }
      return false;
    }
  }, [id]);

  useEffect(() => {
    let verworfen = false;
    const generation = ++ladeGeneration.current;
    void getDetail(id).then(
      (ergebnis) => {
        if (verworfen || generation !== ladeGeneration.current) return;
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setDetail(ergebnis.wert);
        setMindestbestand(ergebnis.wert.artikel.mindestbestand);
        setFach(ergebnis.wert.artikel.fach);
        setEinheit(ergebnis.wert.artikel.einheit);
        setKategorie(ergebnis.wert.artikel.kategorie ?? "");
        setFehler(null);
      },
      () => {
        if (!verworfen && generation === ladeGeneration.current) {
          setFehler("Artikeldetails konnten nicht geladen werden.");
        }
      },
    );
    return () => {
      verworfen = true;
    };
  }, [id]);

  useEffect(() => () => {
    if (mindestTimer.current) clearTimeout(mindestTimer.current);
  }, []);

  function mutationSerialisieren(arbeit: () => Promise<void>): Promise<void> {
    offeneMutationen.current += 1;
    setBusy(true);
    const ausfuehrung = mutationsKette.current.then(arbeit, arbeit);
    mutationsKette.current = ausfuehrung.then(
      () => undefined,
      () => undefined,
    );
    return ausfuehrung.finally(() => {
      offeneMutationen.current -= 1;
      if (offeneMutationen.current === 0) setBusy(false);
    });
  }

  function loeschActionAbweisen(aktionsFehler: string): never {
    // LoeschDialog unterscheidet absichtlich nur Erfolg und Runtime-Fehler.
    // Ein erwarteter ActionErgebnis-Fehler gehoert dagegen unveraendert in
    // den Drawer. Der neue key schliesst den alten Dialog, ohne onFertig und
    // damit ohne den Artikel-Drawer zu schliessen.
    setFehler(aktionsFehler);
    setLoeschDialogGeneration((generation) => generation + 1);
    throw new Error("Die Löschaktion ist fachlich fehlgeschlagen.");
  }

  function artikelFeldSpeichern(aenderung: ArtikelPatch): Promise<void> {
    return mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await updateArtikel(id, aenderung);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        await laden();
      } catch {
        setFehler("Artikeldaten konnten nicht gespeichert werden.");
      }
    });
  }

  function mindestbestandAendern(wert: number | null): void {
    setMindestbestand(wert);
    if (mindestTimer.current) {
      clearTimeout(mindestTimer.current);
      mindestTimer.current = null;
    }
    if (wert === null) return;
    mindestTimer.current = setTimeout(() => {
      mindestTimer.current = null;
      void artikelFeldSpeichern({ mindestbestand: wert });
    }, MINDEST_DEBOUNCE_MS);
  }

  /** Zieht einen ausstehenden Mindestbestand-Commit vor (siehe `onBlur`). */
  function mindestbestandSpeichern(): void {
    if (!mindestTimer.current) return;
    clearTimeout(mindestTimer.current);
    mindestTimer.current = null;
    if (mindestbestand === null) return;
    void artikelFeldSpeichern({ mindestbestand });
  }

  function fachSpeichern(): void {
    const wert = fach.trim();
    if (wert && wert !== detail?.artikel.fach) {
      setFach(wert);
      void artikelFeldSpeichern({ fach: wert });
    }
  }

  function einheitSpeichern(): void {
    const wert = einheit.trim();
    if (wert && wert !== detail?.artikel.einheit) {
      setEinheit(wert);
      void artikelFeldSpeichern({ einheit: wert });
    }
  }

  /**
   * DRK-294. Anders als Fach und Einheit DARF die Kategorie leer werden — ein
   * geleertes Feld heisst „ohne Kategorie" und wird als `null` gespeichert.
   * Kein Grossschreiben wie beim Fach: das ist ein Kuerzel, die Kategorie ein Wort.
   */
  function kategorieSpeichern(): void {
    const wert = kategorieNormalisieren(kategorie);
    if (wert !== (detail?.artikel.kategorie ?? null)) {
      setKategorie(wert ?? "");
      void artikelFeldSpeichern({ kategorie: wert });
    }
  }

  function aktivAendern(aktiv: boolean): Promise<void> {
    return mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await setArtikelAktiv({ id, aktiv });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        await laden();
      } catch {
        setFehler("Artikelstatus konnte nicht gespeichert werden.");
      }
    });
  }

  async function zugangBuchen(werte: ZugangWerte): Promise<void> {
    let eingabe:
      | { artikelId: string; menge: number; chargeId: string; zielLagerortId?: string }
      | {
        artikelId: string;
        menge: number;
        neueCharge: { chargenNr: string; verfall: string };
        zielLagerortId?: string;
      };

    if (werte.chargeId === NEUE_CHARGE) {
      const verfall = monatAusPicker(werte.verfall);
      if (!verfall) {
        setFehler("Bitte einen Verfallsmonat auswählen.", "zugang");
        return;
      }
      eingabe = {
        artikelId: id,
        menge: werte.menge,
        neueCharge: {
          chargenNr: werte.chargenNr?.trim() ?? "",
          verfall,
        },
        ...(werte.zielLagerortId ? { zielLagerortId: werte.zielLagerortId } : {}),
      };
    } else {
      eingabe = {
        artikelId: id,
        menge: werte.menge,
        chargeId: werte.chargeId,
        ...(werte.zielLagerortId ? { zielLagerortId: werte.zielLagerortId } : {}),
      };
    }

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await bucheZugang(eingabe);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler, "zugang");
          return;
        }
        await laden();
        zugangForm.resetFields();
      } catch {
        setFehler("Zugang konnte nicht gebucht werden.", "zugang");
      }
    });
  }

  async function entnahmeBuchen(werte: EntnahmeWerte): Promise<void> {
    const kommentar = werte.kommentar?.trim();
    const eingabe = {
      artikelId: id,
      menge: werte.menge,
      ...(werte.zielLagerortId
        ? { zielLagerortId: werte.zielLagerortId }
        : {}),
      ...(kommentar ? { kommentar } : {}),
    };

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await bucheEntnahme(eingabe);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler, "entnahme");
          return;
        }
        await laden();
        entnahmeForm.resetFields();
      } catch {
        setFehler("Entnahme konnte nicht gebucht werden.", "entnahme");
      }
    });
  }

  async function umlagern(werte: UmlagerWerte): Promise<void> {
    const kommentar = werte.kommentar?.trim();
    const eingabe = {
      artikelId: id,
      chargeId: werte.chargeId,
      vonLagerortId: werte.vonLagerortId,
      nachLagerortId: werte.nachLagerortId,
      menge: werte.menge,
      ...(kommentar ? { kommentar } : {}),
    };

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await bucheUmlagerung(eingabe);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler, "umlagern");
          return;
        }
        await laden();
        umlagerForm.resetFields();
      } catch {
        setFehler("Umlagerung konnte nicht gebucht werden.", "umlagern");
      }
    });
  }

  /**
   * DRK-338 — DIE BRAUCHBAREN QUELLORTE EINER CHARGE, und das ist EINE Regel
   * fuer ZWEI Listen: welche Chargen angeboten werden und welche Quellorte.
   *
   * ⚠️ DASS ES EINE EINZIGE REGEL IST, IST DER EIGENTLICHE FIX (Review-Befunde
   * Codex P2 zu PR #161, zweiter und vierter). Erst hing sie nur an der
   * Charge — dann bot eine Charge, die ueber EINEN Ort wandern kann, ihre
   * uebrigen Orte trotzdem an: liegt sie an der Wurzel UND in einem
   * stillgelegten Schrank, waehrend kein Schrank aktiv ist, taugt der Schrank
   * als Quelle (Ziel: die Wurzel) und die Wurzel nicht (es gibt kein zweites
   * aktives Ziel). Zwei Listen mit zwei Regeln liefen genau hier auseinander.
   *
   * Drei Bedingungen, alle drei fachlich:
   *
   * 1. Der Ort gehoert zum HANDLAGER-BEREICH. `charge.orte` fuehrt auch
   *    Fahrzeuge mit („Schrank 1: 5 · RTW 1: 7"); umgelagert wird hier aber
   *    ausschliesslich innerhalb des Handlagers, damit dessen Summe gleich
   *    bleibt.
   * 2. An dem Ort liegt etwas VON DIESER Charge — aus einem Schrank, in dem
   *    nichts davon liegt, kann nichts wandern. Das ist `charge.orte` selbst.
   * 3. Es gibt ein ANDERES aktives Ziel. Sonst filtert „Nach" den gewaehlten
   *    Quellort heraus und steht leer da: ein Formular, das sich oeffnen laesst
   *    und nicht absenden.
   *
   * ⚠️ Bedingung 3 ist NICHT „mindestens zwei Orte im Bereich": die Quellen
   * schliessen stillgelegte Schraenke ein (genau dafuer gibt es sie), die Ziele
   * nicht. Die Abkuerzung waere wahr fuer den Fall, der scheitert, und falsch
   * fuer den, der tragen muss.
   */
  const handlagerOrtSet = new Set(detail?.handlagerOrtIds ?? []);
  const quellenVon = (charge: ArtikelDetailCharge | undefined) =>
    (charge?.orte ?? []).filter((ort) =>
      handlagerOrtSet.has(ort.id)
      && (detail?.zielOrte ?? []).some((ziel) => ziel.id !== ort.id));

  const umlagerQuellen = quellenVon(
    detail?.chargen.find((charge) => charge.id === umlagerCharge),
  );
  const umlagerQuelle = umlagerQuellen.find((ort) => ort.id === umlagerVon);

  /** Chargen, von denen im Handlager ueberhaupt etwas liegt — ohne Ruecksicht
   *  darauf, ob es von dort aus weitergeht. Traegt allein den Leer-Satz. */
  const chargenImHandlager = (detail?.chargen ?? [])
    .filter((charge) => charge.orte.some((ort) => handlagerOrtSet.has(ort.id)));

  /** Und die, fuer die es wirklich einen Weg gibt — dieselbe Regel wie oben. */
  const umlagerChargen = (detail?.chargen ?? [])
    .filter((charge) => quellenVon(charge).length > 0);

  const chargeOptionen = detail
    ? [
      { value: NEUE_CHARGE, label: "+ Neue Charge", keywords: "neue Charge" },
      ...detail.chargen.map((charge) => ({
        value: charge.id,
        label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · Rest gesamt ${charge.restGesamt}`,
        keywords: charge.chargenNr,
      })),
    ]
    : [];

  const zielOrtOptionen = (detail?.zielOrte ?? []).map((ort) => ({
    value: ort.id,
    label: ort.name,
  }));

  /**
   * ⚠️ DIE ART STEHT IN DEN SUCHWORTEN, NICHT IM SICHTBAREN LABEL (DRK-309).
   *
   * ⚠️ DIE ART STEHT IM LABEL, NICHT NUR IN DEN SUCHWORTEN — Kehrtwende aus
   * Reviewrunde 4, und der Grund ist nachpruefbar statt geschmacklich:
   * `lagerorte.name` traegt KEINEN Eindeutigkeitsschluessel (`_db/schema.ts`).
   * Zwei Zeilen duerfen also gleich heissen, und dann sind sie in einer Liste
   * aus blossen Namen nicht mehr auseinanderzuhalten. Die frueher hier
   * notierte Abwaegung („der Name unterscheidet die Eintraege bereits") setzte
   * genau das voraus, was das Schema nicht zusagt.
   *
   * ⚠️ DIESELBE FORM WIE AUF DEM HELFERSCHIRM (`_ui/FahrzeugWahl.tsx`):
   * „Art · Kennung" hinter dem Namen. Zwei Flaechen, die dieselbe Einheit
   * waehlen lassen, fuehren keine zwei Schreibweisen fuer dieselbe Zeile.
   * Die Kennung steht nur, wenn es eine gibt; die Art steht immer — auch der
   * Zwischenstand, der „nicht zugeordnet" sagt statt zu schweigen.
   *
   * Die Suchworte bleiben daneben bestehen: wer „tasche" tippt, meint die Art
   * und nicht die Schreibweise, und das trifft jetzt Label UND Schluessel.
   */
  const fahrzeugBeschriftung = einheitLabels(fahrzeuge);
  const fahrzeugOptionen = fahrzeuge.map((fahrzeug) => ({
    value: fahrzeug.id,
    // ⚠️ UND WO AUCH DIE ART NICHT TRENNT, TRENNT DIE ID (Reviewrunde 16):
    // zwei Taschen duerfen gleich heissen und beide ohne Kennung sein.
    // `einheitLabels` haengt die ID NUR im Kollisionsfall an.
    label: fahrzeugBeschriftung.get(fahrzeug.id)!.label,
    keywords: [fahrzeug.name, fahrzeug.kennung, einheitenartLabel(fahrzeug.einheitenart)]
      .filter(Boolean).join(" "),
  }));

  return (
    <Drawer
      open
      onClose={onSchliessen}
      title={detail?.artikel.name ?? "Artikeldetails"}
      /*
       * 1120 STATT 880 STATT 520 — beide Sprünge kommen aus einer Messung.
       *
       * 520 → 880 (13.09.2026, `e2e/flyin-breite.spec.ts`): bei 520 px war
       * der Inhalt 1862 px hoch, auf 1280x720 davon ein Drittel zu sehen,
       * während links 760 px abgedunkelter Hintergrund brachlagen.
       *
       * 880 → 1120 (21.09.2026): die beiden Tabellen unten fahren
       * `scroll.x: "max-content"`. Schon die Seed-Daten brauchten für die
       * Chargen 691 px; der Platz darin war 798 px — echte Chargen mit
       * mehreren Orten und Buchungen mit Kommentar liefen darüber hinaus und
       * brachten je Tabelle einen eigenen waagerechten Scrollbalken mit.
       *
       * Breiter allein hätte wenig geholfen — eine breitere Spalte ist
       * immer noch EINE Spalte. Die Zahl wirkt erst zusammen mit dem
       * `buchungsspalten`-Raster weiter unten, das die beiden Buchungs-
       * formulare ab genug Breite nebeneinander legt.
       *
       * ⛔ KEIN `size="large"` (das wären antds 736) und keine nackte Zahl:
       * `flyinBreite` deckelt auf 92 vw — auf 1280 px bleiben damit 160 px
       * Hintergrund, auf 1024 px greift der Deckel.
       */
      size={flyinBreite(1120)}
      rootClassName={styles.modul}
      destroyOnHidden
    >
      {meldung?.quelle === "allgemein" ? (
        <Alert
          type="warning"
          showIcon={false}
          title={meldung.text}
          style={{ marginBlockEnd: 16 }}
        />
      ) : null}

      {!detail ? (
        <div style={SCHRIFT.neben}>Artikeldetails werden geladen …</div>
      ) : (
        <div className={styles.artikelRaster}>
          <ArtikelKopf
            detail={detail}
            mindestbestand={mindestbestand ?? detail.artikel.mindestbestand}
          />

          {/*
            ⚠️ DER SATZ NENNT SEIT DRK-380 AUCH DIE FOLGE, nicht nur die Lage.
            „Erscheint nicht in den aktiven Listen" allein erklaerte das
            gesperrte Zugangsformular daneben nicht — und ein gesperrtes Feld
            ohne Grund ist der Fall, in dem jemand den Schalter sucht und die
            Verbindung nicht herstellt. Der Zusatz sagt ausserdem, was WEITER
            geht: Entnahme und Umlagerung bleiben erlaubt, damit der
            Restbestand abzubuchen ist (Entscheidung zu DRK-380).
          */}
          {!detail.artikel.aktiv ? (
            <Alert
              type="info"
              showIcon={false}
              title={
                "Dieser Artikel ist deaktiviert und erscheint nicht in den aktiven " +
                "Listen. Auf ihn geht kein Material mehr zu; Entnahme und Umlagerung " +
                "bleiben möglich."
              }
            />
          ) : null}

          <Abschnitt titel="Stammdaten">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div style={SCHRIFT.feldname}>Mindestbestand</div>
                <div data-rolle="mindestbestand">
                  <InputNumber
                    min={0}
                    precision={0}
                    value={mindestbestand}
                    onChange={mindestbestandAendern}
                    // Zieht den entprellten Schreibvorgang beim Verlassen des
                    // Feldes vor. Ohne das verliert ein Schliessen des Drawers
                    // innerhalb der Entprellzeit die Aenderung stillschweigend
                    // — der Aufraeumer loescht den Timer, ohne ihn
                    // auszufuehren. `fach` und `einheit` daneben tun es schon.
                    onBlur={mindestbestandSpeichern}
                    aria-label="Mindestbestand"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Fach im Handlager</div>
                <Input
                  value={fach}
                  onChange={(ereignis) => setFach(ereignis.target.value.toUpperCase())}
                  onBlur={fachSpeichern}
                  aria-label="Fach im Handlager"
                />
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Kategorie</div>
                <KategorieEingabe
                  kategorien={kategorien}
                  value={kategorie}
                  onChange={setKategorie}
                  onBlur={kategorieSpeichern}
                  aria-label="Kategorie"
                />
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Einheit</div>
                <Input
                  value={einheit}
                  onChange={(ereignis) => setEinheit(ereignis.target.value)}
                  onBlur={einheitSpeichern}
                  aria-label="Einheit"
                />
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Aktiv</div>
                <Switch
                  checked={detail.artikel.aktiv}
                  loading={busy}
                  onChange={(aktiv) => { void aktivAendern(aktiv); }}
                  aria-label="Artikel aktiv"
                />
              </div>
            </div>
          </Abschnitt>

          <div className={styles.buchungsspalten}>
            <Abschnitt titel="Zugang buchen">
              {/*
                ⚠️ GESPERRT, WENN DER ARTIKEL DEAKTIVIERT IST — DRK-380, und
                als EINZIGES der drei Formulare dieser Spalte. Entnahme und
                Umlagerung bleiben offen: „deaktivieren" ist der Rueckfall des
                Loeschpfades fuer einen Artikel MIT Historie, und wer den
                Abgang mitsperrte, froere dessen Restbestand ein. Die Richtung
                ist die Asymmetrie — heraus ja, hinein nein.

                ⚠️ DER GRUND STEHT OBEN IM `Alert`, NICHT HIER. `Form`s
                `disabled` reicht an jedes Feld durch; ein zweiter Hinweis
                direkt am Formular stuende zweimal auf demselben Schirm.
              */}
              <Form<ZugangWerte>
                form={zugangForm}
                layout="vertical"
                disabled={busy || !detail.artikel.aktiv}
                initialValues={{
                  menge: 1,
                  chargeId: NEUE_CHARGE,
                  ...(detail && detail.zielOrte.length === 1
                    ? { zielLagerortId: detail.zielOrte[0]!.id }
                    : {}),
                }}
                onFinish={(werte) => { void zugangBuchen(werte); }}
                data-rolle="zugang-form"
              >
                <Form.Item
                  name="menge"
                  label="Menge"
                  rules={[{ required: true }, { type: "number", min: 1 }]}
                >
                  <InputNumber
                    min={1}
                    precision={0}
                    aria-label="Zugangsmenge"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                <Form.Item name="chargeId" label="Charge" rules={[{ required: true }]}>
                  <Select
                    aria-label="Charge"
                    showSearch
                    filterOption={zielFilter}
                    options={chargeOptionen}
                    virtual={false}
                  />
                </Form.Item>
                <Form.Item
                  name="zielLagerortId"
                  label="Wohin"
                  rules={[{ required: true, message: "Bitte einen Ort wählen" }]}
                  extra="„Handlager (ohne Schrank)“ heißt: noch nicht einsortiert."
                >
                  <Select
                    aria-label="Wohin"
                    showSearch
                    optionFilterProp="label"
                    options={zielOrtOptionen}
                  />
                </Form.Item>
                {ausgewaehlteCharge === NEUE_CHARGE ? (
                  <>
                    <Form.Item
                      name="chargenNr"
                      label="Chargennummer"
                      rules={[{ required: true, whitespace: true }]}
                    >
                      <Input aria-label="Chargennummer" autoComplete="off" />
                    </Form.Item>
                    <Form.Item label="Verfallsmonat">
                      <div data-rolle="verfallsmonat">
                        <Form.Item
                          name="verfall"
                          noStyle
                          rules={[{ required: true, message: "Bitte Verfallsmonat auswählen." }]}
                        >
                          <DatePicker
                            picker="month"
                            format="YYYY-MM"
                            aria-label="Verfallsmonat"
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                      </div>
                    </Form.Item>
                  </>
                ) : null}
                {meldung?.quelle === "zugang" ? (
                  <Alert
                    type="warning"
                    showIcon={false}
                    title={meldung.text}
                    style={{ marginBlockEnd: 12 }}
                  />
                ) : null}
                <Button type="primary" htmlType="submit" loading={busy}>
                  Zugang buchen
                </Button>
              </Form>
            </Abschnitt>

            <Abschnitt titel="Entnahme buchen">
              <Form<EntnahmeWerte>
                form={entnahmeForm}
                layout="vertical"
                disabled={busy}
                initialValues={{ menge: 1 }}
                onFinish={(werte) => { void entnahmeBuchen(werte); }}
                data-rolle="entnahme-form"
              >
                <Form.Item
                  name="menge"
                  label="Menge"
                  rules={[{ required: true }, { type: "number", min: 1 }]}
                >
                  <InputNumber
                    min={1}
                    precision={0}
                    aria-label="Entnahmemenge"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                {/*
                  DRK-309: „Ziel-Einheit", weil die Liste darunter Fahrzeuge
                  UND Taschen führt. Welche Art eine einzelne Option hat, sagt
                  die Option (`fahrzeugOptionen`).
                */}
                <Form.Item name="zielLagerortId" label="Ziel-Einheit">
                  <Select
                    aria-label="Ziel-Einheit"
                    placeholder="Handlager (Verbrauch)"
                    allowClear
                    showSearch
                    filterOption={zielFilter}
                    options={fahrzeugOptionen}
                    virtual={false}
                  />
                </Form.Item>
                <Form.Item name="kommentar" label="Kommentar">
                  <Input.TextArea
                    aria-label="Entnahmekommentar"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                  />
                </Form.Item>
                {meldung?.quelle === "entnahme" ? (
                  <Alert
                    type="warning"
                    showIcon={false}
                    title={meldung.text}
                    style={{ marginBlockEnd: 12 }}
                  />
                ) : null}
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={busy}
                  disabled={detail.artikel.bestand === 0}
                >
                  Entnahme buchen
                </Button>
              </Form>
            </Abschnitt>
          </div>

          {/*
            DRK-338 — DAS UMLAGERN STEHT UEBER DER CHARGENTABELLE UND NICHT IM
            Raster daneben: es liest sich aus derselben Tabelle („Liegt in:
            Schrank 1: 5 · GF-Schrank: 3"), die direkt darunter steht. Zwei
            Spalten waeren hier ausserdem eng — das Formular traegt fuenf
            Felder, Zugang und Entnahme drei bzw. vier.
          */}
          <Abschnitt titel="Umlagern im Handlager">
            {/*
              ⚠️ ZWEI VERSCHIEDENE LEEREN, ZWEI VERSCHIEDENE SAETZE. „Es liegt
              nichts da" und „es gibt keinen zweiten Ort" verlangen
              unterschiedliche Handgriffe; ein gemeinsamer Satz schickte die
              Haelfte der Leser an die falsche Stelle.
            */}
            {umlagerChargen.length === 0 ? (
              <div style={SCHRIFT.neben}>
                {chargenImHandlager.length === 0
                  ? "Von diesem Artikel liegt im Handlager nichts, das sich umlagern ließe."
                  : "Es gibt im Handlager keinen zweiten aktiven Ort, in den dieses Material "
                    + "wandern könnte. Lege unter „Lagerorte“ einen Schrank an oder nimm einen "
                    + "stillgelegten wieder in Betrieb."}
              </div>
            ) : (
              <Form<UmlagerWerte>
                form={umlagerForm}
                layout="vertical"
                disabled={busy}
                initialValues={{ menge: 1 }}
                onFinish={(werte) => { void umlagern(werte); }}
                data-rolle="umlager-form"
              >
                <div className={styles.umlagerfelder}>
                  <Form.Item name="chargeId" label="Charge" rules={[{ required: true }]}>
                    <Select
                      aria-label="Umlagerung Charge"
                      showSearch
                      filterOption={zielFilter}
                      options={umlagerChargen.map((charge) => ({
                        value: charge.id,
                        label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)}`,
                        keywords: charge.chargenNr,
                      }))}
                      virtual={false}
                      /*
                       * ⚠️ QUELLE UND MENGE MUESSEN MIT. Beide haengen an der
                       * Charge: ein stehengebliebener Schrank waere nach dem
                       * Wechsel eine Quelle, an der diese Charge gar nicht
                       * liegt — und die Menge eine, die es dort nicht gibt. Der
                       * Server faengt beides ab, aber erst nach dem Absenden.
                       */
                      onChange={() => umlagerForm.setFieldsValue({
                        vonLagerortId: undefined, menge: 1,
                      })}
                    />
                  </Form.Item>
                  <Form.Item
                    name="vonLagerortId"
                    label="Von"
                    rules={[{ required: true, message: "Bitte den Quellort wählen" }]}
                  >
                    <Select
                      aria-label="Von"
                      disabled={!umlagerCharge}
                      placeholder={umlagerCharge ? undefined : "Erst die Charge wählen"}
                      options={umlagerQuellen.map((ort) => ({
                        value: ort.id,
                        label: `${ort.name} · ${ort.menge} ${detail.artikel.einheit}`,
                      }))}
                      /*
                       * ⚠️ DAS ZIEL MUSS MIT — EIN FELD AUS DER AUSWAHL ZU
                       * NEHMEN LOESCHT SEINEN WERT NICHT (Review-Befund Codex
                       * P2 zu PR #161). „Nach" filtert den gewaehlten Quellort
                       * heraus; wer aber ZUERST das Ziel waehlt und danach
                       * denselben Ort als Quelle, behaelt ihn als Formularwert.
                       * Die Auswahl zeigt dann die nackte Kennung an, und das
                       * Absenden laeuft in „Quelle und Ziel muessen verschieden
                       * sein" — an einer Bedienfolge, die nichts Falsches tut.
                       */
                      onChange={(wert: string) => umlagerForm.setFieldsValue({
                        menge: 1,
                        ...(umlagerForm.getFieldValue("nachLagerortId") === wert
                          ? { nachLagerortId: undefined }
                          : {}),
                      })}
                    />
                  </Form.Item>
                  <Form.Item
                    name="nachLagerortId"
                    label="Nach"
                    rules={[{ required: true, message: "Bitte den Zielort wählen" }]}
                  >
                    <Select
                      aria-label="Nach"
                      showSearch
                      optionFilterProp="label"
                      // Der gewaehlte Quellort faellt heraus: „von A nach A" ist
                      // keine Umlagerung, und der Server lehnt sie ohnehin ab.
                      options={detail.zielOrte
                        .filter((ort) => ort.id !== umlagerVon)
                        .map((ort) => ({ value: ort.id, label: ort.name }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="menge"
                    label="Menge"
                    rules={[{ required: true }, { type: "number", min: 1 }]}
                    /*
                     * ⚠️ DER DECKEL IST EINE HILFE, KEIN RIEGEL. Er steht
                     * daneben in `bucheUmlagerung`, und dort rollt eine zu
                     * grosse Menge die ganze Buchung zurueck — eine TEILWEISE
                     * Umlagerung liesse den Buchstand an beiden Orten falsch
                     * stehen, ohne dass es jemand erfaehrt.
                     */
                    extra={umlagerQuelle
                      ? `Dort liegen ${umlagerQuelle.menge} ${detail.artikel.einheit}.`
                      : undefined}
                  >
                    <InputNumber
                      min={1}
                      max={umlagerQuelle?.menge}
                      precision={0}
                      aria-label="Umlagerungsmenge"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                </div>
                <Form.Item name="kommentar" label="Kommentar">
                  <Input.TextArea
                    aria-label="Umlagerungskommentar"
                    autoSize={{ minRows: 1, maxRows: 3 }}
                  />
                </Form.Item>
                {meldung?.quelle === "umlagern" ? (
                  <Alert
                    type="warning"
                    showIcon={false}
                    title={meldung.text}
                    style={{ marginBlockEnd: 12 }}
                  />
                ) : null}
                <Button type="primary" htmlType="submit" loading={busy}>
                  Umlagern
                </Button>
              </Form>
            )}
          </Abschnitt>

          <ChargenTabelle
            chargen={detail.chargen}
            einheit={detail.artikel.einheit}
          />
          <HistorieTabelle
            historie={detail.historie}
            mehrVorhanden={detail.mehrVorhanden}
          />

          <section className={styles.gefahr}>
            <div className={styles.gtitle}>Gefahrenzone</div>
            <p style={SCHRIFT.text}>
              Artikel deaktivieren oder – wenn keine Nachweise verknüpft sind – endgültig löschen.
            </p>
            <LoeschButton
              key={loeschDialogGeneration}
              name={detail.artikel.name}
              typLabel="Artikel"
              pruefen={async () => {
                const ergebnis = await pruefeLoeschbar("artikel", id);
                if (!ergebnis.ok) {
                  return {
                    loeschbar: false,
                    grund: ergebnis.fehler,
                    kannDeaktivieren: false,
                  };
                }
                return ergebnis.wert;
              }}
              onLoeschen={async () => {
                setFehler(null);
                const ergebnis = await loescheElement("artikel", id);
                if (!ergebnis.ok) loeschActionAbweisen(ergebnis.fehler);
              }}
              onDeaktivieren={async () => {
                setFehler(null);
                const ergebnis = await deaktiviereElement("artikel", id);
                if (!ergebnis.ok) loeschActionAbweisen(ergebnis.fehler);
              }}
              onFertig={onSchliessen}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid var(--lb-linie)",
        borderRadius: 6,
        padding: 16,
        background: "var(--lb-karte)",
      }}
    >
      <h3 style={{ ...SCHRIFT.abschnitt, marginBlock: "0 14px" }}>{titel}</h3>
      {children}
    </section>
  );
}

function ArtikelKopf({
  detail,
  mindestbestand,
}: {
  detail: ArtikelDetailResult;
  mindestbestand: number;
}) {
  const unterMindest = detail.artikel.bestand < mindestbestand;
  // ⚠️ `rest` ist der Handlager-Bereich, `restGesamt` schliesst Fahrzeuge ein. Der
  // Chip meint die Nachschub-Sicht des Handlagers und darf NICHT auf Fahrzeug-
  // bestand anspringen — dafuer ist der Fahrzeug-Check zustaendig (§5.2.1).
  const faelligeCharge = detail.chargen.find((charge) => charge.ampel !== "gruen" && charge.rest > 0);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={SCHRIFT.zahl}>
        Bestand {detail.artikel.bestand} {detail.artikel.einheit}
      </div>
      <Space wrap>
        {!detail.artikel.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
        {detail.artikel.aktiv && !unterMindest && !faelligeCharge ? (
          <Chip ton="ok">ok</Chip>
        ) : null}
        {unterMindest ? <Chip ton="rot">unter Mindestbestand</Chip> : null}
        {faelligeCharge ? (
          <Chip ton={ampelTon(faelligeCharge.ampel)}>
            Charge {faelligeCharge.text}
          </Chip>
        ) : null}
      </Space>
    </div>
  );
}

function ChargenTabelle({
  chargen,
  einheit,
}: {
  chargen: ArtikelDetailCharge[];
  einheit: string;
}) {
  return (
    <Abschnitt titel="Chargen · älteste zuerst (FEFO)">
      <Datentabelle<ArtikelDetailCharge>
        aria-label="Chargen"
        rowKey="id"
        dataSource={chargen}
        locale={{ emptyText: "Keine Chargen im Bestand." }}
        columns={[
          {
            title: "Verfall",
            key: "verfall",
            // FEFO ist die Vorsortierung der Abfrage; sortiert wird ueber die
            // Ampel, nicht ueber `charge.text` („in 2 Monaten", „abgelaufen") —
            // der ordnete als Zeichenkette beliebig.
            sorter: nachRang<ArtikelDetailCharge, ArtikelDetailCharge["ampel"]>(
              (charge) => charge.ampel,
              AMPEL_RANG,
            ),
            render: (_, charge) => (
              <Space>
                <Plakette
                  verfall={charge.verfall}
                  ampel={charge.ampel}
                  statusText={charge.text}
                />
                <Chip ton={ampelTon(charge.ampel)}>{charge.text}</Chip>
              </Space>
            ),
          },
          {
            title: "Charge",
            dataIndex: "chargenNr",
            key: "chargenNr",
            sorter: nachText<ArtikelDetailCharge>((charge) => charge.chargenNr),
          },
          {
            title: "Liegt in",
            key: "orte",
            render: (_, charge) => <OrtVerteilung orte={charge.orte} einheit={einheit} />,
          },
          {
            // Hieß „Rest" und zeigte den Handlager — das las sich als
            // Gesamtbestand. Der Name sagt jetzt, was die Zahl ist.
            title: "Rest gesamt",
            dataIndex: "restGesamt",
            key: "restGesamt",
            align: "right",
            // Gezeigt wird „3 Stk", sortiert wird ueber die nackte Zahl.
            sorter: nachZahl<ArtikelDetailCharge>((charge) => charge.restGesamt),
            render: (rest: number) => `${rest} ${einheit}`,
          },
        ]}
      />
    </Abschnitt>
  );
}

/**
 * ⛔ KEIN SORTIERER IN DIESER TABELLE — SIE HAELT EINEN AUSSCHNITT, und das
 * sagt ihr eigenes Prop: `mehrVorhanden`.
 *
 * Gezeigt werden die LETZTEN Buchungen, nicht alle. Ein Vergleicher im
 * Spaltenkopf verspraeche ein EXTREM („Zeit aufsteigend" = die erste Buchung
 * dieses Artikels), das genau dann falsch ist, wenn der Deckel greift. Volle
 * Begruendung: `core/tabelle/sortierer.ts` (DRK-331, fuenfte Reviewrunde).
 *
 * ⚠️ NICHT AUF `ChargenTabelle` UEBERTRAGEN: die haelt ALLE Chargen des
 * Artikels (`chargenMitRest`, ohne Deckel) und darf deshalb sortieren.
 */
function HistorieTabelle({
  historie,
  mehrVorhanden,
}: {
  historie: ArtikelDetailBuchung[];
  mehrVorhanden: boolean;
}) {
  return (
    <Abschnitt titel="Letzte Buchungen">
      <Datentabelle<ArtikelDetailBuchung>
        aria-label="Buchungshistorie des Artikels"
        rowKey="id"
        dataSource={historie}
        locale={{ emptyText: "Noch keine Buchungen." }}
        columns={[
          {
            title: "Zeit",
            dataIndex: "ts",
            key: "ts",
            // ⚠️ UEBER DAS `Date`, NIE UEBER `fmtTs(ts)`: „14.09. 08:12"
            // ordnete als Zeichenkette den 2. Oktober vor den 14. September.
            // Die Zeile traegt hier bereits den Rohwert — sie kommt aus einer
            // Server Action, nicht ueber die RSC-Grenze.
            render: (ts: Date) => <span className={styles.jts}>{fmtTs(ts)}</span>,
          },
          {
            /*
             * ⚠️ DER KOMMENTAR BRAUCHT EINE BREITE (DRK-372), und in einer
             * Schublade wiegt das doppelt: `buchungen.kommentar` hat keine
             * Laengengrenze, die Tabelle faehrt `scroll.x: "max-content"` —
             * und der Platz daneben ist hier nicht das Fenster, sondern der
             * `flyinBreite`-Deckel der Schublade (Falle 13). Ort, Quelle und
             * Menge waeren damit schon bei einem Satz aus dem Bild.
             *
             * Ohne `zeilen`: gedeckelt wird die Breite, nie die Hoehe —
             * dieselbe Abwaegung wie im Journal, dort ausgeschrieben.
             */
            title: "Buchung",
            key: "typ",
            render: (_, buchung) => {
              const zeile = journalZeile(buchung);
              return (
                <Zellentext
                  text={buchung.kommentar
                    ? `${zeile.typText} · ${buchung.kommentar}`
                    : zeile.typText}
                />
              );
            },
          },
          // DRK-338 — ohne den Ort stehen die beiden Zeilen einer Umlagerung
          // ununterscheidbar untereinander: zweimal „Umlagerung", −5 und +5.
          {
            title: "Ort",
            dataIndex: "ortName",
            key: "ortName",
          },
          {
            title: "Quelle",
            dataIndex: "quelleName",
            key: "quelleName",
          },
          {
            title: "Menge",
            key: "menge",
            align: "right",
            render: (_, buchung) => {
              const zeile = journalZeile(buchung);
              const farbe = zeile.zustand === "negativ"
                ? styles.jminus
                : zeile.zustand === "positiv"
                  ? styles.jplus
                  : "";
              return (
                <span className={`${styles.jdelta} ${farbe}`}>
                  {zeile.mengeText}
                </span>
              );
            },
          },
        ]}
      />
      {mehrVorhanden ? (
        <div className={styles.footnote} style={{ marginBlockStart: 10 }}>
          Es werden nur die neuesten Buchungen angezeigt.
        </div>
      ) : null}
    </Abschnitt>
  );
}
