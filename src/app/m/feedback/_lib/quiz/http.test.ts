import { describe, expect, it } from "vitest";
import {
  BEITRITT_COOKIE_MAX_AGE_S,
  cookieWert,
  json,
  leseJson,
  quizCookie,
  quizCookieOptionen,
} from "./http";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers });

describe("leseJson", () => {
  it("liest ein Objekt", async () => {
    expect(await leseJson(post('{"a":1}'))).toEqual({
      ok: true,
      wert: { a: 1 },
    });
  });
  it("leerer Body ist undefined, kaputtes JSON ein Fehler", async () => {
    expect(await leseJson(post(null))).toEqual({ ok: true, wert: undefined });
    expect(await leseJson(post("{"))).toEqual({ ok: false });
  });
  it("bricht bei zu großem Body ab, auch ohne ehrlichen content-length", async () => {
    expect(await leseJson(post("x".repeat(5000)), 1024)).toEqual({ ok: false });
    expect(
      await leseJson(post("{}", { "content-length": "99999" }), 1024),
    ).toEqual({ ok: false });
  });
});

describe("cookieWert", () => {
  it("findet das Cookie unter mehreren", () => {
    const req = new Request("http://localhost/", {
      headers: { cookie: "a=1; iuk-quiz-7=abc_-; b=2" },
    });
    expect(cookieWert(req, quizCookie(7))).toBe("abc_-");
    expect(cookieWert(req, quizCookie(8))).toBeNull();
    expect(cookieWert(new Request("http://localhost/"), "a")).toBeNull();
  });
});

describe("json und Cookie-Optionen", () => {
  it("antwortet mit no-store", async () => {
    const r = json({ ok: true }, 409);
    expect(r.status).toBe(409);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true });
  });
  it("Cookie: HttpOnly, Lax, Pfad /, 12 h", () => {
    expect(quizCookie(3)).toBe("iuk-quiz-3");
    expect(BEITRITT_COOKIE_MAX_AGE_S).toBe(12 * 3600);
    expect(quizCookieOptionen()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 43_200,
    });
  });
});
