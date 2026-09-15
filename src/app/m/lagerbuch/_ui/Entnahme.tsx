"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import { NETZ_TEXT_BUCHUNG, type HelferErgebnis, type HelferGrund } from "../_lib/actionTypen";
import { fmtVerfall, ampelTon } from "../_lib/format";
import type { Ampel } from "../_lib/domain/verfall";
// NUR DER TYP, und er liegt in einem Modul OHNE "use client" (Falle 6):
// dieselbe Form liest die Server Component, die ihn befüllt.
import type { ZielAnzeige } from "../_lib/entnahmeZiel";
export type { ZielAnzeige };
import s from "./helfer.module.css";

/**
 * DIE ENTNAHME AM REGAL — §7.2.2, §7.3. Nachfolger von `HelferEntnahme.tsx`.
 *
 * ⚠️ SIE HEISST `Entnahme.tsx`, NICHT `HelferEntnahme.tsx`. §2.1 (Zeile 358)
 * fuehrt sie so; teil5.md nennt sie an fuenf Stellen falsch. Das ist ein
 * Schreibfehler in einem Kommentar, keine Planaenderung.
 *
 * ⚠️ DIE ACTION KOMMT ALS PROP. `_actions/buchung.ts` gehoert vollstaendig
 * Teil 5 (Festlegung H7) — alle drei Buchungs-Actions teilen sich dort
 * `fefoAbbuchung` und dieselbe Zod-Basis, deshalb entsteht die Datei EINMAL und
 * dort. Ein Import hier machte diese Datei von einem SPAETER laufenden Plan
 * abhaengig; als Prop ist die Insel vollstaendig, testbar und gruen, und der
 * eine Import liegt in
 * `a/[artikelId]/page.tsx` (T83) — genau eine Stelle, die die Reihenfolge
 * kennt. Dasselbe Muster benutzt Teil 5 fuer `_ui/BarcodeScanner.tsx`.
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
    orte: { id: string; name: string; menge: number; zugangshinweis: string | null }[];
    ampel: Ampel;
    text: string;
  }[];
};

/** Genau die Signatur von `bucheEntnahmeHelfer` (Teil 5, T114). */
export type BuchungsAktion = (eingabe: {
  artikelId: string;
  menge: number;
  ziel: { art: "fahrzeug"; lagerortId: string } | { art: "verbrauch" };
}) => Promise<HelferErgebnis<{ gebucht: number }>>;

type Rueckmeldung = { art: "ok" | "fehler"; text: string; grund?: HelferGrund };

export function Entnahme({
  detail,
  ziel,
  buchen,
}: {
  detail: EntnahmeDetail;
  /** `null` = noch nichts gewählt; dann wird NICHT gebucht (DRK-300). */
  ziel: ZielAnzeige | null;
  buchen: BuchungsAktion;
}) {
  const [menge, setMenge] = useState(1);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  /*
   * DER WEG ZUR ZIELWAHL UND ZURÜCK. `returnTo` ist keine Bequemlichkeit: ohne
   * ihn stünde die Person nach der Wahl auf der Artikelliste statt vor dem
   * Regalfach, vor dem sie gerade steht.
   */
  const zielWahlWeg = `/helfer/ziel?returnTo=${encodeURIComponent(`/a/${detail.id}`)}`;
  const zielName = ziel?.art === "fahrzeug" ? ziel.name : null;

  function absenden() {
    // ⚠️ OHNE ZIEL WIRD NICHT GEBUCHT. Der Knopf ist dann bereits gesperrt;
    // diese Zeile ist die zweite Hälfte derselben Zusage — ein Tastendruck auf
    // einem noch nicht neu gerenderten Knopf käme sonst durch.
    if (!ziel) return;
    const m = Math.min(menge, detail.bestand);
    if (m <= 0) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await buchen({
          artikelId: detail.id,
          menge: m,
          // Die KENNUNG wandert, nicht der Anzeigename — der Server kennt nur sie.
          ziel: ziel.art === "fahrzeug" ? { art: "fahrzeug", lagerortId: ziel.lagerortId } : ziel,
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          // Das gilt auch fuer den fuenften Grund `"eingabe"`
          // (Betreiberentscheidung B4): er traegt seine Botschaft im `text`,
          // und weil `darfErneuern("eingabe")` false ist, faellt er unten durch
          // die `sitzung`-Bedingung hindurch — kein Weg zurueck aufs Gate.
          setRueck({ art: "fehler", text: r.text, grund: r.grund });
          return;
        }
        const gebucht = r.wert.gebucht;
        // Das Ziel gehört IN DEN SATZ: ohne es ist eine Buchung aufs Fahrzeug
        // von einem reinen Verbrauch nicht zu unterscheiden — und der Satz ist
        // der einzige Beleg, den die Person am Regal zu sehen bekommt.
        const wohin = zielName ? ` → ${zielName}` : "";
        setRueck(
          gebucht < m
            ? // §7.3, zweiter Zustand: heute ein GRUENER Chip mit der KLEINEREN
              // Zahl, ohne Hinweis — der Helfer legt fuenf Teile ins Fahrzeug
              // und das Journal kennt drei.
              { art: "ok", text: `${gebucht} von ${m} gebucht; mehr lag nicht im Handlager.${wohin}` }
            : { art: "ok", text: `Entnahme gebucht: ${gebucht} × ${detail.name}${wohin}` },
        );
        setMenge(1);
      } catch {
        // FALLE 62: `HelferEntnahme.tsx:22-30` hat KEIN catch — der Wurf
        // schlaegt bis zur Fehlerseite durch, und in Produktion steht dort ein
        // englischer Satz mit `digest` (Falle 66). `"netz"` entsteht
        // ausschliesslich HIER, nie serverseitig.
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG, grund: "netz" });
        // Die Menge bleibt im Feld, der Knopf wird wieder aktiv (§7.10.3).
      }
    });
  }

  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href="/helfer">
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

      <div className={s.karte}>
        <div className={s.karteTitel}>Entnahme</div>
        <div className={s.kartePad}>
          <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
            <span className={s.zeileHaupt}>Menge</span>
            <Stepper
              wert={menge}
              setWert={setMenge}
              min={1}
              max={Math.max(detail.bestand, 1)}
              beschriftung="Menge"
            />
          </div>

          {/*
            DIE ZIELZEILE STEHT ÜBER DEM KNOPF, nicht darunter und nicht im
            Seitenkopf: sie ist die letzte Zeile, die jemand liest, bevor er
            tippt. Eine Wahl, die für den ganzen Kärtchen-Zugang gilt, muss an
            jedem Artikel sichtbar sein — sonst lenkt eine vergessene Wahl
            still Bestand um.
          */}
          <div
            className={`${s.zeile} ${s.zielZeile}`}
            style={{ borderTop: "none", padding: "11px 0" }}
            data-rolle="entnahme-ziel"
          >
            <span className={s.zeileHaupt}>Ziel</span>
            <span className={`${s.zielWert} ${ziel === null ? s.zielOffen : ""}`}>
              {ziel === null
                ? "Noch nichts gewählt"
                : ziel.art === "fahrzeug"
                  ? ziel.name
                  : "Keine Einheit — Verbrauch"}
            </span>
            <Link className={s.zielAendern} href={zielWahlWeg}>
              {ziel === null ? "Wählen" : "Ändern"}
            </Link>
          </div>

          <button
            className={`${s.knopf} ${s.knopfRot} ${s.knopfBreit}`}
            type="button"
            disabled={ziel === null || detail.bestand === 0 || laeuft}
            onClick={absenden}
            data-rolle="entnahme-buchen"
          >
            Entnahme buchen
          </button>

          {rueck && (
            <>
              {/* Der mehrzeilige Ergebnissatz braucht die von `.chip` abweichende Form aus `.rueckmeldung`. */}
              <span
                className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
                data-rolle="entnahme-ergebnis"
                role="status"
              >
                {rueck.text}
              </span>
              {/*
                Bei `sitzung` fuehrt der Weg zurueck aufs Gate — MIT `returnTo`,
                damit der Artikel nach dem erneuten Einloesen wieder offen ist.
                Ein Erneuerungsfeld an Ort und Stelle gibt es hier NICHT: anders
                als im Check (§7.4.4) haengt an dieser Seite kein Client-Zustand,
                den ein Seitenwechsel verwuerfe — nur eine Zahl, und die bleibt
                stehen.
              */}
              {rueck.grund === "sitzung" && (
                <Link
                  className={s.rueckweg}
                  href={`/?returnTo=${encodeURIComponent(`/a/${detail.id}`)}`}
                  data-rolle="entnahme-zum-gate"
                >
                  Kärtchen erneut eingeben
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Nächste Charge zuerst (FEFO)</div>
        {detail.chargen.map((c) => (
          <div className={s.zeile} key={c.id} data-rolle="charge-zeile">
            <div className={s.zeileHaupt}>
              <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
              <div className={s.zeileMeta}>
                {/* Beide Angaben stehen NEBENEINANDER: der Chip traegt den
                    Status als TEXT (nie allein ueber Farbe), `fmtVerfall` das
                    Datum in der Form „MM/JJ" (Teil 3, T39). */}
                <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
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
                    {ort.name}: {ort.menge} {detail.einheit}
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
                    {ort.name}: {ort.zugangshinweis}
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
          </div>
        ))}
      </div>
    </div>
  );
}
