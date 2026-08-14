"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, Checkbox, Input } from "antd";

import { bearbeitenAction, type ShareFormZustand } from "../../../actions";
import css from "./bearbeiten.module.css";

/**
 * DAS BEARBEITEN-FORMULAR EINER FREIGABE (Spec §7.3; Plan T42).
 *
 * WARUM DIESE DATEI NEBEN `page.tsx` LIEGT UND `"use client"` TRAEGT: Feldfehler
 * muessen AM FELD ankommen (`docs/design/README.md:245-247`), das verlangt
 * `useActionState`, und das gibt es nur im Client. `page.tsx` bleibt dafuer eine
 * Server Component, laedt die Zeile und reicht FERTIGE Werte herein — Text und
 * Zahlen, keine `Date`-Objekte, keine Drizzle-Zeilen, kein `password_hash`.
 * Dieselbe Naht wie `shares/neu/page.tsx` → `_ui/UploadInsel.tsx`.
 *
 * ====================================================================
 * DIE TRAGENDE ZUSAGE: „WER NUR DEN TITEL KORRIGIERT, AENDERT DEN ABLAUF NICHT"
 * ====================================================================
 *
 * `bearbeitenAction` aendert NUR, was die `FormData` mitbringt — und liest ein
 * fehlendes wie ein leeres `expiryDays` als „nicht angefasst"
 * (`(verwaltung)/actions.ts`). Die Vorbelegung allein reicht dafuer NICHT, und
 * das ist der Punkt, an dem die naheliegende Loesung falsch ist:
 *
 *   Die Datenbank fuehrt `expires_at` ABSOLUT, die Action schreibt
 *   `jetzt + n * 86400 s`. Wer den korrekt vorbelegten Wert einfach mitschickt,
 *   VERSCHIEBT den Ablauf trotzdem — bei jedem Speichern ein Stueck weiter.
 *
 * Deshalb traegt das Ablauffeld sein `name`-Attribut nur, wenn sein Wert ein
 * ANDERER ist als der der Zeile. Verglichen werden WERTE und nicht „wurde
 * angefasst": 6 → 10 → 6 ist unveraendert, ein Merker „beruehrt" verschoebe den
 * Ablauf trotzdem.
 *
 * DIE ANDEREN FELDER MACHEN DAS AUSDRUECKLICH NICHT. `maxDownloads` traegt sein
 * `name` IMMER — die Action liest es ueber `formData.has(...)`, ein fehlendes
 * Feld heisst dort „nicht angefasst", und ein gesetztes Limit liesse sich dann
 * nie mehr loeschen. Dasselbe gilt fuer `title` und `description`. Der
 * Unterschied ist kein Geschmack: bei `expiryDays` waere ein versehentliches
 * Schreiben ZERSTOEREND, bei den anderen dreien ist es verlustfrei umkehrbar.
 *
 * KEINE ZWEITE DECKELUNG HIER. Die Grenze `FILES_MAX_ABLAUF_TAGE` erzwingt die
 * Action; sie steht an EINER Stelle (Plan T42, „Beachten"). Hier ist sie nur
 * Hinweistext — und bewusst KEIN `max`-Attribut: eine Zeile, deren Restlaufzeit
 * ueber einer spaeter gesenkten Grenze liegt, wuerde die Formularpruefung des
 * Browsers ausloesen und das Absenden ALLER Felder blockieren, fuer einen Wert,
 * der gar nicht mitgeschickt wird.
 */

export type BearbeitenFormularProps = {
  shareId: string;
  titel: string;
  /** Leer heisst „keine Beschreibung" — die Spalte ist nullable. */
  beschreibung: string;
  /** Leer heisst UNBEGRENZT (`max_downloads IS NULL`), nie `0`. */
  maxDownloadsText: string;
  hatPasswort: boolean;
  /** Die RESTLAUFZEIT in ganzen Tagen, aufgerundet — `null`, wenn abgelaufen. */
  restTage: number | null;
  /** Der Ablaufzeitpunkt als fertiger Text; serverseitig formatiert. */
  ablaufText: string;
  abgelaufen: boolean;
  maxAblaufTage: number;
};

/**
 * Der Startwert von `useActionState`. `ok: false` mit LEEREM `feldFehler`
 * heisst „noch nichts abgeschickt" — dieselbe Bauform wie in `UploadInsel`.
 */
const START: ShareFormZustand = { ok: false, feldFehler: {}, werte: {} };

/**
 * Der Wert, den `istGesetzt` in `(verwaltung)/actions.ts` als „an" liest
 * (`KAESTCHEN_AN = ["1","true","on"]`). Er steht als HIDDEN-Feld im Markup und
 * nicht als `value` am Kaestchen: ein Kontrollkaestchen sendet ueberhaupt nur,
 * wenn es angehakt ist, und ohne `value` sendet es `"on"` — beides haengt an
 * Details, die ein Umbau still verliert. Ein Wert ausserhalb der Liste machte
 * „Passwort entfernen" wirkungslos, ohne dass irgendwo ein Fehler entstuende.
 */
const ENTFERNEN_AN = "1";

const fehlerVon = (zustand: ShareFormZustand, feld: string): string | undefined =>
  zustand.ok ? undefined : zustand.feldFehler[feld];

export function BearbeitenFormular(props: BearbeitenFormularProps) {
  const [zustand, absenden] = useActionState(bearbeitenAction, START);

  /** Der Wert der ZEILE als Text — die Vorbelegung und zugleich der Vergleich. */
  const ausDerZeile = props.restTage === null ? "" : String(props.restTage);

  const [titel, setTitel] = useState(props.titel);
  const [beschreibung, setBeschreibung] = useState(props.beschreibung);
  const [limit, setLimit] = useState(props.maxDownloadsText);
  const [passwort, setPasswort] = useState("");
  const [entfernen, setEntfernen] = useState(false);
  const [tage, setTage] = useState(ausDerZeile);

  /**
   * VERGLICHEN WIRD GEGEN DIE PROP, NICHT GEGEN EINEN GEMERKTEN ANFANGSWERT —
   * und das erspart einen Effekt, der hier zwei ESLint-Fehler ausgeloest haette
   * (`react-hooks/refs` beim Lesen eines Refs im Render,
   * `set-state-in-effect` beim Nachziehen).
   *
   * Der Grund, dass es traegt: `bearbeitenAction` ruft `revalidatePath(…,
   * "layout")`, Next rendert die Server Component danach neu, und `page.tsx`
   * rechnet `restTage` aus dem FRISCHEN `expires_at`. Nach dem Speichern von 10
   * Tagen steht in der Prop also 10 und im Feld ebenfalls 10 — unveraendert, und
   * ein zweites Speichern (etwa eine Titelkorrektur) verlaengert den Share NICHT
   * ein zweites Mal. Ein gemerkter Anfangswert wuesste davon nichts.
   *
   * Die Aufrundung passt dazu: die Seite rendert NACH dem Schreiben, die
   * Restlaufzeit ist also knapp unter n Tagen und `Math.ceil` liefert wieder
   * genau n.
   */
  const ablaufGeaendert = tage.trim() !== ausDerZeile;

  /**
   * NACH EINER ERFOLGREICHEN RUNDE FANGEN PASSWORT UND HAEKCHEN WIEDER BEI NULL
   * AN — die einzigen beiden Felder, deren Inhalt sich nicht aus den Props
   * wiederherstellt.
   *
   * Titel, Beschreibung, Limit und Ablauf stehen nach dem Speichern ohnehin auf
   * dem gespeicherten Wert; das Passwortfeld dagegen ist ABSICHTLICH nie
   * vorbelegt, sein Zustand ueberlebte die Runde also als einziger. Der Ablauf,
   * den das erzeugt, ist erreichbar und nicht offensichtlich: Passwort setzen →
   * speichern (`hatPasswort` wird wahr, das Kaestchen erscheint) →
   * „Passwortschutz entfernen" anhaken → speichern. Die `FormData` traegt dann
   * BEIDES, die Action lehnt „setzen UND entfernen" ab — und im Feld stehen nur
   * Punkte, die niemand in dieser Runde getippt hat. Umgekehrt entfernte ein
   * stehengebliebenes Haekchen den Schutz beim naechsten Speichern ungefragt
   * ein zweites Mal.
   *
   * ZURUECKGESETZT WIRD IM RENDER UND NICHT IN EINEM EFFEKT: `useEffect` waere
   * hier eine zweite Runde durch den Browser (das Feld zeigte kurz noch den
   * alten Inhalt) und stiesse ausserdem gegen `react-hooks/set-state-in-effect`.
   * Reacts eigenes Muster fuer „Zustand an eine geaenderte Eingabe anpassen" ist
   * genau dies: den vorigen Wert merken, im Render vergleichen, beim Wechsel
   * setzen. React verwirft den angefangenen Durchlauf und rendert sofort neu,
   * ohne das DOM dazwischen anzufassen.
   *
   * Verglichen wird die OBJEKTIDENTITAET und nicht `zustand.ok`: `ok` bliebe
   * ueber zwei Erfolge hinweg durchgehend wahr, und die zweite Runde setzte
   * nichts zurueck. `useActionState` liefert je Runde ein neues Ergebnisobjekt.
   */
  const [letzterZustand, setLetzterZustand] = useState(zustand);
  if (zustand !== letzterZustand) {
    setLetzterZustand(zustand);
    if (zustand.ok) {
      setPasswort("");
      setEntfernen(false);
    }
  }

  const titelFehler = fehlerVon(zustand, "title");
  const ablaufFehler = fehlerVon(zustand, "expiryDays");
  const limitFehler = fehlerVon(zustand, "maxDownloads");
  const passwortFehler = fehlerVon(zustand, "password");
  const zeilenFehler = fehlerVon(zustand, "id");

  return (
    <Card data-testid="files-bearbeiten-karte">
      <form action={absenden} data-testid="files-bearbeiten-formular">
        {/* Ohne die Kennung findet die Action die Zeile nicht — sie liest sie
            aus der `FormData`, nie aus der Adresse. */}
        <input type="hidden" name="id" value={props.shareId} />

        {zeilenFehler && (
          /* Kein Feldfehler, sondern die Auskunft ueber die ganze Freigabe:
             `type="warning"` und NICHT `type="error"`, weil die Fehlerfarbe die
             Primaerfarbe ist (`docs/design/README.md`, Falle 3). */
          <Alert
            type="warning"
            showIcon
            data-testid="files-bearbeiten-fehler"
            message={zeilenFehler}
            action={
              // Kein `size="small"` mehr: dieser Knopf sitzt in einer
              // Alert-Aktion, keiner Tabellenzeile — die alte Ausnahme aus
              // `docs/design/README.md`, Falle 4, galt nie fuer diese Stelle,
              // und `size="small"` faellt auf 24px, unter die Mindesttapflaeche
              // (korrigiert Aufgabe 12).
              <Button href="/">Zur Übersicht</Button>
            }
          />
        )}

        {zustand.ok && (
          <Alert
            type="success"
            showIcon
            data-testid="files-bearbeiten-gespeichert"
            message="Änderungen gespeichert."
          />
        )}

        <label className={css.feld}>
          <span className={css.beschriftung}>Titel</span>
          <Input
            name="title"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            status={titelFehler ? "error" : undefined}
            aria-invalid={titelFehler ? true : undefined}
            aria-describedby={titelFehler ? "fi-b-title-fehler" : undefined}
          />
        </label>
        {titelFehler && (
          <p id="fi-b-title-fehler" className={css.fehlermeldung}>
            {titelFehler}
          </p>
        )}

        <label className={css.feld}>
          <span className={css.beschriftung}>Beschreibung (leer = keine)</span>
          {/* `Input.TextArea` ist ein Compound-Zugriff und in einer SERVER
              Component verboten; hier, in der Client-Insel, ist er zulaessig. */}
          <Input.TextArea
            name="description"
            rows={3}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
          />
        </label>

        <label className={css.feld}>
          <span className={css.beschriftung}>Restlaufzeit in Tagen</span>
          <Input
            /*
             * DIE TRAGENDE ZEILE DIESES FORMULARS — siehe Kopfkommentar. Ohne
             * `name` faellt das Feld aus der Eintragsliste des Formulars, die
             * Action liest „nicht angefasst" und `expires_at` bleibt stehen.
             */
            name={ablaufGeaendert ? "expiryDays" : undefined}
            data-testid="files-bearbeiten-ablauf"
            type="number"
            min={1}
            value={tage}
            onChange={(e) => setTage(e.target.value)}
            status={ablaufFehler ? "error" : undefined}
            aria-invalid={ablaufFehler ? true : undefined}
            aria-describedby={ablaufFehler ? "fi-b-expiry-fehler" : undefined}
          />
        </label>
        {/*
         * DIE GRENZE GILT DER NEUEN LAUFZEIT, NICHT DEM FELDINHALT — und der
         * Unterschied ist keine Wortklauberei. Wird `FILES_MAX_ABLAUF_TAGE`
         * spaeter gesenkt, steht in einer Bestandszeile eine Restlaufzeit
         * OBERHALB der heutigen Grenze. Ein Satz „Höchstens N Tage" neben einer
         * vorbelegten groesseren Zahl liest sich dann als „diese Freigabe ist
         * ungueltig", obwohl nichts falsch ist und der Wert gar nicht
         * mitgeschickt wird. Deshalb bezieht der Satz die Zahl ausdruecklich auf
         * eine NEUE Laufzeit ab heute — die einzige Lesart, die immer stimmt.
         */}
        <p className={css.hinweis} data-testid="files-bearbeiten-ablauftext">
          {props.abgelaufen
            ? `Abgelaufen am ${props.ablaufText}. Eine Zahl setzt die Laufzeit ab heute neu — ` +
              `höchstens ${props.maxAblaufTage} Tage.`
            : `Läuft ab am ${props.ablaufText}. Unverändert lassen heißt: der Ablauf bleibt, ` +
              `wie er ist. Eine neue Laufzeit gilt ab heute und für höchstens ` +
              `${props.maxAblaufTage} Tage.`}
        </p>
        {ablaufFehler && (
          <p id="fi-b-expiry-fehler" className={css.fehlermeldung}>
            {ablaufFehler}
          </p>
        )}

        <label className={css.feld}>
          <span className={css.beschriftung}>Download-Limit (leer = unbegrenzt)</span>
          <Input
            /* IMMER mit `name` — Begruendung im Kopfkommentar. */
            name="maxDownloads"
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            status={limitFehler ? "error" : undefined}
            aria-invalid={limitFehler ? true : undefined}
            aria-describedby={limitFehler ? "fi-b-limit-fehler" : undefined}
          />
        </label>
        {limitFehler && (
          <p id="fi-b-limit-fehler" className={css.fehlermeldung}>
            {limitFehler}
          </p>
        )}

        <label className={css.feld}>
          <span className={css.beschriftung}>
            {props.hatPasswort ? "Neues Passwort (leer = unverändert)" : "Passwort setzen"}
          </span>
          {/* NIE vorbelegt: ein Passwort im `value`-Attribut stuende im Markup
              derselben Antwort, die es schuetzen soll. `ShareFormZustand.werte`
              traegt es aus demselben Grund nicht zurueck. */}
          <Input.Password
            name="password"
            autoComplete="new-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            /*
             * NICHT `disabled`, wenn „entfernen" angehakt ist: ein
             * abgeschaltetes Feld wird gar nicht erst uebertragen, der
             * eingetippte Text verschwaende stillschweigend und das Passwort
             * waere entfernt. Die Action lehnt „setzen UND entfernen"
             * ausdruecklich AB, statt einen Vorrang zu raten — der Widerspruch
             * gehoert sichtbar an dieses Feld, nicht in einen grauen Kasten.
             */
            status={passwortFehler ? "error" : undefined}
            aria-invalid={passwortFehler ? true : undefined}
            aria-describedby={passwortFehler ? "fi-b-password-fehler" : undefined}
          />
        </label>
        {passwortFehler && (
          <p id="fi-b-password-fehler" className={css.fehlermeldung}>
            {passwortFehler}
          </p>
        )}

        {/*
         * DAS ENTFERNEN GIBT ES NUR, WO ES ETWAS ZU ENTFERNEN GIBT. Ein
         * Kaestchen an einer ungeschuetzten Freigabe waere ein Einstiegspunkt in
         * eine Handlung ohne Wirkung — und die Action lehnt „setzen UND
         * entfernen" ausdruecklich ab, statt still einen Vorrang zu raten.
         */}
        {props.hatPasswort && (
          <>
            <Checkbox
              data-testid="files-bearbeiten-passwort-entfernen"
              checked={entfernen}
              onChange={(e) => setEntfernen(e.target.checked)}
            >
              Passwortschutz entfernen
            </Checkbox>
            {entfernen && (
              <input type="hidden" name="passwortEntfernen" value={ENTFERNEN_AN} />
            )}
          </>
        )}

        <div className={css.aktionen}>
          {/* Kein `size`: `ARBEITSDICHTE` setzt `controlHeight` auf 44 (nicht
              mehr 56, korrigiert Aufgabe 12) — schon das richtige Masz,
              `size="large"` waeren 72px. */}
          <Button className={css.knopf} type="primary" htmlType="submit">
            Änderungen speichern
          </Button>
          {/*
           * DER WEG ZURUECK STEHT AM FORMULAR, nicht nur in der Kopfzeile: wer
           * hier steht und doch nichts aendern will, braucht ihn genau hier.
           * Ziel ist die Modulwurzel — Begruendung in `page.tsx`.
           */}
          <Button className={css.knopf} href="/">
            Abbrechen
          </Button>
        </div>
      </form>
    </Card>
  );
}
