"use client";

import { useActionState } from "react";
import { einloesenAmGate, type GateZustand } from "../_actions/gate";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "../_lib/marke";
import { Ikone } from "./ikonen";
import s from "./helfer.module.css";

/**
 * DAS GATE — §7.2.4. "use client" wegen `useActionState`.
 *
 * ⚠️ `meldung` IST DER FERTIGE SATZ, NICHT DER ROHPARAMETER. Er kommt aus
 * `gateMeldung(grund, sperrSekunden)` (Teil 2, T18) und wird hier NUR
 * angezeigt. Drei Gruende, und der dritte traegt allein:
 *   * die vier Gate-Texte stehen in §3.9 UND NIRGENDS SONST;
 *   * ein `searchParams`-Wert ist NUTZEREINGABE und darf nie in die Seite
 *     durchgereicht werden;
 *   * die Sekundenzahl fuer `zuviele` liest DIE SEITE selbst aus derselben
 *     Schranke, mit denselben Absender-Kopfzeilen — EINE ZAHL IN DER URL IST
 *     BEIM ERSTEN NEULADEN GELOGEN.
 *
 * ⚠️ ES GIBT GENAU EINEN FEHLERORT. Der Text aus `?grund=` und der
 * Rueckgabewert der Server Action erscheinen an DERSELBEN Stelle (`.gateFehler`,
 * heute `gateerr`, globals.css:126). Zwei Fehlerorte waeren zwei Zustaende, die
 * einander widersprechen koennen.
 *
 * ⚠️ DIE VERWALTUNGSKARTE RUFT NICHT `signIn()`. Sie ist ein LINK auf das
 * Suite-`/login` (§3.6.6, Entscheidung 15 a: „der Verwaltungs-Knopf fuehrt auf
 * das Suite-/login"). `signIn("oidc", …)` waere die naheliegende Uebernahme aus
 * `Gate.tsx:55` und in der Suite FALSCH: der Anbieter heisst dort
 * **`"pocket-id"`** (`core/auth/pocketId.ts:28`) und existiert nur bei
 * gesetztem `POCKET_ID_ISSUER` (`core/auth/config.ts:76`). Auth.js meldet einen
 * unbekannten Anbieter erst zur LAUFZEIT — `pnpm build` bliebe gruen.
 *
 * `/login` steht auf JEDEM Host zur Verfuegung: `core/routing.ts:12` fuehrt es
 * in `PASSTHROUGH`, der Pfad wird also nirgends in ein Modul umgeschrieben.
 *
 * ⚠️ DER LINK KOMMT FERTIG VOM SERVER und wird hier NICHT zusammengesetzt. Er
 * traegt `verwaltungsZiel()` (Teil 2, T23, `_lib/zugang.ts:205-213`) bzw.
 * `returnTo`, und beides kennt nur der Server. Ein zweites Zusammensetzen hier
 * waere eine zweite Stelle, an der der Cutover-Fall „kein SUITE_HOST_LAGERBUCH"
 * falsch entschieden werden kann (§3.6.6) — und nach Betreiberentscheidung B-1
 * genau die Stelle, an der ein literaler Prod-Host den Dev-Login jeder Dev- und
 * E2E-Umgebung ins Leere laufen liesse (`callbackUrl` wird dort nur als eigene
 * Origin angenommen).
 *
 * ⚠️ DER DEMO-LOGIN-KNOPF DES BESTANDS (`Gate.tsx:59-66`) ENTFAELLT ERSATZLOS.
 * Die Suite-Anmeldeseite bietet ihn selbst, wenn `AUTH_DEV_LOGIN` gesetzt ist
 * (`core/auth/devLogin.ts:14`); ein zweiter Knopf im Modul waere ein zweiter
 * Pfad in dieselbe Sitzung, in Produktion nur durch eine BEDINGUNG stillgelegt.
 */

/**
 * ⚠️ DER AUSNAHMEWEG — Global Constraint 11, und er fehlte im Plan (Befund 19
 * des Preflight-Scans). „Jeder Action-Aufruf im Client steht in `try/catch`"
 * nimmt das Gate an keiner Stelle aus: bricht die Verbindung
 * beim Absenden, lehnt der Aufruf ab, und `useActionState` verwirft in die
 * naechste Error Boundary — genau der Zustand, den Falle 66 verbietet. Gemessen
 * unter react-dom 19.2 und jsdom 26: ohne dieses `catch` steigt der Wurf bis in
 * den Absendeweg hoch und der Baum wird ausgehaengt; die Person saehe eine
 * technische Fehlerseite statt eines Satzes an ihrem Formular.
 *
 * DER SATZ ENTSTEHT HIER, IM CLIENT — nie serverseitig (§2.12). Er steht
 * bewusst NICHT in `_lib/actionTypen.ts` neben `NETZ_TEXT_BUCHUNG` und
 * `NETZ_TEXT_CHECK`: die beiden gehoeren zu `HelferErgebnis`, also zu einer
 * angemeldeten Helfer-Sitzung. Am Gate gibt es noch keine. Und in
 * `_actions/gate.ts` kann er nicht liegen: eine Datei mit `"use server"` darf
 * ausschliesslich asynchrone Funktionen exportieren.
 *
 * ⚠️ DER SATZ NENNT KEINE URSACHE — UND ZWAR ABSICHTLICH, WEIL DAS `catch` DREI
 * GANZ VERSCHIEDENE LAGEN FAENGT (Review-Befund 1 zu T77, Fix-Runde 1):
 *   * den Verbindungsabbruch beim Absenden;
 *   * den Host-Wurf von `requireLagerbuchHost` (`_actions/gate.ts:49`);
 *   * JEDE ECHTE SERVERAUSNAHME — und die ist NICHT theoretisch: fehlt
 *     `LAGERBUCH_HELFER_SITZUNG_SECRET`, wirft `createHelferSitzung` in JEDEM
 *     Trefferpfad, den der Gate-Weg ueber `redeemToken` erreicht; dasselbe gilt
 *     fuer `getDb()`/`SQLITE_READONLY`.
 * Eine Netzdiagnose waere dann auf dem EINZIGEN oeffentlichen Einstieg fuer
 * Helfer:innen ohne Konto die FALSCHE Auskunft: die Person tippt nach, sucht den
 * Fehler bei ihrem Empfang, und der Betrieb sucht ein Netzproblem, das es nicht
 * gibt. Der Satz benennt deshalb nur, WAS NICHT GESCHAH („der Code konnte nicht
 * geprueft werden"), die eine Handlung, die in allen drei Lagen dieselbe ist
 * (noch einmal auf Weiter tippen), UND den Weg zur Leitung, wenn es dabei
 * bleibt. Genauso haelt es der Praezedenzfall im Repo:
 * `src/app/m/feedback/f/[slugSecret]/Zettel.tsx:194`
 * (`MELDUNG_AUSNAHME`) faengt Netz UND
 * Serverausnahme mit EINEM ursachenneutralen Satz; unterschieden werden dort
 * nicht die Ausnahmen, sondern Ausnahme gegen ABWEISUNG — und diese Trennung
 * haelt hier der Rueckgabeweg (`ergebnis.fehler`) schon selbst.
 *
 * ⚠️ NICHT NACH FEHLERART DIFFERENZIEREN. Ein zweiter Satz waere hier nicht nur
 * unnoetig, sondern schaedlich: der Host-Wurf ist kein Betriebsfall, sondern ein
 * manipulierter Aufruf, und er darf nicht unterscheidbar antworten. Ein Satz fuer
 * alle drei Lagen verraet darueber nichts.
 *
 * Was Global Constraint 11 verlangt, ist ERFUELLT und war nie mehr als das:
 * „jeder Action-Aufruf im Client steht in `try/catch`" — das `catch` steht. Der
 * Constraint pinnt den GRUND `"netz"` im Feld `grund` von `HelferErgebnis`;
 * `GateZustand` (T73) hat gar kein Feld `grund`, sondern nur `fehler?: string`.
 * WELCHER Satz in diesem Feld steht, entscheidet der Constraint nicht — und eine
 * andere Zeichenkette im selben Feld aendert keine fremde Datei.
 *
 * ⚠️ `?? {}` IST NICHT DEFENSIV, SONDERN DER ERFOLGSPFAD. `einloesenAmGate`
 * endet im Erfolg mit `redirect()` (`_actions/gate.ts:99`). Der Client-Aufruf
 * lehnt dafuer NICHT ab — Next transportiert den Redirect in der Antwort
 * (`src/app/m/feedback/f/[slugSecret]/Zettel.tsx:647-650`) —, er loest mit
 * `undefined` auf. React
 * rendert danach noch einmal, und ein `zustand.fehler` auf `undefined` wirft
 * dabei „Cannot read properties of undefined" und reisst den Baum ab. Gemessen
 * am 06.08.2026 unter react-dom 19.2.
 */
const MELDUNG_AUSNAHME_GATE =
  "Der Code konnte nicht geprüft werden. Bitte noch einmal auf Weiter tippen — " +
  "bleibt es dabei, wende dich an die Leitung.";

async function amGate(vorher: GateZustand, formData: FormData): Promise<GateZustand> {
  try {
    const ergebnis: GateZustand | undefined = await einloesenAmGate(vorher, formData);
    return ergebnis ?? {};
  } catch {
    return { fehler: MELDUNG_AUSNAHME_GATE };
  }
}

export function Gate({
  meldung,
  returnTo,
  verwaltungsLink,
}: {
  meldung: string | null;
  /** Bereits serverseitig sanitiert (`sanitizeReturnTo`, Teil 2 T19). */
  returnTo: string;
  /** FERTIGES Anmeldeziel, serverseitig gebaut (T81). */
  verwaltungsLink: string;
}) {
  const [zustand, formAction, laeuft] = useActionState<GateZustand, FormData>(amGate, {});

  // DER EINE Fehlerort: erst der Rueckgabewert der Action (frischer), sonst die
  // Meldung aus `?grund=`.
  const fehler = zustand.fehler ?? meldung;

  return (
    <div className={s.gate}>
      <div className={s.gateBalken} />
      <div className={s.gateMarke}>
        LAGER<span className={s.markeAkzent}>BUCH</span>
      </div>
      <div className={s.gateUnter}>
        {LAGERBUCH_ORGANISATION} · {LAGERBUCH_ZEILE}
      </div>

      <div className={s.gateKarten}>
        <div className={s.gateKarte}>
          <h2>Im Dienst</h2>
          <p className={s.fussnote}>
            Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben – ohne Konto, ohne
            Passwort. Nur Entnahme.
          </p>
          <form action={formAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            {/*
              `inputMode="numeric"`, `maxLength` und `pattern` sind zusammen die
              billigste Massnahme gegen Fehleingaben am GEMEINSAMEN
              Rate-Limit-Eimer (§7.5.3, Falle 24): alle Helferinnen hinter
              demselben Uplink — ein Anschluss oder Mobilfunk hinter CGNAT —
              teilen sich fuenf Fehlversuche pro Minute.
            */}
            <input
              className={s.codefeld}
              name="code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              pattern="[0-9]{3}-?[0-9]{3}"
              placeholder="000-000"
              aria-label="Zugangs-Code"
              aria-describedby="codehinweis"
            />
            <div id="codehinweis" className={s.gateHinweis}>
              Sechs Ziffern vom Kärtchen, mit oder ohne Bindestrich.
            </div>
            {/*
              `role="alert"`: seit dem Netzfall erscheint dieser Ort auch
              NACHTRAEGLICH — nach einem Antippen, ohne Seitenwechsel. Ohne die
              Rolle bemerkt eine Bildschirmleserin genau den Fall nicht, der neu
              hinzugekommen ist.
            */}
            {fehler && (
              <div className={s.gateFehler} role="alert" data-rolle="gate-fehler">
                {fehler}
              </div>
            )}
            <button className={`${s.knopf} ${s.knopfRot}`} type="submit" disabled={laeuft}>
              Weiter
            </button>
          </form>
        </div>

        {/*
          DIE VERWALTUNGSKARTE BLEIBT (§7.2.4, Entscheidung 15 a). Sie ist ein
          zweites, gleichrangiges Ziel neben dem Zahlenfeld — und der EINZIGE
          sichtbare Verwaltungseinstieg auf dem lagerbuch-Host.
        */}
        <div className={s.gateKarte}>
          <h2>Verwaltung</h2>
          <p className={s.fussnote}>
            Volles {LAGERBUCH_MARKE}: Artikel &amp; Chargen, Soll-Bestückung der Fahrzeuge,
            Bestellvorschläge, Journal und Zugangs-Codes.
          </p>
          <div style={{ flex: 1 }} />
          {/*
            Ein `<a>`, kein `<Link>`: das Anmeldeziel liegt AUSSERHALB des
            Moduls und in `PASSTHROUGH` (`core/routing.ts:12`). Ein Prefetch der
            Anmeldeseite braechte nichts und liefe auf jedem Gate-Aufruf mit.
          */}
          <a
            className={`${s.knopf} ${s.knopfTinte}`}
            href={verwaltungsLink}
            data-rolle="gate-verwaltung"
          >
            <Ikone name="schluessel" groesse={16} />
            Mit Pocket ID anmelden
          </a>
        </div>
      </div>
    </div>
  );
}
