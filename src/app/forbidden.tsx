import { connection } from "next/server";
import { Button } from "antd";
import { Ruhezustand } from "@/core/ruhe";
import styles from "./not-found.module.css";

/**
 * „KEIN ZUGRIFF" (HTTP 403) — die Schwester der 404-Seite, ohne Shell und mit demselben Grund.
 *
 * Erreicht wird sie, wenn die Middleware den Modulzugang verweigert (`canAccess`, `src/proxy.ts`).
 * Der Weg zurueck fuehrt ins PORTAL auf dem Suite-Host (`AUTH_URL`), nicht nach `/`: auf einem
 * Modul-Host waere `/` genau das Modul, das gerade verweigert wurde.
 *
 * `connection()`: `AUTH_URL` wird je Anfrage gelesen, nicht beim Bau eingebacken (vgl. Falle 21).
 */
export default async function Forbidden() {
  await connection();
  const portal = process.env.AUTH_URL ? new URL("/", process.env.AUTH_URL).toString() : "/";
  return (
    <main className={styles.seite}>
      <Ruhezustand
        figur="zugriff"
        als="h1"
        mittig
        titel="Kein Zugriff"
        data-testid="kein-zugriff"
        aktion={
          <Button type="primary" href={portal}>
            Zum Portal
          </Button>
        }
      />
      <p className={styles.ziffer} aria-hidden="true">
        403
      </p>
    </main>
  );
}
