// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Kettenpruefung } from "./Kettenpruefung";

afterEach(unmount);

const text = () => query("[data-kettenpruefung]").textContent ?? "";

describe("Kettenpruefung", () => {
  it("zeigt Chip und Satz", async () => {
    await mount(<Kettenpruefung zustand={{ art: "gebrochen", block: 2, grund: "Vorgänger fehlt oder wurde verändert" }} mitSatz />);
    expect(query("[data-ton]").getAttribute("data-ton")).toBe("rot");
    expect(query("[data-ton]").textContent).toBe("Gebrochen bei Block 2");
    expect(text()).toContain("Block 2: Vorgänger fehlt oder wurde verändert. Die Datei wurde nach dem Export verändert oder ist beschädigt.");
  });

  it("ohne mitSatz kein Satz", async () => {
    await mount(<Kettenpruefung zustand={{ art: "intakt", vollstaendig: true }} />);
    expect(query("[data-ton]").getAttribute("data-ton")).toBe("ok");
    expect(text()).toBe("Kette intakt");
    expect(exists("[data-satz]")).toBe(false);
  });

  it("ungeprüft und laufend sind grau", async () => {
    await mount(<Kettenpruefung zustand={{ art: "laeuft", i: 1, n: 3 }} mitSatz />);
    expect(query("[data-ton]").getAttribute("data-ton")).toBe("grau");
    expect(text()).toBe("Prüfe Block 1 von 3 …");
    expect(exists("[data-satz]")).toBe(false);
  });

  it("Anker ist nur selbst gemeldet", async () => {
    const hash = "ab12cd34".padEnd(64, "0");
    await mount(
      <Kettenpruefung
        zustand={{ art: "intakt", vollstaendig: true }}
        anker={{ block: 3, hash, gemeldetAm: "2026-09-23T21:10:00+02:00" }}
        zeitzone="Europe/Berlin"
      />,
    );
    expect(query("[data-anker]").textContent).toBe(
      "Anker laut Datei: Block 3, gemeldet am 23.9.2026, 21:10 Uhr (#ab12cd34) — nicht von der Suite bestätigt",
    );
  });

  it("ohne Anker keine Ankerzeile", async () => {
    await mount(<Kettenpruefung zustand={{ art: "ungeprueft" }} anker={null} />);
    expect(exists("[data-anker]")).toBe(false);
  });
});
