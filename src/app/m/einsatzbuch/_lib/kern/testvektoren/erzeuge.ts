import { versiegele } from "../block";
import { ausBase64, zuBase64, zufall } from "../bytes";
import { verschluesseleExport } from "../export";
import { GENESIS, type Block, type Einsatz, type Exportdatei, type Exportkopf } from "../format";
import { blockHash, type Kettenergebnis } from "../kette";
import { schluesselIdVon } from "../umschlag";

/**
 * TESTVEKTOREN — der Format-Vertrag zwischen TypeScript (Suite, Reader) und Rust
 * (Desktop-App, versiegelt). `eingaben.json` hält jeden Zufall fest; aus ihr entsteht
 * `erwartet.json` deterministisch. Die Rust-Seite (Stufe 4) baut dieselben Blöcke aus
 * derselben Eingabe und vergleicht byte-genau. Neu erzeugen:
 * `pnpm exec tsx scripts/einsatzbuch-testvektoren.ts` (mit `--neu` auch neue Schlüssel).
 * Die Negativfälle der Spec §9.1 (`negativ`) entstehen aus den positiven Blöcken, ohne neuen
 * Zufall; ihr erwartetes Kettenergebnis steht als Literal hier, nicht aus `pruefeKette`.
 */
export interface Testschluessel { privat: JsonWebKey; oeffentlichSpki: string }

export interface Testeingaben {
  zeitzone: string;
  suite: Testschluessel;
  einsaetze: Einsatz[];
  bloecke: { versiegelt: string; cek: string; iv: string; umschlag: { ephemer: JsonWebKey; iv: string } }[];
  export: { kennwort: string; salt: string; iv: string; kopf: Exportkopf; exportiertVon: string; quelle: string };
}

/** Ein Negativfall der Spec §9.1 — aus den positiven Blöcken abgeleitet, nie neu versiegelt. */
export interface Negativfall {
  name: "veraenderter-kopf" | "vertauschter-umschlag" | "luecke" | "falscher-anfang";
  bloecke: Block[];
  /** Ergebnis von `pruefeKette(bloecke)`. */
  kette: Kettenergebnis;
  /** Blocknummern (`kopf.block` im manipulierten Stand), deren Umschlag der Suite-Schlüssel NICHT auspackt. Alle anderen Blöcke des Falls packen aus. */
  auspackenScheitert: number[];
}

export interface Testerwartung { schluesselId: string; bloecke: Block[]; export: Exportdatei; negativ: Negativfall[] }

const KURVE = { name: "ECDH", namedCurve: "P-256" } as const;

async function paarAusJwk(privat: JsonWebKey): Promise<CryptoKeyPair> {
  const { d: _d, key_ops: _o, ...oeffentlich } = privat;
  return {
    privateKey: await crypto.subtle.importKey("jwk", privat, KURVE, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("jwk", oeffentlich, KURVE, true, []),
  };
}

export async function erzeugeErwartung(e: Testeingaben): Promise<Testerwartung> {
  const suite = await paarAusJwk(e.suite.privat);
  const schluesselId = await schluesselIdVon(suite.publicKey);
  const bloecke: Block[] = [];
  for (let i = 0; i < e.einsaetze.length; i++) {
    const z = e.bloecke[i];
    const kopf = { v: 1 as const, block: i + 1, prev: bloecke[i - 1]?.hash ?? GENESIS, versiegelt: z.versiegelt, schluesselId, umgebung: "echt" as const };
    bloecke.push(await versiegele(e.einsaetze[i], kopf, suite.publicKey, {
      cek: ausBase64(z.cek), iv: ausBase64(z.iv),
      umschlag: { ephemer: await paarAusJwk(z.umschlag.ephemer), iv: ausBase64(z.umschlag.iv) },
    }));
  }
  const schluessel = Object.fromEntries(e.bloecke.map((z, i) => [String(i + 1), z.cek]));
  const exportdatei = await verschluesseleExport(
    { bloecke, schluessel, exportiertVon: e.export.exportiertVon, quelle: e.export.quelle, anker: { block: bloecke.length, hash: bloecke[bloecke.length - 1].hash, gemeldetAm: e.export.kopf.erstellt } },
    e.export.kennwort, e.export.kopf,
    { salt: ausBase64(e.export.salt), iv: ausBase64(e.export.iv) },
  );
  return { schluesselId, bloecke, export: exportdatei, negativ: await negativfaelle(bloecke) };
}

/** Frische Kopie mit neu berechnetem Fingerabdruck — die Prüfung soll am Hash vorbeikommen. */
async function mitNeuemHash(b: Block): Promise<Block> {
  return { ...b, hash: await blockHash(b) };
}

/**
 * Die vier Negativfälle der Spec §9.1. Jeder Fall ist eine frische Kopie; die positiven
 * Blöcke bleiben unberührt. `kette` ist die Erwartung (Literal), nicht das Ergebnis von `pruefeKette`.
 */
async function negativfaelle(positiv: Block[]): Promise<Negativfall[]> {
  const [b1, b2, b3] = positiv;
  return [
    {
      name: "veraenderter-kopf",
      bloecke: [b1, { ...b2, kopf: { ...b2.kopf, versiegelt: "2026-08-29T19:34:00+02:00" } }, b3],
      kette: { ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" },
      auspackenScheitert: [2],
    },
    {
      name: "vertauschter-umschlag",
      bloecke: [b1, await mitNeuemHash({ ...b2, umschlag: b3.umschlag })],
      kette: { ok: true, vollstaendig: true },
      auspackenScheitert: [2],
    },
    {
      name: "luecke",
      bloecke: [b1, await mitNeuemHash({ ...b2, kopf: { ...b2.kopf, block: 3 } })],
      kette: { ok: false, block: 3, grund: "Lücke in der Reihenfolge" },
      auspackenScheitert: [3],
    },
    {
      name: "falscher-anfang",
      bloecke: [await mitNeuemHash({ ...b1, kopf: { ...b1.kopf, prev: "f".repeat(64) } })],
      kette: { ok: false, block: 1, grund: "Anfang der Kette stimmt nicht" },
      auspackenScheitert: [1],
    },
  ];
}

async function neuesPaar(): Promise<JsonWebKey> {
  const p = await crypto.subtle.generateKey(KURVE, true, ["deriveBits"]);
  return crypto.subtle.exportKey("jwk", p.privateKey);
}

/** Neue Schlüssel und Nonces um feste Einsätze. Nur bei einem bewussten Formatwechsel aufrufen. */
export async function neueEingaben(einsaetze: Einsatz[], versiegelt: string[]): Promise<Testeingaben> {
  const suitePrivat = await neuesPaar();
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", (await paarAusJwk(suitePrivat)).publicKey));
  const bloecke = [];
  for (let i = 0; i < einsaetze.length; i++) {
    bloecke.push({ versiegelt: versiegelt[i], cek: zuBase64(zufall(32)), iv: zuBase64(zufall(12)), umschlag: { ephemer: await neuesPaar(), iv: zuBase64(zufall(12)) } });
  }
  return {
    zeitzone: "Europe/Berlin",
    suite: { privat: suitePrivat, oeffentlichSpki: zuBase64(spki) },
    einsaetze, bloecke,
    export: {
      kennwort: "testvektor-kennwort", salt: zuBase64(zufall(16)), iv: zuBase64(zufall(12)),
      kopf: { erstellt: "2026-09-24T10:00:00+02:00", umfang: "alle", von: 1, bis: einsaetze.length, anzahl: einsaetze.length, quelle: "DRK-Bereitschaft Uelzen" },
      exportiertVon: "Testvektor", quelle: "DRK-Bereitschaft Uelzen",
    },
  };
}
