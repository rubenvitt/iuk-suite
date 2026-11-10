"use client";

import { useState } from "react";
import { api } from "../offline/client";
import { localStore } from "../offline/localStore";
import styles from "./uav.module.css";

/**
 * „Abmelden" in der Kopfleiste (IDA-389). Auf einem Übungsgerät, das
 * herumgereicht wird, trug sonst die nächste Person unter fremdem Namen ein.
 *
 * Wie nach dem Login (`LoginForm`): erst den Konto-Zeiger und den
 * Identitäts-Cache verwerfen, dann ein VOLLER Reload — die Insel startet so
 * anonym und zeigt nichts mehr aus dem Speicher der abgemeldeten Person. Der
 * Fortschritt bleibt unter deren Besitzer liegen, auch eine noch nicht
 * gesendete Queue: sie geht beim nächsten Login derselben Person hinaus.
 */
export function AbmeldenKnopf() {
  const [laeuft, setLaeuft] = useState(false);

  async function abmelden() {
    setLaeuft(true);
    try {
      await api.logout();
    } catch {
      // Offline: das Cookie bleibt, der Server meldet beim nächsten Laden
      // wieder dieselbe Person. Nichts verwerfen, nichts vortäuschen.
      setLaeuft(false);
      return;
    }
    localStore.kontoWechselVorbereiten();
    window.location.replace("/");
  }

  return (
    <button
      type="button"
      className={styles["rahmen-abmelden"]}
      onClick={() => void abmelden()}
      disabled={laeuft}
      data-rolle="uav-abmelden"
    >
      Abmelden
    </button>
  );
}
