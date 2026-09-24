"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import { NETZ_TEXT_BUCHUNG } from "../_lib/actionTypen";
// ⚠️ DIREKT IMPORTIERT, NICHT ALS PROP (Falle 9, `CLAUDE.md`): „Server
// Actions duerfen als einzige ueber die Grenze — aber direkt importiert,
// nicht als Prop durchgereicht."
import { bucheAuffuellung } from "../_actions/buchung";
import { fmtVerfall, ampelTon } from "../_lib/format";
import type { Ampel } from "../_lib/domain/verfall";
import s from "./helfer.module.css";

/**
 * DAS AUFFUELLEN DES HANDLAGERS — DRK-313, im Stil der Entnahme
 * (`_ui/Entnahme.tsx`) und mit derselben Bediendichte 56/72.
 *
 * ⚠️ SIE IST DIE GEGENRICHTUNG ZUR ENTNAHME, NICHT IHRE VARIANTE. Dort verlaesst
 * Material das Handlager (Ziel: Fahrzeug oder Verbrauch), hier kommt es hinein
 * (Ziel: ein Schrank). Das ist der Grund, warum der Knopf hier NICHT rot ist:
 * Rot traegt auf dieser Flaeche die Bedeutung „Bestand geht weg" (der
 * Entnahme-Knopf) und in den Chips die Ampel (Falle 3). Ein zweiter roter
 * Breitknopf mit umgekehrter Wirkung waere der teuerste denkbare Gleichklang —
 * am Regal wird nach Farbe und Position getippt, nicht nach Beschriftung.
 *
 * ⚠️ DIE ACTION WIRD DIREKT IMPORTIERT (Codex-Befund P1 zu PR #174,
 * `CLAUDE.md`/Falle 9): „Server Actions duerfen als einzige ueber die Grenze —
 * aber direkt importiert, nicht als Prop durchgereicht."
 *
 * ⚠️ HIER STAND, DASS DAS DER UNTERSCHIED ZU `Entnahme.tsx` SEI — das gilt
 * seit DRK-375 nicht mehr. `Entnahme.tsx` und `BoxAbgabe.tsx` nahmen ihre
 * Action als Prop, weil `_actions/buchung.ts` damals einem SPAETER laufenden
 * Plan gehoerte; diese Begruendung ist abgelaufen, und beide sind umgestellt.
 * Alle drei Buchungsinseln des Helfer-Wegs fuehren jetzt dieselbe Form — es
 * gibt keine Ausnahme mehr, an der man sich orientieren koennte.
 *
 * ⚠️ KEIN antd UND KEIN `@ant-design/icons` (Fallen 1 und 7) — wie der ganze
 * Helfer-Ast. Die Monatsauswahl ist ein natives `<input type="month">`, dieselbe
 * Entscheidung wie im Zaehlschritt (§7.7.2 Punkt 4): mit Handschuhen einhaendig
 * bedienbar, und es entfaellt jede Dayjs-Umrechnung. Die STRENGE liegt
 * serverseitig (`MONAT_REGEX`).
 */
export type AuffuellCharge = {
  id: string;
  chargenNr: string;
  verfall: string;
  /** Rest im HANDLAGER-Bereich — dieselbe Zahl und dieselbe Sprache wie die
   *  Kopfzahl „BESTAND HANDLAGER". */
  rest: number;
  ampel: Ampel;
  text: string;
};

export type AuffuellDetail = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  /**
   * DRK-380 — `false` heisst: der Artikel ist deaktiviert, es geht kein
   * Material mehr auf ihn zu. Die Seite rendert trotzdem (der Regal-QR darf
   * keine Sackgasse werden); gesperrt wird allein die Buchung.
   */
  aktiv: boolean;
  bestand: number;
  chargen: AuffuellCharge[];
};

/** Ein waehlbarer Schrank. `zugangshinweis` steht VORN im Markup, nicht in einem
 *  Tooltip — dieselbe Begruendung wie in `Entnahme`: wer hier steht, sucht das
 *  Regal, und ein Hinweis, den man aufdecken muss, hilft dort niemandem. */
export type AuffuellZiel = { id: string; name: string; zugangshinweis: string | null };

/**
 * Der Wert, mit dem die Chargenwahl „eine neue Charge" meint.
 *
 * ⚠️ ER MUSS EIN WERT SEIN, DEN KEINE `chargen.id` ANNEHMEN KANN. `newId()` ist
 * nanoid mit 21 Zeichen aus dem 64er-Alphabet — ein Doppelpunkt kommt darin
 * nicht vor. Ohne diese Eigenschaft koennte eine echte Charge die Wahl still
 * uebernehmen.
 */
const NEUE_CHARGE = "neu:";

type Rueckmeldung = { art: "ok" | "fehler"; text: string };

export function Auffuellen({
  detail,
  ziele,
}: {
  detail: AuffuellDetail;
  /** Die Wurzel („Handlager (ohne Schrank)") plus die AKTIVEN Schraenke. Nie leer:
   *  die Wurzel gibt es immer. */
  ziele: AuffuellZiel[];
}) {
  const [chargeWahl, setChargeWahl] = useState(NEUE_CHARGE);
  const [chargenNr, setChargenNr] = useState("");
  const [verfall, setVerfall] = useState("");
  const [menge, setMenge] = useState(1);
  /**
   * DIE GERADE ANGELEGTE CHARGE — Codex-Befund P1 zu PR #174.
   *
   * ⚠️ SIE STEHT HIER, WEIL DIE LISTE SIE NOCH NICHT KENNEN MUSS. Die Buchung
   * revalidiert die Seite, `detail.chargen` bekommt die neue Zeile also — nur
   * eben nicht zwingend im selben Bild, in dem die Antwort ankommt. Zeigte die
   * Insel in diesem Fenster gar keine Auswahl, waere der Knopf freigegeben und
   * NICHTS angekreuzt: die naechste Buchung ginge auf eine Charge, die auf dem
   * Schirm nicht zu sehen ist. Dieser Eintrag ueberbrueckt genau dieses
   * Fenster und verschwindet, sobald die Liste ihn selbst fuehrt.
   */
  const [angelegt, setAngelegt] = useState<
    { id: string; chargenNr: string; verfall: string } | null
  >(null);
  /*
   * ⚠️ VORBELEGT NUR BEI GENAU EINER WAHL. Gibt es Schraenke, wird gewaehlt —
   * dieselbe Regel wie beim Entnahme-Ziel (DRK-300): eine Vorbelegung, die
   * jemand uebersieht, raeumt Material still an den falschen Ort, und niemand
   * merkt es. Bei genau einem Ort gibt es dagegen nichts zu entscheiden, und
   * ein Pflicht-Tipp auf die einzige Zeile waere reine Zeremonie (dieselbe
   * Bauform wie im Artikel-Drawer der Verwaltung).
   */
  const [zielId, setZielId] = useState(ziele.length === 1 ? ziele[0]!.id : "");
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  const neu = chargeWahl === NEUE_CHARGE;
  /*
   * Die Uebergangszeile faellt weg, sobald `detail.chargen` die neue Charge
   * fuehrt — sonst stuende sie nach der Revalidierung ZWEIMAL da, einmal
   * provisorisch und einmal echt.
   */
  const uebergang = angelegt && !detail.chargen.some((c) => c.id === angelegt.id) ? angelegt : null;
  const chargeVollstaendig = neu ? chargenNr.trim() !== "" && verfall !== "" : true;
  /*
   * ⚠️ `detail.aktiv` STEHT IN DERSELBEN BEDINGUNG WIE DIE OFFENE ENTSCHEIDUNG
   * (DRK-380), nicht in einer eigenen Weiche davor. `bereit` traegt schon
   * heute die zweite Haelfte der Zusage — `absenden` faellt bei `!bereit`
   * heraus, damit ein Tastendruck auf einen noch nicht neu gerenderten Knopf
   * nicht doch durchkommt. Eine zweite Sperre daneben haette diese Eigenschaft
   * nicht geerbt.
   */
  const bereit = detail.aktiv && chargeVollstaendig && zielId !== "" && menge > 0 && !laeuft;
  const zielName = ziele.find((z) => z.id === zielId)?.name ?? null;

  function absenden() {
    // Die zweite Haelfte derselben Zusage wie der gesperrte Knopf: ein
    // Tastendruck auf einen noch nicht neu gerenderten Knopf kaeme sonst durch.
    if (!bereit) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await bucheAuffuellung({
          artikelId: detail.id,
          menge,
          zielLagerortId: zielId,
          charge: neu
            ? { art: "neu", chargenNr: chargenNr.trim(), verfall }
            : { art: "vorhanden", chargeId: chargeWahl },
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          setRueck({ art: "fehler", text: r.text });
          return;
        }
        /*
         * DER BELEG NENNT MENGE, ARTIKEL UND ZIEL — AK3 des Tickets, und zwar
         * NACH der Buchung, nicht nur davor. Der Zielname kommt aus der
         * Antwort, nicht aus dem Zustand hier: der Server weiss, wohin er
         * wirklich gebucht hat.
         */
        setRueck({
          art: "ok",
          text: `Aufgefüllt: ${r.wert.gebucht} × ${detail.name} → ${r.wert.ziel}`,
        });
        /*
         * ⚠️ NACH EINER NEUEN CHARGE WIRD AUF SIE UMGESCHALTET — und das ist
         * die Abhilfe zu einem echten Fehler, nicht Bequemlichkeit
         * (Codex-Befund P1 zu PR #174).
         *
         * Wer eine Lieferung auspackt, verteilt sie auf MEHRERE Schraenke und
         * bucht darum mehrfach nacheinander. Bliebe die Wahl auf „Neue
         * Charge" stehen, legte der zweite Griff eine ZWEITE `chargen`-Zeile
         * mit derselben Nummer und demselben Verfall an — es gibt keinen
         * Eindeutigkeitsindex auf `(artikel_id, chargen_nr)`. Eine physische
         * Charge zerfiele in mehrere, in FEFO nicht unterscheidbare Toepfe,
         * und zwar STILL: jede Buchung fuer sich gelingt, und erst die
         * Chargenliste zeigt spaeter zwei gleiche Zeilen, die niemand mehr
         * zusammenfuehren kann (das Journal ist append-only).
         *
         * Die beiden Felder werden dabei GELEERT: sie haben ihren Zweck
         * erfuellt, und ein stehengebliebener Text luede dazu ein, dieselbe
         * Nummer beim naechsten Wechsel auf „Neue Charge" ein zweites Mal
         * anzulegen — also genau zurueck in den Fehler.
         */
        if (neu) {
          setAngelegt({ id: r.wert.chargeId, chargenNr: chargenNr.trim(), verfall });
          setChargeWahl(r.wert.chargeId);
          setChargenNr("");
          setVerfall("");
        }
        /*
         * ⚠️ DIE MENGE FAELLT AUF 1 ZURUECK. Sie ist bei jeder Buchung eine
         * neue Aussage — sie stehen zu lassen waere die Einladung,
         * versehentlich doppelt zu buchen.
         */
        setMenge(1);
      } catch {
        // `"netz"` entsteht ausschliesslich HIER, nie serverseitig (Global
        // Constraint 12) — wie in `Entnahme`.
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG });
      }
    });
  }

  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href="/auffuellen">
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
      </div>

      {/*
        DER DEAKTIVIERTE ARTIKEL — DRK-380.

        ⚠️ ER STEHT OBEN, NICHT AM KNOPF. Wer den Karton in der Hand hat,
        soll es lesen, BEVOR er Chargennummer und Verfall abtippt — ein
        Hinweis erst unten am gesperrten Knopf kostet genau die Arbeit, die
        er verhindern soll.

        ⚠️ DER SATZ NENNT DEN AUSGANG. „Geht nicht" allein laesst jemanden mit
        Material stehen, das er nirgends verbuchen kann; der Schalter sitzt in
        der Verwaltung, und das ist die einzige brauchbare Auskunft hier.

        ⚠️ KEIN ROT (Falle 3, und die Hausregel dieser Flaeche): Rot traegt am
        Regal die Ampel und „Bestand geht weg". Das hier ist keine Gefahr,
        sondern eine Lage.
      */}
      {!detail.aktiv && (
        <div
          className={`${s.karte} ${s.kartePad}`}
          data-rolle="auffuellen-inaktiv"
          role="status"
        >
          <div className={s.karteTitel} style={{ padding: 0 }}>
            Artikel ist deaktiviert
          </div>
          <p className={s.fussnote} style={{ margin: "6px 0 0" }}>
            Auf diesen Artikel geht kein Material mehr zu. Der vorhandene
            Bestand lässt sich weiter entnehmen. Soll wieder aufgefüllt werden,
            muss die Verwaltung den Artikel zuerst aktivieren.
          </p>
        </div>
      )}

      {/*
        ⚠️ DIE CHARGE STEHT VORN, NICHT DIE MENGE. Wer eine Lieferung auspackt,
        hat den Karton in der Hand und liest die Chargennummer ab; die Menge
        zaehlt er danach. Die Reihenfolge der Karten ist die Reihenfolge der
        Handgriffe — dieselbe Regel, aus der in der Entnahme die Zielzeile
        direkt ueber dem Knopf steht.
      */}
      <fieldset
        className={s.karte}
        style={{ border: "1px solid var(--lb-linie)", padding: 0, margin: 0 }}
        data-rolle="charge-wahl"
      >
        {/* Die Gruppe braucht einen NAMEN, sonst sagt eine Vorlesehilfe
            „Optionsfeld" ohne jeden Zusammenhang. Ein `legend` ist das, was die
            Gruppe fuer Hilfstechnik zur Gruppe macht; das Randmass haelt ihn in
            der Kerbe der Umrandung statt auf ihr. */}
        <legend className={s.karteTitel} style={{ padding: "0 10px" }}>
          Charge
        </legend>

        <label className={`${s.zeile} ${s.zeileWahl}`}>
          <input
            type="radio"
            name="charge"
            className={s.wahlKnopf}
            checked={neu}
            onChange={() => setChargeWahl(NEUE_CHARGE)}
          />
          <div className={s.zeileHaupt}>
            <div className={s.zeileName}>Neue Charge</div>
            <div className={s.zeileMeta}>
              <span>Frische Ware mit eigener Nummer und eigenem Verfall</span>
            </div>
          </div>
        </label>

        {/*
          DIE FELDER STEHEN NUR DA, WENN SIE GEBRAUCHT WERDEN. Zwei dauerhaft
          sichtbare, meist gesperrte Felder waeren auf einem Telefon ein halber
          Schirm, den niemand liest.
        */}
        {neu && (
          <div className={s.kartePad} data-rolle="neue-charge-felder">
            <input
              className={s.feld}
              type="text"
              autoComplete="off"
              aria-label="Chargennummer"
              placeholder="Chargennummer"
              value={chargenNr}
              onChange={(e) => setChargenNr(e.target.value)}
              data-rolle="chargennummer"
            />
            <div className={s.verfallZeile}>
              {/* `pattern` und `inputMode` sind der Rueckfall fuer Browser, die
                  `month` als Textfeld rendern. */}
              <input
                type="month"
                inputMode="numeric"
                pattern="\d{4}-\d{2}"
                aria-label="Verfallsmonat"
                value={verfall}
                onChange={(e) => setVerfall(e.target.value)}
                data-rolle="verfallsmonat"
              />
            </div>
          </div>
        )}

        {/*
          DIE GERADE ANGELEGTE CHARGE — nur solange die Liste sie noch nicht
          selbst fuehrt (siehe `angelegt`). Sie traegt KEINE Restmenge: was
          insgesamt auf ihr liegt, weiss der Server, und eine hier
          hochgerechnete Zahl waere eine Behauptung neben lauter gemessenen.
        */}
        {uebergang && (
          <label className={`${s.zeile} ${s.zeileWahl}`} data-rolle="charge-zeile">
            <input
              type="radio"
              name="charge"
              className={s.wahlKnopf}
              checked={chargeWahl === uebergang.id}
              onChange={() => setChargeWahl(uebergang.id)}
            />
            <div className={s.zeileHaupt}>
              <div className={s.zeileName} style={{ font: "600 13px var(--lb-mono)" }}>
                Charge {uebergang.chargenNr}
              </div>
              <div className={s.zeileMeta}>
                <span>gerade angelegt</span>
                <span>{fmtVerfall(uebergang.verfall)}</span>
              </div>
            </div>
          </label>
        )}

        {/*
          ⚠️ DIE VORHANDENEN CHARGEN STEHEN IN DERSELBEN GRUPPE, nicht in einer
          zweiten Karte darunter. „Neu oder vorhanden" ist EINE Entscheidung mit
          einer Antwort; zwei Gruppen nebeneinander liessen offen, was gilt,
          wenn in beiden etwas gewaehlt ist.

          Die Reihenfolge ist FEFO — dieselbe wie in der Entnahme, damit
          dieselbe Liste auf beiden Flaechen dieselbe Reihenfolge hat.
        */}
        {detail.chargen.map((c) => (
          <label key={c.id} className={`${s.zeile} ${s.zeileWahl}`} data-rolle="charge-zeile">
            <input
              type="radio"
              name="charge"
              className={s.wahlKnopf}
              checked={chargeWahl === c.id}
              onChange={() => setChargeWahl(c.id)}
            />
            <div className={s.zeileHaupt}>
              <div className={s.zeileName} style={{ font: "600 13px var(--lb-mono)" }}>
                Charge {c.chargenNr}
              </div>
              <div className={s.zeileMeta}>
                {/* Der Status steht als TEXT im Chip, nie allein ueber Farbe. */}
                <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                <span>{fmtVerfall(c.verfall)}</span>
              </div>
            </div>
            <div className={s.mengenChip}>
              {c.rest}
              <small>{detail.einheit}</small>
            </div>
          </label>
        ))}
      </fieldset>

      <fieldset
        className={s.karte}
        style={{ border: "1px solid var(--lb-linie)", padding: 0, margin: 0 }}
        data-rolle="ziel-wahl"
      >
        <legend className={s.karteTitel} style={{ padding: "0 10px" }}>
          Wohin
        </legend>
        {ziele.map((z) => (
          <label key={z.id} className={`${s.zeile} ${s.zeileWahl}`} data-rolle="ziel-zeile">
            <input
              type="radio"
              name="ziel"
              className={s.wahlKnopf}
              checked={zielId === z.id}
              onChange={() => setZielId(z.id)}
            />
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{z.name}</div>
              {/* Die Bedingung ist die Zusage: ein bedingungsloses Meta-Feld
                  waere ohne Hinweis eine LEERE Zeile mit Abstand. */}
              {z.zugangshinweis && <div className={s.zeileMeta}>{z.zugangshinweis}</div>}
            </div>
          </label>
        ))}
      </fieldset>

      <div className={s.karte}>
        <div className={s.karteTitel}>Auffüllen</div>
        <div className={s.kartePad}>
          <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
            <span className={s.zeileHaupt}>Menge</span>
            <Stepper wert={menge} setWert={setMenge} min={1} max={9999} beschriftung="Menge" />
          </div>

          {/*
            AK3 — ZIEL, ARTIKEL UND MENGE VOR DER BUCHUNG. Der Satz steht als
            LETZTE Zeile ueber dem Knopf, weil er die letzte ist, die jemand
            liest, bevor er tippt. Er wiederholt nicht nur, was oben gewaehlt
            wurde: die drei Angaben stehen sonst in drei verschiedenen Karten,
            und wer von oben nach unten scrollt, hat die erste beim Tippen
            nicht mehr im Bild.
          */}
          <div
            className={`${s.zeile} ${s.zielZeile}`}
            style={{ borderTop: "none", padding: "11px 0" }}
            data-rolle="auffuellen-zusammenfassung"
          >
            <span className={s.zeileHaupt}>Buchung</span>
            <span className={`${s.zielWert} ${zielName === null ? s.zielOffen : ""}`}>
              {zielName === null
                ? "Noch kein Schrank gewählt"
                : `${menge} ${detail.einheit} ${detail.name} → ${zielName}`}
            </span>
          </div>

          <button
            className={`${s.knopf} ${s.knopfTinte} ${s.knopfBreit}`}
            type="button"
            disabled={!bereit}
            onClick={absenden}
            data-rolle="auffuellen-buchen"
          >
            Auffüllen buchen
          </button>

          {rueck && (
            <span
              className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
              data-rolle="auffuellen-ergebnis"
              role="status"
            >
              {rueck.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
