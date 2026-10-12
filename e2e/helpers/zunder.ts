/**
 * Der Eingangs-Token zwischen Zunder-Ersatz (`scripts/fake-zunder.mjs`) und Suite
 * im Rückmeldungs-Profil (IDA-214). Erfunden; `e2e/rueckmeldung.spec.ts` prüft,
 * dass er nie im ausgelieferten HTML steht. Eigene Datei, damit der Spec die
 * Playwright-Konfiguration nicht laden muss (die prüft beim Laden ihre Ports).
 */
export const E2E_ZUNDER_TOKEN = "zi_e2e_nur_fuer_den_zunder_ersatz_0123456789";
