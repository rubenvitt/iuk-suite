"use client";

import { useId, useState } from "react";

import s from "../(oeffentlich-share)/s/[id]/share.module.css";

/**
 * DIE PASSWORTMASKE VON `/s/<id>` — die Client-Insel des serverseitigen Gates
 * (Spec §7.4, Plan T40).
 *
 * ═══ WARUM ES UEBERHAUPT EINE INSEL IST ══════════════════════════════════════
 *
 * `POST /api/s/<id>/verify` liest `req.json()` und antwortet mit `Set-Cookie`
 * plus JSON. Ein nacktes `<form method="post" action="…">` schickte
 * `application/x-www-form-urlencoded`; der Handler bekaeme dort ein LEERES
 * Passwort und antwortete auf jedes richtige Passwort mit 401 — still, denn
 * `passwortAus()` behandelt einen unlesbaren Rumpf bewusst als Fehlversuch und
 * nicht als 400. Und selbst mit passendem Rumpf bliebe der Browser auf der
 * JSON-Antwort stehen.
 *
 * Der Preis ist benannt: die Freigabeseite ist ohne JavaScript LESBAR, aber ein
 * passwortgeschuetzter Share ist ohne JavaScript nicht zu entsperren. Dasselbe
 * gilt schon heute (`easy-filesharing` prueft das Passwort im Client) und fuer
 * `/u/<token>` (§8.2). Die feedback-Zusage „ohne JS vollstaendig bedienbar"
 * gilt dort und wird hier ausdruecklich nicht ausgedehnt. Was ohne JS bleibt,
 * ist der `<noscript>`-Hinweis mit dem Weg statt einer toten Maske.
 *
 * ═══ WAS DIESE DATEI IMPORTIEREN DARF UND WAS NICHT ══════════════════════════
 *
 * Nur das CSS-Modul. **Niemals** `_lib/passwort.ts` (`node:crypto`),
 * `_lib/av.ts` (`node:net`) oder `_lib/grenzen.ts#grenzen()` (liest
 * `process.env` und wirft im Browser). Umgekehrt darf `page.tsx` aus dieser
 * Datei keinen WERT lesen, nur die Komponente: sie traegt `"use client"`, und
 * eine Server Component bekaeme statt des Wertes eine Client-Referenz
 * (Falle 6, HTTP 500 fuer die ganze Seite).
 *
 * ═══ DER ERFOLGSWEG IST EIN PROP, KEIN `useRouter` ═══════════════════════════
 *
 * Nach dem 200 traegt der Browser das Cookie, und die Seite muss NEU vom Server
 * kommen — erst dann entsteht das Markup der Dateiliste ueberhaupt (§7.4: das
 * Gate ist eine Server-Komponente). `location.reload()` ist dafuer das
 * ehrlichste Mittel: ein `router.refresh()` erneuerte nur den RSC-Baum, und
 * `useRouter()` braeuchte ausserdem den App-Router-Kontext, den es in einem
 * Vitest nicht gibt — die Zusage „genau einmal, und nur bei 200" waere dann
 * nicht pruefbar. Deshalb ist der Weg ein Prop mit Vorgabewert.
 */
export function PasswortMaske({
  shareId,
  nachErfolg = () => window.location.reload(),
}: {
  shareId: string;
  /** Was nach dem 200 geschieht. Vorgabe: die Seite neu vom Server holen. */
  nachErfolg?: () => void;
}) {
  const feldId = useId();
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function absenden(ereignis: React.FormEvent) {
    ereignis.preventDefault();
    // Zwei Riegel in einer Zeile: ein leeres Passwort ist beim Handler ein
    // Fehlversuch und zaehlt gegen die Notbremse (10 Versuche / 10 min), und
    // ein zweites Absenden waehrend des ersten kostete einen weiteren Versuch
    // samt bcrypt-Rechnung fuer dieselbe Eingabe.
    if (passwort === "" || laeuft) return;

    setLaeuft(true);
    setFehler(null);
    try {
      const antwort = await fetch(`/api/s/${shareId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: passwort }),
      });

      if (antwort.ok) {
        nachErfolg();
        // KEIN `setLaeuft(false)`: die Seite wird gleich ersetzt, und ein
        // wieder freigegebener Knopf laedt in dem Moment ein zweites Mal.
        return;
      }

      /*
       * DER RUMPF DER ANTWORT WIRD NICHT ANGEZEIGT. Der Handler haelt sein
       * Orakel geschlossen: „unbekannter Share", „Share ohne Passwort" und
       * „falsches Passwort" antworten mit demselben 401 und demselben Text.
       * Wuerde diese Insel den Servertext durchreichen, oeffnete jede kuenftige
       * Verfeinerung dort das Orakel hier — ohne dass jemand diese Datei
       * anfasst.
       */
      setFehler(
        antwort.status === 429
          ? "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen."
          : "Das Passwort stimmt nicht. Bitte prüfen Sie die Schreibweise.",
      );
    } catch {
      // Ausdruecklich ANDERS benannt als die Ablehnung: wer bei einem Funkloch
      // „Passwort falsch" liest, tippt ein richtiges Passwort neu ein.
      setFehler("Die Verbindung ist fehlgeschlagen. Bitte erneut versuchen.");
    }
    setLaeuft(false);
  }

  return (
    <form className={s.maske} onSubmit={absenden} data-testid="files-passwort-maske">
      <div className={s.maskenfeld}>
        <label className="fp-label" htmlFor={feldId}>
          Passwort
        </label>
        <input
          className="fp-feld"
          id={feldId}
          name="password"
          type="password"
          autoComplete="current-password"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
        />
      </div>

      {fehler !== null && (
        <p className="fp-fehler" data-testid="files-passwort-fehler" role="alert">
          {fehler}
        </p>
      )}

      <button
        className={`fp-knopf ${s.maskenknopf}`}
        type="submit"
        /* Nicht `disabled` bei leerem Feld: ein deaktivierter Knopf sagt nicht,
           WARUM. Der Guard oben faengt den Leerklick ab, und das Feld bleibt
           der Ort, an dem die Person weitermacht. */
        disabled={laeuft}
      >
        {laeuft ? "Wird geprüft …" : "Freigabe öffnen"}
      </button>

      <noscript>
        <p className="fp-fehler">
          Zum Öffnen dieser Freigabe wird JavaScript benötigt. Bitte aktivieren
          Sie es oder öffnen Sie den Link in einem anderen Browser.
        </p>
      </noscript>
    </form>
  );
}
