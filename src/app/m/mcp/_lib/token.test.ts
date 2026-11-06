import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { bearerAus, mcpClientIds, pruefeToken, vergissPersonen, type TokenPruefer } from "./token";

const ISSUER = "https://id.example.test";
const JETZT = Date.UTC(2026, 10, 6, 10);

let schluessel: JWTVerifyGetKey;
let privat: CryptoKey;
let fremd: CryptoKey;

beforeAll(async () => {
  const k = await generateKeyPair("RS256", { extractable: true });
  privat = k.privateKey;
  fremd = (await generateKeyPair("RS256")).privateKey;
  schluessel = createLocalJWKSet({ keys: [{ ...(await exportJWK(k.publicKey)), kid: "k1", alg: "RS256" }] });
});
beforeEach(() => vergissPersonen());

function token(o: { aud?: string; sub?: string; exp?: number; iss?: string; key?: CryptoKey } = {}) {
  return new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(o.iss ?? ISSUER).setAudience(o.aud ?? "mcp-client").setSubject(o.sub ?? "sub-1")
    .setIssuedAt(Math.floor(JETZT / 1000)).setExpirationTime(o.exp ?? Math.floor(JETZT / 1000) + 3600)
    .sign(o.key ?? privat);
}

type Userinfo = () => Promise<Record<string, unknown>>;
function pruefer(userinfo = vi.fn<Userinfo>(async () => ({ sub: "sub-1", name: "Helfer A", groups: ["wartung-nutzer"] }))): TokenPruefer & { userinfo: typeof userinfo } {
  return { issuer: ISSUER, clientIds: ["mcp-client"], schluessel, userinfo, jetzt: () => JETZT };
}

describe("Token des MCP-Servers", () => {
  it("liest den Bearer-Kopf und die Client-Liste", () => {
    expect(bearerAus("Bearer abc.def-ghi")).toBe("abc.def-ghi");
    expect(bearerAus("Basic abc")).toBeNull();
    expect(bearerAus(null)).toBeNull();
    expect(mcpClientIds({ MCP_CLIENT_ID: " a, b ,," })).toEqual(["a", "b"]);
    expect(mcpClientIds({})).toEqual([]);
  });

  it("nimmt ein gültiges Token an; Gruppen und Name kommen aus dem Userinfo", async () => {
    const r = await pruefeToken(`Bearer ${await token()}`, pruefer());
    expect(r).toEqual({ ok: true, person: { sub: "sub-1", name: "Helfer A", email: null, groups: ["wartung-nutzer"] } });
  });

  it("ein Token für eine andere Anwendung zählt nicht (Confused Deputy)", async () => {
    expect(await pruefeToken(`Bearer ${await token({ aud: "andere-app" })}`, pruefer())).toEqual({ ok: false, grund: "ungueltig" });
  });

  it("abgelaufen, fremd signiert, fremder Aussteller: ungültig", async () => {
    for (const t of [
      await token({ exp: Math.floor(JETZT / 1000) - 10 }),
      await token({ key: fremd }),
      await token({ iss: "https://boese.example" }),
      "kein.jwt.token",
    ]) expect((await pruefeToken(`Bearer ${t}`, pruefer())).ok).toBe(false);
  });

  it("ohne Token: fehlt; ohne eingerichteten Client: nicht eingerichtet", async () => {
    expect(await pruefeToken(null, pruefer())).toEqual({ ok: false, grund: "fehlt" });
    expect(await pruefeToken(`Bearer ${await token()}`, { ...pruefer(), clientIds: [] })).toEqual({ ok: false, grund: "nicht_eingerichtet" });
  });

  it("ein Userinfo zu einer anderen Person oder ein Fehler beim Abruf lehnt ab", async () => {
    expect((await pruefeToken(`Bearer ${await token()}`, pruefer(vi.fn<Userinfo>(async () => ({ sub: "sub-2", groups: ["wartung-admin"] }))))).ok).toBe(false);
    expect((await pruefeToken(`Bearer ${await token()}`, pruefer(vi.fn<Userinfo>(async () => { throw new Error("weg"); })))).ok).toBe(false);
  });

  it("merkt sich die Person eine Minute, danach fragt es neu", async () => {
    const p = pruefer();
    const kopf = `Bearer ${await token()}`;
    await pruefeToken(kopf, p);
    await pruefeToken(kopf, p);
    expect(p.userinfo).toHaveBeenCalledTimes(1);
    await pruefeToken(kopf, { ...p, jetzt: () => JETZT + 61_000 });
    expect(p.userinfo).toHaveBeenCalledTimes(2);
  });

  it("ein gemerktes Token gilt nicht über seinen Ablauf hinaus", async () => {
    const p = pruefer();
    const kopf = `Bearer ${await token({ exp: Math.floor(JETZT / 1000) + 10 })}`;
    expect((await pruefeToken(kopf, p)).ok).toBe(true);
    expect(await pruefeToken(kopf, { ...p, jetzt: () => JETZT + 20_000 })).toEqual({ ok: false, grund: "ungueltig" });
  });
});
