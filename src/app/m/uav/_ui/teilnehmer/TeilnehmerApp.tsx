"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Identity } from "../../_lib/sitzung";
import { api } from "../offline/client";
import { IDENTITY_SESSION_KEY, besitzerFuer, localStore } from "../offline/localStore";
import { syncEngine } from "../offline/syncEngine";
import { useFortschritt } from "./useFortschritt";
import { useKatalog } from "./useKatalog";
import { Dashboard } from "./Dashboard";
import { TaskDetail } from "./TaskDetail";
import { SyncStatus } from "./SyncStatus";
import styles from "./uav.module.css";

const IDENTITY_KEY = IDENTITY_SESSION_KEY;

/**
 * Zuletzt per `api.me()` bestätigte Identität, sitzungsweit gecacht — NICHT
 * für Zugriffsentscheidungen (die trifft ausschließlich der Server), sondern
 * nur damit die Insel bei einem Offline-Reload im selben Tab weiß, ob sie die
 * Erfassung zeigen darf oder auf Nur-Lesen bleibt.
 */
function identitaetAusCache(): Identity | null {
  try {
    const roh = sessionStorage.getItem(IDENTITY_KEY);
    return roh ? (JSON.parse(roh) as Identity) : null;
  } catch {
    return null;
  }
}

function identitaetCachen(identity: Identity): void {
  try {
    sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Storage nicht verfügbar — die Insel läuft ohne Cache weiter.
  }
}

/**
 * Client-Insel der Teilnehmer-Ansicht — Port aus
 * uav-praxis/src/pages/TeilnehmerApp.tsx. Liest die Aufgaben-ID aus der
 * äußeren Route (`?id=`, `ansicht="aufgabe"`) statt aus einem Router-Param.
 *
 * Identität: `api.me()` statt `AuthContext`. Ein Fehlschlag (offline) darf die
 * Erfassung NIEMALS abschalten — die Insel muss offline stehen. Deshalb:
 * solange kein erfolgreicher `api.me()`-Aufruf (in dieser Tab-Sitzung oder aus
 * `sessionStorage`) eine Nicht-Teilnehmer-Identität bestätigt hat, läuft die
 * App vollständig weiter; erst eine BESTÄTIGTE `anon`/`admin`-Antwort schaltet
 * auf Nur-Lesen.
 *
 * ⛔ HIER STAND EIN SPERRBILDSCHIRM („Bitte mit deinem Code anmelden."), und er
 * ist seit dem 2026-08-29 weg — Betreiberentscheidung: „Auf einem geteilten
 * Tablet soll man den Aufgabenkatalog auch ohne jeden Code durchblättern können
 * — nur lesen, nichts erfassen. Zum Eintragen einer Durchführung braucht es
 * dann weiterhin einen Code."
 *
 * WAS `nurLesen` VERBIRGT, ist alles Persönliche: Fortschrittskarte, Zähler je
 * Aufgabe, Zielanzahl, „nicht anwendbar", die Liste der Durchführungen und das
 * Erfassungsformular. Das ist nicht nur Ton, sondern nötig: auf einem GETEILTEN
 * Tablet steht im `localStorage` noch der Fortschritt der zuletzt angemeldeten
 * Person (`useFortschritt`) — ohne diese Weiche zeigte die anonyme Ansicht
 * deren Zähler.
 *
 * WESSEN Speicher gezeigt und synchronisiert wird, entscheidet seit DRK-286 der
 * Besitzer (`besitzerFuer`): das bestätigte Teilnehmerkonto, offline das zuletzt
 * bestätigte Konto dieses Browsers, sonst die anonyme Erfassung. Vorher lag der
 * Fortschritt geräteweit, und nach dem Login von B sah B den Stand von A.
 */
export function TeilnehmerApp({ ansicht }: { ansicht: "start" | "aufgabe" }) {
  if (!useHydriert()) return <main className={styles.app} aria-busy="true" />;
  return <TeilnehmerInsel ansicht={ansicht} />;
}

const nieAendern = () => () => {};

/**
 * `false` im Server-HTML und während der Hydration, danach `true` (DRK-446).
 * Die Insel liest Katalog, Fortschritt und Identität schon im ERSTEN Render aus
 * dem Browser-Speicher, den der Server nicht hat — ein direkter Aufruf lieferte
 * so zwei verschiedene Bäume, und React verwarf das Server-HTML („Hydration
 * failed"). Deshalb rendert der Teil bewusst nur im Client; bei einer
 * Client-Navigation ist der Wert sofort `true`, dort blitzt nichts leer auf.
 * Geprüft über den echten Hydrationsweg in `hydration.test.tsx`.
 */
function useHydriert(): boolean {
  return useSyncExternalStore(nieAendern, () => true, () => false);
}

function TeilnehmerInsel({ ansicht }: { ansicht: "start" | "aufgabe" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aktiv = ansicht === "aufgabe" ? searchParams.get("id") : null;

  const [identity, setIdentity] = useState<Identity | null>(() => identitaetAusCache());
  // Erhöht, wenn der Server meldet, dass das Cookie inzwischen einem anderen
  // Konto gehört (`konto_gewechselt`) — dann wird `me()` erneut gefragt.
  const [meRunde, setMeRunde] = useState(0);

  useEffect(() => {
    let abgebrochen = false;
    api
      .me()
      .then((id) => {
        if (abgebrochen) return;
        // ZUERST binden (Konto merken, anonyme Erfassung und Alt-Keys
        // übergeben), DANN die Identität setzen — der erste Render mit dem
        // neuen Besitzer liest so bereits den übergebenen Stand.
        localStore.kontoBestaetigt(id);
        identitaetCachen(id);
        setIdentity(id);
      })
      .catch(() => {
        // Offline/Netzfehler: vorhandenen (gecachten) Stand nicht verwerfen.
      });
    return () => {
      abgebrochen = true;
    };
  }, [meRunde]);

  // Nur für eine BESTÄTIGTE Teilnehmer-Identität starten: sonst würde ein
  // 401 von `/api/sync` (anon/admin) den Status auf „fehler" setzen, und der
  // SyncStatus-Chip zeigte „Sync fehlgeschlagen" ausgerechnet auf dem
  // Anmelde-Hinweis-Bildschirm, wo nie etwas synchronisiert werden soll.
  useEffect(() => {
    if (identity?.kind !== "participant") return;
    return syncEngine.start(identity.id, () => setMeRunde((n) => n + 1));
  }, [identity]);

  const besitzer = besitzerFuer(identity);
  const katalog = useKatalog();
  const {
    speicherfehler,
    fortschritt,
    durchfuehrungHinzufuegen,
    durchfuehrungEntfernen,
    zielanzahlSetzen,
    nichtAnwendbarSetzen,
  } = useFortschritt(katalog, besitzer);

  const heute = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const aufgabe = aktiv ? katalog.find((a) => a.id === aktiv) ?? null : null;
  const aufgabeFortschritt = aufgabe ? fortschritt[aufgabe.id] : undefined;

  // Unbekannte Aufgaben-ID in der URL (z. B. veralteter Deep-Link) → zurück zum
  // Dashboard. Erst wenn der Katalog tatsächlich geladen ist (sonst würde ein
  // leerer Erst-Render fälschlich jeden Deep-Link wegleiten).
  useEffect(() => {
    if (aktiv && !aufgabe && katalog.length > 0) router.replace("/");
  }, [aktiv, aufgabe, katalog.length, router]);

  // Erst eine BESTÄTIGTE Nicht-Teilnehmer-Identität schaltet auf Nur-Lesen —
  // `null` (noch unbestätigt, z. B. offline) NICHT: sonst verlöre eine
  // Teilnehmerin im Funkloch beim ersten Laden ihr Erfassungsformular.
  const nurLesen = identity !== null && identity.kind !== "participant";

  return (
    <main className={styles.app}>
      {speicherfehler && !nurLesen && (
        <div className={styles["speicher-warnung"]} role="alert">
          <strong className={styles["warnung-titel"]}>Fortschritt nicht gespeichert</strong>
          <p>
            Der Fortschritt kann nicht gespeichert werden (Speicher voll oder nicht verfügbar).
            Eingaben gehen beim Schließen der App verloren.
          </p>
        </div>
      )}

      {aufgabe && aufgabeFortschritt ? (
        <TaskDetail
          // Neu mounten bei Besitzerwechsel: das Formular hält die Namen der
          // letzten Eingabe im eigenen State (DRK-286).
          key={besitzer}
          besitzer={besitzer}
          aufgabe={aufgabe}
          fortschritt={aufgabeFortschritt}
          heute={heute}
          nurLesen={nurLesen}
          onAdd={(e) => durchfuehrungHinzufuegen(aufgabe.id, e)}
          onRemove={(eid) => durchfuehrungEntfernen(aufgabe.id, eid)}
          onZielanzahl={(z) => zielanzahlSetzen(aufgabe.id, z)}
          onNichtAnwendbar={(w) => nichtAnwendbarSetzen(aufgabe.id, w)}
        />
      ) : (
        <Dashboard katalog={katalog} fortschritt={fortschritt} nurLesen={nurLesen} />
      )}

      <SyncStatus />
    </main>
  );
}

export default TeilnehmerApp;
