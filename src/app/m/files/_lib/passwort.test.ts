import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { nanoid } from "nanoid";
import {
  bcryptHash,
  bcryptVerify,
  cookieName,
  erzeugeShareCookie,
  istCookieGueltig,
} from "./passwort";

/**
 * Prüfling: der EINE Ort, an dem das Modul `files` ein Share-Passwort prüft und
 * die Entsperrung eines Shares beglaubigt (Spec §7.4). Drei Aufrufer hängen
 * daran (Download, ZIP, Vorschau), und in der Alt-App war genau diese Prüfung
 * Dekoration: `verify` antwortete `{ ok: true }`, die Byte-Endpunkte lasen
 * `passwordHash` nirgends.
 *
 * Zwei Literale statt Importe aus dem Prüfling, und der Grund ist derselbe wie
 * in `token.test.ts`: würde der Test die Domänentrennung oder die Vier-Stunden-
 * Grenze aus `passwort.ts` importieren, wäre jede Mutation dort gleichzeitig
 * eine Mutation der Erwartung — die Suite bliebe grün. Im qr-Modul ist genau das
 * passiert (5/5 grün, während Konstanten gedreht wurden).
 */
const DOMAENE_LITERAL = "files-share-v1:";
const VIER_STUNDEN_SEKUNDEN = 14400;

/** Beide Vektoren gehören zum Passwort darunter; erzeugt mit bcryptjs, cost 12. */
const PASSWORT = "Testpasswort-2026";
const ALT_HASH_2B = "$2b$12$SC/ie/AcUjuq8nm6tuLMCe8VNxq3tJ.xWQribbyA4aIZ6Wz604Oya";

const GEHEIMNIS = "test-secret-der-suite";
const ANDERES_GEHEIMNIS = "ein-zweites-geheimnis";

/** Zwei ID-Formen, die es in der Datenbank wirklich gibt: `nanoid(10)` über das
 * 64-Zeichen-`urlAlphabet` enthält `-` und `_` und ist case-sensitive. */
const SHARE_A = "V1StGXR8_Z";
const SHARE_B = "aB-dEfGh1J";

function mitGeheimnis(geheimnis = GEHEIMNIS): void {
  vi.stubEnv("AUTH_SECRET", geheimnis);
}

/**
 * Die Signatur unabhängig nachgerechnet: eigener `createHmac`-Aufruf, eigenes
 * Präfix-Literal. Nur so trägt die Zusage „HMAC über AUTH_SECRET mit der
 * Domänentrennung `files-share-v1:`" überhaupt eine Aussage.
 */
function signiere(
  shareId: string,
  gueltigBisSekunden: number | string,
  praefix = DOMAENE_LITERAL,
  geheimnis = GEHEIMNIS,
): string {
  return createHmac("sha256", geheimnis)
    .update(`${praefix}${shareId}.${gueltigBisSekunden}`, "utf8")
    .digest("base64url");
}

function wert(
  shareId: string,
  gueltigBisSekunden: number | string,
  praefix = DOMAENE_LITERAL,
  geheimnis = GEHEIMNIS,
): string {
  return `${shareId}.${gueltigBisSekunden}.${signiere(shareId, gueltigBisSekunden, praefix, geheimnis)}`;
}

const JETZT = new Date("2026-07-30T12:00:00Z");
const JETZT_SEKUNDEN = Math.floor(JETZT.getTime() / 1000);
const IN_ZEHN_TAGEN = new Date(JETZT.getTime() + 10 * 24 * 3600 * 1000);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cookieName — ein Cookie JE Share", () => {
  it("hängt die Share-ID an den Namen: files_s_<shareId>", () => {
    expect(cookieName(SHARE_A)).toBe(`files_s_${SHARE_A}`);
  });

  it("gibt zwei Shares zwei verschiedene Namen", () => {
    // Die eigentliche Zusage: ein EINZIGES Cookie würde beim zweiten
    // geschützten Share den ersten überschreiben (§7.4) — wer zwei Shares
    // entsperrt hat, verlöre den ersten wieder. Eine Fassung, die einen
    // konstanten Namen zurückgibt, bestünde jeden anderen Test dieser Gruppe.
    expect(cookieName(SHARE_A)).not.toBe(cookieName(SHARE_B));
  });

  it("ist für 500 echte nanoid(10)-IDs ein gültiger Cookie-Name", () => {
    // RFC-6265-`token`: keine Trennzeichen, kein `=`, kein `;`, kein Weißraum.
    // `nanoid`s urlAlphabet enthält `-` und `_` — beide sind erlaubt, deshalb
    // braucht die ID keine Kodierung. Genau das behauptet §7.4, und hier steht
    // die Gegenprobe gegen echte IDs statt gegen ein Beispiel.
    const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
    for (let i = 0; i < 500; i++) {
      const name = cookieName(nanoid(10));
      expect(name).toMatch(TOKEN);
      expect(name).toHaveLength("files_s_".length + 10);
    }
  });

  it("wirft bei einer ID, die kein Cookie-Name wäre — statt einen Header zu spalten", () => {
    // Der Name landet in einem `Set-Cookie`-Header. Eine ID mit `;`, `=` oder
    // Zeilenumbruch wäre dort eine Trennstelle; die ID kommt aus einem
    // Pfadabschnitt, also aus fremder Hand. Der Aufrufer löst sie vorher aus der
    // Datenbank auf (Existenzprüfung, §7.4) — dieser Wurf ist der Riegel dahinter.
    expect(() => cookieName("a;b")).toThrow(/Share-ID/);
    expect(() => cookieName("a=b")).toThrow(/Share-ID/);
    expect(() => cookieName("a b")).toThrow(/Share-ID/);
    expect(() => cookieName("a\nSet-Cookie: x=y")).toThrow(/Share-ID/);
    expect(() => cookieName("")).toThrow(/Share-ID/);
  });
});

describe("bcryptVerify — die 1:1-Pflicht am Bestands-Hash", () => {
  it("nimmt einen Bestands-Hash der Alt-App an und weist ein falsches Passwort ab", () => {
    // Die Vektoren gehören `abhaengigkeiten.test.ts` (die Bibliothek); hier
    // steht, dass UNSERE Funktion sie durchreicht und nicht etwa `true`
    // zurückgibt, weil ein Hash vorliegt.
    expect(bcryptVerify(PASSWORT, ALT_HASH_2B)).toBe(true);
    expect(bcryptVerify("falsch", ALT_HASH_2B)).toBe(false);
    expect(bcryptVerify("", ALT_HASH_2B)).toBe(false);
  });

  it("liefert für NULL und Unrat `false`, statt zu werfen", () => {
    // `bcrypt.compareSync("x", null)` WIRFT („Illegal arguments: string,
    // object") — gemessen an bcryptjs@3.0.3. `shares.password_hash` ist
    // nullable, und die drei Byte-Wege bekommen die Spalte, wie sie ist. Ohne
    // diesen Riegel wäre ein Share ohne Passwort auf einer öffentlichen Route
    // ein HTTP 500 statt der spezifizierten 401 (§7.4, „das Orakel wird
    // geschlossen").
    expect(bcryptVerify(PASSWORT, null)).toBe(false);
    expect(bcryptVerify(PASSWORT, undefined)).toBe(false);
    expect(bcryptVerify(PASSWORT, "")).toBe(false);
    expect(bcryptVerify(PASSWORT, "nichts")).toBe(false);
    expect(bcryptVerify(PASSWORT, "$2b$12$abgeschnitten")).toBe(false);
  });
});

describe("bcryptHash — auch NEUE Passwörter in die Alt-Familie", () => {
  it("schreibt $2b$12$ und wird von bcryptVerify wieder angenommen", () => {
    // Ein Wechsel der Hash-Familie oder des cost macht keinen Bestands-Share
    // unöffenbar — aber er teilt den Bestand in zwei Welten, und die Spec
    // verlangt cost 12 ausdrücklich auch für neue Passwörter (§4.2).
    const hash = bcryptHash("Neues-Passwort-2026");
    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(hash).toHaveLength(60);
    expect(bcryptVerify("Neues-Passwort-2026", hash)).toBe(true);
    expect(bcryptVerify("Neues-Passwort-2027", hash)).toBe(false);
  });
});

describe("erzeugeShareCookie — die Vorlage, an der T28 hängt", () => {
  it("trägt HttpOnly, SameSite=Lax und Path=/", () => {
    mitGeheimnis();
    const vorlage = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    expect(vorlage).not.toBeNull();
    expect(vorlage?.name).toBe(`files_s_${SHARE_A}`);
    expect(vorlage?.httpOnly).toBe(true);
    expect(vorlage?.sameSite).toBe("lax");
    // `Path=/` ist keine Kosmetik: `/api/download/…` und `/api/preview/…` lesen
    // dasselbe Cookie (§7.4). Mit `Path=/s` käme es dort nie an.
    expect(vorlage?.path).toBe("/");
  });

  it("setzt Secure nur in Produktion — sonst gäbe es das Cookie über http gar nicht", () => {
    mitGeheimnis();
    vi.stubEnv("NODE_ENV", "production");
    expect(erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT)?.secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT)?.secure).toBe(false);
  });

  it("hat die Form <shareId>.<gueltigBisSekunden>.<hmac>", () => {
    mitGeheimnis();
    const vorlage = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    const teile = (vorlage?.value ?? "").split(".");
    expect(teile).toHaveLength(3);
    expect(teile[0]).toBe(SHARE_A);
    expect(teile[1]).toBe(String(JETZT_SEKUNDEN + VIER_STUNDEN_SEKUNDEN));
    // base64url ohne Padding: 43 Zeichen aus SHA-256, kein `=`, kein `+`, kein
    // `/` — und insbesondere kein `.`, sonst wäre die Dreiteilung des Wertes
    // nicht eindeutig.
    expect(teile[2]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Und der HMAC ist der unabhängig nachgerechnete.
    expect(teile[2]).toBe(signiere(SHARE_A, JETZT_SEKUNDEN + VIER_STUNDEN_SEKUNDEN));
  });

  it("deckelt Max-Age auf vier Stunden, auch wenn der Share zehn Tage läuft", () => {
    mitGeheimnis();
    expect(erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT)?.maxAge).toBe(
      VIER_STUNDEN_SEKUNDEN,
    );
  });

  it("kürzt Max-Age auf die Restlaufzeit, wenn der Share früher endet", () => {
    // Ohne diese Hälfte des `min` überlebt die Entsperrung den Share: das
    // Cookie wäre noch gültig, wenn `expires_at` längst vorbei ist.
    mitGeheimnis();
    const inEinerStunde = new Date(JETZT.getTime() + 3600 * 1000);
    expect(erzeugeShareCookie(SHARE_A, inEinerStunde, JETZT)?.maxAge).toBe(3600);
  });

  it("nennt in Max-Age und gueltigBis denselben Zeitpunkt", () => {
    // Die zwei Zahlen sind zwei Ausdrücke derselben Grenze — eine im Browser,
    // eine in unserer Signatur. Laufen sie auseinander, gilt die eine Seite
    // länger als die andere, und welche das ist, merkt niemand.
    mitGeheimnis();
    for (const ablauf of [IN_ZEHN_TAGEN, new Date(JETZT.getTime() + 90 * 1000)]) {
      const vorlage = erzeugeShareCookie(SHARE_A, ablauf, JETZT);
      const gueltigBis = Number((vorlage?.value ?? "").split(".")[1]);
      expect(gueltigBis).toBe(JETZT_SEKUNDEN + (vorlage?.maxAge ?? -1));
    }
  });

  it("liefert für einen abgelaufenen Share kein Cookie", () => {
    // Ein negatives Max-Age wäre ein Lösch-Cookie, ein `gueltigBis` in der
    // Vergangenheit eine Signatur auf einen bereits ungültigen Zustand. Beides
    // ist keine Entsperrung, also gibt es keine.
    mitGeheimnis();
    expect(erzeugeShareCookie(SHARE_A, new Date(JETZT.getTime() - 1000), JETZT)).toBeNull();
    expect(erzeugeShareCookie(SHARE_A, JETZT, JETZT)).toBeNull();
  });

  it("wirft ohne AUTH_SECRET, und die Meldung nennt die Variable", () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    expect(() => erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT)).toThrow(/AUTH_SECRET/);
  });
});

describe("istCookieGueltig — genau ein Annahmeweg", () => {
  it("nimmt die eigene Vorlage an", () => {
    mitGeheimnis();
    const vorlage = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    expect(istCookieGueltig(SHARE_A, vorlage?.value, JETZT)).toBe(true);
    // Kurz vor Ablauf noch gültig …
    const knappDavor = new Date((JETZT_SEKUNDEN + VIER_STUNDEN_SEKUNDEN) * 1000 - 1000);
    expect(istCookieGueltig(SHARE_A, vorlage?.value, knappDavor)).toBe(true);
  });

  it("weist ein Cookie ab, das zu einem FREMDEN Share gehört", () => {
    // Der Angreiferzug, den der Cookie-NAME allein nicht abwehrt: Cookie-Namen
    // wählt der Client. Wer Share A entsperrt hat, schickt dessen Wert unter dem
    // Namen `files_s_<B>` und lädt B. Deshalb ist die Share-Bindung
    // kryptografisch: signiert wird über die ERWARTETE ID.
    // Beide IDs sind gleich lang — die Ablehnung darf nicht bloß eine
    // Längendifferenz sein.
    mitGeheimnis();
    expect(SHARE_A).toHaveLength(SHARE_B.length);
    const vorlageA = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    expect(istCookieGueltig(SHARE_B, vorlageA?.value, JETZT)).toBe(false);
    // Und die Gegenprobe zur Gegenprobe: ein für B ausgestelltes Cookie gilt
    // für B — die Ablehnung oben ist keine generelle Unmöglichkeit.
    const vorlageB = erzeugeShareCookie(SHARE_B, IN_ZEHN_TAGEN, JETZT);
    expect(istCookieGueltig(SHARE_B, vorlageB?.value, JETZT)).toBe(true);
    // Auch der umgeschriebene Wert (ID von B, Signatur von A) trägt nicht.
    expect(
      istCookieGueltig(SHARE_B, (vorlageA?.value ?? "").replace(SHARE_A, SHARE_B), JETZT),
    ).toBe(false);
  });

  it("weist ein abgelaufenes gueltigBis ab", () => {
    mitGeheimnis();
    const vorlage = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    const nachAblauf = new Date((JETZT_SEKUNDEN + VIER_STUNDEN_SEKUNDEN + 1) * 1000);
    expect(istCookieGueltig(SHARE_A, vorlage?.value, nachAblauf)).toBe(false);
    // Auch ein KORREKT signierter Wert mit einem Zeitpunkt in der Vergangenheit
    // gilt nicht — die Signatur beglaubigt die Frist, sie ersetzt sie nicht.
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, JETZT_SEKUNDEN - 1), JETZT)).toBe(false);
  });

  it("weist ein um ein Bit manipuliertes HMAC ab", () => {
    mitGeheimnis();
    const vorlage = erzeugeShareCookie(SHARE_A, IN_ZEHN_TAGEN, JETZT);
    const [id, frist, hmac] = (vorlage?.value ?? "").split(".");
    // Ein Zeichen des base64url-HMAC gegen ein anderes tauschen: ein einzelnes
    // Bit im Rohwert. Die Länge bleibt gleich.
    const gekippt = (hmac[0] === "A" ? "B" : "A") + hmac.slice(1);
    expect(gekippt).not.toBe(hmac);
    expect(istCookieGueltig(id, `${id}.${frist}.${gekippt}`, JETZT)).toBe(false);
    // Und die verlängerte Frist bei unverändertem HMAC ebenso — sonst wäre die
    // Frist frei wählbar.
    expect(
      istCookieGueltig(id, `${id}.${Number(frist) + 99999}.${hmac}`, JETZT),
    ).toBe(false);
  });

  it("weist einen Wert ab, der mit einem ANDEREN Präfix signiert wurde", () => {
    // Die Domänentrennung: dasselbe AUTH_SECRET signiert in der Suite auch
    // anderes. Ohne Präfix im Nachrichtenkopf könnte ein Wert aus einem fremden
    // Zusammenhang hier als Entsperrung gelten (§7.4).
    mitGeheimnis();
    const frist = JETZT_SEKUNDEN + 600;
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, frist, ""), JETZT)).toBe(false);
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, frist, "files-share-v2:"), JETZT)).toBe(
      false,
    );
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, frist, "iuk-suite:"), JETZT)).toBe(false);
    // Positivprobe mit demselben Bauweg: nur das Literal `files-share-v1:`
    // trägt. Ohne sie wäre die Gruppe auch gegen eine kaputte Signaturfunktion
    // grün.
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, frist), JETZT)).toBe(true);
  });

  it("weist einen Wert ab, der unter einem anderen AUTH_SECRET signiert wurde", () => {
    // Ohne diesen Fall wäre die Zusage „HMAC über AUTH_SECRET" von KEINEM Test
    // besessen: ein fest eingebauter Schlüssel bestünde jeden anderen Punkt
    // dieser Liste. Er ist zugleich der Grund, warum das Geheimnis beim Aufruf
    // gelesen wird und nicht beim Laden des Moduls.
    const frist = JETZT_SEKUNDEN + 600;
    const fremd = wert(SHARE_A, frist, DOMAENE_LITERAL, ANDERES_GEHEIMNIS);
    mitGeheimnis(GEHEIMNIS);
    expect(istCookieGueltig(SHARE_A, fremd, JETZT)).toBe(false);
    mitGeheimnis(ANDERES_GEHEIMNIS);
    expect(istCookieGueltig(SHARE_A, fremd, JETZT)).toBe(true);
  });

  it("weist jede Formabweichung ab, ohne zu werfen", () => {
    // Der Wert kommt vom Client und wird auf öffentlichen Byte-Routen gelesen.
    // `timingSafeEqual` WIRFT bei ungleich langen Puffern — ein zu kurzer
    // HMAC-Abschnitt wäre damit HTTP 500 statt einer Ablehnung.
    mitGeheimnis();
    const frist = JETZT_SEKUNDEN + 600;
    const gueltig = wert(SHARE_A, frist);
    for (const kaputt of [
      undefined,
      null,
      "",
      ".",
      "..",
      SHARE_A,
      `${SHARE_A}.${frist}`,
      `${SHARE_A}.${frist}.`,
      `${SHARE_A}.${frist}.kurz`,
      `${gueltig}.nochwas`,
      `${SHARE_A}.nicht-numerisch.${signiere(SHARE_A, "nicht-numerisch")}`,
      `${SHARE_A}.-1.${signiere(SHARE_A, -1)}`,
      `${SHARE_A}.1e12.${signiere(SHARE_A, "1e12")}`,
      gueltig.toUpperCase(),
      ` ${gueltig}`,
      "a".repeat(10000),
    ]) {
      expect(() => istCookieGueltig(SHARE_A, kaputt, JETZT)).not.toThrow();
      expect(istCookieGueltig(SHARE_A, kaputt, JETZT)).toBe(false);
    }
  });

  it("wirft ohne AUTH_SECRET, statt still jeden geschützten Share zu öffnen", () => {
    // Fail-loud ist hier die kleinere Schwester von fail-closed: `false` wäre
    // sicher, aber die Fehlkonfiguration sähe für jeden Empfänger wie „Passwort
    // falsch" aus. AUTH_SECRET ist Pflicht (`compose.yaml:23`), und Auth.js
    // fällt ohne die Variable ohnehin laut aus.
    const gueltig = wert(SHARE_A, JETZT_SEKUNDEN + 600);
    vi.stubEnv("AUTH_SECRET", undefined);
    expect(() => istCookieGueltig(SHARE_A, gueltig, JETZT)).toThrow(/AUTH_SECRET/);
  });

  it("nimmt ohne Zeitangabe die Uhr der Gegenwart", () => {
    // Der Standardwert `new Date()` ist der Produktivpfad; alle Aufrufer
    // übergeben nichts. Ein `jetzt`, das nur im Test gesetzt wird, wäre eine
    // Frist, die produktiv niemand prüft.
    mitGeheimnis();
    // Der Ablauf ist hier RELATIV zur echten Uhr, nicht `IN_ZEHN_TAGEN`: dieser
    // Fall läuft als einziger gegen `Date.now()`, und ein Kalenderdatum wäre
    // hier eine Zeitbombe — ab dem 09.08.2026 wäre der Share abgelaufen und der
    // Test rot aus einem Grund, der nichts mit dem Prüfling zu tun hat.
    const vorlage = erzeugeShareCookie(SHARE_A, new Date(Date.now() + 10 * 24 * 3600 * 1000));
    expect(istCookieGueltig(SHARE_A, vorlage?.value)).toBe(true);
    expect(istCookieGueltig(SHARE_A, wert(SHARE_A, Math.floor(Date.now() / 1000) - 5))).toBe(
      false,
    );
  });
});
