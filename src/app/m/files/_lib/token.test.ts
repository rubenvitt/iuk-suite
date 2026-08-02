import { describe, it, expect, vi } from "vitest";
import { erzeugeToken, normalisiereToken, tokenHash, zeichenAusByte } from "./token";

/**
 * `node:crypto` wird als Modul ersetzt, damit `randomBytes` beobachtbar ist —
 * die echte Implementierung bleibt dabei eingesetzt (`...echt` plus
 * `mockImplementation`): der Spion beobachtet, er ersetzt nicht.
 *
 * `vi.spyOn(crypto, "randomBytes")` greift hier NICHT, und beide Gründe wären
 * einzeln schon tödlich: der ESM-Namespace eines Builtins ist gefroren, und
 * `token.ts` destrukturiert `randomBytes` beim Modulladen — ein spät gesetztes
 * Patch sieht es also nie. Ein solcher Spion bliebe stumm und der Test grün.
 */
const randomBytesSpion = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", async (importOriginal) => {
  const echt = await importOriginal<typeof import("node:crypto")>();
  randomBytesSpion.mockImplementation(echt.randomBytes);
  return { ...echt, randomBytes: randomBytesSpion };
});

/**
 * Das Alphabet steht hier als LITERAL, nicht als Import aus dem Prüfling: sonst
 * wäre jede Alphabet-Mutation gleichzeitig eine Mutation der Erwartung, und der
 * Test bliebe grün. Dasselbe gilt für die Grammatik-Regex unten.
 */
const ALPHABET_LITERAL = "23456789abcdefghijkmnpqrstuvwxyz";
const GRAMMATIK =
  /^dz-[23456789abcdefghijkmnpqrstuvwxyz]{4}-[23456789abcdefghijkmnpqrstuvwxyz]{4}-[23456789abcdefghijkmnpqrstuvwxyz]{4}$/;

/**
 * Unabhängig berechnet, NICHT mit demselben `createHash`-Aufruf wie der
 * Prüfling — sonst prüft der Test seine eigene Rechnung. Nachrechnen mit:
 *
 *   printf 'dz-2345-6789-abcd' | openssl dgst -sha256 -binary \
 *     | openssl base64 -A | tr '+/' '-_' | tr -d '='
 */
const HASH_VON_DZ_2345_6789_ABCD = "hcKXPoE90xNaFTkUdSRsrNF9iaJBwIyEk7JMYv3Lc5k";

/**
 * Zweiter Vektor mit Absicht: die Standard-base64-Form dieses Hashes ist
 * `crKrZkJuFwuWSc8l3bD6fV6G9ZYs9uKL+/iXNFPe5Tc=` und enthält `+` UND `/`. Nur
 * damit trägt die Zusage „base64url" überhaupt eine Aussage — beim ersten
 * Vektor sind base64 und base64url bis auf das Padding identisch.
 *
 *   printf 'dz-4444-4444-4444' | openssl dgst -sha256 -binary \
 *     | openssl base64 -A | tr '+/' '-_' | tr -d '='
 */
const HASH_VON_DZ_4444_4444_4444 = "crKrZkJuFwuWSc8l3bD6fV6G9ZYs9uKL-_iXNFPe5Tc";

describe("erzeugeToken", () => {
  it("erfüllt bei 1.000 Token die Grammatik dz- + 3×4 Zeichen (17 Zeichen)", () => {
    for (let i = 0; i < 1000; i++) {
      const token = erzeugeToken();
      expect(token).toMatch(GRAMMATIK);
      expect(token).toHaveLength(17);
    }
  });

  it("enthält in 1.000 Token nie 0, 1, l oder o", () => {
    // Die vier verwechselbaren Zeichen sind der Grund für das 32er-Alphabet:
    // Codes werden vorgelesen und von Hand abgeschrieben.
    for (let i = 0; i < 1000; i++) {
      expect(erzeugeToken()).not.toMatch(/[01lo]/);
    }
  });

  it("liefert 1.000 paarweise verschiedene Token", () => {
    // Ohne diese Zusicherung ist die Zufallsquelle des Standardpfades von KEINEM
    // Test besessen: eine konstante Quelle (`new Uint8Array(anzahl).fill(7)`)
    // erfüllt Grammatik, Länge und „nie 0/1/l/o" vollständig und gibt bei jedem
    // Aufruf denselben Token zurück — jeder Abgabelink derselbe, anonymer
    // Schreibzugang auf jeden Posteingang.
    // Nicht flaky: 60 Bit Entropie, Kollisionswahrscheinlichkeit bei 1.000
    // Ziehungen ≈ 1000²/(2·2^60) ≈ 4·10⁻¹³.
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) tokens.add(erzeugeToken());
    expect(tokens.size).toBe(1000);
  });

  it("zieht die Bytes im Standardpfad aus node:crypto.randomBytes", () => {
    // Die Eindeutigkeit oben schließt die konstante Quelle, aber NICHT den
    // Verlust des CSPRNG: 1.000 Ziehungen aus `Math.random()` sind ebenfalls
    // alle verschieden und damit von ihr nicht zu unterscheiden. Genau darauf
    // baut die Spec ihre Kryptoentscheidung („60 Bit Entropie … SHA-256 ist hier
    // richtig, bcrypt wäre Rechenlast ohne Sicherheitsgewinn", §4.7) — mit
    // vorhersagbarer Quelle ist der Token ratbar und die Begründung hinfällig.
    randomBytesSpion.mockClear();
    const token = erzeugeToken();
    // Genau EIN Zug je Token, und der über alle 12 Bytes auf einmal.
    expect(randomBytesSpion).toHaveBeenCalledTimes(1);
    expect(randomBytesSpion).toHaveBeenCalledWith(12);
    // Und der Spion reicht durch: die echte Grammatik kommt trotzdem heraus.
    expect(token).toMatch(GRAMMATIK);
  });

  it("fordert genau 12 Zufallsbytes an — ein Byte je Geheimzeichen", () => {
    let angefordert = -1;
    erzeugeToken((anzahl) => {
      angefordert = anzahl;
      return new Uint8Array(anzahl);
    });
    expect(angefordert).toBe(12);
  });

  it("ist mit injizierten Bytes deterministisch", () => {
    // Byte 0 → erstes Alphabetzeichen "2", Byte 1 → "3".
    expect(erzeugeToken(() => new Uint8Array(12))).toBe("dz-2222-2222-2222");
    expect(erzeugeToken(() => new Uint8Array(12).fill(1))).toBe("dz-3333-3333-3333");
    // Byte 32 läuft auf das erste Zeichen zurück — das ist der Modulo, und mit
    // `% 31` oder `% 33` stünde hier ein anderes Zeichen.
    expect(erzeugeToken(() => new Uint8Array(12).fill(32))).toBe("dz-2222-2222-2222");
    expect(erzeugeToken(() => new Uint8Array(12).fill(255))).toBe("dz-zzzz-zzzz-zzzz");
  });
});

describe("zeichenAusByte — die Gleichverteilung", () => {
  it("trifft über alle 256 Bytewerte jedes der 32 Zeichen genau 8-mal", () => {
    const zaehler = new Map<string, number>();
    for (let byte = 0; byte < 256; byte++) {
      const zeichen = zeichenAusByte(byte);
      zaehler.set(zeichen, (zaehler.get(zeichen) ?? 0) + 1);
    }
    // Genau die 32 Zeichen des Alphabets, keines häufiger als ein anderes:
    // das ist die Zusage „byte % 32 bei 256 Bytewerten ist verzerrungsfrei".
    expect([...zaehler.keys()].sort().join("")).toBe(
      [...ALPHABET_LITERAL].sort().join(""),
    );
    expect([...zaehler.values()]).toEqual(new Array(32).fill(8));
  });
});

describe("tokenHash", () => {
  it("liefert den unabhängig berechneten Erwartungswert", () => {
    expect(tokenHash("dz-2345-6789-abcd")).toBe(HASH_VON_DZ_2345_6789_ABCD);
  });

  it("ist base64url ohne Padding — kein =, kein +, kein /", () => {
    expect(tokenHash("dz-4444-4444-4444")).toBe(HASH_VON_DZ_4444_4444_4444);
    for (let i = 0; i < 50; i++) {
      const hash = tokenHash(erzeugeToken());
      expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(hash).not.toContain("=");
      expect(hash).not.toContain("+");
      expect(hash).not.toContain("/");
    }
  });

  it("hasht den vollen Token inklusive dz- und Bindestrichen", () => {
    // Ohne Präfix oder ohne Bindestriche käme ein anderer Wert heraus. Die Form
    // ist verbindlich (Spec §4.7: SHA-256 über den vollen Token) — sonst trifft
    // die Suche nach dem gespeicherten token_hash den eigenen Wert nicht mehr.
    expect(tokenHash("2345-6789-abcd")).not.toBe(HASH_VON_DZ_2345_6789_ABCD);
    expect(tokenHash("dz-23456789abcd")).not.toBe(HASH_VON_DZ_2345_6789_ABCD);
  });

  it("normalisiert NICHT selbst — Großschreibung ergibt einen anderen Hash", () => {
    // Deshalb muss jeder Aufrufer erst normalisieren. Die Zusicherung gehört in
    // den Test, damit niemand sie später „hilfreich" in tokenHash einbaut.
    expect(tokenHash("DZ-2345-6789-ABCD")).not.toBe(HASH_VON_DZ_2345_6789_ABCD);
    expect(tokenHash(" dz-2345-6789-abcd ")).not.toBe(HASH_VON_DZ_2345_6789_ABCD);
  });
});

describe("normalisiereToken — Annahme", () => {
  it("lässt die kanonische Form unverändert", () => {
    expect(normalisiereToken("dz-2345-6789-abcd")).toBe("dz-2345-6789-abcd");
  });

  it("akzeptiert Großschreibung und Leerzeichen statt Bindestriche", () => {
    expect(normalisiereToken("DZ2345 6789 ABCD")).toBe("dz-2345-6789-abcd");
    expect(normalisiereToken("Dz-2345-6789-Abcd")).toBe("dz-2345-6789-abcd");
    expect(normalisiereToken("  dz-2345-6789-abcd\n")).toBe("dz-2345-6789-abcd");
  });

  it("akzeptiert fehlende und falsch gesetzte Bindestriche und gruppiert neu", () => {
    expect(normalisiereToken("dz23456789abcd")).toBe("dz-2345-6789-abcd");
    expect(normalisiereToken("dz-234-56789-abcd")).toBe("dz-2345-6789-abcd");
    expect(normalisiereToken("DZ 2345 6789 ABCD")).toBe("dz-2345-6789-abcd");
    // Das im Plan namentlich genannte Annahme-Beispiel, wörtlich: die
    // Weißraumgruppen liegen hier 2-4-4-2 und nicht auf den Vierergrenzen. Der
    // Fall steht zusätzlich zu den obigen da, weil der Plan ihn benennt und ein
    // späterer Leser ihn sonst im Test sucht (Korrektur vom 30.07. zur
    // widersprüchlichen Erstfassung `DZ23 4567 89AB`, die als zu kurz abgelehnt
    // wird — siehe „lehnt falsche Längen ab").
    expect(normalisiereToken("DZ23 4567 89AB CD")).toBe("dz-2345-6789-abcd");
  });

  it("ergibt zusammen mit tokenHash denselben Hash wie die kanonische Form", () => {
    // Die eigentliche Kette: was ein Melder in die Adresszeile tippt, muss auf
    // denselben token_hash führen wie der gedruckte Code. Ohne das
    // Wiedereinsetzen der Bindestriche in normalisiereToken bricht genau hier.
    const normalisiert = normalisiereToken("DZ2345 6789 ABCD");
    expect(normalisiert).not.toBeNull();
    expect(tokenHash(normalisiert as string)).toBe(HASH_VON_DZ_2345_6789_ABCD);
  });

  it("nimmt jedes erzeugte Token in Großschreibung wieder an", () => {
    for (let i = 0; i < 200; i++) {
      const token = erzeugeToken();
      expect(normalisiereToken(token.toUpperCase())).toBe(token);
      expect(normalisiereToken(token.replace(/-/g, ""))).toBe(token);
    }
  });
});

describe("normalisiereToken — Ablehnung", () => {
  it("lehnt die vier verwechselbaren Zeichen ab, obwohl die Länge stimmt", () => {
    // 0, 1, l, o sind KEINE Alphabetzeichen. Ohne Alphabetprüfung wäre die
    // Länge 12 erfüllt und die Eingabe ginge durch — genau der Alt-Defekt.
    expect(normalisiereToken("dz-0000-0000-0000")).toBeNull();
    expect(normalisiereToken("dz-1111-1111-1111")).toBeNull();
    expect(normalisiereToken("dz-llll-llll-llll")).toBeNull();
    expect(normalisiereToken("dz-oooo-oooo-oooo")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-abc0")).toBeNull();
  });

  it("lehnt fremde Zeichen ab, statt sie still zu entfernen", () => {
    // Der entscheidende Fall: `dz-abc!x-6789-abcd` hat MIT dem `!` 13
    // Körperzeichen, ohne es 12. Eine Fassung, die Fremdzeichen wegputzt
    // (`replace(/[^a-z0-9]/g, "")` wie drop/web/src/lib/utils.ts:75), gäbe hier
    // ein gültig aussehendes `dz-abcx-6789-abcd` zurück.
    expect(normalisiereToken("dz-abc!x-6789-abcd")).toBeNull();
    expect(normalisiereToken("dz-abc!-6789-abcd")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-abc_")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-abcü")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-ab*d")).toBeNull();
  });

  it("lehnt falsche Längen ab", () => {
    // Der Plan nennt als Beispiel `DZ23 4567 89AB` — das sind nur 10
    // Körperzeichen; verbindlich ist dort die FORM `dz-xxxx-xxxx-xxxx`, nicht
    // die Buchstabenzahl des Beispiels. Zu kurz bleibt zu kurz.
    expect(normalisiereToken("DZ23 4567 89AB")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-ab")).toBeNull();
    expect(normalisiereToken("dz-2345-6789-abcde")).toBeNull();
    expect(normalisiereToken("dz-")).toBeNull();
    expect(normalisiereToken("dz")).toBeNull();
    expect(normalisiereToken("")).toBeNull();
    expect(normalisiereToken("   ")).toBeNull();
  });

  it("verlangt das Präfix dz und akzeptiert keinen nackten Körper", () => {
    // Die Alt-Normalisierung ergänzte ein fehlendes `dz-` — ihr einziger
    // Aufrufer war das Token-Eingabefeld auf drops Startseite, das §8.1
    // absichtlich streicht („ein Eingabefeld wäre ein Rateweg"). Der einzige
    // Aufrufer hier ist der Pfadabschnitt von `/u/<token>`, und der trägt das
    // Präfix immer mit.
    expect(normalisiereToken("2345-6789-abcd")).toBeNull();
    expect(normalisiereToken("23456789abcd")).toBeNull();
    expect(normalisiereToken("zd-2345-6789-abcd")).toBeNull();
    // Auch das ZWEITE Präfixzeichen muss stimmen, und das ist die schärfere
    // Zusage: `slice("dz".length)` schneidet blind zwei Zeichen ab. Prüfte der
    // Code nur `d`, würde ein einzelner Tippfehler nicht abgelehnt, sondern
    // still auf einen ANDEREN, gültigen Abgabelink umgeschrieben — ein Alias
    // auf ein fremdes token_hash.
    expect(normalisiereToken("dx-2345-6789-abcd")).toBeNull();
    expect(normalisiereToken("d2-2345-6789-abcd")).toBeNull();
  });

  it("akzeptiert keine URL — Slashes und Doppelpunkte sind fremde Zeichen", () => {
    expect(normalisiereToken("https://drop.iuk-ue.de/u/dz-2345-6789-abcd")).toBeNull();
    expect(normalisiereToken("/u/dz-2345-6789-abcd")).toBeNull();
  });
});
