import { describe, it, expect } from "vitest";
import {
  computeClosesAt,
  freigabelage,
  isExpired,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
} from "./lifecycle";

const t = (iso: string) => new Date(iso);

describe("computeClosesAt", () => {
  // Neuer Anker (Entscheidung C): Ende des lokalen Kalendertags (Europe/Berlin)
  // von `eveningDate` + `closeAfterHours`. `eveningDate` ist der Abend-Tag, nicht
  // mehr die Aktivierungszeit.

  it("Abend am 24.07., Frist 48h → schließt am 27.07. um 00:00 lokal", () => {
    // Ende des 24.07. lokal = 25.07. 00:00 Berlin (CEST, UTC+2) = 24.07. 22:00Z
    // + 48h = 27.07. 00:00 Berlin = 26.07. 22:00Z
    expect(computeClosesAt(t("2026-07-24T00:00:00Z"), 48)).toEqual(
      t("2026-07-26T22:00:00Z"),
    );
  });

  it("Abend heute, Frist 0 → schließt zum lokalen Tagesende", () => {
    // Ende des 09.04. lokal = 10.04. 00:00 Berlin (CEST, UTC+2) = 09.04. 22:00Z
    expect(computeClosesAt(t("2026-04-09T00:00:00Z"), 0)).toEqual(
      t("2026-04-09T22:00:00Z"),
    );
  });

  it("Default sind 48h", () => {
    expect(DEFAULT_CLOSE_AFTER_HOURS).toBe(48);
  });

  describe("Sommerzeit-Grenze", () => {
    it("Märzumstellung (2026-03-29, 2:00 CET → 3:00 CEST): Frist verrutscht nicht", () => {
      // Abend am Tag VOR der Umstellung. Ende des 28.03. lokal = 29.03. 00:00 —
      // die Umstellung selbst findet erst um 2:00 desselben Tages statt, also
      // ist 00:00 noch CET (UTC+1): 29.03. 00:00 Berlin = 28.03. 23:00Z.
      // Eine naive feste Offset-Rechnung (immer +2h, wie im Sommer) läge hier
      // eine Stunde daneben.
      expect(computeClosesAt(t("2026-03-28T00:00:00Z"), 0)).toEqual(
        t("2026-03-28T23:00:00Z"),
      );
    });

    it("Märzumstellung, Tag der Umstellung selbst: Ende des Tages ist schon CEST", () => {
      // Abend am 29.03. (Umstellungstag). Ende des 29.03. lokal = 30.03. 00:00 —
      // die Umstellung (2:00 → 3:00) liegt bereits hinter uns, also CEST (UTC+2):
      // 30.03. 00:00 Berlin = 29.03. 22:00Z.
      expect(computeClosesAt(t("2026-03-29T00:00:00Z"), 0)).toEqual(
        t("2026-03-29T22:00:00Z"),
      );
    });

    it("Oktoberumstellung (2026-10-25, 3:00 CEST → 2:00 CET): Frist verrutscht nicht", () => {
      // Abend am Umstellungstag selbst. Ende des 25.10. lokal = 26.10. 00:00 —
      // die Umstellung liegt bereits hinter uns (3:00 CEST → 2:00 CET), also
      // CET (UTC+1): 26.10. 00:00 Berlin = 25.10. 23:00Z. Eine naive feste
      // Offset-Rechnung (immer +2h, wie im Sommer) läge hier eine Stunde daneben.
      expect(computeClosesAt(t("2026-10-25T00:00:00Z"), 0)).toEqual(
        t("2026-10-25T23:00:00Z"),
      );
    });
  });

  it("`date` als Mitternacht UTC: lokaler Kalendertag entscheidet, nicht der UTC-Tag", () => {
    // 23:00 UTC am 23.07. ist in Berlin (CEST, UTC+2) bereits 01:00 am 24.07. —
    // der lokale Kalendertag ist der 24., obwohl die UTC-Repräsentation noch auf
    // den Vortag fällt. Muss auf denselben closesAt abbilden wie ein sauberes
    // Mitternacht-UTC-Datum für denselben lokalen Tag.
    expect(computeClosesAt(t("2026-07-23T23:00:00Z"), 0)).toEqual(
      t("2026-07-24T22:00:00Z"),
    );
    expect(computeClosesAt(t("2026-07-24T00:00:00Z"), 0)).toEqual(
      t("2026-07-24T22:00:00Z"),
    );
  });

  it("Vorab-Anlegen: Abend in 4 Tagen → Frist liegt nach dem Abend, nicht vor ihm", () => {
    const eveningIn4Days = t("2026-08-01T00:00:00Z");
    const closesAt = computeClosesAt(eveningIn4Days, DEFAULT_CLOSE_AFTER_HOURS);
    expect(closesAt.getTime()).toBeGreaterThan(eveningIn4Days.getTime());
  });
});

describe("isExpired", () => {
  it("false wenn closesAt null", () => {
    expect(isExpired(null, t("2026-04-09T10:00:00Z"))).toBe(false);
  });
  it("true wenn now >= closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:01Z"))).toBe(true);
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:00Z"))).toBe(true);
  });
  it("false wenn now < closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T09:59:59Z"))).toBe(false);
  });
});

describe("nextStatusOnAccess", () => {
  it("active + abgelaufen → closed", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T10:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("closed");
  });
  it("active + nicht abgelaufen bleibt active", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T12:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("active");
  });
  it("draft/closed/archived bleiben unverändert", () => {
    const now = t("2026-04-09T11:00:00Z");
    expect(nextStatusOnAccess("draft", null, now)).toBe("draft");
    expect(nextStatusOnAccess("closed", t("2020-01-01T00:00:00Z"), now)).toBe("closed");
    expect(nextStatusOnAccess("archived", null, now)).toBe("archived");
  });
});

/**
 * DIE FREIGABEREGEL — zwei Riegel mit verschiedenen Gründen, und der
 * Unterschied zwischen ihnen ist der Alltagsfall.
 */
describe("freigabelage", () => {
  const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);
  // Ein Zeitpunkt mitten am Tag, damit der Test nicht an einer Mitternachtskante
  // hängt: 19:30 ist die Stunde, in der freigegeben wird.
  const jetzt = new Date("2026-09-19T17:30:00Z");

  it("lehnt einen Abend VOR seinem Kalendertag ab", () => {
    // Die Freigabe setzt den Abend auf `held`, und das heißt überall „hat
    // stattgefunden". Ein Klick auf die falsche Zeile der Jahresplanung machte
    // den Dezembertermin im September zum gelaufenen — und schlösse dabei die
    // tatsächlich laufende Umfrage.
    expect(freigabelage(tag("2026-09-20"), 48, jetzt)).toBe("zuFrueh");
    expect(freigabelage(tag("2026-12-10"), 48, jetzt)).toBe("zuFrueh");
  });

  it("erlaubt den Abend des heutigen Tages", () => {
    // Der Normalfall: 19:30 am Abend des Dienstes.
    expect(freigabelage(tag("2026-09-19"), 48, jetzt)).toBe("ok");
  });

  it("ERLAUBT den Morgen danach — der Tag ist vorbei, die Frist nicht", () => {
    /*
     * ⚠️ Der Fall, der die beiden Riegel überhaupt nötig macht. Ein einziger
     * Datumsvergleich hätte hier abgelehnt, obwohl der Bogen noch zwei Tage
     * offen ist: `computeClosesAt` rechnet Tagesende plus Frist, bei 48 Stunden
     * also bis zwei Tage Rückstand.
     */
    expect(freigabelage(tag("2026-09-18"), 48, jetzt)).toBe("ok");
    expect(freigabelage(tag("2026-09-17"), 48, jetzt)).toBe("ok");
  });

  it("lehnt einen vergessenen Termin ab, dessen Frist schon vorbei ist", () => {
    /*
     * Sonst entstünde ein TOTER Bogen: `computeClosesAt` ankert am Abenddatum,
     * die Frist läge also in der Vergangenheit, und der erste öffentliche
     * Aufruf faltete ihn sofort auf `closed`. Herausgekommen wäre: die laufende
     * Umfrage beendet, nichts an ihrer Stelle, und eine Bestätigung, die „ab
     * sofort kann geantwortet werden" versprochen hat.
     */
    expect(freigabelage(tag("2026-09-16"), 48, jetzt)).toBe("abgelaufen");
    expect(freigabelage(tag("2026-09-12"), 48, jetzt)).toBe("abgelaufen");
  });

  it("verschiebt die Grenze mit der Fristlänge der Gruppe", () => {
    // Die Regel liest die Frist, sie rechnet nicht mit 48 als Konstante — eine
    // Gruppe mit 7 Tagen darf einen Abend von letzter Woche noch freigeben.
    const vorSechsTagen = tag("2026-09-13");
    expect(freigabelage(vorSechsTagen, 48, jetzt)).toBe("abgelaufen");
    expect(freigabelage(vorSechsTagen, 24 * 7, jetzt)).toBe("ok");
  });
});
