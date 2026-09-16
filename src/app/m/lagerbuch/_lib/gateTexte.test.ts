import { describe, it, expect } from "vitest";
import {
  istGateGrund,
  gateMeldung,
  gateGrundFuerSperre,
  GATE_GRUENDE,
  type GateGrund,
} from "./gateTexte";

describe("istGateGrund — ein GESCHLOSSENER Satz", () => {
  it("erkennt genau die sechs Werte", () => {
    for (const g of ["code", "gesperrt", "abgelaufen", "zuviele", "anmeldung", "keinZugriff"]) {
      expect(istGateGrund(g)).toBe(true);
    }
    expect([...GATE_GRUENDE].sort())
      .toEqual(["abgelaufen", "anmeldung", "code", "gesperrt", "keinZugriff", "zuviele"]);
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
    expect(gateMeldung("keinZugriff", null))
      .toBe("Dein Konto hat keinen Zugriff auf das Lagerbuch. Wende dich an die Leitung.");
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

const KAERTCHEN = { herkunft: "kaertchen" } as const;
const SITZUNG_WEG = { herkunft: "konto", nochAngemeldet: false } as const;
const GRUPPE_WEG = { herkunft: "konto", nochAngemeldet: true } as const;

describe("gateGrundFuerSperre — ein Zustand, drei Lagen (DRK-305)", () => {
  it("mit Kaertchen heisst `sitzung` am Gate `abgelaufen`", () => {
    expect(gateGrundFuerSperre("sitzung", KAERTCHEN)).toBe("abgelaufen");
  });

  it("angemeldet gewesen, Sitzung weg → `anmeldung`", () => {
    expect(gateGrundFuerSperre("sitzung", SITZUNG_WEG)).toBe("anmeldung");
  });

  it("NOCH angemeldet, aber Gruppe entzogen → `keinZugriff`", () => {
    /*
     * ⚠️ DER TRAEGER DES ZWEITEN BEFUNDS (P2 zu PR #169), und ohne ihn ist eine
     * Fassung gruen, die eine SCHLEIFE baut: „Melde dich erneut an" schickt
     * diese Person durch den ganzen Pocket-ID-Weg — und danach steht sie vor
     * derselben Sperre, denn ihr fehlt nicht die Sitzung, sondern das Recht.
     */
    expect(gateGrundFuerSperre("sitzung", GRUPPE_WEG)).toBe("keinZugriff");
  });

  it("die drei Lagen liefern DREI verschiedene Saetze", () => {
    // Mechanisch gegen das Zusammenlegen: zwei gleiche Saetze hiessen, dass
    // eine der drei Lagen ihre Auskunft verloren hat.
    const saetze = [KAERTCHEN, SITZUNG_WEG, GRUPPE_WEG]
      .map((lage) => gateMeldung(gateGrundFuerSperre("sitzung", lage), null));
    expect(new Set(saetze).size).toBe(3);
  });

  it("nur `anmeldung` fordert zum Anmelden auf", () => {
    // Die Probe auf den Befund selbst: der Satz fuer die entzogene Gruppe darf
    // genau das NICHT verlangen, sonst ist die Schleife wieder da.
    expect(gateMeldung("keinZugriff", null)).not.toContain("Melde dich");
    expect(gateMeldung("keinZugriff", null)).toContain("Leitung");
  });

  it("`gesperrt` gilt NUR in der Kaertchen-Lage", () => {
    expect(gateGrundFuerSperre("gesperrt", KAERTCHEN)).toBe("gesperrt");
  });

  it("ein TOTES Kaertchen-Cookie ueberstimmt die Konto-Herkunft NICHT", () => {
    /*
     * ⚠️ DER TRAEGER DES DRITTEN BEFUNDS (P2 zu PR #169, zweite Runde), und er
     * sichert eine Unterscheidung zwischen BESITZEN und BENUTZEN.
     *
     * `requireHelferSitzung` faellt hinter `grund: "gesperrt"` ausdruecklich auf
     * das Konto durch — wer ein totes Kaertchen-Cookie im Browser hat und sich
     * anmeldet, arbeitet also angemeldet weiter, und das Cookie bleibt liegen.
     * Faellt spaeter die Anmeldung, liefert der Riegel den Grund des KAERTCHENS.
     * Ohne diese Zeile stuende dann „dieser Zugangs-Code wurde gesperrt" vor
     * einer Person, die nie einen Code eingegeben hat — eine Auskunft ueber den
     * falschen Gegenstand, und sie verschweigt den Weg, der wirklich hilft.
     */
    expect(gateGrundFuerSperre("gesperrt", SITZUNG_WEG)).toBe("anmeldung");
    expect(gateGrundFuerSperre("gesperrt", GRUPPE_WEG)).toBe("keinZugriff");
  });

  it("in der Konto-Lage sind BEIDE Gruende gleichgueltig", () => {
    // Die Verallgemeinerung des Falls darueber: was dem Kaertchen widerfahren
    // ist, spielt fuer jemanden, der es nicht benutzt hat, keine Rolle.
    for (const lage of [SITZUNG_WEG, GRUPPE_WEG]) {
      expect(gateGrundFuerSperre("gesperrt", lage))
        .toBe(gateGrundFuerSperre("sitzung", lage));
    }
  });

  it("liefert nur Werte, die der Route Handler /abmelden weiterreichen darf", () => {
    // `/abmelden` baut aus dem Wert einen Location-Kopf und laesst nur den
    // geschlossenen Satz durch (`abmelden/route.ts`). Ein Rueckgabewert
    // ausserhalb davon liefe dort still ins Leere.
    for (const grund of ["sitzung", "gesperrt"] as const) {
      for (const lage of [KAERTCHEN, SITZUNG_WEG, GRUPPE_WEG]) {
        expect(istGateGrund(gateGrundFuerSperre(grund, lage))).toBe(true);
      }
    }
  });
});
