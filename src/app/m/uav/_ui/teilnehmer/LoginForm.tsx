"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../offline/client";
import styles from "./uav.module.css";

/**
 * Teilnehmer-Login — Port aus uav-praxis/src/pages/LoginPage.tsx, hier ohne
 * `AuthContext`: `LoginForm` spricht `api.participantLogin` direkt.
 *
 * Magic-Link (`code`-Prop): löst SOFORT ein, mit dem Rohwert aus der URL —
 * keine Normalisierung auf dem Client, die Suite normalisiert serverseitig
 * (`codeNormalisieren` in `_lib/code.ts`). Erfolg → `window.location.replace("/")`,
 * ein VOLLER Reload, damit die Teilnehmer-Insel mit der neuen Session
 * (Cookie) startet statt mit einem clientseitig veralteten Identitäts-Cache.
 */
export function LoginForm({ code }: { code?: string }) {
  const [eingabe, setEingabe] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const magicVerarbeitet = useRef(false);

  useEffect(() => {
    if (magicVerarbeitet.current) return;
    if (!code) return;
    magicVerarbeitet.current = true;

    void (async () => {
      setLaden(true);
      try {
        await api.participantLogin(code);
        window.location.replace("/");
      } catch (e) {
        setEingabe(code);
        setFehler(fehlermeldungAus(e));
        setLaden(false);
      }
    })();
  }, [code]);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!eingabe.trim()) return;
    setLaden(true);
    setFehler(null);
    try {
      await api.participantLogin(eingabe);
      window.location.replace("/");
    } catch (err) {
      setFehler(fehlermeldungAus(err));
      setLaden(false);
    }
  }

  return (
    <form className={styles["login-form"]} onSubmit={absenden} noValidate>
      <label htmlFor="login-code">Persönlicher Code</label>
      <input
        id="login-code"
        name="code"
        className={styles["login-code"]}
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        value={eingabe}
        onChange={(e) => setEingabe(e.target.value)}
        disabled={laden}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? "login-fehler" : undefined}
        placeholder="z. B. ABCD-1234"
      />

      {fehler && (
        <p id="login-fehler" className={styles["login-fehler"]} role="alert">
          {fehler}
        </p>
      )}

      <button
        type="submit"
        className={`${styles["btn-primaer"]} ${styles["login-button"]}`}
        disabled={laden || !eingabe.trim()}
      >
        {laden ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
  );
}

function fehlermeldungAus(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "invalid_code") return "Ungültiger oder inaktiver Code.";
    return e.message;
  }
  return "Anmeldung fehlgeschlagen. Bitte erneut versuchen.";
}
