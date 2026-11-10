import { describe, expect, it, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * DIE VERDRAHTUNG DER SEITE — dieselbe leichte Bauform wie `portal/page.test.tsx`:
 * `NeuigkeitenPage()` liefert einen Elementbaum, keinen DOM. Geprüft wird, dass
 * die Sitzung die AUSWAHL steuert und die Insel genau deren Ergebnis bekommt.
 *
 * `@/core/auth` ist gemockt, weil next-auth im `node`-Environment an seinem
 * eigenen `next/server`-Import bricht (repoweiter Befund, siehe
 * `layout.test.tsx`). Die Auswahl selbst bleibt ECHT — sie ist rein, und ein
 * Mock darüber prüfte nur noch den Mock.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
// Die Datenbank bleibt draußen; was gemerkt wird, prüft `vorlieben.test.ts`.
vi.mock("@/app/m/portal/_lib/vorlieben", () => ({ neuigkeitenGesehenVon: vi.fn(() => null) }));
// Die Insel importiert die Server Actions, und die ziehen `next-auth` nach.
vi.mock("@/app/m/portal/neuigkeiten/actions", () => ({
  ladeNeuigkeitenAction: vi.fn(),
  merkeNeuigkeitenGesehenAction: vi.fn(),
}));

import { auth } from "@/core/auth";
import NeuigkeitenPage from "@/app/m/portal/neuigkeiten/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { NeuigkeitenListe } from "@/app/m/portal/_ui/NeuigkeitenListe";
import {
  NEUIGKEITEN_SEITE, appsAus, heuteIso, neuigkeitenFuer, tageZurueck, ERSTBESUCH_TAGE,
} from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import type { Neuigkeit, NeuigkeitenSeite } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import type { NeuigkeitenGesehen } from "@/app/m/portal/_db/schema";
import { neuigkeitenGesehenVon } from "@/app/m/portal/_lib/vorlieben";

const authMock = vi.mocked(auth);

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

interface InselProps {
  erste: NeuigkeitenSeite;
  apps: ReturnType<typeof appsAus>;
  neuSeit: NeuigkeitenGesehen | null;
  merken: boolean;
}

async function inselProps(): Promise<InselProps> {
  const baum = flatten((await NeuigkeitenPage()) as ReactElement);
  return baum.find((el) => el.type === NeuigkeitenListe)!.props as InselProps;
}

async function insel(): Promise<Neuigkeit[]> {
  return (await inselProps()).erste.eintraege;
}

describe("Neuigkeiten-Seite", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null as never);
  });

  it("traegt einen Seitenkopf mit Rueckweg auf die Kachelseite", async () => {
    const baum = flatten((await NeuigkeitenPage()) as ReactElement);
    const kopf = baum.find((el) => el.type === Seitenkopf);
    expect((kopf!.props as { titel: string }).titel).toBe("Neuigkeiten");
    // Anders als die Startseite ist diese Seite KEINE Wurzel — ohne Rückweg
    // wäre sie auf dem Telefon eine Sackgasse (Prüffrage aus dem Design-README).
    expect((kopf!.props as { zurueck?: { href: string } }).zurueck?.href).toBe("/");
  });

  it("uebergibt der Insel nur die erste Seite der Auswahl fuer die Gruppen der Sitzung", async () => {
    authMock.mockResolvedValue({ user: { groups: ["aufgaben-nutzer"] } } as never);
    const alle = neuigkeitenFuer(["aufgaben-nutzer"]);
    const props = await inselProps();
    // Die echten Notizen sind weit mehr als eine Seite — genau darum geht es (IDA-391).
    expect(alle.length).toBeGreaterThan(NEUIGKEITEN_SEITE);
    expect(props.erste).toEqual({ eintraege: alle.slice(0, NEUIGKEITEN_SEITE), weitere: true });
    expect(props.apps).toEqual(appsAus(alle));
  });

  it("vergleicht „Neu“ ohne Sitzungsperson gar nicht und ohne gemerkten Besuch mit den letzten Tagen", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    expect(await inselProps()).toMatchObject({ neuSeit: null, merken: false });

    authMock.mockResolvedValue({ user: { id: "person-1", groups: [] } } as never);
    vi.mocked(neuigkeitenGesehenVon).mockReturnValueOnce(null);
    expect(await inselProps()).toMatchObject({
      neuSeit: { bis: tageZurueck(heuteIso(), ERSTBESUCH_TAGE), schluessel: [] },
      merken: true,
    });

    const stand = { bis: "2026-11-01", schluessel: ["portal/x"] };
    vi.mocked(neuigkeitenGesehenVon).mockReturnValueOnce(stand);
    expect((await inselProps()).neuSeit).toEqual(stand);
    expect(neuigkeitenGesehenVon).toHaveBeenLastCalledWith("person-1");
  });

  it("faellt anonym auf `null` zurueck, nicht auf „keine Gruppen“", async () => {
    /*
     * `[]` und `null` sind hier NICHT dasselbe: `canAccess` steigt bei
     * `groups === null` sofort mit `false` aus, während `[]` „angemeldet, aber
     * in keiner Gruppe" heißt — und das sieht die Notizen zum Portal. Ein
     * `?? []` an dieser Stelle wäre also eine stille Öffnung.
     */
    expect(await insel()).toEqual(neuigkeitenFuer(null).slice(0, NEUIGKEITEN_SEITE));
    expect(await insel()).not.toEqual(neuigkeitenFuer([]).slice(0, NEUIGKEITEN_SEITE));
  });
});
