import { describe, it, expect } from "vitest";
import { absoluteCallbackUrl } from "@/core/auth/callbackUrl";

const QR = "https://qr.iuk-ue.de";

describe("absoluteCallbackUrl", () => {
  // Der Kern des Befunds: relativ abgeschickt, löst Auth.js gegen AUTH_URL auf
  // (= Portal) statt gegen den Host, auf dem der Login begann.
  it("absolutiert einen relativen Pfad gegen den aktuellen Origin", () => {
    expect(absoluteCallbackUrl("/", QR)).toBe(`${QR}/`);
    expect(absoluteCallbackUrl("/admin?tab=presets", QR)).toBe(`${QR}/admin?tab=presets`);
  });

  // Ein bereits absoluter Wert kommt aus einem Einstiegspunkt, der den Host
  // kannte — der darf nicht auf den aktuellen Origin umgebogen werden.
  it("reicht einen bereits absoluten Wert durch", () => {
    expect(absoluteCallbackUrl(`${QR}/x`, "https://iuk-ue.de")).toBe(`${QR}/x`);
  });

  // Alles, was keine eigene Origin mitbringt, bleibt auf der aktuellen — auch
  // Unsinn. Das ist die gewuenschte Eigenschaft: der Nutzer verlaesst den Host
  // nie unbeabsichtigt, egal was im Query-Parameter stand.
  it("laesst nicht-absolute Werte auf dem aktuellen Origin", () => {
    expect(absoluteCallbackUrl("", QR)).toBe(`${QR}/`);
    expect(new URL(absoluteCallbackUrl("not a url", QR)).origin).toBe(QR);
  });

  // Kein Schutz vor fremden absoluten Zielen an dieser Stelle — das ist Aufgabe
  // der Allowlist in redirect.ts, die serverseitig laeuft und nicht umgangen
  // werden kann. Hier abzuweisen taeuschte eine Sicherheit vor, die eine
  // Client-Komponente ohnehin nicht leisten kann.
  it("reicht fremde absolute Ziele durch — geprueft wird serverseitig", () => {
    expect(absoluteCallbackUrl("https://evil.example.com/x", QR)).toBe(
      "https://evil.example.com/x",
    );
    // Protokoll-relativ zaehlt hier als absolut: `//host/x` bringt eine eigene
    // Origin mit. Auch das faengt erst die Allowlist ab (siehe redirect.test.ts).
    expect(absoluteCallbackUrl("//evil.example.com/x", QR)).toBe("https://evil.example.com/x");
  });
});
