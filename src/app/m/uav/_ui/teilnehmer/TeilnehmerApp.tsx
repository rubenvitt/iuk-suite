"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Identity } from "../../_lib/sitzung";
import { api } from "../offline/client";
import { syncEngine } from "../offline/syncEngine";
import { useFortschritt } from "./useFortschritt";
import { useKatalog } from "./useKatalog";
import { Dashboard } from "./Dashboard";
import { TaskDetail } from "./TaskDetail";
import { SyncStatus } from "./SyncStatus";
import styles from "./uav.module.css";

const IDENTITY_KEY = "uav-identity";

/**
 * Zuletzt per `api.me()` bestätigte Identität, sitzungsweit gecacht — NICHT
 * für Zugriffsentscheidungen (die trifft ausschließlich der Server), sondern
 * nur damit die Insel bei einem Offline-Reload im selben Tab weiß, ob sie den
 * „Bitte anmelden"-Hinweis zeigen muss oder normal weiterlaufen darf.
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
 * Identität: `api.me()` statt `AuthContext`. Ein Fehlschlag (offline) darf den
 * Hinweis „Bitte mit deinem Code anmelden“ NIEMALS auslösen — die Insel muss
 * offline stehen. Deshalb: solange kein erfolgreicher `api.me()`-Aufruf (in
 * dieser Tab-Sitzung oder aus `sessionStorage`) eine Nicht-Teilnehmer-Identität
 * bestätigt hat, läuft die App normal weiter; erst eine BESTÄTIGTE
 * `anon`/`admin`-Antwort zeigt den Hinweis.
 */
export function TeilnehmerApp({ ansicht }: { ansicht: "start" | "aufgabe" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aktiv = ansicht === "aufgabe" ? searchParams.get("id") : null;

  const [identity, setIdentity] = useState<Identity | null>(() => identitaetAusCache());

  useEffect(() => {
    let abgebrochen = false;
    api
      .me()
      .then((id) => {
        if (abgebrochen) return;
        setIdentity(id);
        identitaetCachen(id);
      })
      .catch(() => {
        // Offline/Netzfehler: vorhandenen (gecachten) Stand nicht verwerfen.
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  // Nur für eine BESTÄTIGTE Teilnehmer-Identität starten: sonst würde ein
  // 401 von `/api/sync` (anon/admin) den Status auf „fehler" setzen, und der
  // SyncStatus-Chip zeigte „Sync fehlgeschlagen" ausgerechnet auf dem
  // Anmelde-Hinweis-Bildschirm, wo nie etwas synchronisiert werden soll.
  useEffect(() => {
    if (identity?.kind !== "participant") return;
    return syncEngine.start();
  }, [identity]);

  const katalog = useKatalog();
  const {
    speicherfehler,
    fortschritt,
    durchfuehrungHinzufuegen,
    durchfuehrungEntfernen,
    zielanzahlSetzen,
    nichtAnwendbarSetzen,
  } = useFortschritt(katalog, identity);

  const heute = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const aufgabe = aktiv ? katalog.find((a) => a.id === aktiv) ?? null : null;
  const aufgabeFortschritt = aufgabe ? fortschritt[aufgabe.id] : undefined;

  // Unbekannte Aufgaben-ID in der URL (z. B. veralteter Deep-Link) → zurück zum
  // Dashboard. Erst wenn der Katalog tatsächlich geladen ist (sonst würde ein
  // leerer Erst-Render fälschlich jeden Deep-Link wegleiten).
  useEffect(() => {
    if (aktiv && !aufgabe && katalog.length > 0) router.replace("/");
  }, [aktiv, aufgabe, katalog.length, router]);

  const zeigeHinweis = identity !== null && identity.kind !== "participant";

  return (
    <main className={styles.app}>
      {zeigeHinweis ? (
        /*
         * DIE ERSTE FLÄCHE, DIE EINE TRAINIERENDE PERSON SIEHT — und bis
         * hierher stand darauf ein Satz und ein Knopf.
         *
         * Sie sagte weder, was diese App ist, noch woher man einen Code
         * bekommt; und der Knopf führte auf `/login`, wo ohne `code`-Parameter
         * der Suite-Login mit Pocket ID steht statt eines Code-Feldes
         * (`core/routing.ts`). Deshalb: Name, ein Satz zur Sache, die Herkunft
         * des Codes — und der Knopf auf `/anmelden`, die code-lose Adresse
         * derselben Anmeldefläche (`_ui/teilnehmer/AnmeldeFlaeche.tsx`).
         *
         * Der Weg in die Verwaltung steht NICHT hier, sondern klein und grau in
         * der Kopfleiste des Rahmens (`_ui/teilnehmer/TeilnehmerRahmen.tsx`) —
         * dort trägt ihn jede Fläche dieses Zweigs, und er steht auf jedem
         * Bildschirm an derselben Stelle.
         */
        <div className={styles["anmelde-hinweis"]}>
          <p className={styles.eyebrow}>Training · BOS</p>
          <h1 className={styles["kopf-titel"]}>Drohnen-Trainingsbegleiter</h1>
          <p>
            Dein Trainingsplan mit allen Übungen, Durchführungen und Nachweisen — auch ohne Netz.
            Zum Öffnen brauchst du deinen persönlichen Code; den bekommst du von deiner
            Kursleitung.
          </p>
          <Link href="/anmelden" className={styles["btn-primaer"]}>
            Mit Code anmelden
          </Link>
        </div>
      ) : (
        <>
          {speicherfehler && (
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
              aufgabe={aufgabe}
              fortschritt={aufgabeFortschritt}
              heute={heute}
              onAdd={(e) => durchfuehrungHinzufuegen(aufgabe.id, e)}
              onRemove={(eid) => durchfuehrungEntfernen(aufgabe.id, eid)}
              onZielanzahl={(z) => zielanzahlSetzen(aufgabe.id, z)}
              onNichtAnwendbar={(w) => nichtAnwendbarSetzen(aufgabe.id, w)}
            />
          ) : (
            <Dashboard katalog={katalog} fortschritt={fortschritt} />
          )}
        </>
      )}

      <SyncStatus />
    </main>
  );
}

export default TeilnehmerApp;
