const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SECRET_LEN = 5;

/**
 * Zerlegt ein Token `{slug}-{secret}` positionsbasiert — NICHT per split("-"),
 * weil der slug selbst Bindestriche enthalten darf. secret sind die letzten 5
 * Zeichen, das Trennzeichen an Position len-6 wird verworfen.
 * Muss exakt der Alt-Logik entsprechen (public.go:141-146), sonst brechen
 * gedruckte QR-Codes.
 */
export function parseToken(
  slugSecret: string,
): { slug: string; secret: string } | null {
  if (slugSecret.length < SECRET_LEN + 2) return null; // mind. 1 slug-Zeichen + "-" + 5
  const secret = slugSecret.slice(-SECRET_LEN);
  const slug = slugSecret.slice(0, -(SECRET_LEN + 1));
  if (slug.length === 0) return null;
  return { slug, secret };
}

export function buildToken(slug: string, secret: string): string {
  return `${slug}-${secret}`;
}

/** 5 Zeichen aus [a-z0-9]. `rng` (0..1) injizierbar für deterministische Tests. */
export function generateSecret(rng: () => number = defaultRng): string {
  let out = "";
  for (let i = 0; i < SECRET_LEN; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return out;
}

function defaultRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
