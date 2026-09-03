"use client";

import { useEffect, useState } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Der Streifen fuer den Fall „mit Netz, aber abgelaufener Sitzung".
 *
 * ⛔ WARUM DAS EINE CLIENT-ENTSCHEIDUNG IST: diese Seite wird vom Service
 * Worker aus dem Cache ausgeliefert — sie ist EIN gespeichertes HTML fuer beide
 * Lagen und kann serverseitig gar nicht wissen, welche gerade gilt. Kommt
 * jemand hier an, OBWOHL er Netz hat, dann deshalb, weil die Suite auf
 * /login umgeleitet hat und der Redirect-Riegel des Workers die gecachte
 * Flaeche ausgeliefert hat (Spec §7.3).
 *
 * ⛔ KEIN Suite-Rot (Falle 3: colorError === colorPrimary === #c8000f). Der
 * Streifen ist eine Auskunft, keine Fehlermeldung.
 *
 * Nachgesehen, nicht angenommen: `SessionGuard` (`components/providers.tsx`)
 * handelt NUR bei `session.error === "RefreshTokenError"`. Eine schlicht
 * fehlende Sitzung loest hier also keine Weiterleitung aus — dieser Streifen
 * ist das einzige Signal.
 */
export function AbgemeldetStreifen() {
  const [imNetz, setImNetz] = useState(false);

  useEffect(() => {
    const messen = () => setImNetz(navigator.onLine);
    messen();
    window.addEventListener("online", messen);
    window.addEventListener("offline", messen);
    return () => {
      window.removeEventListener("online", messen);
      window.removeEventListener("offline", messen);
    };
  }, []);

  if (!imNetz) return null;

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
