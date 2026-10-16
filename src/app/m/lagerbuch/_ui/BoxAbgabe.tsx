"use client";

import { useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { falte } from "../_lib/suche";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import {
  ANMELDUNG_TEXT, NETZ_TEXT_BUCHUNG, type HelferGrund,
} from "../_lib/actionTypen";
// ⚠️ DIREKT IMPORTIERT, NICHT ALS PROP (Falle 9, `CLAUDE.md`):
// „Server Actions duerfen als einzige ueber die Grenze — aber direkt
// importiert, nicht als Prop durchgereicht." Dieselbe Form wie in
// `_ui/Auffuellen.tsx` und `_ui/Entnahme.tsx`.
import { bucheInEntnahmebox } from "../_actions/entnahmebox";
import { einheitMeta, inDerEinheit, type Einheitenart } from "../_lib/konstanten";
import { ampelTon } from "../_lib/format";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
// NUR DER TYP, und er liegt in einem Modul OHNE "use client" (Falle 6):
// dieselbe Form liest die Server Component, die ihn befuellt.
import type { BoxPosten } from "../_lib/lesepfade/entnahmebox";
import s from "./helfer.module.css";

/**
 * „IN DIE BOX LEGEN" AM FAHRZEUG — DRK-314.
 *
 * Die Gegenrichtung zu `_ui/Entnahme.tsx`: dort wandert Material aus dem
 * Handlager an die Einheit, hier von der Einheit in die Kiste in der Halle.
 *
 * ⚠️ KEIN antd UND KEIN `@ant-design/icons` (Fallen 1 und 7). Der Helfer-Weg ist
 * bewusst antd-frei; er rendert auf einem privaten Telefon in einer Sitzung ohne
 * Konto, und seine Bediendichte ist 56/72, nicht die der Verwaltung.
 * `_lib/bauform.test.ts` riegelt das fuer den ganzen Ast ab.
 *
 * ⚠️ DIE ACTION WIRD DIREKT IMPORTIERT (DRK-375). Bis dahin kam sie als PROP —
 * uebernommen von `Entnahme.tsx`, dessen Begruendung eine REIHENFOLGE war
 * (`_actions/buchung.ts` gehoerte einem spaeter laufenden Plan). Diese
 * Begruendung hat hier nie gegolten: `_actions/entnahmebox.ts` entstand in
 * DERSELBEN Aufgabe wie diese Insel. Uebrig blieb nur die bequemere Testform —
 * und dafuer gibt Falle 9 (`CLAUDE.md`) die Bauform vor: „Server
 * Actions duerfen als einzige ueber die Grenze — aber direkt importiert, nicht
 * als Prop durchgereicht."
 *
 * ── EINE SEITE STATT ZWEIER ────────────────────────────────────────────────
 *
 * ⚠️ DIE MENGENEINGABE KLAPPT IN DER ZEILE AUF, statt auf einen zweiten Schirm
 * zu fuehren. Der Grund ist der Handgriff, nicht der Geschmack: wer eine Kiste
 * ausraeumt, legt selten ein Teil hinein, sondern drei oder vier
 * nacheinander — und jeder Schirmwechsel kostet auf dem Telefon den Ueberblick
 * ueber die Liste, aus der man gerade waehlt. Die Entnahme am Regal hat den
 * umgekehrten Fall (ein Artikel, den man am Etikett gescannt hat) und deshalb
 * zu Recht eine eigene Seite.
 *
 * ⚠️ ES IST IMMER HOECHSTENS EINE ZEILE OFFEN. Zwei halb ausgefuellte
 * Mengenfelder untereinander sind zwei Absichten, von denen der Knopf nur eine
 * ausfuehrt; welche, waere aus der Anzeige nicht zu erkennen.
 *
 * ── SUCHE OBEN, BELEG UNTEN — IDA-220 ─────────────────────────────────────
 *
 * Eine Einheit fuehrt leicht 200 Posten. Ohne Suche hiess das: durch die
 * ganze Liste scrollen, und die Bestaetigung stand danach OBEN ueber der Liste
 * — also genau dort, wo niemand hinsah, der gerade unten etwas abgelegt hatte.
 *
 * ⚠️ DAS SUCHFELD FILTERT IM CLIENT, mit derselben Faltung wie die Artikelliste
 * der Entnahme (`ArtikelSuche`, `_lib/suche.ts`). Die Posten liegen ohnehin
 * vollstaendig im Payload; eine Navigation je Tastendruck waere in der Halle
 * die teuerste Form. Gesucht wird ueber den Artikelnamen — `BoxPosten` fuehrt
 * kein Fach, und an der Einheit gibt es keines.
 *
 * ⚠️ DER ERFOLG STEHT IN DER LEISTE UNTEN, DER FEHLER IN DER OFFENEN ZEILE. Der
 * Erfolg schliesst die Zeile — er braucht einen Ort, der unabhaengig von der
 * Scrollposition sichtbar ist. Ein Fehler laesst sie offen, und die Meldung
 * gehoert neben den Knopf, der sie ausgeloest hat.
 *
 * ⚠️ DER BELEG ZAEHLT, WAS IN DIESER RUNDE ABGELEGT WURDE. Ein Posten, der auf
 * null geht, verschwindet aus der Liste (`postenAmOrt`); ohne den Beleg waere
 * das Verschwinden die einzige Spur der Buchung. Er lebt nur im Zustand dieser
 * Insel — das Buch ist die Wahrheit, der Beleg ist die Quittung.
 */

export type BoxEinheit = {
  id: string;
  name: string;
  kennung: string | null;
  einheitenart: Einheitenart | null;
};

/** Ein Fehler gehoert zu der Zeile, aus der gebucht wurde. */
type Fehler = { artikelId: string; text: string; grund?: HelferGrund };

/** Eine Zeile des Belegs — was in dieser Runde abgelegt wurde. */
type Abgelegt = { artikelId: string; artikelName: string; einheit: string; menge: number };

/**
 * DIE CHARGENWAHL IST EIN EIGENER ZUSTAND MIT DREI WERTEN, nicht zwei.
 *
 * `null` heisst „keine Charge gewaehlt — die aelteste nehmen" und ist die
 * Vorgabe; eine Id heisst „genau diese". Der Unterschied ist fachlich: FEFO ist
 * eine ENTNAHME-Regel, beim Umraeumen traegt man DIE Packung, die man in der
 * Hand hat (`_lib/schreibpfade/umlagerung.ts`). Wer die Nummer nicht lesen kann
 * oder wem sie egal ist, laesst die Vorgabe stehen.
 */
type Wahl = { artikelId: string; menge: number; chargeId: string | null };

export function BoxAbgabe({
  einheit,
  posten,
  andereEinheitErreichbar,
  rueckweg,
  kontoZugang,
}: {
  einheit: BoxEinheit;
  posten: BoxPosten[];
  /**
   * DIE HERKUNFT DES ZUGANGS — `true` heisst „angemeldetes Konto, kein
   * Kaertchen" (DRK-305).
   *
   * ⚠️ SIE ENTSCHEIDET DEN RUECKWEG, und ohne sie ist er eine Sackgasse: faellt
   * der Zugang aus, gibt der Server den Kaertchen-Grund `sitzung` zurueck — er
   * kann die Herkunft nicht unterscheiden (`_lib/helferZugang.ts`) —, und der
   * Weg darunter fuehrte aufs Gate, wo ein Code verlangt wird, den eine
   * angemeldete Person nicht hat.
   *
   * PFLICHT-PROP: ein vergessenes `kontoZugang?` waere still `undefined` und
   * damit „Kaertchen", also genau der Defekt.
   */
  kontoZugang: boolean;
  /**
   * Fuehrt „Andere Einheit" ueberhaupt woandershin? (Codex-Review zu PR #175)
   *
   * ⚠️ DER LINK OBEN IST DIE EINZIGE NAVIGATION DIESES SCHIRMS, und er ist
   * genau dann wirkungslos, wenn `/helfer/box` dieselbe Einheit erneut waehlt —
   * bei einem gebundenen Kaertchen (DRK-302) oder bei genau einer aktiven
   * Einheit. Er fuehrt dann sichtbar nach nirgendwo: die Seite laedt, zeigt
   * dasselbe, und wer davorsteht haelt den eigenen Klick fuer danebengegangen.
   *
   * ⚠️ DIE ENTSCHEIDUNG GEHOERT DER SEITE, NICHT DIESER INSEL. Nur sie kennt
   * die Bindung der Sitzung und die Zahl der aktiven Einheiten; die Insel
   * bekaeme beides nur, wenn man ihr mehr in den Payload legt, als sie zeigt.
   * Dieselbe Aufteilung wie `gebunden` bei `CheckFlow`.
   *
   * PFLICHT-PROP: ein vergessenes `andereEinheitErreichbar?` waere still
   * `undefined` und damit „nicht erreichbar" — der Link verschwaende auf JEDEM
   * Schirm, auch dort, wo er gebraucht wird.
   */
  andereEinheitErreichbar: boolean;
  /**
   * WOHIN DER RUECKWEG FUEHRT, WENN ES KEINE ANDERE EINHEIT GIBT — DRK-417.
   *
   * ⚠️ ER KOMMT VOM SERVER, WEIL NUR DER DIE REICHWEITE KENNT. Hier stand fest
   * `/helfer`, und fuer eine Karte an der Entnahmebox ist das ein Link, der
   * nichts tut: die Artikelliste weist dieselbe Karte ab und schickt sie
   * hierher zurueck. Dieser Schirm hat sonst keine Navigation ausser der
   * Reiterleiste — der Weg darf nicht im Kreis fuehren (Codex-Befund P2 zu
   * PR #205).
   *
   * ⚠️ PFLICHT-PROP, KEIN OPTIONAL. Ein Vorgabewert waere wieder das feste
   * `/helfer` — also genau der Kreis, und zwar still.
   */
  rueckweg: { href: string; text: string };
}) {
  const [wahl, setWahl] = useState<Wahl | null>(null);
  const [fehler, setFehler] = useState<Fehler | null>(null);
  const [abgelegt, setAbgelegt] = useState<Abgelegt[]>([]);
  const [belegOffen, setBelegOffen] = useState(false);
  const [q, setQ] = useState("");
  const [laeuft, start] = useTransition();
  const belegRef = useRef<HTMLDivElement>(null);

  // `trim()` VOR `falte()` — dieselbe Form wie `ArtikelSuche`.
  const treffer = useMemo(() => {
    const nadel = falte(q.trim());
    return posten.filter((p) => falte(p.artikelName).includes(nadel));
  }, [posten, q]);

  /** Der Beleg fasst je Artikel zusammen: zweimal Pflaster ist EINE Zeile. */
  const beleg = useMemo(() => {
    const je = new Map<string, Abgelegt>();
    for (const a of abgelegt) {
      const da = je.get(a.artikelId);
      je.set(a.artikelId, da ? { ...da, menge: da.menge + a.menge } : a);
    }
    return [...je.values()];
  }, [abgelegt]);
  const letzte = abgelegt.at(-1);

  function oeffnen(p: BoxPosten): void {
    setFehler(null);
    // ⚠️ EIN ZWEITER TIPP AUF DIESELBE ZEILE SCHLIESST SIE. Ohne diesen Zweig
    // gaebe es keinen Weg zurueck aus einer versehentlich geoeffneten Zeile
    // ausser dem Absenden — und genau das waere die Buchung, die niemand wollte.
    setWahl((vorher) =>
      vorher?.artikelId === p.artikelId
        ? null
        : { artikelId: p.artikelId, menge: 1, chargeId: null },
    );
  }

  function absenden(p: BoxPosten): void {
    if (!wahl || wahl.artikelId !== p.artikelId) return;
    /*
     * ⚠️ DIE OBERGRENZE IST DIE CHARGE, SOBALD EINE GEWAEHLT IST — nicht der
     * Bestand des Artikels an der Einheit. Ohne diese Zeile boete der Stepper
     * die volle Artikelmenge an, waehrend der Server die gewaehlte Charge
     * pruefen wuerde: die Buchung fiele mit „Von dieser Charge liegen hier nur
     * …" ab, und zwar erst nach dem Tippen.
     */
    const grenze = Math.min(
      wahl.chargeId
        ? (p.chargen.find((c) => c.id === wahl.chargeId)?.rest ?? 0)
        : p.menge,
      BUCHUNG_MENGE_MAX,
    );
    const menge = Math.min(wahl.menge, grenze);
    if (menge <= 0) return;
    setFehler(null);
    start(async () => {
      try {
        const r = await bucheInEntnahmebox({
          fahrzeugId: einheit.id,
          artikelId: p.artikelId,
          menge,
          chargeId: wahl.chargeId,
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          setFehler({ artikelId: p.artikelId, text: r.text, grund: r.grund });
          return;
        }
        setAbgelegt((vorher) => [...vorher, {
          artikelId: p.artikelId, artikelName: p.artikelName, einheit: p.einheit, menge: r.wert.gebucht,
        }]);
        // Die Zeile schliesst nach dem Erfolg. Sie offen zu lassen hiesse, ein
        // gefuelltes Mengenfeld ueber einer Liste stehen zu lassen, deren Zahlen
        // der naechste Serverstand gerade aendert — ein zweiter Tipp buchte
        // dann gegen einen Bestand, der nicht mehr auf dem Schirm steht.
        setWahl(null);
        // Und die Suche leert sich: der naechste Griff ist fast immer ein
        // ANDERER Artikel (IDA-220). Was gerade gebucht wurde, sagt die Leiste.
        setQ("");
        // Ein kurzes Rucken in der Hand — in der Halle schaut niemand
        // ununterbrochen aufs Telefon. Wo es das nicht gibt (iOS), passiert nichts.
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(40);
        }
      } catch {
        // FALLE 62: ohne `catch` schlaegt der Wurf bis zur Fehlerseite durch,
        // und in Produktion steht dort ein englischer Satz mit `digest`
        // (Falle 66). `"netz"` entsteht ausschliesslich HIER, nie serverseitig.
        setFehler({ artikelId: p.artikelId, text: NETZ_TEXT_BUCHUNG, grund: "netz" });
      }
    });
  }

  /** Enter im Suchfeld: bei genau einem Treffer diesen oeffnen, die Tastatur weg. */
  function suchEnter(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.currentTarget.blur();
    if (treffer.length === 1 && wahl?.artikelId !== treffer[0].artikelId) oeffnen(treffer[0]);
  }

  return (
    <div className={s.lesebahn}>
      {/*
        ⚠️ DER RUECKWEG WIRD GETAUSCHT, NICHT VERSTECKT. Dieser Schirm hat sonst
        keine Navigation; ohne den Link bliebe nur die Reiterleiste. Dieselbe
        Form wie im Leerzustand der Seite und wie in `CheckFlow`.
      */}
      <Link
        className={s.rueckweg}
        href={andereEinheitErreichbar ? "/helfer/box" : rueckweg.href}
        data-rolle="box-rueckweg"
      >
        <Ikone name="chevron-links" groesse={15} />
        {andereEinheitErreichbar ? "Andere Einheit" : rueckweg.text}
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {einheit.name}
        </h1>
      </div>
      {/*
        DIE ART STEHT UNTER DEM NAMEN, NICHT IM NAMEN (DRK-309): zwei Einheiten
        duerfen gleich heissen, und eine Tasche traegt kein Kennzeichen — ohne
        die Art stuende hier fuer sie gar nichts.
      */}
      <p className={s.fussnote} data-rolle="box-einheit-meta">{einheitMeta(einheit)}</p>

      {/*
        ⚠️ DER ERSTE SATZ SAGT JETZT, WOFUER DER SCHIRM DA IST — DRK-417.
        Vorher stand hier „Was du herausnimmst, kommt in die Entnahmebox in der
        Halle". Das beschreibt den MECHANISMUS und beantwortet die Frage nicht,
        die jemand vor der offenen Klappe hat: WAS soll ich herausnehmen? Der
        Anlass des Tickets ist der Ueberschuss — was zu viel drin ist, was nicht
        hierher gehoert, was jemand drauf gelegt hat —, und das stand nirgends
        auf dem Schirm. Die Liste darunter zeigt folgerichtig den BESTAND und
        nicht das Soll (siehe `postenAmOrt` an der Seite).

        ⚠️ ZWEI SAETZE, NICHT VIER. Dieser Schirm wird im Stehen gelesen, mit
        einer Hand. Was gleich bleibt („das Material bleibt so lange im Buch"),
        gehoert in den zweiten Satz, weil die Aenderung so aussieht, als naehme
        sie etwas weg — mehr Beruhigung braucht es nicht.
      */}
      <p className={s.fussnote} data-rolle="box-zweck">
        Was zu viel drin ist oder nicht hierher gehört, kommt in die Entnahmebox
        in der Halle. Eingeräumt wird es später — bis dahin bleibt es im Buch.
      </p>

      {/*
        DAS SUCHFELD BLEIBT OBEN STEHEN (IDA-220) — bei 200 Posten ist es der
        Weg in die Liste, nicht ein Zusatz zu ihr.
      */}
      <div className={s.boxSuche}>
        <div className={s.feldZeile}>
          <input
            className={s.suchfeld}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Artikel suchen"
            placeholder="Artikel suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={suchEnter}
            data-rolle="box-suche"
          />
          {q !== "" && (
            <button
              type="button"
              className={s.boxSucheLeeren}
              onClick={() => setQ("")}
              aria-label="Suche leeren"
              data-rolle="box-suche-leeren"
            >
              <Ikone name="kreuz" />
            </button>
          )}
        </div>
        <div className={s.boxSucheZahl} data-rolle="box-trefferzahl" aria-live="polite">
          {q.trim() === ""
            ? `${posten.length} Artikel`
            : `${treffer.length} von ${posten.length} ${posten.length === 1 ? "Artikel" : "Artikeln"}`}
        </div>
      </div>

      <div className={s.karte}>
        {/*
          ART-BEWUSST, NICHT NEUTRAL (DRK-309): hier steht die Art FEST — es ist
          der Schirm genau dieser Einheit —, und die Regel lautet, dass sie
          dort auch dasteht, wo sie bekannt ist. „Liegt in der Einheit" waere
          die Ausnahme von der eigenen Regel.
        */}
        <div className={s.karteTitel} data-rolle="box-liste-titel">
          Liegt {inDerEinheit(einheit.einheitenart)}
        </div>
        {treffer.length === 0 && (
          <div className={`${s.kartePad} ${s.fussnote}`} data-rolle="box-kein-treffer">
            Nichts gefunden für „{q.trim()}“.
          </div>
        )}
        {treffer.map((p) => {
          const offen = wahl?.artikelId === p.artikelId;
          return (
            <div key={p.artikelId} data-rolle="box-posten">
              <button
                type="button"
                className={`${s.zeile} ${s.zeileKnopf}`}
                onClick={() => oeffnen(p)}
                aria-expanded={offen}
                data-rolle="box-posten-knopf"
              >
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{p.artikelName}</div>
                  <div className={s.zeileMeta}>
                    {/*
                      ⚠️ `c.text` UND NICHT DAS BLOSSE DATUM (Codex-Review zu
                      PR #175). Die Zusammenfassung ist die Zeile, an der jemand
                      entscheidet, ob er den Posten ueberhaupt aufklappt — und
                      „01/27" allein sagt nicht, ob das gut oder schlecht ist.
                      Die Antwort steckte bis hier allein in der FARBE; mit
                      Rot-Gruen-Schwaeche oder einer Vorleseanwendung war sie
                      nicht zu haben. Die Chargenwahl darunter hat es laengst so.
                    */}
                    {p.chargen.map((c) => (
                      <HelferChip key={c.id} ton={ampelTon(c.ampel)}>
                        {c.text}
                      </HelferChip>
                    ))}
                    {/*
                      DIE GEMELDETE ANGABE, UND SIE SAGT DAZU, DASS SIE EINE IST
                      (DRK-377). Sie steht neben den Chargenchips und meint
                      etwas anderes: die Chargen tragen, was im Buch steht,
                      diese Angabe traegt, was jemand auf der Packung gelesen
                      hat. Ohne das Wort „gemeldet" waeren zwei widersprechende
                      Chips nebeneinander — „bis 12/99" und „läuft 10/26 ab" —
                      ohne einen Hinweis, welcher wovon spricht.
                    */}
                    {p.gemeldet && (
                      <HelferChip ton={ampelTon(p.gemeldet.ampel)}>
                        gemeldet: {p.gemeldet.text}
                      </HelferChip>
                    )}
                  </div>
                </div>
                <div className={s.mengenChip}>
                  {p.menge}
                  <small>{p.einheit}</small>
                </div>
                <Ikone name={offen ? "zuklappen" : "aufklappen"} />
              </button>

              {offen && wahl && (
                <div className={s.kartePad} data-rolle="box-eingabe">
                  {/*
                    DIE CHARGENWAHL ERSCHEINT NUR, WENN ES ETWAS ZU WAEHLEN GIBT.
                    Bei genau einer Charge ist die Frage beantwortet, bevor sie
                    gestellt wird — und eine Radiogruppe mit einem Knopf ist eine
                    Bedienung ohne Wirkung.
                  */}
                  {p.chargen.length > 1 && (
                    <fieldset
                      style={{ border: "none", padding: 0, margin: "0 0 10px" }}
                      data-rolle="box-chargenwahl"
                    >
                      <legend className={s.fussnote} style={{ padding: 0 }}>
                        Welche Charge? Ohne Angabe wird die zuerst ablaufende genommen.
                      </legend>
                      <label className={`${s.zeile} ${s.zeileWahl}`}>
                        <input
                          type="radio"
                          name={`charge-${p.artikelId}`}
                          className={s.wahlKnopf}
                          checked={wahl.chargeId === null}
                          onChange={() => setWahl({ ...wahl, chargeId: null })}
                        />
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>Zuerst ablaufende</div>
                        </div>
                      </label>
                      {p.chargen.map((c) => (
                        <label key={c.id} className={`${s.zeile} ${s.zeileWahl}`}>
                          <input
                            type="radio"
                            name={`charge-${p.artikelId}`}
                            className={s.wahlKnopf}
                            checked={wahl.chargeId === c.id}
                            onChange={() => setWahl({ ...wahl, chargeId: c.id, menge: Math.min(wahl.menge, c.rest) })}
                          />
                          <div className={s.zeileHaupt}>
                            <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
                            <div className={s.zeileMeta}>
                              <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                              <span>{c.rest} {p.einheit}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </fieldset>
                  )}

                  <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
                    <span className={s.zeileHaupt}>Menge</span>
                    <Stepper
                      wert={wahl.menge}
                      setWert={(m) => setWahl({ ...wahl, menge: m })}
                      min={1}
                      /*
                        ⚠️ `BUCHUNG_MENGE_MAX` DECKELT AUCH HIER
                        (Codex-Review zu PR #175). Der Bestand ist die
                        fachliche Grenze, der Deckel die technische — `BoxSchema`
                        weist alles darueber ab, und die Meldung spraeche dann
                        von einer unvollstaendigen Eingabe an einem vollstaendig
                        ausgefuellten Formular.
                      */
                      max={Math.max(
                        Math.min(
                          wahl.chargeId
                            ? (p.chargen.find((c) => c.id === wahl.chargeId)?.rest ?? 1)
                            : p.menge,
                          BUCHUNG_MENGE_MAX,
                        ),
                        1,
                      )}
                      beschriftung={`Menge ${p.artikelName}`}
                    />
                  </div>

                  <button
                    className={`${s.knopf} ${s.knopfRot} ${s.knopfBreit}`}
                    type="button"
                    disabled={laeuft}
                    onClick={() => absenden(p)}
                    data-rolle="box-buchen"
                    style={{ marginTop: 10 }}
                  >
                    {laeuft ? "Wird abgelegt…" : "In die Entnahmebox legen"}
                  </button>

                  {fehler?.artikelId === p.artikelId && (
                    <>
                      <span
                        className={`${s.chip} ${s.rot} ${s.rueckmeldung}`}
                        data-rolle="box-ergebnis"
                        role="alert"
                      >
                        {/*
                          DRK-305: `RIEGEL_TEXTE.sitzung` lautet woertlich „Scanne das
                          Kaertchen erneut". Fuer eine angemeldete Person ist das falsch, und
                          der Server kann es nicht wissen — die Seite schon.
                        */}
                        {kontoZugang && fehler.grund === "sitzung" ? ANMELDUNG_TEXT : fehler.text}
                      </span>
                      {fehler.grund === "sitzung" && !kontoZugang && (
                        <Link
                          className={s.rueckweg}
                          // DRK-493: die Einheit per `URLSearchParams`, wie im Check-Pfad.
                          href={`/?returnTo=${encodeURIComponent(`/helfer/box?${new URLSearchParams({ fz: einheit.id })}`)}`}
                          data-rolle="box-zum-gate"
                        >
                          Kärtchen erneut eingeben
                        </Link>
                      )}
                      {fehler.grund === "sitzung" && kontoZugang && (
                        <Link className={s.rueckweg} href="/verwaltung" data-rolle="box-zur-anmeldung">
                          Erneut anmelden
                        </Link>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        DER BELEG — IDA-220. Die Leiste klebt unten im Scroller und steht damit
        dort, wo die Hand gerade ist, egal wie weit unten in der Liste gebucht
        wurde. Der Statusbereich steht IMMER im Baum, damit eine Vorlesehilfe
        die erste Bestaetigung ansagt; ein erst eingefuegter Bereich wird von
        manchen ueberhoert.
      */}
      <div role="status" aria-live="polite" data-rolle="box-beleg-bereich">
        {letzte && (
          <div className={s.abschluss} data-rolle="box-beleg" ref={belegRef}>
            <span className={s.belegHaken} aria-hidden="true">
              <Ikone name="haken" groesse={18} />
            </span>
            <div className={s.abschlussInfo}>
              <b data-rolle="box-ergebnis">
                In die Entnahmebox gelegt: {letzte.menge} × {letzte.artikelName}
              </b>
              <span className={s.belegZeile} data-rolle="box-beleg-summe">
                Diesmal abgelegt: {beleg.length} Artikel
              </span>
              {belegOffen && (
                <ul className={s.belegListe} data-rolle="box-beleg-liste">
                  {beleg.map((a) => (
                    <li key={a.artikelId}>{a.menge} {a.einheit} {a.artikelName}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              className={s.belegUmschalter}
              onClick={() => {
                setBelegOffen((o) => !o);
                // Steht die Leiste am Listenende im Fluss, waechst sie unter die
                // Reiterleiste — die aufgeklappte Liste soll man auch sehen.
                requestAnimationFrame(() => belegRef.current?.scrollIntoView?.({ block: "nearest" }));
              }}
              aria-expanded={belegOffen}
              data-rolle="box-beleg-umschalter"
            >
              Liste <Ikone name={belegOffen ? "zuklappen" : "aufklappen"} groesse={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
