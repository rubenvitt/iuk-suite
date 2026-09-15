"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { LeerZustand } from "./LeerZustand";
import { Ikone } from "./ikonen";
import { checkAbschluss, type CheckAbschlussWert } from "../_actions/check";
import { erneuereSitzung } from "../_actions/sitzung";
import {
  checkNutzlast,
  zaehleAblaufende,
  GERAET_VORBELEGUNG,
  type CheckZaehlung,
  type CheckGeraetAntwort,
} from "../_lib/checkNutzlast";
import { verfallStatus, type VerfallSchwellen } from "../_lib/domain/verfall";
import { o2Status } from "../_lib/domain/o2";
import { chargeText, ampelTon } from "../_lib/format";
import { ZUSTAENDE, type Zustand } from "../_lib/konstanten";
import { NETZ_TEXT_CHECK, darfErneuern, type HelferGrund } from "../_lib/actionTypen";
import s from "./helfer.module.css";

/**
 * DER FAHRZEUG-CHECK — §7.9.
 *
 * ⚠️ DIE EINE STRUKTURAENDERUNG (Falle 15, §7.9.1): DIESE KOMPONENTE KENNT NUR
 * NOCH EIN FAHRZEUG. Heute reicht `helfer/check/page.tsx` vier
 * `Object.fromEntries(fahrzeuge.map(...))`-Woerterbuecher KOMPLETT herein
 * (`CheckFlow.tsx:50-58`) — damit wandert bei JEDEM Helfer-Aufruf die
 * Soll-Bestueckung, Geraeteliste, Flaschenliste und Verfallslage DER GESAMTEN
 * ORGANISATION in den RSC-Payload: auf ein PRIVATES Telefon, in einer Sitzung
 * OHNE Konto (§3.4.5). Die vier Woerterbuecher und `preselect` entfallen; die
 * Fahrzeugwahl wird eine NAVIGATION (`_ui/FahrzeugWahl.tsx`, T80).
 *
 * ⚠️ DIE NUTZLAST WIRD NICHT HIER GEBAUT, sondern von `checkNutzlast`
 * (Teil 3, T43). Das Verfallsfeld im Zaehlschritt und die Live-Vorschau
 * „{n} laufen ab" sind laut §12.1 DIE EINZIGE Absicherung ihrer Fachlichkeit —
 * `actions/check.test.ts:229` beweist nur, dass der Server richtig zaehlt,
 * WENN der Wert ankommt.
 *
 * ⚠️ DIE AMPEL WIRD IM CLIENT GERECHNET, und das ist keine Zeitzonenfrage mehr
 * (§7.9.3): `verfallStatus` rechnet ueber `monatsEnde()` aus `_lib/zeit.ts` und
 * ist ZONENEXPLIZIT. Ob die Funktion im Browser oder im Container laeuft,
 * aendert das Ergebnis nicht mehr — Chip im Zaehlschritt und Zahl in der
 * Abschlussmeldung koennen KONSTRUKTIV nicht auseinanderfallen.
 */

export type CheckPos = {
  id: string;
  fachLabel: string;
  artikelId: string;
  artikelName: string;
  einheit: string;
  handlagerFach: string;
  soll: number;
  fahrzeugBestand: number;
  handlagerBestand: number;
};
export type CheckGeraet = { id: string; typ: "medizin" | "objekt"; name: string };
export type CheckFlasche = {
  id: string;
  name: string;
  nennfuelldruckBar: number;
  /**
   * Der zuletzt gemessene Druck, oder `null`, wenn NIE gemessen wurde.
   *
   * ⚠️ Seit Teil 3 nullbar, und der Grund ist ein Fehlalarm: eine fehlende
   * Messung wurde vorher als „0 bar" gelesen — Ampel rot, und jemand lief los,
   * um eine volle Flasche zu tauschen. Der Null-Fall MUSS deshalb als „noch
   * nicht gemessen" erscheinen (Uebergabe Teil 3, Punkt 4). Das ist eine ANDERE
   * Aussage als „Nennfuelldruck nicht hinterlegt" (keine Messung vs. kein
   * Sollwert), und die eine ersetzt die andere nicht.
   */
  letzterDruck: number | null;
};

type Phase = "zaehlen" | "nachfuellen" | "geraete" | "sauerstoff";
const PHASE_LABEL: Record<Phase, string> = {
  zaehlen: "Zählen",
  nachfuellen: "Nachfüllen",
  geraete: "Geräte",
  sauerstoff: "Sauerstoff",
};

/** Der Schritt-Kopf zeigt NUR die Schritte, die dieses Fahrzeug wirklich hat (1:1, `:28-39`). */
function Schritte({ folge, aktiv }: { folge: Phase[]; aktiv: Phase }) {
  const idx = folge.indexOf(aktiv);
  return (
    <div className={s.schritte}>
      {folge.map((p, i) => (
        <div
          key={p}
          className={`${s.schritt} ${i === idx ? s.schrittAktiv : i < idx ? s.schrittFertig : ""}`}
          data-rolle="schritt"
        >
          <span className={s.schrittNr}>{i + 1}</span> {PHASE_LABEL[p]}
        </div>
      ))}
    </div>
  );
}

const zustandTon = (z: Zustand) =>
  z === "In Ordnung" ? "ok" : z === "Gebrauchsspuren" ? "gelb" : "rot";

/** Die fünf Geräteknöpfe teilen das entschiedene 44px-Tippziel aus `.chipKnopf`. */
export function CheckFlow({
  fahrzeug,
  soll,
  geraete,
  flaschen,
  verfall,
  warn,
  gebunden,
}: {
  fahrzeug: { id: string; name: string; kennung: string | null };
  soll: CheckPos[];
  geraete: CheckGeraet[];
  flaschen: CheckFlasche[];
  /** Beim letzten Check gemeldeter Verfall je artikelId („YYYY-MM"), leer = keine Angabe. */
  verfall: Record<string, string>;
  warn: VerfallSchwellen;
  /**
   * Das gescannte Kaertchen haengt an DIESEM Fahrzeug (DRK-302) — dann gibt es
   * kein „anderes Fahrzeug", und die beiden Auswege in die Wahl entfallen.
   *
   * PFLICHT-PROP, KEIN OPTIONAL. Ein `gebunden?: boolean` waere in jeder
   * vergessenen Aufrufstelle still `undefined` und damit „ungebunden" — der
   * Knopf in die volle Liste stuende wieder da, und kein Tor meldete es. Die
   * Seite ist heute der einzige Aufrufer; ein zweiter muesste die Frage
   * ausdruecklich beantworten.
   *
   * ⚠️ DER WERT FRIERT BEI DER INLINE-ERNEUERUNG EIN, UND DAS BLEIBT SO.
   * `erneuereSitzung` (§7.4.4) tauscht das Cookie OHNE Seitenaufbau; wer mit
   * einem Kaertchen eines anderen Fahrzeugs erneuert, sieht die zwei Auswege
   * danach weiter nach dem ALTEN Kaertchen. Drei Gruende, warum hier trotzdem
   * nichts nachgezogen wird:
   *
   * 1. EINE NEUAUFLOESUNG VOR DEM ABSENDEN WAERE DER SCHADEN, NICHT DIE
   *    HEILUNG. Sie hiesse Seitenaufbau, und der verwirft die eingetragenen
   *    Mengen — genau der Datenverlust, gegen den das Inline-Feld ueberhaupt
   *    gebaut ist (§7.4.4, `docs/design/README.md`: Fehler aus Server-Actions
   *    kommen AM FELD an, nicht als Redirect). Zwanzig Minuten Zaehlarbeit
   *    stehen an dieser Stelle auf dem Spiel.
   * 2. `fahrzeug.id` FRIERT MIT EIN, und das ist RICHTIG: gezaehlt wurde
   *    DIESES Fahrzeug, also gehoeren die Mengen dorthin. Ein Ziel, das unter
   *    der Helferin wechselt, waere die Fehlbuchung.
   * 3. KEINE SACKGASSE. `gebunden` steuert allein, ob „Anderes Fahrzeug"
   *    dasteht — die Tab-Leiste des `HelferRahmen` liegt in JEDER Lage darunter
   *    (der Flow ist ihr Kind, `helfer/check/page.tsx`), und ihr
   *    „Fahrzeug-Check" fuehrt auf `/helfer/check`, wo die Bindung frisch
   *    aufgeloest wird.
   *
   * WAS BLEIBT, ist die Frage, ob ein an Fahrzeug B haengendes Kaertchen einen
   * Check auf A bezeugen darf. Das ist die BERECHTIGUNGSFRAGE, nicht die
   * Anzeigefrage — offene Betreiberfrage 5, Ansatzpunkt 2 in
   * `_actions/check.ts`, und sie gilt dort unveraendert AUCH OHNE Erneuerung.
   */
  gebunden: boolean;
}) {
  // DIE SECHS CLIENT-ZUSTAENDE (1:1, `:62-71`). Sie bleiben bei JEDEM Fehler
  // stehen — das ist die tragende Zusage von §7.4.4 und §7.10.3.
  const [phase, setPhase] = useState<Phase>("zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  const [geraeteState, setGeraeteState] = useState<Record<string, CheckGeraetAntwort>>({});
  const [druck, setDruck] = useState<Record<string, number>>({});
  const [verfallState, setVerfallState] = useState<Record<string, string>>({});

  const [ergebnis, setErgebnis] = useState<CheckAbschlussWert | null>(null);
  const [fehler, setFehler] = useState<{ text: string; grund: HelferGrund } | null>(null);
  const [erneuerungsCode, setErneuerungsCode] = useState("");
  const [erneuerungsFehler, setErneuerungsFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  const faecher = [...new Set(soll.map((p) => p.fachLabel))];

  /*
   * DEFAULT = 0, NICHT MEHR SOLL — DRK-304.
   *
   * Bis hierher galt „voll annehmen, Gezaehltes runterkorrigieren" (`:97`).
   * Diese Vorbelegung WAR die Aktion „Alles auf Soll", die das Ticket
   * entfernt: wer den Schritt durchklickte, bezeugte einen vollen Wagen, ohne
   * ein Fach gesehen zu haben — und serverseitig ist „gezaehlt und stimmt" von
   * „nicht gezaehlt" nicht unterscheidbar (`_lib/checkNutzlast.ts`, Kopf).
   *
   * ⚠️ DIE UMKEHR IST NICHT FOLGENLOS, UND DESHALB STEHT `gezaehlt` DANEBEN.
   * `check.ts` rechnet aus der Summe der gezaehlten Ist JE ARTIKEL eine
   * Korrekturbuchung auf den Fahrzeugbestand — in ein Journal ohne UPDATE und
   * ohne DELETE. Eine 0, die niemand gezaehlt hat, waere damit eine
   * unwiderrufliche Leerbuchung; das Ticket verbietet sie ausdruecklich
   * („keine automatische Deutung von 0 als bestaetigter Leerbestand"). Der
   * Riegel im Zaehlschritt ist die Antwort darauf — NICHT eine zweite
   * Vorbelegung.
   *
   * Der RECORDED Fahrzeugbestand ist weiterhin kein Per-Position-Default: er
   * ist pro ARTIKEL, nicht pro Fach, und derselbe Artikel in mehreren Faechern
   * wuerde sich vervielfachen (`:94-96`, §5.7.1).
   */
  const istWert = (p: CheckPos) => ist[p.id] ?? 0;

  /**
   * Hat jemand diese Position ANGEFASST? `undefined` heisst „noch nicht
   * gezaehlt" und ist von einer gezaehlten 0 zu unterscheiden — genau darauf
   * steht und faellt DRK-304.
   *
   * ⚠️ DER AUSGANG FUER EIN WIRKLICH LEERES FACH IST DAS „−". `Stepper.tsx`
   * ruft `setWert` auch dann, wenn der Wert bei `min` schon steht; der Klick
   * schreibt also die 0 in `ist` und macht sie zur Aussage. Ohne diese
   * Eigenschaft gaebe es aus dem Riegel keinen Weg, und sie darf beim naechsten
   * Umbau des Steppers nicht stillschweigend verloren gehen.
   */
  const gezaehlt = (p: CheckPos) => ist[p.id] !== undefined;
  const nfWert = (p: CheckPos) => nachfuell[p.id] ?? 0;

  // Verfall haengt am ARTIKEL, nicht am Fach. Vorbelegt ist der beim letzten
  // Check gemeldete Wert; leeren heisst „keine Angabe" (`:100-109`).
  const verfallWert = (artikelId: string) => verfallState[artikelId] ?? verfall[artikelId] ?? "";

  // Anzeigereihenfolge Fach fuer Fach → je Artikel bekommt nur die ERSTE Zeile
  // das Eingabefeld. Zwei Felder fuer eine Angabe waeren nicht
  // auseinanderzuhalten (`:105-109`).
  const zaehlFolge = faecher.flatMap((f) => soll.filter((p) => p.fachLabel === f));
  const ersteZeile = new Map<string, string>();
  for (const p of zaehlFolge) if (!ersteZeile.has(p.artikelId)) ersteZeile.set(p.artikelId, p.id);

  const verfallChip = (wert: string) => {
    if (!wert) return null;
    const st = verfallStatus(wert, warn, new Date());
    return { ton: ampelTon(st.ampel), text: chargeText(st, wert) };
  };

  const hatArtikel = soll.length > 0;
  const schrittFolge: Phase[] = [
    ...(hatArtikel ? (["zaehlen", "nachfuellen"] as const) : []),
    ...(geraete.length > 0 ? (["geraete"] as const) : []),
    ...(flaschen.length > 0 ? (["sauerstoff"] as const) : []),
  ];
  const aktivePhase: Phase = schrittFolge.includes(phase) ? phase : (schrittFolge[0] ?? "zaehlen");
  const idx = schrittFolge.indexOf(aktivePhase);
  const istLetzter = idx === schrittFolge.length - 1;
  const naechste = schrittFolge[idx + 1];

  const geraetE = (id: string): CheckGeraetAntwort => geraeteState[id] ?? GERAET_VORBELEGUNG;
  const setGeraet = (id: string, patch: Partial<CheckGeraetAntwort>) =>
    setGeraeteState((v) => ({ ...v, [id]: { ...(v[id] ?? GERAET_VORBELEGUNG), ...patch } }));

  // Druck-Default = Nennfuelldruck („voll annehmen, Abgelesenes runterstellen", `:136-137`).
  //
  // ⚠️ NICHT `letzterDruck`: der letzte Messwert wird ANGEZEIGT, aber er ist
  // keine Vorbelegung. Sonst schriebe ein durchgeklickter Check den vorigen
  // Wert fort, ohne dass jemand aufs Manometer gesehen haette.
  const druckWert = (f: CheckFlasche) => druck[f.id] ?? f.nennfuelldruckBar;

  const zaehlung = (): CheckZaehlung => ({
    ist: Object.fromEntries(soll.map((p) => [p.id, istWert(p)])),
    nachfuell: Object.fromEntries(soll.map((p) => [p.id, nfWert(p)])),
    geraete: Object.fromEntries(geraete.map((g) => [g.id, geraetE(g.id)])),
    druck: Object.fromEntries(flaschen.map((f) => [f.id, druckWert(f)])),
    // NUR die GEAENDERTEN — ein fehlender Eintrag laesst die Angabe
    // unangetastet (`:152-155`).
    verfaelle: Object.fromEntries(
      Object.entries(verfallState)
        .filter(([artikelId, wert]) => wert !== (verfall[artikelId] ?? ""))
        .map(([artikelId, wert]) => [artikelId, wert || null]),
    ),
  });

  function abschliessen() {
    setFehler(null);
    start(async () => {
      try {
        const nutzlast = checkNutzlast({
          fahrzeugId: fahrzeug.id,
          positionen: soll.map((p) => ({ id: p.id, artikelId: p.artikelId, soll: p.soll })),
          geraete: geraete.map((g) => ({ id: g.id })),
          flaschen: flaschen.map((f) => ({ id: f.id, nennfuelldruckBar: f.nennfuelldruckBar })),
          z: zaehlung(),
        });
        const r = await checkAbschluss(nutzlast);
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          // Das gilt auch fuer den fuenften Grund `"eingabe"`
          // (Betreiberentscheidung B4): er traegt seine Botschaft im `text`,
          // und weil `darfErneuern("eingabe")` false ist, erscheint das
          // Erneuerungsfeld nicht — eine unvollstaendige Nutzlast wird nicht
          // dadurch vollstaendig, dass jemand die Sitzung erneuert.
          //
          // ⚠️ HIER WIRD KEIN ZUSTAND ZURUECKGESETZT. Alle sechs bleiben stehen.
          setFehler({ text: r.text, grund: r.grund });
          return;
        }
        setErgebnis(r.wert);
      } catch {
        // FALLE 62/66: `CheckFlow.tsx:158-159` faengt zwar, zeigt aber
        // `e.message` — in Produktion der ENGLISCHE Server-Components-Satz mit
        // `digest`, der niemanden erreicht. `"netz"` entsteht ausschliesslich
        // HIER, nie serverseitig (Global Constraint 12).
        // ALLE SECHS ZUSTAENDE BLEIBEN STEHEN.
        setFehler({ text: NETZ_TEXT_CHECK, grund: "netz" });
      }
    });
  }

  function erneuern() {
    setErneuerungsFehler(null);
    start(async () => {
      try {
        const r = await erneuereSitzung(erneuerungsCode);
        if (!r.ok) {
          setErneuerungsFehler(r.text);
          return;
        }
        // Danach tippt die Helferin erneut auf „Abschliessen" (§7.4.4).
        setFehler(null);
        setErneuerungsCode("");
      } catch {
        setErneuerungsFehler(NETZ_TEXT_CHECK);
      }
    });
  }

  // ——— Fahrzeug ohne Soll, Geraet und Flasche ———
  if (schrittFolge.length === 0) {
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name}</div>
        <LeerZustand
          titel="Nichts zu prüfen"
          text={
            "Für dieses Fahrzeug ist weder ein Soll noch ein Gerät noch eine Sauerstoffflasche " +
            "hinterlegt. Die Verwaltung pflegt die Bestückung."
          }
          /*
           * DER RUECKWEG HAENGT AM KAERTCHEN (DRK-302). Bei einem gebundenen
           * Kaertchen gibt es kein anderes Fahrzeug — „Anderes Fahrzeug" fuehrte
           * dann in eine Wahl, aus der die Seite unmittelbar wieder auf DIESES
           * Fahrzeug zurueckspringt: ein Knopf, der nichts tut. `weg` ist
           * Pflicht-Prop (§11.7), ein Weglassen ist also keine Option.
           */
          weg={gebunden
            ? { href: "/helfer", text: "Zur Entnahme" }
            : { href: "/helfer/check", text: "Anderes Fahrzeug" }}
        />
      </>
    );
  }

  // ——— Fertig ———
  if (ergebnis) {
    const alles =
      ergebnis.offen === 0 &&
      ergebnis.geraeteAuffaellig === 0 &&
      ergebnis.flaschenAuffaellig === 0 &&
      ergebnis.verfallAuffaellig === 0 &&
      ergebnis.flaschenNichtBewertbar === 0;
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Fertig</div>
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="check-ergebnis">
          <div className={s.zeileName}>Check abgeschlossen</div>
          <div className={s.zeileMeta}>
            {/* Ohne Soll-Bestueckung gab es nichts nachzufuellen — ein Chip
                „0 aus Handlager geholt" waere eine Aussage ueber Arbeit, die
                nie stattgefunden hat. */}
            {hatArtikel && (
              <HelferChip ton="ok">{ergebnis.nachgefuellt} aus Handlager geholt</HelferChip>
            )}
            {ergebnis.offen > 0 && (
              <HelferChip ton="rot">{ergebnis.offen} fehlt weiterhin</HelferChip>
            )}
            {ergebnis.geraeteAuffaellig > 0 && (
              <HelferChip ton="rot">{ergebnis.geraeteAuffaellig} Gerät(e) auffällig</HelferChip>
            )}
            {ergebnis.flaschenAuffaellig > 0 && (
              <HelferChip ton="rot">{ergebnis.flaschenAuffaellig} Flasche(n) niedrig</HelferChip>
            )}
            {ergebnis.flaschenNichtBewertbar > 0 && (
              <HelferChip ton="grau">
                {ergebnis.flaschenNichtBewertbar} Flasche(n) nicht bewertbar
              </HelferChip>
            )}
            {ergebnis.verfallAuffaellig > 0 && (
              <HelferChip ton="gelb">{ergebnis.verfallAuffaellig} laufen ab</HelferChip>
            )}
            {alles && <HelferChip ton="ok">Alles in Ordnung</HelferChip>}
          </div>

          {/*
            NEU (§7.9.4): `umlagerung` kappt STILL an der Verfuegbarkeit, und der
            Helfer hat die Teile IN DER HAND. Ohne diesen Satz legt er sie ins
            Fahrzeug und das Journal weiss es nicht.
          */}
          {ergebnis.nachgefuellt < ergebnis.nachfuellBestaetigt && (
            <p className={s.fussnote}>
              Von {ergebnis.nachfuellBestaetigt} bestätigten Teilen konnten nur{" "}
              {ergebnis.nachgefuellt} gebucht werden. Das Handlager war zwischenzeitlich leer —
              bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.offen > 0 && (
            <p className={s.fussnote}>
              Das Handlager hatte nicht genug. {ergebnis.offen} Teile fehlen weiterhin auf dem
              Fahrzeug – bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.geraeteAuffaellig > 0 && (
            <p className={s.fussnote}>Fehlende oder defekte Geräte bitte der Verwaltung melden.</p>
          )}
          {ergebnis.flaschenAuffaellig > 0 && (
            <p className={s.fussnote}>
              Flaschen mit niedrigem Druck bitte tauschen oder der Verwaltung melden.
            </p>
          )}
          {ergebnis.flaschenNichtBewertbar > 0 && (
            <p className={s.fussnote}>
              Für diese Flaschen ist kein Nennfülldruck hinterlegt – der Füllstand lässt sich nicht
              bewerten. Der abgelesene Druck wurde trotzdem gespeichert.
            </p>
          )}
          {ergebnis.verfallAuffaellig > 0 && (
            <p className={s.fussnote}>
              {ergebnis.verfallAuffaellig} Artikel im Fahrzeug laufen bald ab oder sind abgelaufen –
              bitte tauschen oder der Verwaltung melden.
            </p>
          )}

          {/*
            DER AUFFUELLHINWEIS NACH DEM DIENST — DRK-301.

            Er steht am ABSCHLUSS, nicht dauerhaft auf jedem Schritt: er
            beschreibt eine Handlung NACH dem Check, und auf einem Schritt
            konkurrierte er mit dessen eigener Anweisung (die Fussnoten dort
            sind ohnehin dicht). Auf dem Fertig-Schirm ist er bei „Alles in
            Ordnung" der einzige Satz und faellt genau dann auf, wenn nichts
            anderes zu tun bleibt.

            ⚠️ ER IST TEXT, KEIN WEG. Kein Link, kein Knopf: gemeint ist der
            PHYSISCHE QR-Code am Handlager, und AK3 verlangt ausdruecklich, dass
            der Hinweis allein keine Bestandsbuchung ausloest. Ein Link auf
            `/helfer` waere zudem eine zweite, leisere Antwort auf dieselbe
            Frage — und die faende niemand wieder, wenn DRK-312 das
            Handlager-Etikett neu zuschneidet.

            ⚠️ ER WIDERSPRICHT DEM NACHFUELLSCHRITT NICHT. Der bucht Handlager →
            Fahrzeug INNERHALB dieses Checks; gemeint ist hier das Auffuellen
            NACH dem Dienst, ausserhalb des Checks — der Weg, ohne den der
            Handlagerbestand still auseinanderlaeuft.

            ⚠️ NUR MIT SOLL-BESTUECKUNG, aus demselben Grund wie der Chip oben:
            traegt das Fahrzeug nur Geraete und Flaschen, gibt es nichts
            aufzufuellen, und der Satz spraeche von Arbeit, die es nicht gibt.
          */}
          {hatArtikel && (
            <p className={s.fussnote} data-rolle="auffuell-hinweis">
              <b>Nach dem Dienst auffüllen:</b> Was auf dem Fahrzeug fehlt, holst du aus dem
              Handlager – scanne dafür den QR-Code am Handlager, damit die Entnahme dort gebucht
              wird.
            </p>
          )}
        </div>

        {/*
          ZWEI LINKS statt eines Zustandsresets ueber sieben Setter (`:210`,
          §7.9.1). Ein Seitenaufbau ist hier ohnehin gewollt — DIE BESTAENDE
          HABEN SICH GERADE GEAENDERT. AEUSSERE Pfade, beide.

          ⚠️ `encodeURIComponent` (Befund 31): T80 baut dieselbe URL und
          begruendet die Kodierung damit, dass ein importierter Alt-Bestand
          andere IDs tragen kann — ein rohes `?fz=a b` erzeugt eine kaputte URL.
          „Nochmal dieses Fahrzeug" fuehrt auf exakt denselben Pfad; die Gefahr
          besteht hier unveraendert.
        */}
        <Link
          className={`${s.knopf} ${s.knopfGeist}`}
          href={`/helfer/check?fz=${encodeURIComponent(fahrzeug.id)}`}
          data-rolle="nochmal"
        >
          Nochmal dieses Fahrzeug
        </Link>
        {/*
          NUR BEI UNGEBUNDENEM KAERTCHEN (DRK-302). Nach dem Scan eines
          Fahrzeug-Kaertchens gibt es kein anderes Fahrzeug; der Knopf fuehrte in
          eine Wahl, die die Seite sofort wieder auf dieses Fahrzeug aufloest.
          „Nochmal dieses Fahrzeug" bleibt in BEIDEN Lagen stehen — es ist der
          Weg, mit dem die Helferin nach einer Buchung frische Bestaende sieht.
        */}
        {!gebunden && (
          <Link className={`${s.knopf} ${s.knopfGeist}`} href="/helfer/check" data-rolle="anderes">
            Anderes Fahrzeug
          </Link>
        )}
      </>
    );
  }

  /** Der Fehlerbereich am Abschluss — samt Inline-Erneuerung (§7.4.4). */
  const fehlerBereich = fehler && (
    <div className={`${s.karte} ${s.kartePad}`}>
      <div className={s.gateFehler} data-rolle="check-fehler" role="status">
        {fehler.text}
      </div>
      {darfErneuern(fehler.grund) && (
        <div data-rolle="erneuern">
          <p className={s.fussnote}>
            Kärtchen erneut eingeben — <b>die gezählten Mengen bleiben stehen.</b>
          </p>
          <div className={s.feldZeile}>
            <input
              className={s.codefeld}
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              pattern="[0-9]{3}-?[0-9]{3}"
              placeholder="000-000"
              aria-label="Zugangs-Code"
              value={erneuerungsCode}
              onChange={(e) => setErneuerungsCode(e.target.value)}
              data-rolle="erneuern-code"
            />
            <button
              className={`${s.knopf} ${s.knopfTinte}`}
              type="button"
              disabled={laeuft}
              onClick={erneuern}
              data-rolle="erneuern-weiter"
            >
              Weiter
            </button>
          </div>
          {erneuerungsFehler && (
            <div className={s.gateFehler} data-rolle="erneuern-fehler" role="status">
              {erneuerungsFehler}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ——— Schritt: Zaehlen ———
  if (aktivePhase === "zaehlen") {
    const unterSoll = soll.filter((p) => gezaehlt(p) && istWert(p) < p.soll).length;
    const ungezaehlt = soll.filter((p) => !gezaehlt(p)).length;
    const ablaufend = zaehleAblaufende(
      Object.fromEntries(soll.map((p) => [p.artikelId, verfallWert(p.artikelId) || null])),
      warn,
      new Date(),
    );

    const zurNachfuellung = () => {
      // Greedy je Artikel: die Handlager-Verfuegbarkeit ueber die Positionen
      // (Anzeige-Reihenfolge) verteilen, damit der Vorschlag nicht mehr
      // verspricht, als der Handlager hergibt (1:1, `:222-238`).
      const rest = new Map<string, number>();
      for (const p of soll) if (!rest.has(p.artikelId)) rest.set(p.artikelId, p.handlagerBestand);
      const nf: Record<string, number> = {};
      for (const p of soll) {
        const luecke = Math.max(0, p.soll - istWert(p));
        const uebrig = rest.get(p.artikelId) ?? 0;
        const nimm = Math.min(luecke, uebrig);
        nf[p.id] = nimm;
        rest.set(p.artikelId, uebrig - nimm);
      }
      setNachfuell(nf);
      setFehler(null);
      setPhase("nachfuellen");
    };

    return (
      <>
        <div className={s.schirmKopf}>
          {fahrzeug.name}
          {fahrzeug.kennung ? ` · ${fahrzeug.kennung}` : ""}
        </div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>
            Wie viel liegt wirklich im Fahrzeug, und wie lange hält es?
          </div>
          <p className={s.fussnote}>
            Jede Position startet bei 0 – mit <b>+</b> hochzählen, was du wirklich findest. Ist ein
            Fach leer, tippe einmal auf <b>−</b>; damit ist die 0 gezählt. Das Verfallsdatum kommt
            aus dem letzten Check und ist freiwillig: nur ändern, wenn auf der Packung ein anderes
            (das <b>früheste</b>) Datum steht. Leeren heißt „keine Angabe“.
          </p>
        </div>

        <div className={s.fachraster} data-rolle="zaehlliste">
          {faecher.map((fach) => (
            <div key={fach}>
              <div className={s.fachKopf}>{fach}</div>
              <div className={s.karte}>
                {soll
                  .filter((p) => p.fachLabel === fach)
                  .map((p) => {
                    const wert = istWert(p);
                    const offen = !gezaehlt(p);
                    const luecke = Math.max(0, p.soll - wert);
                    const ueber = wert > p.soll;
                    const vw = verfallWert(p.artikelId);
                    const vc = verfallChip(vw);
                    const traegtFeld = ersteZeile.get(p.artikelId) === p.id;
                    return (
                      <div className={s.zeile} key={p.id} style={{ alignItems: "flex-start" }}>
                        {/*
                          DREIWERTIG SEIT DRK-304, und aus demselben Grund wie
                          beim Sauerstoff weiter unten: der nackte
                          `.pruefKreis` ist neutral, und „noch nicht gezaehlt"
                          ist weder ein Fehl- noch ein Ok-Befund. Zweiwertig
                          faerbte die unberuehrte Zeile ROT — jede Zeile beim
                          Betreten des Schritts —, und der Marker, der beim
                          Scrollen ohne Lesen wirkt, saegte damit genau die
                          Aussage ab, die der Riegel daneben macht.
                        */}
                        <div
                          className={`${s.pruefKreis} ${
                            offen ? "" : luecke > 0 ? s.pruefKreisFehl : s.pruefKreisOk
                          }`}
                        />
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>{p.artikelName}</div>
                          <div className={s.zeileMeta}>
                            <span>
                              Soll {p.soll} {p.einheit}
                            </span>
                            {/* ⚠️ Die Luecke einer unberuehrten Position ist
                                UNBEKANNT, nicht „voll" (DRK-304). Ein
                                „nachfuellen 5" an einer Zeile, die niemand
                                gezaehlt hat, waere eine Zahl aus dem Nichts —
                                und sie stuende beim Betreten des Schritts an
                                JEDER Zeile. */}
                            {offen && <HelferChip ton="grau">noch nicht gezählt</HelferChip>}
                            {!offen && luecke > 0 && (
                              <HelferChip ton="rot">nachfüllen {luecke}</HelferChip>
                            )}
                            {ueber && (
                              <HelferChip ton="gelb">Überbestand {wert - p.soll}</HelferChip>
                            )}
                            {/* Der Chip steht in JEDER Zeile desselben Artikels —
                                deshalb faellt die Hinweiszeile bei Wiederholzeilen
                                ersatzlos weg (§7.7.2 Punkt 3). */}
                            {vc && <HelferChip ton={vc.ton}>{vc.text}</HelferChip>}
                          </div>
                        </div>
                        {/* max grosszuegig ueber Soll: echter Ueberbestand muss
                            zaehlbar sein, sonst korrigiert der Abgleich real
                            vorhandene Teile STILL heraus (`:293-294`). */}
                        <Stepper
                          noText
                          wert={wert}
                          min={0}
                          max={9999}
                          beschriftung={p.artikelName}
                          setWert={(v) => setIst((z) => ({ ...z, [p.id]: v }))}
                        />
                        {/*
                          GESCHWISTER VON KREIS, TEXT UND STEPPER — NICHT MEHR
                          KIND VON `.zeileHaupt`. §7.7.2 Punkt 2 gibt dem
                          Verfallsfeld „eine eigene, volle Zeile"; im
                          `.zeileHaupt` bekam es nur dessen SPALTE, am Telefon
                          neben dem 56er-Stepper rund 110px. Als Geschwister mit
                          `flex: 1 0 100%` (shell-seitig in `.verfallZeile`)
                          faellt es unter alle drei und nimmt die volle
                          Kartenbreite ein.
                        */}
                        {traegtFeld && (
                          <div className={s.verfallZeile}>
                            {/* Natives <input type="month"> — kein antd-DatePicker
                                (§7.7.2 Punkt 4): die Klasse ist ohnehin ohne
                                Bibliothek, die native Monatsauswahl ist mit
                                Handschuhen einhaendig bedienbar, und es entfaellt
                                jede Dayjs-Umrechnung. `pattern` und `inputMode`
                                sind der Rueckfall fuer Browser, die `month` als
                                Textfeld rendern; die STRENGE selbst ist
                                serverseitig (MONAT_REGEX, §4.6). */}
                            <input
                              type="month"
                              inputMode="numeric"
                              pattern="\d{4}-\d{2}"
                              aria-label={`Verfall ${p.artikelName}`}
                              value={vw}
                              onChange={(e) =>
                                setVerfallState((v) => ({ ...v, [p.artikelId]: e.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {fehlerBereich}

        {/*
          DIE LEISTE DES ZAEHLSCHRITTS SCHWEBT NICHT MEHR — DRK-304. Sie steht
          am ENDE der Liste, und das ist der Punkt: ein „Weiter", das ueber der
          Liste mitfaehrt, ist erreichbar, BEVOR die Liste gelesen wurde. Wer
          gezaehlt hat, ist ohnehin unten angekommen.

          ⚠️ DIE UEBRIGEN DREI SCHRITTE BEHALTEN IHRE SCHWEBENDE LEISTE. Das
          Ticket nennt nur den Zaehlschritt, ihr Inhalt ist ein anderer, und ihr
          Knopf heisst „Abschliessen" — die Konsistenzfrage ist im Board
          gestellt und nicht einseitig entschieden.

          ⚠️ `.abschluss.abschlussRuhend` statt zweier gleichrangiger Klassen:
          bei Gleichstand entschiede die Reihenfolge im Stylesheet, und die ist
          keine Zusage (Falle 5).
        */}
        <div
          className={`${s.abschluss} ${s.abschlussRuhend}`}
          data-rolle="abschlussleiste"
        >
          <div className={s.abschlussInfo} data-rolle="zaehl-summe">
            {/*
              SOLANGE ETWAS OFFEN IST, IST DIE OFFENE ZAHL DIE NACHRICHT — nicht
              „Alles auf Soll". Eine Bilanz ueber Positionen, die niemand
              gezaehlt hat, waere eine Behauptung; „2 von 2" sagt stattdessen,
              warum der Knopf daneben nicht geht.
            */}
            <b>
              {ungezaehlt > 0
                ? `Noch ${ungezaehlt} von ${soll.length} zu zählen`
                : unterSoll === 0
                  ? "Alles auf Soll"
                  : `${unterSoll} unter Soll`}
            </b>
            <div>
              {ablaufend > 0 && `${ablaufend} laufen ab · `}
              {ungezaehlt > 0
                ? "Leeres Fach? Einmal auf − tippen."
                : unterSoll === 0
                  ? "Nichts nachzufüllen"
                  : "Weiter zur Nachfüllung aus dem Handlager"}
            </div>
          </div>
          {/*
            ⚠️ GESPERRT, NICHT NUR GEWARNT. Ein Hinweis liesse den Ein-Klick-Weg
            in die Leerbuchung offen — und die ist im Journal nicht
            zuruecknehmbar (`check.ts`, `korrekturAufLagerort`). Der Riegel ist
            zugleich die Zusage der User Story: Mengen werden BEWUSST erfasst.
          */}
          <button
            className={s.abschlussGo}
            type="button"
            disabled={ungezaehlt > 0}
            onClick={zurNachfuellung}
            data-rolle="weiter"
          >
            Weiter
          </button>
        </div>
      </>
    );
  }

  // ——— Schritt: Geraete ———
  if (aktivePhase === "geraete") {
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Geräte</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {idx > 0 && (
          <button
            className={`${s.knopf} ${s.knopfGeist}`}
            type="button"
            onClick={() => setPhase(schrittFolge[idx - 1])}
            data-rolle="zurueck-zaehlen"
          >
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Sind die Geräte da und in Ordnung?</div>
          <p className={s.fussnote}>
            Alles ist auf <b>vorhanden · In Ordnung</b> vorbelegt – nur Abweichungen antippen.
          </p>
        </div>
        <div className={s.karte}>
          {geraete.map((g) => {
            const e = geraetE(g.id);
            return (
              <div className={s.zeile} key={g.id} style={{ alignItems: "flex-start" }}>
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{g.name}</div>
                  <div className={s.zeileMeta}>
                    {/* ⚠️ `aria-pressed` UND der Haken sind die Zusage, dass die
                        Auswahl nicht allein auf der Farbe steht: der Chiptext ist
                        im gewaehlten wie im ungewaehlten Fall derselbe. */}
                    <button
                      type="button"
                      aria-pressed={e.vorhanden}
                      data-rolle="geraet-vorhanden"
                      className={s.chipKnopf}
                      onClick={() => setGeraet(g.id, { vorhanden: true })}
                    >
                      <HelferChip ton={e.vorhanden ? "ok" : "grau"}>
                        {e.vorhanden && <Ikone name="haken" groesse={13} />}vorhanden
                      </HelferChip>
                    </button>
                    <button
                      type="button"
                      aria-pressed={!e.vorhanden}
                      data-rolle="geraet-fehlt"
                      className={s.chipKnopf}
                      onClick={() => setGeraet(g.id, { vorhanden: false })}
                    >
                      <HelferChip ton={!e.vorhanden ? "rot" : "grau"}>
                        {!e.vorhanden && <Ikone name="haken" groesse={13} />}fehlt
                      </HelferChip>
                    </button>
                    {e.vorhanden &&
                      ZUSTAENDE.map((z) => (
                        <button
                          key={z}
                          type="button"
                          aria-pressed={e.zustand === z}
                          data-rolle="geraet-zustand"
                          className={s.chipKnopf}
                          onClick={() => setGeraet(g.id, { zustand: z })}
                        >
                          <HelferChip ton={e.zustand === z ? zustandTon(z) : "grau"}>
                            {e.zustand === z && <Ikone name="haken" groesse={13} />}
                            {z}
                          </HelferChip>
                        </button>
                      ))}
                  </div>
                  <input
                    className={s.feld}
                    placeholder="Bemerkung (optional)"
                    aria-label={`Bemerkung ${g.name}`}
                    value={e.bemerkung ?? ""}
                    onChange={(ev) => setGeraet(g.id, { bemerkung: ev.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss} data-rolle="abschlussleiste">
          <div className={s.abschlussInfo}>
            <b>{geraete.length} Gerät(e)</b>
            <div>
              {istLetzter ? "Quittieren schließt den Check ab" : `Weiter zu ${PHASE_LABEL[naechste]}`}
            </div>
          </div>
          {istLetzter ? (
            <button
              className={s.abschlussGo}
              type="button"
              disabled={laeuft}
              onClick={abschliessen}
              data-rolle="abschliessen"
            >
              Abschließen
            </button>
          ) : (
            <button
              className={s.abschlussGo}
              type="button"
              onClick={() => setPhase(naechste)}
              data-rolle="weiter"
            >
              Weiter
            </button>
          )}
        </div>
      </>
    );
  }

  // ——— Schritt: Sauerstoff ———
  if (aktivePhase === "sauerstoff") {
    const niedrig = flaschen.filter(
      (f) => f.nennfuelldruckBar > 0 && o2Status(druckWert(f), f.nennfuelldruckBar).niedrig,
    ).length;
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Sauerstoff</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {idx > 0 && (
          <button
            className={`${s.knopf} ${s.knopfGeist}`}
            type="button"
            onClick={() => setPhase(schrittFolge[idx - 1])}
            data-rolle="zurueck-zaehlen"
          >
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Welchen Druck zeigt das Manometer?</div>
          <p className={s.fussnote}>
            Jede Flasche ist auf den Nennfülldruck vorbelegt – mit <b>−</b> auf den abgelesenen Wert
            runterstellen.
          </p>
        </div>
        <div className={s.karte} data-rolle="o2-liste">
          {flaschen.map((f) => {
            const wert = druckWert(f);
            // Ohne bekannten Nennfuelldruck ist der Fuellstand NICHT BEWERTBAR
            // (§5.12) — `o2Status` gaebe hier „rot / niedrig" zurueck, und die
            // Helferin liefe los, um eine VOLLE Flasche zu tauschen.
            const st = f.nennfuelldruckBar > 0 ? o2Status(wert, f.nennfuelldruckBar) : null;
            return (
              <div className={s.zeile} key={f.id}>
                {/*
                  ⚠️ DREIWERTIG, NICHT ZWEIWERTIG (Review-Befund 3). `st === null`
                  heisst „nicht bewertbar" (kein Nennfuelldruck hinterlegt) — und
                  ein zweiwertiges `st?.niedrig ? Fehl : Ok` faellt dann auf
                  `.pruefKreisOk`, also auf eine GEFUELLTE GRUENE Flaeche
                  (`helfer.module.css:275`, `background: var(--lb-ampel-ok-text)`).
                  Die Zeile sagte gleichzeitig „geprueft und in Ordnung" (Farbe)
                  und „nicht bewertbar" (Chiptext daneben).

                  `HelferChip.tsx:29-31` haelt die Regel fest: „⚠️ `grau` IST KEIN
                  AMPELWERT … und darf NIE als gruen dargestellt werden." Das ist
                  das Spiegelbild von Befund 30: dort wanderte eine volle Flasche
                  faelschlich als ROT durch, hier eine unbeurteilbare als GRUEN —
                  und der `pruefKreis` ist der einzige Marker, der beim Scrollen
                  ohne Lesen wirkt.

                  Der nackte `.pruefKreis` ist bereits neutral
                  (`background: var(--lb-karte)`, grauer Rand) und damit die
                  richtige dritte Stufe.
                */}
                <div
                  className={`${s.pruefKreis} ${
                    st === null ? "" : st.niedrig ? s.pruefKreisFehl : s.pruefKreisOk
                  }`}
                />
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{f.name}</div>
                  <div className={s.zeileMeta}>
                    {f.nennfuelldruckBar > 0 ? (
                      <span>Nennfülldruck {f.nennfuelldruckBar} bar</span>
                    ) : (
                      <span>Nennfülldruck nicht hinterlegt</span>
                    )}
                    {/* ⚠️ „noch nicht gemessen" ist eine ANDERE Aussage als
                        „Nennfuelldruck nicht hinterlegt" (keine Messung vs. kein
                        Sollwert). Ohne sie stuende im Null-Fall ein leeres Feld
                        ohne Erklaerung (Uebergabe Teil 3, Punkt 4). */}
                    {f.letzterDruck === null ? (
                      <span>noch nicht gemessen</span>
                    ) : (
                      <span>zuletzt gemessen: {f.letzterDruck} bar</span>
                    )}
                    {st ? (
                      <HelferChip ton={ampelTon(st.ampel)}>{st.prozent}%</HelferChip>
                    ) : (
                      <HelferChip ton="grau">nicht bewertbar</HelferChip>
                    )}
                    {st?.niedrig && <HelferChip ton="rot">niedrig</HelferChip>}
                  </div>
                </div>
                {/* max grosszuegig ueber Nennfuelldruck: eine ueberfuellte
                    Flasche muss ablesbar bleiben (`:401`). */}
                <Stepper
                  wert={wert}
                  min={0}
                  max={9999}
                  beschriftung={`Druck ${f.name}`}
                  setWert={(v) => setDruck((z) => ({ ...z, [f.id]: v }))}
                />
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss} data-rolle="abschlussleiste">
          <div className={s.abschlussInfo}>
            <b>{niedrig === 0 ? `${flaschen.length} Flasche(n)` : `${niedrig} niedrig`}</b>
            <div>Bestätigen schließt den Check ab</div>
          </div>
          <button
            className={s.abschlussGo}
            type="button"
            disabled={laeuft}
            onClick={abschliessen}
            data-rolle="abschliessen"
          >
            Abschließen
          </button>
        </div>
      </>
    );
  }

  // ——— Schritt: Nachfuellen ———
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of soll) {
    const e = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    e.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, e);
  }
  const nfPositionen = soll.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summe = soll.reduce((z, p) => z + nfWert(p), 0);

  return (
    <>
      <div className={s.schirmKopf}>{fahrzeug.name}</div>
      <Schritte folge={schrittFolge} aktiv={aktivePhase} />
      <button
        className={`${s.knopf} ${s.knopfGeist}`}
        type="button"
        onClick={() => setPhase("zaehlen")}
        data-rolle="zurueck-zaehlen"
      >
        ← Zurück zum Zählen
      </button>

      {nfPositionen.length === 0 ? (
        <div className={`${s.karte} ${s.kartePad}`}>
          Nichts nachzufüllen – alle Positionen sind auf Soll. Du kannst{" "}
          {istLetzter ? "den Check direkt abschließen" : "direkt weiter"}.
        </div>
      ) : (
        <>
          <div className={`${s.karte} ${s.kartePad}`}>
            <div className={s.zeileName}>Aus dem Handlager aufs Fahrzeug legen</div>
            <p className={s.fussnote}>
              Hol die Teile aus dem angegebenen Handlager-Fach und stell mit <b>+/−</b> ein, wie
              viele du <b>wirklich</b> geholt hast.
            </p>
          </div>
          <div className={s.karte} data-rolle="nf-liste">
            {nfPositionen.map((p) => {
              const luecke = Math.max(0, p.soll - istWert(p));
              return (
                <div className={s.nfZeile} key={p.id}>
                  <div className={s.zeileHaupt}>
                    <div className={s.zeileName}>{p.artikelName}</div>
                    <div className={s.zeileMeta}>
                      <span className={s.fach}>{p.handlagerFach}</span>
                      <span>
                        Lücke {luecke} · im Handlager {p.handlagerBestand}
                      </span>
                    </div>
                  </div>
                  <div className={s.nfGeholt}>
                    {/* `max={luecke}`: der Helfer stellt ein, was er WIRKLICH
                        geholt hat — die Buchung folgt der Wirklichkeit, nicht
                        dem Vorschlag (`:461`). */}
                    <Stepper
                      noText
                      wert={nfWert(p)}
                      min={0}
                      max={luecke}
                      beschriftung={`geholt ${p.artikelName}`}
                      setWert={(v) => setNachfuell((z) => ({ ...z, [p.id]: v }))}
                    />
                    <small>geholt</small>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/*
        ⚠️ Diese Warnung KANN der greedy Vorschlag nicht ausloesen — er deckelt
        selbst an der Verfuegbarkeit (Befund 32). Sie erscheint erst, wenn der
        Helfer von Hand mehr eintraegt, als der Handlager fuer diesen Artikel
        hergibt: dann kappt die Buchung serverseitig, und er soll es VORHER
        wissen.
      */}
      {[...knappheit.values()].some((e) => e.gewuenscht > e.verfuegbar) && (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="nf-knappheit">
          {/* Der mehrzeilige Hinweis braucht die von `.chip` abweichende Form aus `.warnhinweis`. */}
          <span
            className={`${s.chip} ${s.gelb} ${s.warnhinweis}`}
            data-rolle="helfer-chip"
          >
            Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.
          </span>
        </div>
      )}

      {fehlerBereich}

      <div className={s.abschluss} data-rolle="abschlussleiste">
        <div className={s.abschlussInfo}>
          <b>{summe} Teile aufs Fahrzeug</b>
          <div>
            {istLetzter
              ? `Bestätigen bucht Handlager → ${fahrzeug.name}`
              : `Weiter zu ${PHASE_LABEL[naechste]}`}
          </div>
        </div>
        {istLetzter ? (
          <button
            className={s.abschlussGo}
            type="button"
            disabled={laeuft}
            onClick={abschliessen}
            data-rolle="abschliessen"
          >
            {/* „Gelegt & abschließen" stand hier und war kein Satz, sondern
                zwei Bruchstücke: ein Partizip ohne Bezug plus ein Infinitiv.
                Der Knopf bestätigt, was die Karte darüber verlangt („Aus dem
                Handlager aufs Fahrzeug legen") — er sagt das jetzt in denselben
                Worten. Dass damit der Check endet, steht im Text daneben
                („Bestätigen bucht Handlager → …"). */}
            Aufs Fahrzeug gelegt
          </button>
        ) : (
          <button
            className={s.abschlussGo}
            type="button"
            onClick={() => setPhase(naechste)}
            data-rolle="weiter"
          >
            Weiter
          </button>
        )}
      </div>
    </>
  );
}
