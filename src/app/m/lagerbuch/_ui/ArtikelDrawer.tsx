"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { Dayjs } from "dayjs";
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  type InputRef,
} from "antd";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { Kartentabelle, nachRang, nachText, nachZahl, Zellentext } from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { SPACE } from "@/core/theme/tokens";
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
import { Ikone } from "./ikonen";
import { KategorieEingabe } from "./KategorieEingabe";
import { LoeschButton } from "./LoeschButton";
import { monatAusPicker } from "./monat";
import { OrtVerteilung } from "./OrtVerteilung";
import { Plakette } from "./Plakette";
import styles from "./verwaltung.module.css";
import { MONATSWAEHLER_IM_BILD } from "../_lib/monatswaehler";

export const NEUE_CHARGE = "__neu__";

/**
 * Wo eine Meldung HINGEHOERT. Ein Fehler aus dem Umlagern-Formular gehoert an
 * dieses Formular, nicht an den Kopf der Schublade — seit IDA-235 steht er
 * sonst sogar in einem anderen Reiter.
 */
type Meldungsquelle = "allgemein" | "zugang" | "entnahme" | "umlagern" | "stammdaten";

/**
 * IDA-235 — DIE REITER DER SCHUBLADE. Vorher stand alles untereinander: rund
 * 1 650–1 950 px Inhalt mit 13–18 Eingabefeldern, und ein Tippfehler im
 * Mindestbestand war nach 400 ms gespeichert. Jetzt: lesen zuerst
 * („Übersicht"), Buchen als eigener Reiter mit EINEM Formular zur Zeit,
 * Stammdaten nur ueber „Bearbeiten" mit ausdruecklichem Speichern.
 *
 * ⚠️ DER REITER STEHT NICHT IN DER ADRESSE, anders als die Reiter der Seiten.
 * Seit IDA-239 steht der offene ARTIKEL dort (`?artikel=`, ersetzt, nicht
 * angehaengt — `ArtikelTable`); ein `?reiter=` daneben waere ein zweiter
 * Parameter fuer einen fluechtigen Zustand, und Zurueck schaltete den Reiter
 * um, statt die Schublade zu schliessen.
 */
type Reiter = "uebersicht" | "buchen" | "stammdaten" | "verlauf";
type Buchungsart = "zugang" | "entnahme" | "umlagern";

const BUCHUNGSARTEN: { value: Buchungsart; label: string }[] = [
  { value: "zugang", label: "Zugang" },
  { value: "entnahme", label: "Entnahme" },
  { value: "umlagern", label: "Umlagern" },
];

/** Das Journal filtert nach Artikel-Kennung (`?artikel=`, IDA-239). */
const JOURNAL_PFAD = "/verwaltung/journal";

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

/**
 * FALLE 24 — DEN FOKUS NUR SETZEN, WENN ER VERLOREN IST.
 *
 * Gesetzt wird er hier nur nach einem Moduswechsel der Stammdaten („Bearbeiten",
 * „Abbrechen", „Speichern"): der geklickte Knopf verschwindet dabei, und der
 * Fokus faellt auf `body`. Speichern ist aber asynchron — wer inzwischen in
 * „Buchen" eine Menge tippt, darf sie nicht an „Bearbeiten" verlieren. Deshalb
 * zaehlt nur `body`, ein abgehaengtes Element oder ein nicht tabbarer Rahmen
 * (`tabindex="-1"`, der Container der Schublade) als verloren. Vorbild:
 * `kommplan/_ui/fokus.ts`; dessen `fokusVerloren` zaehlt jedes Element IN einer
 * Schublade als verloren, weil es dort um eine SCHLIESSENDE geht — hier bleibt
 * sie offen.
 */
function fokussiereWennVerloren(ziel: HTMLElement | null | undefined): void {
  if (!ziel || typeof document === "undefined") return;
  const aktiv = document.activeElement;
  const verloren = aktiv === null
    || aktiv === document.body
    || !aktiv.isConnected
    || aktiv.getAttribute("tabindex") === "-1";
  if (verloren) ziel.focus();
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

type StammdatenWerte = {
  name: string;
  mindestbestand: number;
  fach: string;
  kategorie?: string;
  einheit: string;
  aktiv: boolean;
};

type ArtikelPatch = Partial<{
  name: string;
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
   * Die Meldung traegt ihre HERKUNFT. Ein Fehler aus „Entnahme" stand frueher
   * als einziger Kanal ganz oben in der Schublade — rund 700 px ueber dem
   * Knopf, und es wird nicht dorthin gescrollt. Auf einem schmalen Geraet sah
   * es aus, als reagiere der Knopf nicht, und der Vorgang wurde wiederholt.
   * Formularfehler gehoeren deshalb an ihr Formular; alles Uebrige (Laden,
   * Loeschen) bleibt oben.
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
  const [reiter, setReiter] = useState<Reiter>("uebersicht");
  /** `null` = noch nicht gewaehlt; dann entscheidet der Artikel (s. `art`). */
  const [buchungsart, setBuchungsart] = useState<Buchungsart | null>(null);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschDialogGeneration, setLoeschDialogGeneration] = useState(0);
  const ladeGeneration = useRef(0);
  const mutationsKette = useRef<Promise<void>>(Promise.resolve());
  const offeneMutationen = useRef(0);
  const fokusNachModuswechsel = useRef(false);
  const bearbeitenKnopf = useRef<HTMLButtonElement>(null);
  const nameFeld = useRef<InputRef>(null);
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

  // Falle 24: nur nach einem Moduswechsel, den ein Klick ausgeloest hat — nie
  // beim Oeffnen (dort fokussiert die Schublade ihren Rahmen selbst).
  useEffect(() => {
    if (!fokusNachModuswechsel.current) return;
    fokusNachModuswechsel.current = false;
    fokussiereWennVerloren(
      bearbeiten ? nameFeld.current?.input : bearbeitenKnopf.current,
    );
  }, [bearbeiten]);

  function modusWechseln(neu: boolean): void {
    fokusNachModuswechsel.current = true;
    if (neu) setFehler(null);
    setBearbeiten(neu);
  }

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
    setFehler(aktionsFehler, "stammdaten");
    setLoeschDialogGeneration((generation) => generation + 1);
    throw new Error("Die Löschaktion ist fachlich fehlgeschlagen.");
  }

  /**
   * IDA-235 — STAMMDATEN WERDEN AUSDRUECKLICH GESPEICHERT, nicht mehr nach
   * Blur bzw. 400 ms. Ein Tippfehler im Mindestbestand war vorher ohne
   * Rueckweg gespeichert; jetzt verwirft „Abbrechen" ihn.
   *
   * Geschickt wird nur, was sich gegenueber dem geladenen Stand AENDERT — ein
   * unveraendertes Formular schreibt nichts. Dieselben Regeln wie vorher je
   * Feld: Fach in Grossbuchstaben, Kategorie darf leer werden und heisst dann
   * `null` (DRK-294), Name, Fach und Einheit nie leer (das sagen die Regeln
   * am Formular). Der Schalter „Aktiv" laeuft ueber seine eigene Action und
   * erst NACH den Feldern: scheitern die, bleibt der Status unberuehrt.
   */
  async function stammdatenSpeichern(werte: StammdatenWerte): Promise<void> {
    if (!detail) return;
    const bisher = detail.artikel;
    const aenderung: ArtikelPatch = {};
    const name = werte.name.trim();
    if (name !== bisher.name) aenderung.name = name;
    if (werte.mindestbestand !== bisher.mindestbestand) {
      aenderung.mindestbestand = werte.mindestbestand;
    }
    const fach = werte.fach.trim().toUpperCase();
    if (fach !== bisher.fach) aenderung.fach = fach;
    const einheit = werte.einheit.trim();
    if (einheit !== bisher.einheit) aenderung.einheit = einheit;
    const kategorie = kategorieNormalisieren(werte.kategorie);
    if (kategorie !== (bisher.kategorie ?? null)) aenderung.kategorie = kategorie;
    const aktivGeaendert = werte.aktiv !== bisher.aktiv;

    if (Object.keys(aenderung).length === 0 && !aktivGeaendert) {
      modusWechseln(false);
      return;
    }

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        if (Object.keys(aenderung).length > 0) {
          const ergebnis = await updateArtikel(id, aenderung);
          if (!ergebnis.ok) {
            setFehler(ergebnis.fehler, "stammdaten");
            return;
          }
        }
        if (aktivGeaendert) {
          const ergebnis = await setArtikelAktiv({ id, aktiv: werte.aktiv });
          if (!ergebnis.ok) {
            setFehler(ergebnis.fehler, "stammdaten");
            await laden();
            return;
          }
        }
        await laden();
        modusWechseln(false);
      } catch {
        setFehler("Artikeldaten konnten nicht gespeichert werden.", "stammdaten");
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

  function formularMeldung(quelle: Meldungsquelle): ReactNode {
    return meldung?.quelle === quelle ? (
      <Alert
        type="warning"
        showIcon={false}
        title={meldung.text}
        style={{ marginBlockEnd: SPACE.md }}
      />
    ) : null;
  }

  function zugangFormular(artikel: ArtikelDetailResult): ReactNode {
    return (
      /*
        ⚠️ GESPERRT, WENN DER ARTIKEL DEAKTIVIERT IST — DRK-380, und als
        EINZIGES der drei Formulare. Entnahme und Umlagerung bleiben offen:
        „deaktivieren" ist der Rueckfall des Loeschpfades fuer einen Artikel
        MIT Historie, und wer den Abgang mitsperrte, froere dessen Restbestand
        ein. Die Richtung ist die Asymmetrie — heraus ja, hinein nein.

        ⚠️ DER GRUND STEHT OBEN IM `Alert` UEBER DEN REITERN, NICHT HIER.
        `Form`s `disabled` reicht an jedes Feld durch; ein zweiter Hinweis
        direkt am Formular stuende zweimal auf demselben Schirm.
      */
      <Form<ZugangWerte>
        key="zugang"
        form={zugangForm}
        layout="vertical"
        disabled={busy || !artikel.artikel.aktiv}
        initialValues={{
          menge: 1,
          chargeId: NEUE_CHARGE,
          ...(artikel.zielOrte.length === 1
            ? { zielLagerortId: artikel.zielOrte[0]!.id }
            : {}),
        }}
        onFinish={(werte) => { void zugangBuchen(werte); }}
        data-rolle="zugang-form"
      >
        <div className={styles.buchungsfelder}>
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
          {/*
            IDA-235: der Satz zu „Handlager (ohne Schrank)" stand dauerhaft
            unter dem Feld; er erklaert einen Eintrag der Liste und steht jetzt
            hinter dem „?" am Feldnamen.
          */}
          <Form.Item
            name="zielLagerortId"
            label="Wohin"
            tooltip={{
              title: "„Handlager (ohne Schrank)“ heißt: noch nicht einsortiert.",
              icon: <Ikone name="info" groesse={14} />,
            }}
            rules={[{ required: true, message: "Bitte einen Ort wählen" }]}
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
                      popupAlign={MONATSWAEHLER_IM_BILD}
                      format="YYYY-MM"
                      aria-label="Verfallsmonat"
                      style={{ width: "100%" }}
                      // DRK-483: Enter uebernimmt den Monat, gebucht wird erst
                      // ueber „Zugang buchen".
                      onKeyDown={enterUebernimmtNurDasFeld}
                    />
                  </Form.Item>
                </div>
              </Form.Item>
            </>
          ) : null}
        </div>
        {formularMeldung("zugang")}
        <Button type="primary" htmlType="submit" loading={busy}>
          Zugang buchen
        </Button>
      </Form>
    );
  }

  function entnahmeFormular(artikel: ArtikelDetailResult): ReactNode {
    return (
      <Form<EntnahmeWerte>
        key="entnahme"
        form={entnahmeForm}
        layout="vertical"
        disabled={busy}
        initialValues={{ menge: 1 }}
        onFinish={(werte) => { void entnahmeBuchen(werte); }}
        data-rolle="entnahme-form"
      >
        <div className={styles.buchungsfelder}>
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
              autoSize={{ minRows: 1, maxRows: 4 }}
            />
          </Form.Item>
        </div>
        {formularMeldung("entnahme")}
        <Button
          type="primary"
          htmlType="submit"
          loading={busy}
          disabled={artikel.artikel.bestand === 0}
        >
          Entnahme buchen
        </Button>
      </Form>
    );
  }

  function umlagerFormular(artikel: ArtikelDetailResult): ReactNode {
    /*
      ⚠️ ZWEI VERSCHIEDENE LEEREN, ZWEI VERSCHIEDENE SAETZE. „Es liegt nichts
      da" und „es gibt keinen zweiten Ort" verlangen unterschiedliche
      Handgriffe; ein gemeinsamer Satz schickte die Haelfte der Leser an die
      falsche Stelle.
    */
    if (umlagerChargen.length === 0) {
      return (
        <div style={SCHRIFT.neben}>
          {chargenImHandlager.length === 0
            ? "Von diesem Artikel liegt im Handlager nichts, das sich umlagern ließe."
            : "Es gibt im Handlager keinen zweiten aktiven Ort. Lege unter „Lagerorte“ "
              + "einen Schrank an oder nimm einen stillgelegten wieder in Betrieb."}
        </div>
      );
    }
    return (
      <Form<UmlagerWerte>
        key="umlager"
        form={umlagerForm}
        layout="vertical"
        disabled={busy}
        initialValues={{ menge: 1 }}
        onFinish={(werte) => { void umlagern(werte); }}
        data-rolle="umlager-form"
      >
        <div className={styles.buchungsfelder}>
          <Form.Item name="chargeId" label="Charge" rules={[{ required: true }]}>
            <Select
              aria-label="Umlagerung Charge"
              showSearch
              filterOption={zielFilter}
              /*
               * IDA-235 — WO DIE CHARGE LIEGT, STEHT IN DER OPTION. Bis
               * hierher las man es aus der Chargentabelle unter dem
               * Formular ab; die steht jetzt im Reiter „Übersicht".
               * Genannt werden nur die Orte, von denen aus es weitergeht
               * (`quellenVon`) — dieselbe Regel wie unter „Von".
               */
              options={umlagerChargen.map((charge) => ({
                value: charge.id,
                label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · `
                  + quellenVon(charge)
                    .map((ort) => `${ort.name}: ${ort.menge}`)
                    .join(", "),
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
                label: `${ort.name} · ${ort.menge} ${artikel.artikel.einheit}`,
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
              options={artikel.zielOrte
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
              ? `Dort liegen ${umlagerQuelle.menge} ${artikel.artikel.einheit}.`
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
          <Form.Item name="kommentar" label="Kommentar">
            <Input.TextArea
              aria-label="Umlagerungskommentar"
              autoSize={{ minRows: 1, maxRows: 3 }}
            />
          </Form.Item>
        </div>
        {formularMeldung("umlagern")}
        <Button type="primary" htmlType="submit" loading={busy}>
          Umlagern
        </Button>
      </Form>
    );
  }

  function buchenReiter(artikel: ArtikelDetailResult): ReactNode {
    // Ein deaktivierter Artikel nimmt keinen Zugang an (DRK-380) — der
    // naheliegende erste Handgriff ist dann die Entnahme des Restbestands.
    const art = buchungsart ?? (artikel.artikel.aktiv ? "zugang" : "entnahme");
    return (
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <Segmented<Buchungsart>
          options={BUCHUNGSARTEN}
          value={art}
          onChange={setBuchungsart}
          aria-label="Buchungsart"
          style={{ justifySelf: "start" }}
        />
        {/*
          ⚠️ JEDES FORMULAR TRAEGT EINEN `key` (s. dort). Ohne ihn stehen die
          drei `Form`s an DERSELBEN Stelle des Baums, React behaelt die
          Instanz, und `Form` haelt die Formularinstanz vom ersten Mount fest
          (`useForm(form)` liest sie nur einmal): die Umlagerung schrieb dann
          in den Zustand des Zugangs — gemessen im DOM-Test, nicht vermutet.
        */}
        {art === "zugang"
          ? zugangFormular(artikel)
          : art === "entnahme"
            ? entnahmeFormular(artikel)
            : umlagerFormular(artikel)}
      </div>
    );
  }

  function stammdatenReiter(artikel: ArtikelDetailResult): ReactNode {
    const a = artikel.artikel;
    if (!bearbeiten) {
      return (
        <Abschnitt
          titel="Stammdaten"
          aktion={(
            <Button
              ref={bearbeitenKnopf}
              icon={<Ikone name="stift" groesse={16} />}
              onClick={() => modusWechseln(true)}
            >
              Bearbeiten
            </Button>
          )}
        >
          <dl className={styles.stammdatenListe} data-rolle="stammdaten-liste">
            <Feld name="Name" wert={a.name} />
            <Feld name="Mindestbestand" wert={`${a.mindestbestand} ${a.einheit}`} />
            <Feld name="Fach im Handlager" wert={a.fach} />
            <Feld name="Kategorie" wert={a.kategorie ?? "–"} />
            <Feld name="Einheit" wert={a.einheit} />
            <Feld name="Status" wert={a.aktiv ? "aktiv" : "deaktiviert"} />
          </dl>
        </Abschnitt>
      );
    }
    return (
      <Abschnitt titel="Stammdaten bearbeiten">
        <Form<StammdatenWerte>
          layout="vertical"
          disabled={busy}
          initialValues={{
            name: a.name,
            mindestbestand: a.mindestbestand,
            fach: a.fach,
            kategorie: a.kategorie ?? "",
            einheit: a.einheit,
            aktiv: a.aktiv,
          }}
          onFinish={(werte) => { void stammdatenSpeichern(werte); }}
          data-rolle="stammdaten-form"
        >
          <div className={styles.buchungsfelder}>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, whitespace: true, message: "Bitte einen Namen eingeben." }]}
            >
              <Input ref={nameFeld} aria-label="Name" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="mindestbestand"
              label="Mindestbestand"
              rules={[{ required: true, message: "Bitte einen Mindestbestand eingeben." }]}
            >
              <InputNumber
                min={0}
                precision={0}
                aria-label="Mindestbestand"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              name="fach"
              label="Fach im Handlager"
              normalize={(wert?: string) => wert?.toUpperCase() ?? ""}
              rules={[{ required: true, whitespace: true, message: "Bitte ein Fach eingeben." }]}
            >
              <Input aria-label="Fach im Handlager" autoComplete="off" />
            </Form.Item>
            <Form.Item name="kategorie" label="Kategorie">
              <KategorieEingabe kategorien={kategorien} aria-label="Kategorie" />
            </Form.Item>
            <Form.Item
              name="einheit"
              label="Einheit"
              rules={[{ required: true, whitespace: true, message: "Bitte eine Einheit eingeben." }]}
            >
              <Input aria-label="Einheit" autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="aktiv"
              label="Aktiv"
              valuePropName="checked"
              tooltip={{
                title: "Ein deaktivierter Artikel fehlt in den aktiven Listen und nimmt "
                  + "keinen Zugang mehr an.",
                icon: <Ikone name="info" groesse={14} />,
              }}
            >
              <Switch aria-label="Artikel aktiv" />
            </Form.Item>
          </div>
          {formularMeldung("stammdaten")}
          <div className={styles.stammdatenAktionen}>
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={busy}>
                Speichern
              </Button>
              <Button onClick={() => modusWechseln(false)}>
                Abbrechen
              </Button>
            </Space>
            {/*
              Die „Gefahrenzone" als eigener roter Kasten ist entfallen
              (IDA-235): Rot ist fachlich belegt (Falle 3), und Loeschen ist
              eine Ausnahme, die hinter „Bearbeiten" genuegt. Ob geloescht
              oder nur deaktiviert wird, entscheidet der Dialog.
            */}
            <LoeschButton
              key={loeschDialogGeneration}
              name={a.name}
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
          </div>
        </Form>
      </Abschnitt>
    );
  }

  return (
    <Drawer
      open
      onClose={onSchliessen}
      /*
       * IDA-235: der Name ist wieder schlichter Titel. Bearbeitet wird er unter
       * „Stammdaten" → „Bearbeiten" mit den uebrigen Feldern — der Stift im
       * Titel (IDA-215) speicherte beim Verlassen, ohne Rueckweg.
       */
      title={detail?.artikel.name ?? "Artikeldetails"}
      /*
       * 1120 STATT 880 STATT 520 — beide Sprünge kommen aus einer Messung.
       *
       * 520 → 880 (13.09.2026, `e2e/flyin-breite.spec.ts`): bei 520 px war
       * der Inhalt 1862 px hoch, auf 1280x720 davon ein Drittel zu sehen,
       * während links 760 px abgedunkelter Hintergrund brachlagen.
       *
       * 880 → 1120 (21.09.2026): die beiden Tabellen (heute in „Übersicht"
       * und „Verlauf") fahren `scroll.x: "max-content"`. Schon die Seed-Daten
       * brauchten für die Chargen 691 px; der Platz darin war 798 px — echte
       * Chargen mit mehreren Orten und Buchungen mit Kommentar liefen darüber
       * hinaus und brachten je Tabelle einen eigenen waagerechten
       * Scrollbalken mit. Die Formulare legen ihre Felder über
       * `buchungsfelder` nebeneinander, sobald die Breite da ist.
       *
       * ⛔ KEIN `size="large"` (das wären antds 736) und keine nackte Zahl:
       * `flyinBreite` deckelt auf 92 vw — auf 1280 px bleiben damit 160 px
       * Hintergrund, auf 1024 px greift der Deckel.
       */
      size={flyinBreite(1120)}
      rootClassName={styles.modul}
      /*
       * Falle 24: `autoFocus` bleibt an — beim Oeffnen setzt diese Schublade
       * keinen eigenen Fokus, den der Rahmen danach stehlen koennte, und Esc
       * wirkt so sofort. Die Rueckgabe beim Schliessen trifft die Zeile, die
       * die Schublade geoeffnet hat; die Maske verhindert einen Klick
       * dazwischen. Eigene Fokuswechsel nur ueber `fokussiereWennVerloren`.
       */
      destroyOnHidden
    >
      {meldung?.quelle === "allgemein" ? (
        <Alert
          type="warning"
          showIcon={false}
          title={meldung.text}
          style={{ marginBlockEnd: SPACE.lg }}
        />
      ) : null}

      {!detail ? (
        <div style={SCHRIFT.neben}>Artikeldetails werden geladen …</div>
      ) : (
        <div className={styles.artikelRaster}>
          <ArtikelKopf detail={detail} />

          {/*
            ⚠️ DER SATZ NENNT SEIT DRK-380 AUCH DIE FOLGE, nicht nur die Lage.
            „Erscheint nicht in den aktiven Listen" allein erklaerte das
            gesperrte Zugangsformular nicht — und ein gesperrtes Feld ohne
            Grund ist der Fall, in dem jemand den Schalter sucht und die
            Verbindung nicht herstellt. Der Zusatz sagt ausserdem, was WEITER
            geht: Entnahme und Umlagerung bleiben erlaubt, damit der
            Restbestand abzubuchen ist (Entscheidung zu DRK-380). Er steht UEBER
            den Reitern, weil er fuer alle gilt.
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

          <Tabs
            activeKey={reiter}
            // 16 statt antds 32 px zwischen den Reitern: so passen alle vier
            // auch auf ein Telefon (390 px), ohne im „…"-Menue zu verschwinden.
            tabBarGutter={SPACE.lg}
            onChange={(schluessel) => setReiter(schluessel as Reiter)}
            items={[
              {
                key: "uebersicht",
                label: "Übersicht",
                children: <UebersichtReiter detail={detail} />,
              },
              { key: "buchen", label: "Buchen", children: buchenReiter(detail) },
              { key: "stammdaten", label: "Stammdaten", children: stammdatenReiter(detail) },
              {
                key: "verlauf",
                label: "Verlauf",
                children: (
                  <HistorieTabelle
                    historie={detail.historie}
                    mehrVorhanden={detail.mehrVorhanden}
                    artikelId={detail.artikel.id}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}

function Abschnitt({
  titel, aktion, children,
}: {
  titel: string;
  aktion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--lb-linie)",
        borderRadius: 6,
        padding: SPACE.lg,
        background: "var(--lb-karte)",
      }}
    >
      <div className={styles.abschnittKopf}>
        <h3 style={{ ...SCHRIFT.abschnitt, margin: 0 }}>{titel}</h3>
        {aktion}
      </div>
      {children}
    </section>
  );
}

function Feld({ name, wert }: { name: string; wert: ReactNode }) {
  return (
    <div>
      <dt style={SCHRIFT.feldname}>{name}</dt>
      <dd style={{ ...SCHRIFT.text, margin: 0 }}>{wert}</dd>
    </div>
  );
}

function ArtikelKopf({ detail }: { detail: ArtikelDetailResult }) {
  const unterMindest = detail.artikel.bestand < detail.artikel.mindestbestand;
  // ⚠️ `rest` ist der Handlager-Bereich, `restGesamt` schliesst Fahrzeuge ein. Der
  // Chip meint die Nachschub-Sicht des Handlagers und darf NICHT auf Fahrzeug-
  // bestand anspringen — dafuer ist der Fahrzeug-Check zustaendig (§5.2.1).
  const faelligeCharge = detail.chargen.find((charge) => charge.ampel !== "gruen" && charge.rest > 0);

  return (
    <div style={{ display: "grid", gap: SPACE.sm }}>
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

/**
 * IDA-235 — der Lese-Reiter: wo wie viel liegt, und welche Charge zuerst
 * gebraucht wird. Kein Eingabefeld.
 *
 * „Bestand je Ort" ist die Summe der Chargenverteilung (`chargen[].orte`) je
 * Ort; die Reihenfolge der ersten Nennung bleibt stehen (Handlager-Bereich vor
 * Fahrzeugen, so liefert `_actions/detail.ts` jede einzelne Verteilung).
 */
function UebersichtReiter({ detail }: { detail: ArtikelDetailResult }) {
  const jeOrt = new Map<string, ArtikelDetailCharge["orte"][number]>();
  for (const charge of detail.chargen) {
    for (const ort of charge.orte) {
      const bisher = jeOrt.get(ort.id);
      jeOrt.set(ort.id, bisher ? { ...bisher, menge: bisher.menge + ort.menge } : ort);
    }
  }
  const { artikel } = detail;

  return (
    <div className={styles.artikelRaster}>
      <Abschnitt titel="Bestand je Ort">
        <div style={{ display: "grid", gap: SPACE.sm }}>
          {jeOrt.size > 0 ? (
            <OrtVerteilung orte={[...jeOrt.values()]} einheit={artikel.einheit} />
          ) : (
            <div style={SCHRIFT.neben}>Kein Bestand.</div>
          )}
          <div style={SCHRIFT.neben} data-rolle="kennzahlen">
            Mindestbestand {artikel.mindestbestand} {artikel.einheit} · Fach {artikel.fach}
          </div>
        </div>
      </Abschnitt>
      <ChargenTabelle chargen={detail.chargen} einheit={artikel.einheit} />
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
      <Kartentabelle<ArtikelDetailCharge>
        aria-label="Chargen"
        rowKey="id"
        dataSource={chargen}
        leer={{ nichts: "Keine Chargen im Bestand." }}
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
 * Wer alle sehen will, folgt dem Link ins Journal (IDA-235).
 *
 * ⚠️ NICHT AUF `ChargenTabelle` UEBERTRAGEN: die haelt ALLE Chargen des
 * Artikels (`chargenMitRest`, ohne Deckel) und darf deshalb sortieren.
 */
function HistorieTabelle({
  historie,
  mehrVorhanden,
  artikelId,
}: {
  historie: ArtikelDetailBuchung[];
  mehrVorhanden: boolean;
  artikelId: string;
}) {
  /*
   * IDA-239 — NACH DER KENNUNG, NICHT NACH DEM NAMEN. Bis hierher kannte das
   * Journal nur die Freitextsuche `q` ueber Artikelname UND Kommentar; der
   * Link fand damit auch Artikel, deren Name diesen enthaelt, und Buchungen,
   * deren Kommentar ihn nennt. `?artikel=` trifft genau diesen einen.
   */
  const journalLink = `${JOURNAL_PFAD}?artikel=${encodeURIComponent(artikelId)}`;
  return (
    <Abschnitt
      titel="Letzte Buchungen"
      aktion={<Link href={journalLink}>Im Journal anzeigen</Link>}
    >
      <Kartentabelle<ArtikelDetailBuchung>
        aria-label="Buchungshistorie des Artikels"
        rowKey="id"
        dataSource={historie}
        leer={{ nichts: "Noch keine Buchungen." }}
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
        <div className={styles.footnote} style={{ marginBlockStart: SPACE.sm }}>
          Es werden nur die neuesten Buchungen angezeigt.
        </div>
      ) : null}
    </Abschnitt>
  );
}
