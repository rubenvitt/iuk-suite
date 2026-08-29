"use client";

import Link from "next/link";
import styles from "./uav.module.css";

/**
 * DER HINWEIS AN DER STELLE, AN DER DIE ERFASSUNG STÜNDE.
 *
 * Seit dem 2026-08-29 ist der Aufgabenkatalog ohne jeden Code durchblätterbar
 * (Betreiberentscheidung: „Auf einem geteilten Tablet soll man den
 * Aufgabenkatalog auch ohne jeden Code durchblättern können — nur lesen, nichts
 * erfassen"). Vorher lag davor ein Sperrbildschirm mit dem Satz „Bitte mit
 * deinem Code anmelden."
 *
 * DER TON IST DESHALB EIN ANDERER: das anonyme Blättern ist ein VORGESEHENER
 * Zustand, kein Fehlerfall. Kein Rot, keine Warnform, kein Modal — eine ruhige
 * Fläche, die sagt, wofür der Code gebraucht wird und woher er kommt. Der
 * Unterschied ist nicht Geschmack: eine rote Fläche auf einer Datenfläche
 * verspricht „hier ist etwas schiefgelaufen" (docs/design/README.md, Falle 3),
 * und schiefgelaufen ist hier nichts.
 */
export function CodeHinweis() {
  return (
    <section className={styles["code-hinweis"]} aria-label="Durchführungen eintragen">
      <p>
        Zum Eintragen einer Durchführung brauchst du deinen persönlichen Code. Den bekommst du von
        deiner Kursleitung.
      </p>
      <Link href="/anmelden" className={styles["code-hinweis-link"]}>
        Mit Code anmelden
      </Link>
    </section>
  );
}
