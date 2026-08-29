import Link from "next/link";
import { LoginForm } from "../_ui/teilnehmer/LoginForm";
import styles from "../_ui/teilnehmer/uav.module.css";

/**
 * Teilnehmer-Login (`/login`, optional `?code=` als Magic-Link) — Port aus
 * uav-praxis/src/pages/LoginPage.tsx. `/api/auth/signin` (Passthrough,
 * Auth.js) ist die Verwaltungs-Anmeldung; `/login` ist auf diesem Host die
 * Brücke für den Teilnehmer-Code, NICHT die Suite-weite Login-Route.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <main className={`${styles.app} ${styles.login}`}>
      <header className={styles["login-kopf"]}>
        <p className={styles.eyebrow}>Training · BOS</p>
        <h1>Anmelden</h1>
      </header>

      <p className={styles["login-hinweis"]}>
        Bitte gib deinen persönlichen Code ein. Du hast ihn von deiner Kursleitung erhalten.
      </p>

      <LoginForm code={typeof code === "string" ? code : undefined} />

      <Link href="/api/auth/signin?callbackUrl=%2Fadmin" className={styles["verwaltung-link"]}>
        Verwaltung (Anmeldung mit Suite-Konto)
      </Link>
    </main>
  );
}
