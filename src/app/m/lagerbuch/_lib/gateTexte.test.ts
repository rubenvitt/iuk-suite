import { describe, it, expect } from "vitest";
import {
  istGateGrund,
  gateMeldung,
  gateGrundFuerSperre,
  GATE_GRUENDE,
  type GateGrund,
} from "./gateTexte";

describe("istGateGrund — ein GESCHLOSSENER Satz", () => {
  it("erkennt genau die fuenf Werte", () => {
    for (const g of ["code", "gesperrt", "abgelaufen", "zuviele", "anmeldung"]) {
      expect(istGateGrund(g)).toBe(true);
    }
    expect([...GATE_GRUENDE].sort())
      .toEqual(["abgelaufen", "anmeldung", "code", "gesperrt", "zuviele"]);
  });

  it("weist alles andere ab — ein searchParams-Wert ist NUTZEREINGABE", () => {
    /**
     * Der Wert wird gegen die Liste geprueft und NIE in die Seite durchgereicht.
     * Ohne diese Zeile stuende `?grund=<img src=x onerror=...>` im Gate-Text,
     * und React entkaeme es zwar — aber der Route Handler /abmelden baut daraus
     * einen Location-Kopf, und dort gilt das nicht.
     */
    for (const roh of ["rate", "CODE", " code", "", "code,gesperrt", "__proto__"]) {
      expect(istGateGrund(roh)).toBe(false);
    }
    expect(istGateGrund(null)).toBe(false);
    expect(istGateGrund(undefined)).toBe(false);
  });
});

describe("gateMeldung — die einzige Stelle, an der diese Saetze stehen", () => {
  it("liefert fuer jeden Grund einen deutschen Satz", () => {
    expect(gateMeldung("code", null))
      .toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
    expect(gateMeldung("gesperrt", null))
      .toBe("Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.");
    expect(gateMeldung("abgelaufen", null))
      .toBe("Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.");
    expect(gateMeldung("anmeldung", null))
      .toBe("Deine Anmeldung ist abgelaufen. Melde dich erneut an.");
  });

  it("nennt das Kärtchen NUR im Kärtchen-Satz (DRK-305)", () => {
    /*
     * ⚠️ DER KERN DES BEFUNDS, NICHT SEINE KOSMETIK. Beide Sätze beschreiben
     * denselben Zustand — der Zugang ist weg —, und sie unterscheiden sich in
     * genau der Handlung, die sie verlangen. „Scanne das Kärtchen erneut" ist
     * für jemanden, der nie eins hatte, eine Aufforderung ins Leere; das Gate
     * bietet daneben zwar die Pocket-ID-Karte an, aber der SATZ zeigt auf den
     * falschen der beiden Wege.
     */
    expect(gateMeldung("abgelaufen", null)).toContain("Kärtchen");
    expect(gateMeldung("anmeldung", null)).not.toContain("Kärtchen");
    expect(gateMeldung("anmeldung", null)).toContain("Anmeldung");
  });

  it("unterscheidet `code` und `gesperrt` im WORTLAUT", () => {
    // Nicht kosmetisch: `code` heisst „unbekannt ODER gesperrt" (der Scanner
    // weiss es nicht), `gesperrt` heisst „wir wissen es genau, dein Kaertchen
    // wurde gesperrt". Zusammengelegt verlaere die zweite Lage ihre Auskunft.
    expect(gateMeldung("code", null)).not.toBe(gateMeldung("gesperrt", null));
  });

  it("traegt bei `zuviele` die Sekundenzahl — und faellt ohne sie auf die Minute", () => {
    expect(gateMeldung("zuviele", 42))
      .toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
    // Kommt null zurueck, ist die Sperre inzwischen abgelaufen (§3.9).
    expect(gateMeldung("zuviele", null))
      .toBe("Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.");
  });

  it("schreibt die Singularform aus", () => {
    // Festlegung G8 — „in 1 Sekunden" ist kein zumutbarer deutscher Satz.
    expect(gateMeldung("zuviele", 1))
      .toBe("Zu viele Fehlversuche. Bitte in 1 Sekunde erneut versuchen.");
  });

  it("ignoriert `sperrSekunden` bei jedem anderen Grund", () => {
    // Die Zahl gehoert zu `zuviele` und zu nichts sonst. Ohne diese Zeile
    // wanderte sie beim naechsten Umbau in einen Text, in dem sie nichts bedeutet.
    expect(gateMeldung("code", 42)).toBe(gateMeldung("code", null));
  });

  it("liefert null bei unbekanntem oder fehlendem Grund — das Gate rendert normal", () => {
    // Ausdruecklich KEIN Rueckfalltext. Ein „Etwas ist schiefgelaufen" auf einer
    // Seite, die gerade voellig normal aufgerufen wurde, ist schlechter als
    // Schweigen — und der Regelfall dieser Seite IST der normale Aufruf.
    expect(gateMeldung(null, null)).toBeNull();
    expect(gateMeldung(undefined, null)).toBeNull();
    expect(gateMeldung("rate", null)).toBeNull();     // der ALTE Wert aus ?err=
    expect(gateMeldung("", null)).toBeNull();
  });

  it("kennt fuer JEDEN Wert des Satzes einen Text — keine Luecke", () => {
    // Mechanisch: waechst GATE_GRUENDE um einen Wert, ohne dass gateMeldung ihn
    // kennt, ist das hier rot statt still `null`.
    for (const g of GATE_GRUENDE) {
      expect(gateMeldung(g, 5), `kein Text fuer ${g}`).toBeTypeOf("string");
    }
  });
});

describe("die Typzusage", () => {
  it("verengt den Typ, damit ein roher Wert nicht durchrutscht", () => {
    const roh: string | null = "gesperrt";
    if (istGateGrund(roh)) {
      const g: GateGrund = roh;   // typecheckt NUR, wenn `roh is GateGrund` greift
      expect(g).toBe("gesperrt");
    } else {
      expect.unreachable("haette erkannt werden muessen");
    }
  });
});

describe("gateGrundFuerSperre — derselbe Zustand, zwei Herkuenfte (DRK-305)", () => {
  it("ohne Konto heisst `sitzung` am Gate `abgelaufen`", () => {
    expect(gateGrundFuerSperre("sitzung", false)).toBe("abgelaufen");
  });

  it("mit Konto heisst `sitzung` am Gate `anmeldung`", () => {
    expect(gateGrundFuerSperre("sitzung", true)).toBe("anmeldung");
  });

  it("`gesperrt` bleibt in BEIDEN Herkuenften `gesperrt`", () => {
    /*
     * Das ist kein vergessener Fall, sondern ein Befund aus `befund()`
     * (`_lib/helferZugang.ts`): `gesperrt` entsteht ausschliesslich MIT
     * Kaertchen-Cookie — die Token-Zeile ist weg oder stillgelegt. Wer diesen
     * Grund sieht, HAT also ein Kaertchen, und „wende dich an die Leitung"
     * stimmt fuer ihn, ob er daneben angemeldet ist oder nicht. Ein zweiter
     * Satz hier waere eine Unterscheidung ohne Unterschied.
     */
    expect(gateGrundFuerSperre("gesperrt", false)).toBe("gesperrt");
    expect(gateGrundFuerSperre("gesperrt", true)).toBe("gesperrt");
  });

  it("liefert nur Werte, die der Route Handler /abmelden weiterreichen darf", () => {
    // `/abmelden` baut aus dem Wert einen Location-Kopf und laesst nur den
    // geschlossenen Satz durch (`abmelden/route.ts`). Ein Rueckgabewert
    // ausserhalb davon liefe dort still ins Leere.
    for (const grund of ["sitzung", "gesperrt"] as const) {
      for (const konto of [true, false]) {
        expect(istGateGrund(gateGrundFuerSperre(grund, konto))).toBe(true);
      }
    }
  });
});
