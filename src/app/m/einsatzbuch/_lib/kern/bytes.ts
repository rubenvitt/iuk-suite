/** Bytefolgen, die WebCrypto ohne Umweg annimmt (`BufferSource` verlangt einen `ArrayBuffer`, keinen `SharedArrayBuffer`). */
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function ausUtf8(bytes: Bytes): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function zuBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function ausBase64(text: string): Bytes {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new Error("Kein gültiges Base64");
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (zuBase64(out) !== text) throw new Error("Kein gültiges Base64");
  return out;
}

export function zuHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: Bytes): Promise<string> {
  return zuHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function zufall(laenge: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(laenge));
}

/**
 * Erzwingt eine feste Bytelänge. Rust hat für IV, ephemeren Schlüssel und Umschlag-Chiffrat
 * feste Größen (`Aes256Gcm` z. B. eine feste 12-Byte-Nonce) — ohne diese Prüfung öffnet ein
 * TypeScript-Block im Reader, aber nicht in der Desktop-App.
 */
export function mitLaenge(b: Bytes, n: number, was: string): Bytes {
  if (b.length !== n) throw new Error(`${was} muss ${n} Byte lang sein`);
  return b;
}
