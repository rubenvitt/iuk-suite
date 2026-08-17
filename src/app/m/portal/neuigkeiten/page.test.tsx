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

import { auth } from "@/core/auth";
import NeuigkeitenPage from "@/app/m/portal/neuigkeiten/page";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { NeuigkeitenListe } from "@/app/m/portal/_ui/NeuigkeitenListe";
import { neuigkeitenFuer } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import type { Neuigkeit } from "@/app/m/portal/_lib/neuigkeiten/auswahl";

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

async function insel(): Promise<Neuigkeit[]> {
  const baum = flatten((await NeuigkeitenPage()) as ReactElement);
  const liste = baum.find((el) => el.type === NeuigkeitenListe)!;
  return (liste.props as { neuigkeiten: Neuigkeit[] }).neuigkeiten;
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

  it("uebergibt der Insel genau die Auswahl fuer die Gruppen der Sitzung", async () => {
    authMock.mockResolvedValue({ user: { groups: ["iuk-aufgaben-nutzer"] } } as never);
    expect(await insel()).toEqual(neuigkeitenFuer(["iuk-aufgaben-nutzer"]));
  });

  it("faellt anonym auf `null` zurueck, nicht auf „keine Gruppen“", async () => {
    /*
     * `[]` und `null` sind hier NICHT dasselbe: `canAccess` steigt bei
     * `groups === null` sofort mit `false` aus, während `[]` „angemeldet, aber
     * in keiner Gruppe" heißt — und das sieht die Notizen zum Portal. Ein
     * `?? []` an dieser Stelle wäre also eine stille Öffnung.
     */
    expect(await insel()).toEqual(neuigkeitenFuer(null));
    expect(await insel()).not.toEqual(neuigkeitenFuer([]));
  });
});
