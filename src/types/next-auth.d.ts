import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      groups: string[];
      // Slugs der Fachgruppen, für die die Person Gruppenleitung ist. Modul-
      // spezifisch ausgewertet (feedback), aber wie `groups` aus dem ID-Token.
      fachgruppen: string[];
      isAdmin: boolean;
    };
    error?: string;
    /**
     * Unix-SEKUNDEN der Anmeldung, aus `token.angemeldetSeit`. Die Profilseite
     * zeigt sie als „angemeldet seit".
     */
    angemeldetSeit?: number;
  }

  interface User {
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    groups?: string[];
    fachgruppen?: string[];
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    /**
     * Zeitpunkt (ms) des letzten TRANSIENT gescheiterten Refresh-Versuchs.
     * Traegt den Backoff aus `core/auth/refresh.ts`: solange weniger als
     * BACKOFF_MS her, wird der Token-Endpoint gar nicht erst gerufen. Wird bei
     * jedem Erfolg wieder geleert. Ein ENDGUELTIGER Fehlschlag setzt statt
     * dessen `error` — die beiden Felder schliessen einander aus.
     */
    refreshFailedAt?: number;
    error?: string;
    /**
     * Unix-SEKUNDEN der Anmeldung. Grundlage des Sitzungswiderrufs
     * (`core/konto/widerruf.ts`).
     *
     * NICHT durch `iat` ersetzbar, auch wenn das dasselbe zu sein scheint:
     * Auth.js signiert das Token bei JEDER Antwort neu
     * (`@auth/core/lib/actions/session.js:40`) und setzt `iat` dabei auf die
     * Gegenwart. Ein Widerruf waere nach genau einer Anfrage wieder ueberholt —
     * und kein Gate sieht das, weil in einem Unit-Test niemand ein zweites Mal
     * encodiert.
     */
    angemeldetSeit?: number;
  }
}
