"use client";

import { useEffect, useState } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Der Streifen fuer den Fall „mit Netz, aber abgelaufener Sitzung".
 *
 * ⛔ ER HAENGT NICHT AN `navigator.onLine`, UND DAS IST EINE KORREKTUR AUS
 * FIX-RUNDE 1 (W2). Die erste Fassung schloss aus „online" auf „abgemeldet",
 * mit der Begruendung, wer online auf dieser Flaeche lande, sei ueber den
 * Redirect-Riegel des Workers hergekommen. Das gilt fuer RUECKFALL-Navigationen
 * — und ausgerechnet nicht fuer den haeufigsten Aufruf ueberhaupt: `start_url`
 * ist `/offline`, das ist die Adresse, unter der die INSTALLIERTE App STARTET.
 * Ein angemeldeter Mensch mit Netz bekam die Seite dort frisch vom Netz und las
 * auf seinem Startbildschirm, er sei abgemeldet, waehrend daneben in der
 * Kopfzeile „Anmelden" stand. Zwei Zusagen derselben Aufgabe widersprachen
 * einander; diese hier war die falsche.
 *
 * ⛔ GEFRAGT WIRD JETZT DAS, WAS DER STREIFEN BEHAUPTET: gibt es gerade eine
 * Sitzung? `/api/auth/session` beantwortet genau das, steht in `PASSTHROUGH`
 * und wird vom Service Worker nie beantwortet (sein `fetch`-Handler steigt bei
 * `/api/` aus) — die Antwort kommt also immer vom Server oder gar nicht.
 *
 * ⛔ DREI LAGEN, NICHT ZWEI. „Ich weiss es nicht" (kein Netz, oder der Server
 * antwortet nicht) fuehrt zu SCHWEIGEN, nicht zu einer Behauptung. Eine
 * gescheiterte Anfrage als „abgemeldet" zu lesen waere derselbe Fehler wie
 * vorher, nur mit einem anderen Messwert.
 *
 * ⛔ EIGENE ANFRAGE STATT `useSession()`, und das ist kein Geschmack: diese
 * Routengruppe ist dadurch definiert, dass sie NICHT an der Suite-Huelle haengt
 * (kein `<Shell>`, kein `auth()`). Auf `SessionProvider` aus der Wurzel zu
 * bauen hiesse, dass ein spaeteres Verschieben des Providers in die Shell
 * diesen Streifen STILL jedem anzeigte — `useSession()` liefert ohne Provider
 * dauerhaft „unauthenticated". Die eine zusaetzliche Anfrage ist der Preis
 * dafuer, dass diese Flaeche fuer sich steht.
 *
 * ⛔ KEIN Suite-Rot (Falle 3: colorError === colorPrimary === #c8000f). Der
 * Streifen ist eine Auskunft, keine Fehlermeldung.
 *
 * Nachgesehen, nicht angenommen: `SessionGuard` (`components/providers.tsx`)
 * handelt NUR bei `session.error === "RefreshTokenError"`. Eine schlicht
 * fehlende Sitzung loest also keine Weiterleitung aus — dieser Streifen ist das
 * einzige Signal.
 */
type Lage = "unbekannt" | "angemeldet" | "abgemeldet";

export function AbgemeldetStreifen() {
  const [lage, setLage] = useState<Lage>("unbekannt");

  useEffect(() => {
    let lebt = true;

    const pruefe = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!lebt) return;
        // Ein Serverfehler beantwortet die Frage nicht — dann lieber nichts sagen.
        if (!res.ok) {
          setLage("unbekannt");
          return;
        }
        const daten: unknown = await res.json().catch(() => null);
        if (!lebt) return;
        const angemeldet =
          typeof daten === "object" && daten !== null && "user" in daten && daten.user != null;
        setLage(angemeldet ? "angemeldet" : "abgemeldet");
      } catch {
        // Kein Netz: die haeufigste Lage auf dieser Flaeche, und die eine, in
        // der ueber die Sitzung nichts bekannt ist.
        if (lebt) setLage("unbekannt");
      }
    };

    void pruefe();
    // Kommt das Netz zurueck, ist die Frage neu zu stellen — vorher war sie
    // nicht beantwortbar.
    window.addEventListener("online", pruefe);
    return () => {
      lebt = false;
      window.removeEventListener("online", pruefe);
    };
  }, []);

  if (lage !== "abgemeldet") return null;

  return (
    <p
      data-testid="zeichen-abgemeldet"
      style={{
        ...SCHRIFT.text,
        margin: 0,
        padding: SPACE.sm,
        border: "1px solid var(--iuk-linie)",
        borderRadius: 4,
      }}
    >
      Du bist abgemeldet. Zum Merken und Üben bitte <a href="/login">neu anmelden</a>.
    </p>
  );
}
