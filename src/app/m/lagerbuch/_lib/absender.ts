/**
 * Der Buendelungsschluessel des Gate-Fehlerzaehlers. NICHT „die Client-IP" —
 * der Name sagt bewusst nicht mehr, als der Wert traegt.
 *
 * WARUM `x-forwarded-for` HIER GAR NICHT VORKOMMT — in keiner Richtung:
 * der Suite-Container ist auf dem Server direkt erreichbar (Betreiber,
 * 03.08.2026). Wer ihn direkt erreicht, setzt den Header vollstaendig selbst.
 * Den ERSTEN Eintrag zu nehmen (`core/ratelimit.ts:60`) oder den LETZTEN
 * (`lagerbuch/src/lib/auth/rateLimit.ts:29-35`) macht dabei keinen Unterschied:
 * beide ergeben einen frischen Eimer je Versuch. Beide Begruendungen sind fuer
 * ihre jeweilige Topologie richtig und fuer diese hier falsch.
 *
 * `cf-connecting-ip` setzt Cloudflare. Er ist damit fuer jede Anfrage DURCH die
 * Kette der echte Absender — und fuer eine Anfrage am Rand vorbei ebenso
 * faelschbar wie alles andere. Er ist also eine Buendelung, kein Beweis; in
 * `files` heisst die entsprechende Spalte aus demselben Grund
 * `client_ip_unbestaetigt` (`core/ratelimit.ts:52-55`).
 *
 * OHNE JEDEN KOPF ein KONSTANTER Wert: alle kopflosen Aufrufer teilen sich EINEN
 * Eimer. Das ist der sichere Ausfallmodus — er kann nur zu STRENG sein, nie zu
 * lasch. Fuenf FEHLVERSUCHE pro Minute fuer alle direkt Anfragenden zusammen;
 * ein richtiger Code funktioniert dabei immer (§3.5.3).
 *
 * Der Praefix `cf:` trennt die Namensraeume: ohne ihn koennte ein gefaelschter
 * `cf-connecting-ip: direkt` den Sammel-Eimer der kopflosen Aufrufer mitbenutzen
 * oder umgekehrt verstopfen.
 *
 * AUSGESPROCHEN, STATT WEGGESCHRIEBEN: dieser Schluessel bleibt umgehbar. Wer den
 * Container direkt erreicht, faelscht `cf-connecting-ip` und rotiert ihn. Der
 * Per-Absender-Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und
 * ungezieltes Klopfen — NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden
 * modulweiten Zaehler in `gateSchranke.ts`, weil ihr Schluessel der einzige ist,
 * den niemand rotieren kann. Die Restluecke schliesst eine NETZENTSCHEIDUNG, kein
 * Code: kein Host-Port-Mapping am Suite-Dienst, Traefik-Entrypoint nur aus den
 * Cloudflare-Bereichen erreichbar (Runbook-Schritt mit Gegenprobe, §3.5.2).
 *
 * `Headers` genuegt als Parametertyp, obwohl `await headers()` Nexts
 * `ReadonlyHeaders` liefert: das ist zuweisbar. Die Signatur NIMMT die Header,
 * statt sie selbst zu holen — nur so ist sie aus einem Route Handler benutzbar
 * und ohne Next-Kontext testbar.
 */
export function absenderAus(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  return cf ? `cf:${cf}` : "direkt";
}
