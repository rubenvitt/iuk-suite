/**
 * DER ZUNDER-EINGANG — Adresse und Token, über die die Suite Rückmeldungen
 * einwirft (IDA-214, `docs/superpowers/specs/2026-10-12-rueckmeldung-zunder-design.md`).
 *
 * ⚠️ DER TOKEN IST EIN GEHEIMNIS UND DIESE DATEI DER EINZIGE ORT, DER IHN LIEST.
 * Gerufen wird sie von `konfiguration.ts` (nur die Frage „eingerichtet?") und
 * von der Server Action `senden.ts`. Kein Client-Modul importiert sie;
 * `einbindung.test.ts` hält das fest. Das Ergebnis von `rueckmeldeweg()` trägt
 * deshalb nur `art: "formular"` und nie den Token.
 *
 * ⚠️ NUR EIN EINGANGS-TOKEN (`zi_…`), NIE EIN VOLLER API-TOKEN (`zt_…`). Ein
 * voller Token dürfte in Zunder alles lesen und schreiben, auch außerhalb des
 * Ehrenamts; auf einem Server, den viele Menschen benutzen, ist das nicht
 * verhältnismäßig. Wer versehentlich einen `zt_`-Token einträgt, bekommt eine
 * Warnung und keinen Eingang.
 *
 * KEIN `"use client"` (Falle 6, `CLAUDE.md`).
 */

export const ZUNDER_URL_ENV = "SUITE_RUECKMELDUNG_ZUNDER_URL";
export const ZUNDER_TOKEN_ENV = "SUITE_RUECKMELDUNG_ZUNDER_TOKEN";

export interface ZunderEingang {
  /** Basis-URL ohne abschließenden Schrägstrich, z. B. `https://zunder.rubeen.dev`. */
  basis: string;
  token: string;
}

/** Nur für die e2e: ein Zunder-Ersatz auf dem eigenen Rechner darf `http` sprechen. */
const LOKALE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function istBrauchbareBasis(wert: string): boolean {
  try {
    const url = new URL(wert);
    if (url.search || url.hash) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && LOKALE_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

/** Höchstens eine Warnung je Anlass und Prozess — Begründung an `schonGewarnt` in `konfiguration.ts`. */
const gewarnt = new Set<string>();

/** Nur für Tests: die Sperre zurücknehmen. */
export function _eingangWarnsperreZuruecksetzen(): void {
  gewarnt.clear();
}

function warneEinmal(anlass: string, meldung: string, warnen: (meldung: string) => void): void {
  if (gewarnt.has(anlass)) return;
  gewarnt.add(anlass);
  warnen(meldung);
}

/**
 * Der eingerichtete Eingang oder `null`. Beide Variablen leer ist der
 * Normalfall und bleibt wortlos; eine halbe oder unbrauchbare Einrichtung
 * schreibt eine Warnung ins Serverlog, bricht den Start aber nicht ab
 * (dieselbe Abwägung wie bei `rueckmeldungUrl`).
 */
export function zunderEingang(
  env: Record<string, string | undefined> = process.env,
  warnen: (meldung: string) => void = console.warn,
): ZunderEingang | null {
  const basis = (env[ZUNDER_URL_ENV] ?? "").trim();
  const token = (env[ZUNDER_TOKEN_ENV] ?? "").trim();
  if (basis === "" && token === "") return null;

  if (basis === "" || token === "") {
    warneEinmal(
      "halb",
      `Der Zunder-Eingang bleibt aus: ${ZUNDER_URL_ENV} und ${ZUNDER_TOKEN_ENV} gehören zusammen, gesetzt ist nur eine.`,
      warnen,
    );
    return null;
  }
  if (!istBrauchbareBasis(basis)) {
    warneEinmal(
      "basis",
      `Der Zunder-Eingang bleibt aus: ${ZUNDER_URL_ENV} ist keine https-Adresse ohne Query (${basis}).`,
      warnen,
    );
    return null;
  }
  if (token.startsWith("zt_")) {
    warneEinmal(
      "voll",
      `Der Zunder-Eingang bleibt aus: ${ZUNDER_TOKEN_ENV} ist ein voller API-Token (zt_…). Nötig ist ein Eingangs-Token (zi_…).`,
      warnen,
    );
    return null;
  }
  if (!/^zi_[A-Za-z0-9_-]{16,}$/.test(token)) {
    warneEinmal(
      "token",
      `Der Zunder-Eingang bleibt aus: ${ZUNDER_TOKEN_ENV} ist kein Eingangs-Token (zi_…).`,
      warnen,
    );
    return null;
  }

  return { basis: basis.replace(/\/+$/, ""), token };
}
