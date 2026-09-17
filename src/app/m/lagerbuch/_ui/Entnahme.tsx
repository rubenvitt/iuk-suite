"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import {
  ANMELDUNG_TEXT, NETZ_TEXT_BUCHUNG, type HelferGrund,
} from "../_lib/actionTypen";
// ⚠️ DIREKT IMPORTIERT, NICHT ALS PROP (Falle 9, `AGENTS.md`/`CLAUDE.md`):
// „Server Actions duerfen als einzige ueber die Grenze — aber direkt
// importiert, nicht als Prop durchgereicht." Dieselbe Form wie in
// `_ui/Auffuellen.tsx` und `_ui/BoxAbgabe.tsx`.
import { bucheEntnahmeHelfer } from "../_actions/buchung";
import { einheitMeta, ortZeile, type Einheitenart } from "../_lib/konstanten";
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
 * ⚠️ DIE ACTION WIRD DIREKT IMPORTIERT (DRK-375). Bis dahin kam sie als PROP,
 * und die Begruendung war eine REIHENFOLGE: `_actions/buchung.ts` gehoerte
 * vollstaendig Teil 5 (Festlegung H7), ein Import hier haette diese Insel von
 * einem SPAETER laufenden Plan abhaengig gemacht. Diese Begruendung ist
 * ABGELAUFEN — die Datei existiert, und Falle 9 (`AGENTS.md`/`CLAUDE.md`)
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
  }[];
};

type Rueckmeldung = { art: "ok" | "fehler"; text: string; grund?: HelferGrund };

export function Entnahme({
  detail,
  ziel,
  kontoZugang,
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
}) {
  const [menge, setMenge] = useState(1);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();
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
  const ohneBestand = detail.chargen.filter((c) => c.rest <= 0);
  const sichtbareChargen = zeigeOhneBestand ? detail.chargen : imHandlager;

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
        const r = await bucheEntnahmeHelfer({
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
                {/*
                  DRK-305: `RIEGEL_TEXTE.sitzung` lautet wörtlich „Scanne das
                  Kärtchen erneut". Für eine angemeldete Person ist das falsch,
                  und der Server kann es nicht wissen — die Seite schon.
                */}
                {kontoZugang && rueck.grund === "sitzung" ? ANMELDUNG_TEXT : rueck.text}
              </span>
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
                  href={`/?returnTo=${encodeURIComponent(`/a/${detail.id}`)}`}
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
        <div className={s.karteTitel}>Nächste Charge zuerst (FEFO)</div>
        {sichtbareChargen.map((c) => (
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
          </div>
        ))}

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
