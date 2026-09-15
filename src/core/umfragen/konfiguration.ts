/**
 * DIE EINBINDUNG DER UMFRAGEN — ihre zwei Werte, und ihre Vorgabe ist AUS.
 *
 * Die Suite spielt Umfragen über ein selbst gehostetes Formbricks aus. Diese
 * Datei beantwortet die eine Frage, an der alles hängt: ist die Einbindung
 * überhaupt eingerichtet? Ohne beide Werte lautet die Antwort `null`, und die
 * Arbeitsfläche rendert dann kein Skript — die Suite verhält sich wie vorher.
 *
 * ⚠️ KEIN `"use client"` IN DIESER DATEI, und das ist keine Formsache (Falle 6,
 * `CLAUDE.md`). `FullShell` ist eine Server Component und liest `umfragen-
 * Konfiguration()` beim Rendern. Trüge dieses Modul `"use client"`, bekäme die
 * Server Component eine Client-Referenz statt der Werte zurück — HTTP 500 für
 * jede Arbeitsfläche der Suite. `typecheck` und `build` blieben grün, und
 * **Vitest könnte es strukturell nicht finden** (dort ist `"use client"` ein
 * wirkungsloser String). `einbindung.test.ts` hält die Abwesenheit deshalb als
 * Quelltext-Zusicherung fest.
 *
 * ⚠️ DIE WERTE SIND SERVERSEITIG, NICHT `NEXT_PUBLIC_*`. Sie erreichen den
 * Browser als Props der Client-Insel, nicht über das Bundle. Das ist der
 * Unterschied, der „nicht gesetzt = aus" überhaupt erst prüfbar macht: ein
 * `NEXT_PUBLIC_`-Wert wird zur Bauzeit eingebacken, und das Abschalten in E2E
 * (`playwright.config.ts`) erreichte den gebauten Stand nicht mehr.
 */

export type UmfragenKonfiguration = {
  /** Adresse der Formbricks-Instanz, ohne Schrägstrich am Ende. */
  appUrl: string;
  workspaceId: string;
};

export const UMFRAGEN_APP_URL_ENV = "SUITE_FORMBRICKS_APP_URL";
export const UMFRAGEN_WORKSPACE_ENV = "SUITE_FORMBRICKS_WORKSPACE_ID";

/**
 * Nur `http`/`https`. Der Wert landet als `src` eines `<script>`, und das ist
 * die empfindlichste Senke, die eine Umgebungsvariable in dieser Suite hat.
 * Ein Tippfehler wie `bricks.iuk-ue.de` (ohne Schema) gäbe eine relative
 * Adresse auf dem eigenen Host — das Skript käme nie an, und niemand wüsste,
 * warum.
 */
function istBrauchbareAdresse(wert: string): boolean {
  try {
    const { protocol } = new URL(wert);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * ⚠️ HÖCHSTENS EINE WARNUNG JE PROZESS, und das ist kein Feinschliff.
 *
 * `umfragenKonfiguration()` läuft in `FullShell`, und `FullShell` rendert JE
 * ANFRAGE. Ohne diese Sperre schriebe ein Tippfehler in der `.env` nicht „eine
 * Warnung ins Serverlog", sondern eine Zeile pro Seitenaufruf jeder
 * Arbeitsfläche — und ersäufte damit genau das Log, das er informieren soll.
 *
 * Dieselbe Bauform wie `eingerichtet` in `Umfragen.tsx`: modulweit, nicht je
 * Aufruf. Der Zustand, auf den sie sich bezieht (die Umgebung des Prozesses),
 * lebt genauso lange.
 */
let schonGewarnt = false;

/** Nur für Tests: die Sperre zurücknehmen. */
export function _warnsperreZuruecksetzen(): void {
  schonGewarnt = false;
}

/**
 * ⚠️ EIN GESETZTER, ABER UNBRAUCHBARER WERT BRICHT DEN START NICHT AB — anders
 * als bei den Zugriffsgruppen (`validateGroupConfig`), und der Unterschied ist
 * die Tragweite: eine falsche Gruppe ist ein Sicherheitsfehler, eine falsche
 * Umfragen-Adresse kostet eine Umfrage. Die ganze Suite dafür anzuhalten wäre
 * nicht verhältnismäßig.
 *
 * Still ist es trotzdem nicht: der Fall schreibt eine Warnung ins Serverlog.
 * Das ist der Unterschied zwischen „aus, weil nicht eingerichtet" und „aus,
 * obwohl jemand es einrichten wollte" — und nur der zweite Fall ist ein Fehler.
 */
export function umfragenKonfiguration(
  // Wie in `hosts.ts`/`registry.ts`: nur „String rein, String oder undefined
  // raus" — bewusst nicht `NodeJS.ProcessEnv`, den Next mit einem
  // schreibgeschützten `NODE_ENV` augmentiert (ein Testobjekt ohne dieses Feld
  // wäre sonst nicht zuweisbar).
  env: Record<string, string | undefined> = process.env,
  warnen: (meldung: string) => void = console.warn,
): UmfragenKonfiguration | null {
  const einmalWarnen = (meldung: string) => {
    if (schonGewarnt) return;
    schonGewarnt = true;
    warnen(meldung);
  };

  const appUrl = (env[UMFRAGEN_APP_URL_ENV] ?? "").trim();
  const workspaceId = (env[UMFRAGEN_WORKSPACE_ENV] ?? "").trim();

  // Beide leer: nicht eingerichtet. Der Normalfall, und kein Wort darüber.
  if (appUrl === "" && workspaceId === "") return null;

  if (appUrl === "" || workspaceId === "") {
    einmalWarnen(
      `Umfragen bleiben aus: ${UMFRAGEN_APP_URL_ENV} und ${UMFRAGEN_WORKSPACE_ENV} ` +
        `gehören zusammen, gesetzt ist nur ${appUrl === "" ? UMFRAGEN_WORKSPACE_ENV : UMFRAGEN_APP_URL_ENV}.`,
    );
    return null;
  }

  if (!istBrauchbareAdresse(appUrl)) {
    einmalWarnen(
      `Umfragen bleiben aus: ${UMFRAGEN_APP_URL_ENV} ist keine http(s)-Adresse (${appUrl}).`,
    );
    return null;
  }

  // Der Schrägstrich am Ende fällt weg, weil die Insel `${appUrl}/js/…`
  // zusammensetzt — sonst stünde dort ein doppelter.
  return { appUrl: appUrl.replace(/\/+$/, ""), workspaceId };
}
