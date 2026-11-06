/**
 * EINE UNTERLAGE VON EINER ADRESSE HOLEN (MCP, IDA-367): ein Assistent findet das Handbuch beim Hersteller und
 * nennt die Adresse; die Suite lädt es selbst. Damit daraus kein Weg ins eigene Netz wird (SSRF), gilt:
 *
 * - nur `http`/`https` auf den üblichen Ports, keine Anmeldedaten in der Adresse;
 * - jede aufgelöste Adresse muss öffentlich sein, geprüft in `lookup` — also bei genau der Verbindung, die
 *   aufgebaut wird, auch nach einer Weiterleitung (kein Umweg über DNS-Rebinding);
 * - höchstens drei Weiterleitungen, eine Zeitgrenze und die Größengrenze der Unterlagen, schon beim Lesen.
 *
 * Was ankommt, prüft danach `pruefeUnterlage` wie beim Hochladen in der App.
 */
import { BlockList, isIP, type LookupFunction } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";

const GESPERRT = new BlockList();
for (const [netz, laenge] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) GESPERRT.addSubnet(netz, laenge, "ipv4");
for (const [netz, laenge] of [
  ["::", 128], ["::1", 128], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) GESPERRT.addSubnet(netz, laenge, "ipv6");

/** Eine öffentliche Adresse? IPv4 in IPv6 (`::ffff:10.0.0.1`) zählt wie IPv4. */
export function istOeffentlich(ip: string): boolean {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (v4) return !GESPERRT.check(v4, "ipv4");
  const art = isIP(ip);
  if (art === 0) return false;
  return !GESPERRT.check(ip, art === 4 ? "ipv4" : "ipv6");
}

export type Abruf = { ok: true; bytes: Uint8Array } | { ok: false; fehler: string };

export interface AbrufOptionen {
  maxBytes: number;
  zeitMs?: number;
  /** Nur für Tests: welche Adresse und welche Ports erlaubt sind. */
  erlaubt?: (ip: string) => boolean;
  ports?: readonly string[];
}

const WEITERLEITUNGEN = 3;

function sichererLookup(erlaubt: (ip: string) => boolean): LookupFunction {
  return (host, optionen, fertig) => {
    dnsLookup(host, { ...optionen, all: true }, (fehler, adressen) => {
      if (fehler) return fertig(fehler, "", 0);
      const liste = adressen as { address: string; family: number }[];
      const frei = liste.filter((a) => erlaubt(a.address));
      if (frei.length === 0 || frei.length !== liste.length) {
        return fertig(Object.assign(new Error("nicht öffentlich"), { code: "EGESPERRT" }), "", 0);
      }
      if ((optionen as { all?: boolean }).all) return (fertig as unknown as (e: null, a: typeof frei) => void)(null, frei);
      return fertig(null, frei[0].address, frei[0].family);
    });
  };
}

function einmal(url: URL, o: Required<AbrufOptionen>): Promise<{ weiter: string } | Abruf> {
  return new Promise((fertig) => {
    const modul = url.protocol === "https:" ? https : http;
    const anfrage = modul.get(url, {
      lookup: sichererLookup(o.erlaubt),
      timeout: o.zeitMs,
      headers: { "user-agent": "IUK-Suite Gerätewartung", accept: "application/pdf, image/*;q=0.9, */*;q=0.1" },
    }, (antwort) => {
      const status = antwort.statusCode ?? 0;
      if (status >= 300 && status < 400 && antwort.headers.location) {
        antwort.resume();
        return fertig({ weiter: new URL(antwort.headers.location, url).toString() });
      }
      if (status !== 200) {
        antwort.resume();
        return fertig({ ok: false, fehler: `Die Adresse antwortet mit ${status}.` });
      }
      const laenge = Number(antwort.headers["content-length"] ?? 0);
      if (laenge > o.maxBytes) {
        antwort.destroy();
        return fertig({ ok: false, fehler: "Die Datei ist zu groß." });
      }
      const teile: Buffer[] = [];
      let summe = 0;
      antwort.on("data", (t: Buffer) => {
        summe += t.byteLength;
        if (summe > o.maxBytes) {
          antwort.destroy();
          fertig({ ok: false, fehler: "Die Datei ist zu groß." });
          return;
        }
        teile.push(t);
      });
      antwort.on("end", () => fertig({ ok: true, bytes: new Uint8Array(Buffer.concat(teile)) }));
      antwort.on("error", () => fertig({ ok: false, fehler: "Die Datei kam nicht vollständig an." }));
    });
    anfrage.on("timeout", () => anfrage.destroy(Object.assign(new Error("zeit"), { code: "EZEIT" })));
    anfrage.on("error", (e: NodeJS.ErrnoException) => fertig({
      ok: false,
      fehler: e.code === "EGESPERRT" ? "Diese Adresse ist nicht öffentlich erreichbar."
        : e.code === "EZEIT" ? "Die Adresse antwortet nicht rechtzeitig." : "Die Adresse ist nicht erreichbar.",
    }));
  });
}

/** Lädt eine Datei von einer öffentlichen Adresse. */
export async function ladeVonAdresse(adresse: string, optionen: AbrufOptionen): Promise<Abruf> {
  const o: Required<AbrufOptionen> = { zeitMs: 20_000, erlaubt: istOeffentlich, ports: ["80", "443"], ...optionen };
  let ziel = adresse;
  for (let i = 0; i <= WEITERLEITUNGEN; i++) {
    let url: URL;
    try {
      url = new URL(ziel);
    } catch {
      return { ok: false, fehler: "Das ist keine gültige Adresse." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, fehler: "Nur http- und https-Adressen." };
    if (url.username || url.password) return { ok: false, fehler: "Adressen mit Anmeldedaten gehen nicht." };
    if (url.port && !o.ports.includes(url.port)) return { ok: false, fehler: "Nur die üblichen Ports 80 und 443." };
    // Eine Adresse als Zahl läuft nicht durch `lookup`: hier prüfen.
    const roh = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(roh) && !o.erlaubt(roh)) return { ok: false, fehler: "Diese Adresse ist nicht öffentlich erreichbar." };
    const r = await einmal(url, o);
    if ("weiter" in r) {
      ziel = r.weiter;
      continue;
    }
    return r;
  }
  return { ok: false, fehler: "Zu viele Weiterleitungen." };
}
