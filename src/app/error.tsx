"use client";
import { useSyncExternalStore } from "react";
import { Button } from "antd";
import { Ruhezustand } from "@/core/ruhe";
import styles from "./not-found.module.css";

/**
 * DIE FEHLERGRENZE DER SUITE (IDA-392) — an der Wurzel, also für jedes Modul ohne eigene.
 *
 * Vorher fing nur das Lagerbuch Fehler (`m/lagerbuch/error.tsx`, es behält seine); überall sonst stand bei
 * einem Serverfehler die eingebaute englische Seite von Next ohne Weg zurück. Sie liegt unter dem
 * Root-Layout: Theme (`data-theme`) und `AntdProvider` gelten, die Modul-Shell nicht — wie bei 404 und 403,
 * deren Form sie übernimmt (Ruhezustand, Satz als Überschrift); ohne Ziffer, denn nicht jeder Fehler ist ein 500.
 *
 * Zwei Wege statt einem: „Nochmal versuchen" (`retry`, lädt das Segment neu) und „Zum Portal". Nicht `/`:
 * auf einem Modul-Host wäre das die Modulwurzel, und die kann genau die Seite sein, die gerade wirft.
 * Die Portal-Adresse stempelt das Root-Layout als `data-portal` an `<html>` (`AUTH_URL` sieht ein
 * Client-Modul nicht); fehlt sie, bleibt `/`.
 *
 * KEIN TEXT AUS `error`: in Produktion trägt er für Serverfehler nur einen englischen Platzhalter
 * (siehe `m/lagerbuch/error.tsx`).
 */
const keinAbo = () => () => {};
const portalAusDokument = () => document.documentElement.dataset.portal || "/";
const portalAufDemServer = () => "/";

export default function Fehlergrenze({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const portal = useSyncExternalStore(keinAbo, portalAusDokument, portalAufDemServer);
  return (
    <main className={styles.seite} data-testid="fehlergrenze">
      <Ruhezustand
        figur="stoerung"
        als="h1"
        mittig
        titel="Da ist etwas schiefgegangen."
        aktion={
          <div className={styles.aktionen}>
            {/* Kein `size` (Falle 4). */}
            <Button type="primary" onClick={() => retry()} data-testid="fehler-erneut">
              Nochmal versuchen
            </Button>
            <Button href={portal} data-testid="fehler-portal">
              Zum Portal
            </Button>
          </div>
        }
      />
    </main>
  );
}
