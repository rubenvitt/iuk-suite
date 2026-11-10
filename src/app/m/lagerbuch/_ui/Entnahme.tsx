"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import { ANMELDUNG_TEXT, type HelferGrund } from "../_lib/actionTypen";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { SendeStatus } from "./SendeStatus";
// ⚠️ DIREKT IMPORTIERT, NICHT ALS PROP (Falle 9, `CLAUDE.md`):
// „Server Actions duerfen als einzige ueber die Grenze — aber direkt
// importiert, nicht als Prop durchgereicht." Dieselbe Form wie in
// `_ui/Auffuellen.tsx` und `_ui/BoxAbgabe.tsx`.
import { bucheEntnahmeHelfer, macheEntnahmeRueckgaengig } from "../_actions/buchung";
import { einheitMeta, ortZeile, type Einheitenart } from "../_lib/konstanten";
import { fmtVerfall, ampelTon } from "../_lib/format";
import type { Ampel } from "../_lib/domain/verfall";
// NUR DER TYP, und er liegt in einem Modul OHNE "use client" (Falle 6):
// dieselbe Form liest die Server Component, die ihn befüllt.
import type { ZielAnzeige } from "../_lib/entnahmeZiel";
import { schrankPfad, tokenZielPfad } from "../_lib/tokenZiel";
export type { ZielAnzeige };
import s from "./helfer.module.css";

/**
 * DIE ENTNAHME AM REGAL — §7.2.2, §7.3. Nachfolger von `HelferEntnahme.tsx`.
 *
 * ⚠️ SIE HEISST `Entnahme.tsx`, NICHT `HelferEntnahme.tsx`. §2.1 (Zeile 358)
 * fuehrt sie so; teil5.md nennt sie an fuenf Stellen falsch. Das ist ein
 * Schreibfehler in einem Kommentar, keine Planaenderung.
 *
 * ⚠️ DIE ACTION WIRD DIREKT IMPORTIERT (DRK-375). Bis dahin kam sie als PROP,
 * und die Begruendung war eine REIHENFOLGE: `_actions/buchung.ts` gehoerte
 * vollstaendig Teil 5 (Festlegung H7), ein Import hier haette diese Insel von
 * einem SPAETER laufenden Plan abhaengig gemacht. Diese Begruendung ist
 * ABGELAUFEN — die Datei existiert, und Falle 9 (`CLAUDE.md`)
 * lautet woertlich: „Server Actions duerfen als einzige ueber die Grenze —
 * aber direkt importiert, nicht als Prop durchgereicht."
 *
 * ⚠️ WER DEN PROP ZURUECKHOLT, HOLT KEINE VEREINFACHUNG ZURUECK, SONDERN EINE
 * AUSNAHME. Als Prop ist die Insel im Test bequemer (man reicht eine Funktion
 * hinein statt ein Modul zu ersetzen) — genau deshalb steht der Mock jetzt in
 * `Entnahme.test.tsx`: der Test folgt der Bauform, nicht umgekehrt.
 */
export type EntnahmeDetail = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
  chargen: {
    id: string;
    chargenNr: string;
    verfall: string;
    /**
     * Rest im HANDLAGER-BEREICH — wortgleich mit `ArtikelDetailCharge`
     * (`_actions/detail.ts`, Aufgabe 11). DAS ist die Zahl, die diese Ansicht
     * im Mengenfeld zeigt (Fixrunde 1 zu Aufgabe 12): Kopfzahl
     * ("BESTAND HANDLAGER"), Stepper-Obergrenze (`detail.bestand`) und diese
     * Chargenzahl sprechen dieselbe Sprache — das, was HIER UND JETZT
     * entnehmbar ist. `restGesamt` waere hier eine Zahl, die mehr verspricht,
     * als man am Regal mitnehmen kann.
     */
    rest: number;
    /**
     * DRK-297, Aufgabe 12 — Summe ueber ALLE Orte, Fahrzeuge eingeschlossen.
     * Wortgleich mit `ArtikelDetailCharge["restGesamt"]` (Aufgabe 11); dient
     * hier NUR dem Aufbau der `orte`-Liste und der Datenform-Paritaet mit der
     * Verwaltung — nicht der Anzeige. Eine Charge, die vollstaendig im
     * Fahrzeug liegt, hat `rest === 0` und `restGesamt > 0`: die „0" bleibt
     * nicht raetselhaft, weil direkt daneben die Ortszeile steht ("RTW 1: 7").
     */
    restGesamt: number;
    /** Die VERTEILUNG dieser Charge: wo wie viel liegt, wortgleich mit
     *  `ArtikelDetailCharge["orte"]`. ⚠️ Der Zugangshinweis steht in DIESER
     *  Ansicht VORN im Markup, nicht in einem Tooltip (Nachtrag zu Aufgabe
     *  12) — `OrtVerteilung.tsx` (Aufgabe 11, Verwaltung) ist deshalb bewusst
     *  NICHT wiederverwendet, siehe `_lib/bauform.test.ts`. */
    /**
     * ⚠️ DIE VOLLE FORM, NICHT NUR DER NAME (DRK-309, Reviewrunde 15). Die
     * Verteilung kommt aus `OrtVerteilungEintrag` und traegt die Art laengst;
     * eine engere Angabe HIER warf sie wieder weg. Das wiegt auf diesem
     * Schirm schwerer als in der Verwaltung: hier steht jemand mit dem
     * Telefon am Regal und sucht das Material — zwei gleichnamige Zeilen
     * schicken ihn zur falschen Einheit.
     */
    orte: {
      id: string; name: string; menge: number; zugangshinweis: string | null;
      typ: "lager" | "fahrzeug"; kennung: string | null;
      einheitenart: Einheitenart | null;
    }[];
    ampel: Ampel;
    text: string;
    /**
     * IDA-378 — abgelaufen (`istAbgelaufen`, serverseitig entschieden). Eine
     * solche Charge ist nicht waehlbar, FEFO ueberspringt sie, und sie zaehlt
     * nicht zur Hoechstmenge.
     */
    abgelaufen: boolean;
  }[];
};

type Rueckmeldung = {
  art: "ok" | "fehler";
  text: string;
  grund?: HelferGrund;
  /** IDA-378 — die Sendung, die „Rückgängig" adressiert, und das Ende des Fensters (ms). */
  rueckgaengig?: { sendungId: string; bis: number };
};

/** IDA-378 — Restminuten, aufgerundet: „1 min" bis zur letzten Sekunde. */
function restMinuten(bis: number, jetzt: number): number {
  return Math.ceil((bis - jetzt) / 60_000);
}

/**
 * IDA-378 — DER KNOPF „RÜCKGÄNGIG", solange das Fenster offen ist.
 *
 * ⚠️ DIE UHR IST NUR ANZEIGE. Das Fenster misst der Server an der Journalzeile
 * (`macheEntnahmeRueckgaengig`); hier verschwindet der Knopf, wenn es abgelaufen
 * ist, damit niemand auf einen Knopf tippt, der nur noch eine Absage bringt.
 */
function RueckgaengigKnopf({
  bis, laeuft, beiKlick,
}: { bis: number; laeuft: boolean; beiKlick: () => void }) {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const takt = setInterval(() => setJetzt(Date.now()), 15_000);
    return () => clearInterval(takt);
  }, []);
  const minuten = restMinuten(bis, jetzt);
  if (minuten <= 0) return null;
  return (
    <button
      type="button"
      className={`${s.knopf} ${s.knopfGeist} ${s.knopfBreit}`}
      style={{ marginTop: 10 }}
      disabled={laeuft}
      onClick={beiKlick}
      data-rolle="entnahme-rueckgaengig"
    >
      Rückgängig ({minuten} min)
    </button>
  );
}

export function Entnahme({
  detail,
  ziel,
  kontoZugang,
  schrank = null,
}: {
  detail: EntnahmeDetail;
  /** `null` = noch nichts gewählt; dann wird NICHT gebucht (DRK-300). */
  ziel: ZielAnzeige | null;
  /**
   * DIE HERKUNFT DES ZUGANGS — DRK-305: `true` heißt „angemeldetes Konto, kein
   * Kärtchen".
   *
   * ⚠️ SIE ENTSCHEIDET DEN RÜCKWEG, und ohne sie ist er eine Sackgasse: fällt
   * der Zugang aus, gibt der Server den Kärtchen-Grund `sitzung` zurück — er
   * kann die Herkunft nicht unterscheiden (`_lib/helferZugang.ts`) —, und der
   * Weg darunter führte aufs Gate, wo ein Code verlangt wird, den eine
   * angemeldete Person nicht hat. Die Seite kennt die Herkunft, weil sie mit ihr
   * gerendert hat. Gefunden hat das die Codex-Review zu PR #164.
   *
   * PFLICHT-PROP: ein vergessenes `kontoZugang?` wäre still `undefined` und
   * damit „Kärtchen" — also genau der Defekt.
   */
  kontoZugang: boolean;
  /**
   * IDA-295 — der Schrank, dessen Ortsetikett gescannt wurde, mit dem Bestand
   * dieses Artikels darin. Die Buchung nimmt zuerst aus ihm, den Rest wie
   * bisher aus dem Handlager.
   */
  schrank?: { id: string; name: string; bestand: number } | null;
}) {
  const [menge, setMengeRoh] = useState(1);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  /*
   * IDA-378 — HAT DIE KLEMME GEGRIFFEN? Bis hierher kappte der Stepper 999 still
   * auf den Bestand, und „Entnahme buchen" buchte die kleinere Zahl, ohne dass
   * sie je jemand gelesen hatte. Jede andere Mengenaenderung nimmt den Status
   * wieder weg.
   */
  const [gekappt, setGekappt] = useState(false);
  const setMenge = (m: number | ((vorher: number) => number)) => {
    setMengeRoh(m);
    setGekappt(false);
  };
  const [nimmtZurueck, setNimmtZurueck] = useState(false);
  /*
   * DIE CHARGENLISTE ZEIGT ZUERST, WAS HIER LIEGT — DRK-397.
   *
   * ⚠️ DER FILTER GEHT AUF `rest`, NICHT AUF `restGesamt`, und das ist genau
   * die Gegenrichtung zum Filter im Lesepfad (`artikelDetailHelfer`): DORT
   * faellt heraus, was NIRGENDS mehr liegt, HIER faellt zu, was NICHT IM
   * HANDLAGER liegt. Beide zusammen ergeben die Aufteilung, die der Schirm
   * braucht — oben das Mitnehmbare, dahinter das Auffindbare.
   *
   * ⚠️ UND ES IST EIN UMSCHALTER, KEIN ZWEITER FILTER IM LESEPFAD. Die Zeile,
   * die eine vollstaendig im RTW liegende Charge zeigt, ist die einzige
   * Auskunft, die jemand am leeren Regalfach bekommt (DRK-297, Aufgabe 12) —
   * sie darf ruhen, aber sie darf nicht verschwinden. Wer den Filter
   * stattdessen serverseitig zieht, nimmt sie ersatzlos weg, und zwar still:
   * der Schirm saehe aufgeraeumt aus und sagte nicht mehr, wo das Material ist.
   */
  const [zeigeOhneBestand, setZeigeOhneBestand] = useState(false);
  const imHandlager = detail.chargen.filter((c) => c.rest > 0);
  /*
   * IDA-378 — VERWENDBAR IST, WAS IM HANDLAGER LIEGT UND NICHT ABGELAUFEN IST.
   * Die abgelaufenen bleiben in der Liste stehen (sie liegen ja im Fach, und
   * jemand muss sie dort finden und aussondern), sind aber nicht waehlbar.
   */
  const verwendbar = imHandlager.filter((c) => !c.abgelaufen);
  const verwendbarSumme = verwendbar.reduce((summe, c) => summe + c.rest, 0);
  const abgelaufenSumme = imHandlager
    .filter((c) => c.abgelaufen)
    .reduce((summe, c) => summe + c.rest, 0);
  const ohneBestand = detail.chargen.filter((c) => c.rest <= 0);
  const sichtbareChargen = zeigeOhneBestand ? detail.chargen : imHandlager;

  /*
   * DIE GEWAEHLTE CHARGE — DRK-418. `null` heisst FEFO, also die Vorgabe.
   *
   * ⚠️ FEFO BLEIBT DIE VORGABE UND WIRD NICHT ZUR PFLICHTWAHL. Wer nichts tut,
   * bucht wie bisher; das ist der haeufige Fall und der schnellste Handgriff am
   * Regal. Die Wahl ist fuer den anderen: wer nicht die vorderste Packung in
   * der Hand haelt, erzeugte bis hierher einen Bestand, der auf dem Papier
   * anders aussah als im Fach.
   *
   * ⚠️ NUR CHARGEN MIT REST IM HANDLAGER SIND WAEHLBAR. Die Zeilen unter dem
   * Umschalter (`rest <= 0`) bleiben reine Auskunft: sie sagen, WO das Material
   * sonst liegt (DRK-297, Aufgabe 12). Eine waehlbare Zeile ohne Bestand waere
   * ein Angebot, das die Action danach ablehnt.
   */
  const [chargeId, setChargeId] = useState<string | null>(null);
  const gewaehlteCharge = chargeId === null
    ? null
    : (verwendbar.find((c) => c.id === chargeId) ?? null);

  /*
   * ⚠️ EINE VERSCHWUNDENE CHARGE FAELLT AUF FEFO ZURUECK — Codex-Befund P1 zu
   * PR #205, nachgeprueft und real.
   *
   * Der Fall entsteht bei jeder Buchung, die die gewaehlte Charge LEERT:
   * `bucheEntnahmeHelfer` ruft `revalidiereBestand()`, der Server liefert
   * frische Props, und die Charge faellt aus `imHandlager` heraus. Der
   * ZUSTAND dieser Insel ueberlebt das aber — `chargeId` zeigte danach auf
   * eine Zeile, die es nicht mehr gibt.
   *
   * ⚠️ WAS DARAUS FOLGTE, WAR STILL UND FALSCH: `gewaehlteCharge` wurde `null`,
   * also stand KEIN Radioknopf mehr auf „an" (auch nicht der FEFO-Knopf, denn
   * `chargeId` war ja gesetzt), die Obergrenze sprang zurueck auf den vollen
   * Handlagerbestand, und die naechste Buchung schickte GAR KEINE `chargeId` —
   * sie buchte FEFO, waehrend der Schirm eine ausdrueckliche Wahl behauptete.
   * Im Journal steht danach eine andere Charge, als die Person gewaehlt hat,
   * und das Buch ist append-only.
   *
   * ⚠️ DIE ABLEITUNG STEHT HIER UND NICHT IM ERFOLGSZWEIG VON `absenden`.
   * Ein `setChargeId(null)` nach dem Buchen deckte denselben Fall — aber nur
   * diesen einen. Verschwindet die Charge, weil ein ZWEITES Telefon am selben
   * Regal gebucht hat, trifft derselbe Zustand ohne eigene Buchung ein. Die
   * Form ist Reacts Muster fuer „Zustand aus Props nachfuehren", dieselbe wie
   * in `_ui/Stepper.tsx`.
   */
  if (chargeId !== null && gewaehlteCharge === null) setChargeId(null);
  /*
   * ⚠️ DIE OBERGRENZE FOLGT DER WAHL. Ohne diese Zeile stuende der Stepper
   * weiter auf dem Gesamtbestand des Handlagers, und die Action wiese eine
   * Menge ab, die der Schirm gerade angeboten hat — „reicht die gewaehlte
   * Charge nicht, sagt der Schirm das VOR dem Buchen" ist die Zusage des
   * Tickets.
   *
   * ⚠️ UND SIE IST DIE EINE RECHNUNG, nicht zwei: derselbe Wert deckelt den
   * Stepper und die Menge, die `absenden` schickt. Zwei Rechnungen liefen beim
   * naechsten Griff auseinander, und die zweite ist die, die bucht.
   */
  // IDA-378: ohne Wahl der Rest der VERWENDBAREN Chargen, nicht der Kopfbestand.
  const hoechstmenge = gewaehlteCharge ? gewaehlteCharge.rest : verwendbarSumme;
  /*
   * IDA-378 — DER STATUS AM FELD, wenn die Klemme gegriffen hat. Nur die Zahl
   * und ihr Grund, kein Erklaertext.
   */
  const kappungsText = gewaehlteCharge
    ? `Nur ${hoechstmenge} ${detail.einheit} in dieser Charge`
    : abgelaufenSumme > 0
      ? `Nur ${hoechstmenge} ${detail.einheit} verwendbar, ${abgelaufenSumme} abgelaufen`
      : `Nur ${hoechstmenge} ${detail.einheit} verfügbar`;
  /*
   * ⚠️ DIE WAHL WIRD NUR ANGEBOTEN, WENN ES ETWAS ZU WAEHLEN GIBT — dieselbe
   * Bedingung wie in `_ui/BoxAbgabe.tsx`. Bei genau einer Charge ist die Frage
   * beantwortet, bevor sie gestellt wird, und eine Radiogruppe mit einem Knopf
   * ist eine Bedienung ohne Wirkung.
   */
  const wahlMoeglich = verwendbar.length > 1;

  /*
   * DER WEG ZUR ZIELWAHL UND ZURÜCK. `returnTo` ist keine Bequemlichkeit: ohne
   * ihn stünde die Person nach der Wahl auf der Artikelliste statt vor dem
   * Regalfach, vor dem sie gerade steht. Der Artikelpfad kommt kodiert aus
   * `tokenZielPfad` (DRK-493) und dient auch als Rueckweg ans Gate.
   */
  // IDA-295 — der Schrank reist durch die Zielwahl mit, sonst kaeme man von
  // dort ohne ihn zurueck und buchte still aus dem ganzen Handlager.
  const artikelPfad = schrank
    ? `${tokenZielPfad("artikel", detail.id)}?${new URLSearchParams({ ort: schrank.id })}`
    : tokenZielPfad("artikel", detail.id);
  const zielWahlWeg = `/helfer/ziel?returnTo=${encodeURIComponent(artikelPfad)}`;
  const zielName = ziel?.art === "fahrzeug" ? ziel.name : null;

  /*
   * IDA-358 — DIE BUCHUNG LIEGT AUF DEM GERAET, BIS DER SERVER SIE BESTAETIGT.
   * Ein Wurf (Netz, Rollout) laesst sie stehen, `useEntwurf` versucht es von
   * selbst erneut, auch nach dem Neuladen; dieselbe `sendungId` macht aus einer
   * Wiederholung nach verlorener Antwort keine zweite Entnahme
   * (`_lib/schreibpfade/sendung.ts`). Menge und Satz von damals reisen in der
   * Nutzlast mit, damit der Ergebnissatz auch nach dem Neuladen stimmt.
   *
   * ⚠️ SOLANGE EINE SENDUNG LIEGT, BUCHT DER KNOPF NICHTS NEUES: `sende` mit
   * liegender Sendung ersetzte deren Nutzlast unter derselben ID.
   */
  type Nutzlast = { eingabe: Parameters<typeof bucheEntnahmeHelfer>[0] & object; angefragt: number; zielName: string | null };
  const entwurf = useEntwurf<
    { menge: number; chargeId: string | null },
    Nutzlast,
    { r: Awaited<ReturnType<typeof bucheEntnahmeHelfer>>; n: Nutzlast; sendungId: string }
  >({
    schluessel: `lagerbuch:entnahme:${detail.id}:${schrank?.id ?? "handlager"}`,
    stand: { menge, chargeId },
    wiederherstellen: (w) => {
      setMenge(w.menge);
      setChargeId(w.chargeId);
    },
    senden: async (n, sendungId) => ({ r: await bucheEntnahmeHelfer({ ...n.eingabe, sendungId }), n, sendungId }),
    antwort: ({ r, n, sendungId }) => {
      if (!r.ok) {
        // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
        // Das gilt auch fuer den fuenften Grund `"eingabe"`
        // (Betreiberentscheidung B4): er traegt seine Botschaft im `text`,
        // und weil `darfErneuern("eingabe")` false ist, faellt er unten durch
        // die `sitzung`-Bedingung hindurch — kein Weg zurueck aufs Gate.
        setRueck({ art: "fehler", text: r.text, grund: r.grund });
        return false;
      }
      const gebucht = r.wert.gebucht;
      // Das Ziel gehört IN DEN SATZ: ohne es ist eine Buchung aufs Fahrzeug
      // von einem reinen Verbrauch nicht zu unterscheiden — und der Satz ist
      // der einzige Beleg, den die Person am Regal zu sehen bekommt.
      const wohin = n.zielName ? ` → ${n.zielName}` : "";
      // IDA-378 — das Fenster kommt vom Server (Zeitpunkt der Journalzeile).
      const bis = r.wert.rueckgaengigBis ? Date.parse(r.wert.rueckgaengigBis) : NaN;
      const rueckgaengig = Number.isFinite(bis) ? { sendungId, bis } : undefined;
      setRueck(
        gebucht < n.angefragt
          ? // §7.3, zweiter Zustand: heute ein GRUENER Chip mit der KLEINEREN
            // Zahl, ohne Hinweis — der Helfer legt fuenf Teile ins Fahrzeug
            // und das Journal kennt drei.
            { art: "ok", text: `${gebucht} von ${n.angefragt} gebucht; mehr lag nicht im Handlager.${wohin}`, rueckgaengig }
          : { art: "ok", text: `Entnahme gebucht: ${gebucht} × ${detail.name}${wohin}`, rueckgaengig },
      );
      setMenge(1);
      return true;
    },
  });
  const laeuft = entwurf.zustand !== "ruhe";

  /*
   * IDA-378 — RÜCKGÄNGIG. Kein Entwurf wie beim Buchen: die Gegenbuchung ist
   * am Primaerschluessel gegen Doppel geschuetzt, ein zweiter Tipp nach einem
   * Netzfehler bekommt hoechstens die Absage „schon gegengebucht".
   */
  async function rueckgaengig(sendungId: string) {
    setNimmtZurueck(true);
    try {
      const r = await macheEntnahmeRueckgaengig({ sendungId });
      setRueck(r.ok
        ? { art: "ok", text: `Rückgängig gemacht: ${detail.name}` }
        : { art: "fehler", text: r.text, grund: r.grund });
    } catch {
      // "netz" entsteht nur im Client (Global Constraint 12); der Knopf bleibt.
      setRueck((vorher) => vorher && { ...vorher, art: "fehler", text: "Keine Verbindung — Rückgängig nicht gebucht.", grund: "netz" });
    } finally {
      setNimmtZurueck(false);
    }
  }

  function absenden() {
    // ⚠️ OHNE ZIEL WIRD NICHT GEBUCHT. Der Knopf ist dann bereits gesperrt;
    // diese Zeile ist die zweite Hälfte derselben Zusage — ein Tastendruck auf
    // einem noch nicht neu gerenderten Knopf käme sonst durch.
    if (!ziel) return;
    // DRK-418: an der GEWAEHLTEN Charge deckeln, sonst am Handlagerbestand.
    const m = Math.min(menge, hoechstmenge);
    if (m <= 0) return;
    setRueck(null);
    /*
     * FALLE 62: `HelferEntnahme.tsx:22-30` hatte KEIN catch — der Wurf schlug
     * bis zur Fehlerseite durch (Falle 66). Seit IDA-358 faengt ihn
     * `useEntwurf`: die Sendung bleibt liegen, `SendeStatus` sagt „Nicht
     * gesendet", die Menge bleibt im Feld (§7.10.3).
     */
    entwurf.sende({
      eingabe: {
        artikelId: detail.id,
        menge: m,
        /*
         * DRK-418 — NUR MITSCHICKEN, WENN GEWAEHLT. Ein `chargeId: null` waere
         * gleichbedeutend (das Schema ist `nullish`), aber der Schluessel
         * stuende dann in jeder Nutzlast und legte nahe, die Wahl sei Pflicht.
         *
         * ⚠️ `gewaehlteCharge?.id` UND NICHT `chargeId`: verschwindet die
         * gewaehlte Charge zwischen Wahl und Klick aus dem Handlager — ein
         * zweites Telefon am selben Regal —, zeigt der Schirm sie nicht mehr
         * an, und die Nutzlast soll dann auch nicht mehr von ihr sprechen.
         */
        ...(gewaehlteCharge ? { chargeId: gewaehlteCharge.id } : {}),
        ...(schrank ? { ortId: schrank.id } : {}),
        // Die KENNUNG wandert, nicht der Anzeigename — der Server kennt nur sie.
        ziel: ziel.art === "fahrzeug" ? { art: "fahrzeug", lagerortId: ziel.lagerortId } : ziel,
      },
      angefragt: m,
      zielName,
    });
  }

  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href={schrank ? schrankPfad(schrank.id) : "/helfer"}>
        <Ikone name="chevron-links" groesse={15} />
        Zurück
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {detail.name}
        </h1>
        <span className={s.fach} data-rolle="fach">
          {detail.fach}
        </span>
      </div>

      <div className={`${s.karte} ${s.kartePad}`}>
        <div className={s.fussnote}>BESTAND HANDLAGER</div>
        <div className={s.bestandsZahl} data-rolle="bestand">
          {detail.bestand} <span style={{ fontSize: 16 }}>{detail.einheit}</span>
        </div>
        {schrank && (
          <div className={s.fussnote} data-rolle="bestand-schrank">
            davon in {schrank.name}: {schrank.bestand} {detail.einheit} — wird zuerst gebucht
          </div>
        )}
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Entnahme</div>
        <div className={s.kartePad}>
          <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
            <span className={s.zeileHaupt}>Menge</span>
            <Stepper
              wert={menge}
              setWert={setMenge}
              min={1}
              /*
                DRK-418 — DIE OBERGRENZE FOLGT DER CHARGENWAHL. Ohne sie boete
                der Schirm eine Menge an, die die Action danach ablehnt: eine
                gewaehlte Charge deckelt die Buchung auf IHREN Rest, nicht auf
                den des ganzen Handlagers.
              */
              max={Math.max(hoechstmenge, 1)}
              beschriftung="Menge"
              beiKappung={() => setGekappt(true)}
            />
          </div>
          {gekappt && (
            <span
              className={`${s.chip} ${s.gelb} ${s.warnhinweis}`}
              style={{ marginBottom: 10 }}
              role="status"
              data-rolle="entnahme-kappung"
            >
              {kappungsText}
            </span>
          )}

          {/*
            DIE ZIELZEILE STEHT ÜBER DEM KNOPF, nicht darunter und nicht im
            Seitenkopf: sie ist die letzte Zeile, die jemand liest, bevor er
            tippt. Eine Wahl, die für den ganzen Kärtchen-Zugang gilt, muss an
            jedem Artikel sichtbar sein — sonst lenkt eine vergessene Wahl
            still Bestand um.

            ⚠️ SEIT DRK-406 SIND ES ZWEI VERSCHIEDENE DINGE, nicht ein Feld mit
            zwei Werten. Ist nichts gewählt, ist die Zielwahl der NÄCHSTE
            HANDGRIFF und bekommt die Form dazu — volle Breite, an der Stelle,
            an der sonst gebucht wird. Ist etwas gewählt, ist sie eine ANGABE,
            die man überfliegt und selten ändert, und schrumpft auf die Zeile
            zurück, die sie immer war.

            ⚠️ WER DIE BEIDEN ZUSAMMENLEGT, bekommt entweder eine Pflicht, die
            wie eine Fußnote aussieht (der Zustand vor diesem Ticket), oder eine
            Daueranzeige, die lauter ist als der Buchen-Knopf daneben.
          */}
          {ziel === null ? (
            <div className={s.zielPflicht} data-rolle="entnahme-ziel">
              {/*
                EIN ECHTER LINK, KEIN KNOPF: die Zielwahl ist eine eigene Seite
                (`/helfer/ziel`), und ein Dokumentwechsel ist hier das Richtige.
                Ein `<button>` mit `router.push` nähme der Adresszeile, dem
                Zurück-Wisch und dem langen Antippen ihre Wirkung.

                `aria-describedby` hängt den Grund an den Link statt ihn nur
                danebenzustellen — eine Vorleseanwendung liest sonst „Ziel
                wählen, Link" und den Satz erst drei Elemente später.
              */}
              <Link
                className={`${s.knopf} ${s.knopfTinte} ${s.knopfBreit}`}
                href={zielWahlWeg}
                aria-describedby="lb-ziel-pflicht"
                data-rolle="entnahme-ziel-waehlen"
              >
                Ziel wählen
              </Link>
              <span id="lb-ziel-pflicht" className={s.zielPflichtHinweis}>
                {/*
                  ⚠️ DER SATZ ZITIERT DIE WAHL WÖRTLICH. Auf `/helfer/ziel`
                  heißt die Zeile „Keine Einheit — Verbrauch" (DRK-309: neutral,
                  weil eine Tasche kein Fahrzeug ist). „Kein Fahrzeug" wäre eine
                  Beschriftung, die es auf dem nächsten Schirm nicht gibt.
                */}
                Ohne Ziel wird nicht gebucht — wähle die Einheit oder
                {" „Keine Einheit — Verbrauch“."}
              </span>
            </div>
          ) : (
            <div
              className={`${s.zeile} ${s.zielZeile}`}
              style={{ borderTop: "none", padding: "11px 0" }}
              data-rolle="entnahme-ziel"
            >
              <span className={s.zeileHaupt}>Ziel</span>
              <span className={s.zielWert}>
                {ziel.art === "fahrzeug"
                  ? `${ziel.name} · ${einheitMeta(ziel)}`
                  : "Keine Einheit — Verbrauch"}
              </span>
              <Link className={s.zielAendern} href={zielWahlWeg}>
                Ändern
              </Link>
            </div>
          )}

          <button
            className={`${s.knopf} ${s.knopfTinte} ${s.knopfBreit}`}
            type="button"
            disabled={ziel === null || verwendbarSumme === 0 || laeuft || nimmtZurueck}
            onClick={absenden}
            data-rolle="entnahme-buchen"
          >
            Entnahme buchen
          </button>

          <SendeStatus entwurf={entwurf} rolle="entnahme-ergebnis" />

          {rueck && !laeuft && (
            <>
              {/* Der mehrzeilige Ergebnissatz braucht die von `.chip` abweichende Form aus `.rueckmeldung`. */}
              <span
                className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
                data-rolle="entnahme-ergebnis"
                role="status"
              >
                {/*
                  DRK-305: `RIEGEL_TEXTE.sitzung` lautet wörtlich „Scanne das
                  Kärtchen erneut". Für eine angemeldete Person ist das falsch,
                  und der Server kann es nicht wissen — die Seite schon.
                */}
                {kontoZugang && rueck.grund === "sitzung" ? ANMELDUNG_TEXT : rueck.text}
              </span>
              {rueck.rueckgaengig && (
                <RueckgaengigKnopf
                  // Neu je Sendung — sonst liefe die Uhr der vorigen weiter.
                  key={rueck.rueckgaengig.sendungId}
                  bis={rueck.rueckgaengig.bis}
                  laeuft={nimmtZurueck}
                  beiKlick={() => void rueckgaengig(rueck.rueckgaengig!.sendungId)}
                />
              )}
              {/*
                Bei `sitzung` fuehrt der Weg zurueck aufs Gate — MIT `returnTo`,
                damit der Artikel nach dem erneuten Einloesen wieder offen ist.
                Ein Erneuerungsfeld an Ort und Stelle gibt es hier NICHT: anders
                als im Check (§7.4.4) haengt an dieser Seite kein Client-Zustand,
                den ein Seitenwechsel verwuerfe — nur eine Zahl, und die bleibt
                stehen.
              */}
              {rueck.grund === "sitzung" && !kontoZugang && (
                <Link
                  className={s.rueckweg}
                  href={`/?returnTo=${encodeURIComponent(artikelPfad)}`}
                  data-rolle="entnahme-zum-gate"
                >
                  Kärtchen erneut eingeben
                </Link>
              )}
              {/*
                DRK-305 — derselbe Ausfall, anderer Rückweg. Kein `returnTo`
                aufs Gate: dort steht ein Zahlenfeld für ein Kärtchen, das diese
                Person nicht hat. Der Weg in die Verwaltung löst die Anmeldung
                aus; die eingetippte Menge ist eine Zahl und schnell wieder
                gesetzt, deshalb hier KEIN neuer Tab (anders als im Check, wo
                der ganze Zählstand im Client liegt).
              */}
              {rueck.grund === "sitzung" && kontoZugang && (
                <Link
                  className={s.rueckweg}
                  href="/verwaltung"
                  data-rolle="entnahme-zur-anmeldung"
                >
                  Erneut anmelden
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className={s.karte}>
        {/*
          ⚠️ DIE UEBERSCHRIFT SAGT SEIT DRK-418 ETWAS ANDERES, SOBALD MAN WAEHLEN
          KANN. „Zuerst ablaufende" (IDA-380, vorher „… (FEFO)") beschreibt eine Regel, die die
          Anwendung befolgt; wo eine Wahl steht, ist sie nur noch die VORGABE,
          und die Ueberschrift muss sagen, dass hier etwas zu tun ist. Eine
          Liste, die aussieht wie eine Auskunft, tippt niemand an.
        */}
        <div className={s.karteTitel}>
          {wahlMoeglich ? "Charge wählen" : "Zuerst ablaufende"}
        </div>
        {/*
          ⚠️ DIE FEFO-ZEILE IST EINE ZEILE IN DERSELBEN LISTE, kein Leerlassen —
          dieselbe Entscheidung wie bei der Zielwahl (`helfer/ziel/page.tsx`).
          Ein Ablauf, in dem man die Vorgabe durch Nichtstun bekommt, laesst
          niemanden sehen, was gerade gilt.
        */}
        {wahlMoeglich && (
          <label
            className={`${s.zeile} ${s.zeileWahl}`}
            data-rolle="charge-fefo"
          >
            <input
              type="radio"
              name={`charge-${detail.id}`}
              className={s.wahlKnopf}
              checked={chargeId === null}
              onChange={() => setChargeId(null)}
            />
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>Zuerst ablaufende</div>
            </div>
          </label>
        )}
        {sichtbareChargen.map((c) => {
          /*
           * ⚠️ WAEHLBAR IST NUR, WAS IM HANDLAGER LIEGT. Die Zeilen unter dem
           * Umschalter sind Auskunft darueber, WO das Material sonst ist
           * (DRK-297, Aufgabe 12) — ein Radioknopf daran waere ein Angebot,
           * das die Action danach ablehnt, und zwar mit einem Satz ueber
           * Bestand, den die Zeile daneben gerade mit „0" erklaert.
           */
          // IDA-378: eine abgelaufene Charge ist Auskunft, keine Wahl.
          const waehlbar = wahlMoeglich && c.rest > 0 && !c.abgelaufen;
          const Zeile = waehlbar ? "label" : "div";
          return (
          <Zeile
            className={waehlbar ? `${s.zeile} ${s.zeileWahl}` : s.zeile}
            key={c.id}
            data-rolle="charge-zeile"
            data-waehlbar={waehlbar ? "ja" : "nein"}
          >
            {waehlbar && (
              <input
                type="radio"
                name={`charge-${detail.id}`}
                className={s.wahlKnopf}
                data-rolle="charge-wahl"
                /*
                  ⚠️ `value` TRAEGT DIE CHARGEN-ID, obwohl die Gruppe nicht in
                  einem Formular steht und React den Stand ueber `checked`
                  fuehrt. Sie ist der Greifer: ohne sie sind die Knoepfe von
                  aussen nur ueber ihre POSITION zu treffen, und eine
                  Zusicherung auf „der zweite Radioknopf" misst beim naechsten
                  Sortierwechsel etwas anderes, als sie sagt.
                */
                value={c.id}
                checked={chargeId === c.id}
                /*
                  ⚠️ DIE MENGE WANDERT MIT NACH UNTEN, nie nach oben. Wer 8
                  eingestellt hat und dann eine Charge mit 3 waehlt, bekaeme
                  sonst einen Stepper, dessen Wert ueber seinem eigenen `max`
                  steht — und die Zahl, die dann bucht, waere die dritte
                  Wahrheit neben Anzeige und Deckel.
                */
                onChange={() => {
                  setChargeId(c.id);
                  const zuViel = menge > c.rest;
                  setMenge((m) => Math.min(m, c.rest));
                  // IDA-378: auch dieses Kappen ist sichtbar.
                  if (zuViel) setGekappt(true);
                }}
              />
            )}
            <div className={s.zeileHaupt}>
              <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
              <div className={s.zeileMeta}>
                {/* Beide Angaben stehen NEBENEINANDER: der Chip traegt den
                    Status als TEXT (nie allein ueber Farbe), `fmtVerfall` das
                    Datum in der Form „MM/JJ" (Teil 3, T39). */}
                {c.abgelaufen
                  ? <HelferChip ton="rot">Abgelaufen, nicht verwenden</HelferChip>
                  : <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>}
                <span>{fmtVerfall(c.verfall)}</span>
              </div>
              {/*
                DRK-297, Aufgabe 12 — WO die Charge liegt. Eine eigene Zeile
                pro Ort ("Ort: Menge Einheit"), dieselbe `.zeileMeta`-Form wie
                die Chip-Zeile darueber.
              */}
              <div className={s.zeileMeta} data-rolle="charge-orte">
                {c.orte.map((ort) => (
                  <span key={ort.id} data-rolle="charge-ort">
                    {ortZeile(ort)}: {ort.menge} {detail.einheit}
                  </span>
                ))}
              </div>
              {/*
                ⚠️ NACHTRAG DES HAUPTLAUFS ZU AUFGABE 12: der Zugangshinweis
                steht HIER, direkt unter der Verteilung, und NICHT in einem
                Tooltip. Das ist die Ansicht fuer jemanden mit dem Telefon in
                der Hand, der das Material am Regal nicht findet — ein
                Hinweis, den man erst aufdecken muss, hilft dort niemandem.
                `.chip.warnhinweis` traegt bereits die umbruchfaehige,
                mehrzeilige Form (siehe `CheckFlow.tsx`); der Ton bleibt
                NEUTRAL (`grau`), weil hier nichts falsch gelaufen ist, nur
                ein Weg zu nennen ist.
              */}
              {c.orte
                .filter((ort) => ort.zugangshinweis)
                .map((ort) => (
                  <span
                    key={ort.id}
                    className={`${s.chip} ${s.grau} ${s.warnhinweis}`}
                    data-rolle="charge-zugangshinweis"
                  >
                    {ortZeile(ort)}: {ort.zugangshinweis}
                  </span>
                ))}
            </div>
            <div className={s.mengenChip}>
              {/*
                ⚠️ FIXRUNDE 1 ZU AUFGABE 12: HIER STAND `c.restGesamt`. Kopfzahl
                ("BESTAND HANDLAGER"), Stepper-Obergrenze und Buchen-Sperre
                haengen alle an `detail.bestand` — Handlager-only. `restGesamt`
                waere hier groesser als das, was tatsaechlich abbuchbar ist:
                jemand liest „7 Pkg." und kann sie nicht nehmen. `c.rest` (der
                Handlager-Anteil) spricht dieselbe Sprache wie die Kopfzahl;
                eine „0" bei einer reinen Fahrzeug-Charge ist nicht raetselhaft,
                weil die Ortszeile direkt darunter erklaert, wo der Rest liegt.
              */}
              {c.rest}
              <small>{detail.einheit}</small>
            </div>
          </Zeile>
          );
        })}

        {/*
          ⚠️ EINE LEERE KARTE IST KEINE AUSKUNFT. Liegt von diesem Artikel
          nichts im Handlager, steht hier der Satz, den die Kopfzahl („BESTAND
          HANDLAGER 0") nur als Ziffer sagt — und zwar VOR dem Umschalter,
          damit klar ist, warum darunter nichts steht.
        */}
        {sichtbareChargen.length === 0 && (
          <div className={`${s.zeile} ${s.fussnote}`} data-rolle="charge-leer">
            {ohneBestand.length > 0
              ? "Im Handlager liegt von diesem Artikel nichts."
              : "Für diesen Artikel ist keine Charge erfasst."}
          </div>
        )}

        {/*
          DER UMSCHALTER — DRK-397.
          ⚠️ ER NENNT DIE ANZAHL, und das ist nicht Zierde: ohne sie ist er ein
          Knopf, hinter dem vielleicht nichts steckt, und wer am leeren Fach
          steht, drueckt ihn dann gar nicht erst. Mit der Zahl ist er die
          Antwort auf „hier ist nichts — und sonst?".
          ⚠️ `aria-expanded` STATT EINES ZWEITEN ZUSTANDSTEXTES fuer die
          Vorleseanwendung: der Knopf deckt eine Liste auf, die im selben
          Dokument steht.
        */}
        {ohneBestand.length > 0 && (
          <button
            type="button"
            className={`${s.zeile} ${s.zeileKnopf} ${s.chargenUmschalter}`}
            aria-expanded={zeigeOhneBestand}
            onClick={() => setZeigeOhneBestand((an) => !an)}
            data-rolle="charge-umschalter"
          >
            {zeigeOhneBestand
              ? "Nur Chargen im Handlager zeigen"
              : `Auch ${ohneBestand.length} Charge${ohneBestand.length === 1 ? "" : "n"} ohne Bestand im Handlager zeigen`}
          </button>
        )}
      </div>
    </div>
  );
}
