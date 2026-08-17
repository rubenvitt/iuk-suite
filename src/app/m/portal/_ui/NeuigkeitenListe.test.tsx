// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { NeuigkeitenListe } from "@/app/m/portal/_ui/NeuigkeitenListe";
import type { Neuigkeit } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { absatz, hinweis, liste } from "@/app/m/portal/_lib/neuigkeiten/typen";

const NEUIGKEITEN: Neuigkeit[] = [
  {
    modul: "lagerbuch",
    modulTitel: "Lagerbuch",
    icon: "ContainerOutlined",
    slug: "checkliste-als-pdf",
    datum: "2026-08-16",
    titel: "Fahrzeug-Checklisten als PDF",
    inhalt: [absatz("Neben „Drucken“ steht jetzt „PDF“."), liste("Fach", "Geräte")],
  },
  {
    modul: "portal",
    modulTitel: "Portal",
    icon: "AppstoreOutlined",
    slug: "von-allen-geraeten-abmelden",
    datum: "2026-08-14",
    titel: "Von allen Geräten abmelden",
    inhalt: [absatz("Im Nutzermenü steht „Profil“."), hinweis("Einmal abmelden, einmal anmelden.")],
  },
];

afterEach(async () => {
  await unmount();
});

/**
 * antds `Segmented` rendert je Eintrag ein `<label>` mit einem verborgenen
 * Radio darin; einen `value`-Attributwert trägt das Radio NICHT (der Wert lebt
 * im React-Zustand). Gesucht wird deshalb über die sichtbare Beschriftung —
 * also über das, was auch eine Person anklickt — und geklickt wird das Radio,
 * denn an ihm hängt `onChange`.
 */
async function klickeFilter(beschriftung: string): Promise<void> {
  const eintrag = queryAll('[data-testid="neuigkeiten-filter"] label').find((label) =>
    label.textContent?.includes(beschriftung),
  );
  if (!eintrag) throw new Error(`Kein Filtereintrag „${beschriftung}“`);
  const radio = eintrag.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!radio) throw new Error(`Filtereintrag „${beschriftung}“ ohne Radio`);
  await clickElement(radio);
}

describe("NeuigkeitenListe", () => {
  it("zeigt jede Notiz mit App, Datum und Titel", async () => {
    await mount(<NeuigkeitenListe neuigkeiten={NEUIGKEITEN} />);
    const notizen = queryAll('[data-testid="notiz"]');
    expect(notizen.length).toBe(2);
    expect(notizen[0].textContent).toContain("Lagerbuch");
    expect(notizen[0].textContent).toContain("16. August 2026");
    expect(notizen[0].textContent).toContain("Fahrzeug-Checklisten als PDF");
  });

  it("trägt den slug als Sprungmarke und das Maschinendatum am <time>", async () => {
    await mount(<NeuigkeitenListe neuigkeiten={NEUIGKEITEN} />);
    // `/neuigkeiten#checkliste-als-pdf` muss auf genau diese Karte führen —
    // ohne die id ist der Link ein Verweis auf den Seitenanfang.
    expect(exists("#checkliste-als-pdf")).toBe(true);
    expect(query("time").getAttribute("datetime")).toBe("2026-08-16");
  });

  it("rendert die drei Blockarten", async () => {
    await mount(<NeuigkeitenListe neuigkeiten={NEUIGKEITEN} />);
    expect(queryAll("p").some((p) => p.textContent?.includes("Neben „Drucken“"))).toBe(true);
    expect(queryAll("li").map((li) => li.textContent)).toEqual(["Fach", "Geräte"]);
    expect(query('[data-testid="notiz-hinweis"]').textContent).toContain("Einmal abmelden");
  });

  it("filtert auf eine App und wieder zurück", async () => {
    await mount(<NeuigkeitenListe neuigkeiten={NEUIGKEITEN} />);
    await klickeFilter("Portal");
    expect(queryAll('[data-testid="notiz"]').map((n) => n.getAttribute("data-modul"))).toEqual([
      "portal",
    ]);

    await klickeFilter("Alle");
    expect(queryAll('[data-testid="notiz"]').length).toBe(2);
  });

  it("zeigt keinen Filter, wenn alle Notizen zur selben App gehören", async () => {
    // Ein Schalter mit „Alle" und genau einer App ist kein Filter, sondern eine
    // Beschriftung — dieselbe Überlegung wie bei der Modulnavigation im Portal.
    await mount(<NeuigkeitenListe neuigkeiten={[NEUIGKEITEN[1]]} />);
    expect(exists('[data-testid="neuigkeiten-filter"]')).toBe(false);
    expect(queryAll('[data-testid="notiz"]').length).toBe(1);
  });

  it("sagt es, wenn für diese Person noch nichts vorliegt — ohne Filterzeile darüber", async () => {
    await mount(<NeuigkeitenListe neuigkeiten={[]} />);
    expect(query('[data-testid="neuigkeiten-leer"]').textContent).toContain("noch nichts");
    expect(exists('[data-testid="neuigkeiten-filter"]')).toBe(false);
    expect(exists('[data-testid="neuigkeiten"]')).toBe(false);
  });
});
