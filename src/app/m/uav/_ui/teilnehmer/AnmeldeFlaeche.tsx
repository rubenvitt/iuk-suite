import { LoginForm } from "./LoginForm";
import styles from "./uav.module.css";

/**
 * DIE ANMELDEFLÄCHE DER TEILNEHMENDEN — eine Fläche, ZWEI Adressen.
 *
 * `/login?code=…` ist der Magic-Link: die Adresse steht auf verteilten Zetteln,
 * `_lib/magicLink.ts` baut sie, und die Verwaltung zeigt sie in jeder
 * Teilnehmerzeile. Sie bleibt unverändert (`(teilnehmer)/login/page.tsx`).
 *
 * `/anmelden` ist der Weg für alle, die ihren Code haben, aber nicht mehr den
 * Link (`(teilnehmer)/anmelden/page.tsx`). Ihn gibt es, weil `/login` OHNE
 * `code` gar nicht in dieses Modul führt: `core/routing.ts` schreibt die
 * Adresse nur mit nichtleerem `code`-Parameter hierher um, sonst ist sie der
 * Suite-Login (Pocket ID). Wer also „Bitte mit deinem Code anmelden" las und
 * auf „Anmelden" tippte, landete bei „Mit Pocket ID anmelden" — einem
 * Anmeldeweg, den eine trainierende Person nicht hat. Die zweite Adresse
 * repariert das, ohne eine ausgegebene URL zu entwerten und ohne `routing.ts`
 * anzufassen.
 *
 * EINE Komponente für beide, weil beide dasselbe zeigen. Zwei Abschriften
 * liefen beim ersten Wort auseinander, das jemand ändert.
 *
 * DER WEG IN DIE VERWALTUNG STEHT HIER NICHT MEHR. Er lag bis 2026-08-29 als
 * kleiner grauer Link unter dem Formular — und steht seither in der Kopfleiste
 * des Rahmens (`_ui/teilnehmer/TeilnehmerRahmen.tsx`), also auf JEDER Fläche
 * dieses Zweigs statt nur auf dieser einen. Zweimal dasselbe Ziel auf einem
 * Bildschirm liest sich als zwei verschiedene Wege.
 *
 * Server Component: sie rendert nur Markup und die Client-Insel `LoginForm`.
 */
export function AnmeldeFlaeche({ code }: { code?: string }) {
  return (
    <main className={`${styles.app} ${styles.login}`}>
      <header className={styles["login-kopf"]}>
        <p className={styles.eyebrow}>Training · BOS</p>
        <h1>Anmelden</h1>
      </header>

      <p className={styles["login-hinweis"]}>
        Bitte gib deinen persönlichen Code ein. Du hast ihn von deiner Kursleitung erhalten.
      </p>

      <LoginForm code={code} />
    </main>
  );
}
