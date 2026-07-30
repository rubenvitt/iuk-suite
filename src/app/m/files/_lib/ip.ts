import { isIPv4, isIPv6 } from "node:net";

/**
 * Die EINE Kuerzungsstelle fuer Absenderadressen (Spec §4.5, Analyse E12
 * „(b) UND (c)"). Jede Schreibstelle einer Absenderadresse — `download_logs`
 * und `inbox_files` — geht durch diese Funktion; auch der Import in Spec 2.
 *
 * GEKUERZT, NICHT GEHASHT: ein Hash macht die Ansicht unbrauchbar, der
 * Betreiber soll „drei Downloads aus demselben Netz" erkennen koennen, und
 * dafuer genuegt das Netz. Die Notbremse haengt daran nicht — der
 * `RateLimiter` arbeitet mit der VOLLEN Adresse im Prozessspeicher und
 * schreibt sie nie (§4.5, §8.4).
 */

/** /48 = die ersten drei 16-Bit-Gruppen. */
const IPV6_PRAEFIX_GRUPPEN = 3;
const IPV6_GRUPPEN = 8;
const IPV4_MAPPED_MARKER = 0xffff;

/**
 * Kuerzt eine Absenderadresse auf ihr Netz: IPv4 auf das letzte Oktett `0`,
 * IPv6 auf das /48-Praefix. Ein Wert, der nicht vollstaendig als Adresse
 * verstanden wird, ergibt `null` — NIE der Rohwert und nie ein Teilergebnis
 * (der Rohwert kann ein ganzer `X-Forwarded-For`-Kopf sein).
 */
export function ipKuerzen(roh: string | null): string | null {
  if (roh === null) return null;
  // Getrimmt wird HIER, weil der Aufrufer `X-Forwarded-For` an "," splittet
  // und das Leerzeichen stehen laesst (`"a, b".split(",")[1]` ist `" b"`).
  // Ohne Trim waere jedes Element hinter dem ersten ein stiller Nullwert.
  const wert = roh.trim();
  if (wert === "") return null;

  if (isIPv4(wert)) return kuerzeIPv4(wert);
  if (!isIPv6(wert)) return null;

  // Der Zone-Index (`fe80::1%eth0`) benennt die lokale Schnittstelle, nicht
  // das Netz; er gehoert in keine gespeicherte Adresse. `net.isIPv6`
  // akzeptiert die Form, der eigene Zerleger versteht sie nicht — ohne dieses
  // Abschneiden waere sie stiller Datenverlust.
  const gruppen = zerlegeIPv6(wert.split("%")[0]);
  if (gruppen === null) return null;

  const eingebettet = eingebetteteIPv4(gruppen);
  if (eingebettet !== null) return kuerzeIPv4(eingebettet);

  return formatiereIPv6Netz(gruppen.slice(0, IPV6_PRAEFIX_GRUPPEN));
}

/** Erwartet eine von `isIPv4` bestaetigte Adresse. */
function kuerzeIPv4(adresse: string): string {
  const oktette = adresse.split(".");
  return `${oktette[0]}.${oktette[1]}.${oktette[2]}.0`;
}

/**
 * Ein Dual-Stack-Socket meldet eine IPv4-Herkunft als `::ffff:1.2.3.4`.
 * Bliebe sie IPv6, zaehlte dasselbe Netz je nach Socket-Familie zweimal und
 * die Spalte verlöre genau ihren Zweck. Deshalb ausgepackt und als IPv4
 * gekuerzt — die Hex-Schreibweise `::ffff:0102:0304` laeuft durch denselben
 * Zweig, weil hier auf GRUPPEN geprueft wird, nicht auf Text.
 */
function eingebetteteIPv4(gruppen: number[]): string | null {
  const istMapped =
    gruppen.slice(0, 5).every((g) => g === 0) && gruppen[5] === IPV4_MAPPED_MARKER;
  if (!istMapped) return null;
  const [a, b] = [gruppen[6] >>> 8, gruppen[6] & 0xff];
  const [c, d] = [gruppen[7] >>> 8, gruppen[7] & 0xff];
  return `${a}.${b}.${c}.${d}`;
}

/**
 * Zerlegt eine von `isIPv6` bestaetigte Adresse in genau acht 16-Bit-Gruppen.
 * Zweite Pruefung mit Absicht: `isIPv6` ist die Vorpruefung, diese Funktion
 * entscheidet — und sie liefert `null` statt eines Teilergebnisses, sobald
 * etwas nicht vollstaendig verstanden ist.
 */
function zerlegeIPv6(text: string): number[] | null {
  const teile = text.split("::");
  if (teile.length > 2) return null;

  const links = gruppenAus(teile[0]);
  if (links === null) return null;
  if (teile.length === 1) return links.length === IPV6_GRUPPEN ? links : null;

  const rechts = gruppenAus(teile[1]);
  if (rechts === null) return null;
  const fehlend = IPV6_GRUPPEN - links.length - rechts.length;
  // `::` steht fuer mindestens EINE Nullgruppe (`1:2:3:4:5:6:7::`).
  if (fehlend < 1) return null;
  return [...links, ...new Array<number>(fehlend).fill(0), ...rechts];
}

/** `null`, sobald ein Abschnitt keine Hex-Gruppe und kein IPv4-Schwanz ist. */
function gruppenAus(abschnitt: string): number[] | null {
  if (abschnitt === "") return [];
  const gruppen: number[] = [];
  for (const teil of abschnitt.split(":")) {
    // Ein eingebetteter IPv4-Schwanz (`64:ff9b::1.2.3.4`) sind zwei Gruppen.
    if (teil.includes(".")) {
      if (!isIPv4(teil)) return null;
      const [a, b, c, d] = teil.split(".").map(Number);
      gruppen.push((a << 8) | b, (c << 8) | d);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(teil)) return null;
    gruppen.push(Number.parseInt(teil, 16));
  }
  return gruppen;
}

/**
 * Schreibt das /48-Netz kanonisch: nachlaufende Nullgruppen des Praefixes
 * verschmelzen mit den fuenf Nullgruppen dahinter zu `::`. Sonst gaebe es
 * zwei Schreibweisen fuer dasselbe Netz (`0:0:0::` neben `::`), und die
 * Funktion waere auf ihrem eigenen Ergebnis nicht mehr idempotent.
 */
function formatiereIPv6Netz(praefix: number[]): string {
  const gruppen = [...praefix];
  while (gruppen.length > 0 && gruppen[gruppen.length - 1] === 0) gruppen.pop();
  return `${gruppen.map((g) => g.toString(16)).join(":")}::`;
}
