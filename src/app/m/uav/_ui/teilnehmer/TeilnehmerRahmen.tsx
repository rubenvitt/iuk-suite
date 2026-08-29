import Link from "next/link";
import styles from "./uav.module.css";

/**
 * DER RAHMEN DES TEILNEHMER-ZWEIGS — schlank, eigen, OHNE `<Shell>`.
 *
 * ⛔ KEINE SUITE-HÜLLE, UND DAS IST EINE BETREIBERENTSCHEIDUNG (2026-08-29):
 * „anonymer Zugriff muss möglich sein und im Kiosk Mode ohne Shell auch für
 * Teilnehmer." Sie hebt die Entscheidung aus Aufgabe 15 auf, die hier eine
 * `MinimalShell` vorsah. Vorbilder für die Bauform stehen im Haus:
 * `radio/_ui/AusleihRahmen.tsx` und `lagerbuch/_ui/HelferRahmen.tsx` — beide
 * fahren ihren öffentlichen Zweig mit einem eigenen Rahmen.
 *
 * ⛔ AUCH NICHT `<Shell variant="kiosk">`, so nahe das Wort „Kiosk" liegt:
 * `core/shell/KioskShell.tsx` setzt `height: 100dvh; width: 100vw;
 * overflow: hidden`. Aufgabenliste, Aufgabenansicht und Erfassungsformular
 * sind länger als ein Telefonbildschirm und MÜSSEN scrollen. Dieselbe
 * Begründung steht ausgeschrieben im Kopf von `radio/_ui/AusleihRahmen.tsx`.
 *
 * ⛔ SERVER COMPONENT, KEIN "use client". Die Client-Inseln liegen darunter
 * (`TeilnehmerApp`, `LoginForm`); ein "use client" hier machte den Rahmen zur
 * Client-Grenze, ohne dass irgendetwas dadurch besser würde.
 *
 * KEIN antd und kein `@ant-design/icons` — öffentliche Ansicht
 * (`docs/design/README.md`), und damit sind die Fallen 1 und 7 strukturell
 * ausgeschlossen.
 *
 * WAS MIT DER SUITE-KOPFZEILE VERSCHWINDET, und was an seine Stelle tritt:
 *  - der Weg zurück auf die Startseite → die Wortmarke links ist ein Link auf
 *    „/", zusätzlich zum „← Übersicht" der Aufgabenansicht;
 *  - der Weg in die Verwaltung → der kleine Link rechts, siehe unten;
 *  - der Hell/Dunkel-Umschalter → er ist ersatzlos weg. Die Fläche folgt damit
 *    der Vorgabe des Cookies `iuk-theme-pref`, im Normalfall `auto` und damit
 *    dem Betriebssystem. Das ist für eine Trainingsansicht auf dem eigenen
 *    Telefon die richtige Vorgabe, und ein eigener dritter Umschalter neben den
 *    zweien der Suite wäre eine Bedienstelle mehr, die niemand sucht.
 */
export function TeilnehmerRahmen({
  darfVerwalten,
  children,
}: {
  darfVerwalten: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.rahmen}>
      {/* Reine Marke, liest nichts vor. */}
      <div className={styles["rahmen-streifen"]} aria-hidden="true" />

      <header className={styles["rahmen-kopfleiste"]}>
        <div className={styles["rahmen-kopf"]}>
          <Link href="/" className={styles["rahmen-marke"]}>
            Drohnentraining
          </Link>

          {/*
           * DIE NEBENTÜR IN DIE VERWALTUNG — klein, grau, rechts.
           *
           * Sie steht IMMER da, und `darfVerwalten` entscheidet nur über das
           * Ziel. Der Eintrag hing einmal an `canAdminModule("uav")`, und das
           * ist eine Bedingung, die am Einstieg nie wahr sein kann: wer noch
           * nicht mit dem Suite-Konto angemeldet ist, ist kein Modul-Admin,
           * sähe den Weg also nicht — und um sich anzumelden, bräuchte er ihn.
           * Mit dem Wegfall der Suite-Kopfzeile ist das kein Schönheitsfehler
           * mehr: es gäbe sonst auf diesem Host GAR KEINEN sichtbaren Weg mehr
           * in die Verwaltung.
           *
           * DIE GEGENPROBE AUS `docs/design/README.md` („führt kein Weg
           * dorthin, wo die aufrufende Person nicht hindarf?") ist damit
           * gewahrt: das Ziel ist für Abgemeldete der Suite-Login, den jede
           * Person aufrufen darf, nicht die Verwaltung. `/admin` selbst bleibt
           * hinter `requireUavAdminPage()`, das ohne Gruppe `notFound()` wirft.
           * Das unterscheidet den Fall von `radio/_ui/AusleihRahmen.tsx`, wo
           * der Link auf `/admin` ZEIGT und deshalb an ein Prädikat gehört.
           *
           * `callbackUrl=%2Fadmin`: ohne ihn landete man nach der Anmeldung
           * wieder auf der Trainingsansicht, also dort, wo man schon war.
           */}
          <Link
            href={darfVerwalten ? "/admin" : "/api/auth/signin?callbackUrl=%2Fadmin"}
            className={styles["rahmen-neben"]}
            data-rolle="uav-verwaltungslink"
          >
            Verwaltung
          </Link>
        </div>
      </header>

      {children}
    </div>
  );
}
