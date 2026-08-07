// @vitest-environment jsdom

import { act } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  click,
  clickPortal,
  existsPortal,
  mount,
  queryPortal,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { LoeschDialog } from "./LoeschDialog";
import { LoeschButton } from "./LoeschButton";
import { ELEMENT_ARTEN, type Loeschbarkeit } from "../_lib/loeschen";

afterEach(async () => {
  await unmount();
});

const LOESCHBAR: Loeschbarkeit = { loeschbar: true };
const GESPERRT: Loeschbarkeit = {
  loeschbar: false,
  grund: "Noch mit 12 Buchungen verknüpft — Löschen würde den Nachweis zerstören.",
  kannDeaktivieren: true,
};

const echtesGetComputedStyle = window.getComputedStyle;

beforeAll(() => {
  // rc-dialog fragt die Breite eines Pseudo-Elements ab. jsdom meldet dafuer
  // nur "not implemented"; fuer diese Verhaltenstests genuegt derselbe Style
  // ohne Pseudo-Element, wie bei allen anderen antd-Layout-Stubs im Projekt.
  window.getComputedStyle = (element: Element) => echtesGetComputedStyle(element);
});

afterAll(() => {
  window.getComputedStyle = echtesGetComputedStyle;
});

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (grund?: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (grund?: unknown) => void;
  const promise = new Promise<void>((erfolg, fehler) => {
    resolve = erfolg;
    reject = fehler;
  });
  return { promise, resolve, reject };
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement | HTMLTextAreaElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter am Prototyp von ${input.tagName}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("LoeschDialog: die Vorpruefung", () => {
  it("ruft `pruefen` BEIM OEFFNEN, vor jeder Handlung", async () => {
    const pruefen = vi.fn(async () => LOESCHBAR);
    await mount(
      <LoeschDialog
        offen
        name="Kompressen"
        typLabel="Artikel"
        pruefen={pruefen}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    // Ob ein Artikel loeschbar oder nur deaktivierbar ist, weisz NUR der
    // Server. Genau deshalb existiert dieser Dialog ueberhaupt.
    expect(pruefen).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Grund und bietet Deaktivieren an, wenn nicht loeschbar", async () => {
    const deaktivieren = vi.fn(async () => {});
    await mount(
      <LoeschDialog
        offen
        name="Kompressen"
        typLabel="Artikel"
        pruefen={async () => GESPERRT}
        onLoeschen={async () => {}}
        onDeaktivieren={deaktivieren}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("Noch mit 12 Buchungen verknüpft");
    // Der zweite Ausgang: ohne ihn bliebe `deaktiviereElement` stumm.
    await clickPortal("[data-rolle='deaktivieren']");
    expect(deaktivieren).toHaveBeenCalledTimes(1);
  });

  it("der Loeschknopf ist bei „nicht loeschbar\" gar nicht vorhanden", async () => {
    await mount(
      <LoeschDialog
        offen
        name="Kompressen"
        typLabel="Artikel"
        pruefen={async () => GESPERRT}
        onLoeschen={async () => {}}
        onDeaktivieren={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(existsPortal("[data-rolle='loeschen']")).toBe(false);
  });

  it("blendet den zweiten Ausgang aus, wenn Deaktivieren fachlich verboten ist", async () => {
    await mount(
      <LoeschDialog
        offen
        name="Handlager"
        typLabel="Artikel"
        pruefen={async () => ({
          loeschbar: false,
          grund: "Das Handlager darf nicht deaktiviert werden.",
          kannDeaktivieren: false,
        })}
        onLoeschen={async () => {}}
        onDeaktivieren={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(existsPortal("[data-rolle='deaktivieren']")).toBe(false);
  });

  it("meldet den Grund NICHT als Alert type=error und traegt die fachliche Warnbox", async () => {
    // Ein `Alert type="error"` ueber einer Liste mit Ampel-Chips braechte
    // zwei verschiedene Rot auf denselben Bildschirm — und das kraeftigere
    // gehoerte der Fehlermeldung statt dem abgelaufenen Medikament (§6.6.5).
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => GESPERRT}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(existsPortal(".ant-alert-error")).toBe(false);
    expect(queryPortal("[data-rolle='fachwarnung']").className).toMatch(/warnbox/);
  });

  it("zeigt einen verstaendlichen Fehler, wenn schon die Vorpruefung scheitert", async () => {
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => {
          throw new Error("Netzwerkdetail");
        }}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain(
      "Die Prüfung ist fehlgeschlagen — bitte erneut versuchen.",
    );
    expect(existsPortal("[data-rolle='loeschen']")).toBe(false);
  });
});

describe("LoeschDialog: die Namenseingabe", () => {
  it("der Loeschknopf bleibt gesperrt, solange der Name nicht exakt stimmt", async () => {
    const loeschen = vi.fn(async () => {});
    await mount(
      <LoeschDialog
        offen
        name="Kompressen steril"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={loeschen}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fillPortal(".ant-modal input", "Kompressen");
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fillPortal(".ant-modal input", "kompressen steril");
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fillPortal(".ant-modal input", "Kompressen steril");
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(false);
    await clickPortal("[data-rolle='loeschen']");
    expect(loeschen).toHaveBeenCalledTimes(1);
  });

  it("das Namensfeld traegt ein Label mit dem erwarteten Namen", async () => {
    await mount(
      <LoeschDialog
        offen
        name="RTW 1"
        typLabel="Fahrzeug"
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("RTW 1");
    expect(queryPortal(".ant-modal input").getAttribute("aria-label")).toBe(
      "Namen zur Bestätigung eingeben",
    );
  });
});

describe("LoeschDialog: Huelle und Beschriftungen", () => {
  it("traegt die Rolle dialog mit einem Namen, der „löschen\" enthaelt", async () => {
    // Ersatzanker fuer `.modalbox` (§6.11):
    // getByRole("dialog", { name: /löschen/i }).
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="BZ-Gerät"
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    const modal = queryPortal("[role='dialog']");
    expect(modal.getAttribute("aria-label") ?? modal.textContent).toMatch(/löschen/i);
    expect(queryPortal(".ant-modal-title").textContent).toBe("BZ-Gerät löschen");
  });

  it("benutzt die konfigurierbare Beschriftung des zweiten Ausgangs", async () => {
    await mount(
      <LoeschDialog
        offen
        name="111-111"
        typLabel="Zugangs-Code"
        deaktivierenLabel="Sperren"
        pruefen={async () => GESPERRT}
        onLoeschen={async () => {}}
        onDeaktivieren={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal("[data-rolle='deaktivieren']").textContent).toContain("Sperren");
  });

  it("zeigt einen zusaetzlichen Hinweis, wenn einer uebergeben wird", async () => {
    await mount(
      <LoeschDialog
        offen
        name="Standard-RTW"
        typLabel="Vorlage"
        hinweis="3 Fahrzeuge werden von dieser Vorlage gelöst; ihre Positionen bleiben erhalten."
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("3 Fahrzeuge werden");
  });

  it("Escape schliesst, ohne die Loesch-Action auszuloesen", async () => {
    const loeschen = vi.fn(async () => {});
    const schliessen = vi.fn();
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={loeschen}
        onSchliessen={schliessen}
      />,
    );
    await warte();
    await fillPortal(".ant-modal input", "X");
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    expect(schliessen).toHaveBeenCalledTimes(1);
    expect(loeschen).not.toHaveBeenCalled();
  });

  it("der Schliessen-Knopf schliesst, ohne eine Action auszuloesen", async () => {
    const loeschen = vi.fn(async () => {});
    const deaktivieren = vi.fn(async () => {});
    const schliessen = vi.fn();
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => GESPERRT}
        onLoeschen={loeschen}
        onDeaktivieren={deaktivieren}
        onSchliessen={schliessen}
      />,
    );
    await warte();
    await clickPortal(".ant-modal-close");
    expect(schliessen).toHaveBeenCalledTimes(1);
    expect(loeschen).not.toHaveBeenCalled();
    expect(deaktivieren).not.toHaveBeenCalled();
  });
});

describe("LoeschDialog: Actions", () => {
  it("meldet einen Fehler der Loesch-Action am Dialog, nicht als Wurf", async () => {
    const fertig = vi.fn();
    const schliessen = vi.fn();
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {
          throw new Error("Noch verknüpft");
        }}
        onSchliessen={schliessen}
        onFertig={fertig}
      />,
    );
    await warte();
    await fillPortal(".ant-modal input", "X");
    await clickPortal("[data-rolle='loeschen']");
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("konnte nicht gelöscht werden");
    expect(fertig).not.toHaveBeenCalled();
    expect(schliessen).not.toHaveBeenCalled();
  });

  it("meldet auch einen Fehler der Deaktivieren-Action am Dialog", async () => {
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Zugangs-Code"
        deaktivierenLabel="Sperren"
        pruefen={async () => GESPERRT}
        onLoeschen={async () => {}}
        onDeaktivieren={async () => {
          throw new Error("Noch aktiv");
        }}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    await clickPortal("[data-rolle='deaktivieren']");
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain(
      "Zugangs-Code konnte nicht deaktiviert werden.",
    );
  });

  it("ruft nach erfolgreichem Loeschen erst `onFertig` und dann `onSchliessen`", async () => {
    const reihenfolge: string[] = [];
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {
          reihenfolge.push("loeschen");
        }}
        onFertig={() => reihenfolge.push("fertig")}
        onSchliessen={() => reihenfolge.push("schliessen")}
      />,
    );
    await warte();
    await fillPortal(".ant-modal input", "X");
    await clickPortal("[data-rolle='loeschen']");
    await warte();
    expect(reihenfolge).toEqual(["loeschen", "fertig", "schliessen"]);
  });

  it("ignoriert einen zweiten Klick, solange die erste Action laeuft", async () => {
    const loeschen = vi.fn(async () => {});
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={loeschen}
        onSchliessen={() => {}}
      />,
    );
    await warte();
    await fillPortal(".ant-modal input", "X");
    const knopf = queryPortal("[data-rolle='loeschen']");

    // Beide Ereignisse landen im selben React-Batch. Ein blosses `loading`
    // nach dem naechsten Render reicht hier nicht; die Action braucht einen
    // synchron gesetzten Guard.
    await act(async () => {
      knopf.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      knopf.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(loeschen).toHaveBeenCalledTimes(1);
  });

  it("behaelt Guard und Oeffnungsgrenze ueber Close/Reopen bis zum spaeten Resolve", async () => {
    const tor = deferred();
    const pruefen = vi.fn(async () => LOESCHBAR);
    const loeschen = vi.fn(() => tor.promise);
    const fertig = vi.fn();
    const schliessen = vi.fn();
    const ansicht = (offen: boolean, name: string, hinweis: string) => (
      <LoeschDialog
        offen={offen}
        name={name}
        typLabel="Artikel"
        hinweis={hinweis}
        pruefen={pruefen}
        onLoeschen={loeschen}
        onFertig={fertig}
        onSchliessen={schliessen}
      />
    );

    await mount(ansicht(true, "Alt", "Alte Öffnung"));
    await warte();
    await fillPortal(".ant-modal input", "Alt");
    await clickPortal("[data-rolle='loeschen']");
    expect(loeschen).toHaveBeenCalledTimes(1);

    // Kontrollierte Eltern-Prop: selbst wenn ein Elternteil den Dialog trotz
    // laufender Action aus- und wieder einhaengt, darf die neue Oeffnung den
    // alten In-flight-Guard nicht verlieren.
    await rerender(ansicht(false, "Alt", "Alte Öffnung"));
    expect(existsPortal(".ant-modal input")).toBe(false);
    await rerender(ansicht(true, "Neu", "Neue Öffnung bleibt sichtbar"));
    await warte();
    expect(pruefen).toHaveBeenCalledTimes(2);
    await fillPortal(".ant-modal input", "Neu");
    await clickPortal("[data-rolle='loeschen']");

    await act(async () => {
      tor.resolve();
      await tor.promise;
    });
    await warte();

    expect({
      actionAufrufe: loeschen.mock.calls.length,
      fertigAufrufe: fertig.mock.calls.length,
      schliessenAufrufe: schliessen.mock.calls.length,
      neueOeffnungSichtbar: queryPortal(".ant-modal").textContent?.includes(
        "Neue Öffnung bleibt sichtbar",
      ),
    }).toEqual({
      actionAufrufe: 1,
      fertigAufrufe: 0,
      schliessenAufrufe: 0,
      neueOeffnungSichtbar: true,
    });

    // Nach dem Ende der ALTEN Action faellt der Guard. Erst jetzt darf die
    // neue Oeffnung ihre eigene Action starten und normal fertig werden.
    await clickPortal("[data-rolle='loeschen']");
    await warte();
    expect(loeschen).toHaveBeenCalledTimes(2);
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(schliessen).toHaveBeenCalledTimes(1);
  });

  it("ignoriert ein spaetes Reject der alten Oeffnung und zeigt nur den aktuellen Fehler", async () => {
    const tor = deferred();
    const pruefen = vi.fn(async () => LOESCHBAR);
    const loeschen = vi.fn(() => tor.promise);
    const fertig = vi.fn();
    const schliessen = vi.fn();
    const ansicht = (offen: boolean, name: string, hinweis: string) => (
      <LoeschDialog
        offen={offen}
        name={name}
        typLabel="Artikel"
        hinweis={hinweis}
        pruefen={pruefen}
        onLoeschen={loeschen}
        onFertig={fertig}
        onSchliessen={schliessen}
      />
    );

    await mount(ansicht(true, "Alt", "Alte Öffnung"));
    await warte();
    await fillPortal(".ant-modal input", "Alt");
    await clickPortal("[data-rolle='loeschen']");

    await rerender(ansicht(false, "Alt", "Alte Öffnung"));
    await rerender(ansicht(true, "Neu", "Neue Öffnung ohne alten Action-Fehler"));
    await warte();
    expect(pruefen).toHaveBeenCalledTimes(2);
    await fillPortal(".ant-modal input", "Neu");
    await clickPortal("[data-rolle='loeschen']");

    await act(async () => {
      tor.reject(new Error("Alter Fehler"));
      try {
        await tor.promise;
      } catch {
        // Die Produktkomponente faengt die Action-Ablehnung; der Test wartet
        // nur kontrolliert auf dasselbe Tor.
      }
    });
    await warte();

    const textNachAltemReject = queryPortal(".ant-modal").textContent ?? "";
    expect({
      actionAufrufe: loeschen.mock.calls.length,
      fertigAufrufe: fertig.mock.calls.length,
      schliessenAufrufe: schliessen.mock.calls.length,
      neueMeldungSichtbar: textNachAltemReject.includes(
        "Neue Öffnung ohne alten Action-Fehler",
      ),
      alterFehlerSichtbar: textNachAltemReject.includes("konnte nicht gelöscht werden"),
    }).toEqual({
      actionAufrufe: 1,
      fertigAufrufe: 0,
      schliessenAufrufe: 0,
      neueMeldungSichtbar: true,
      alterFehlerSichtbar: false,
    });

    // Dieselbe Ablehnung gehoert bei einem JETZT gestarteten Aufruf zur
    // sichtbaren Oeffnung und muss dort weiterhin verstaendlich erscheinen.
    await clickPortal("[data-rolle='loeschen']");
    await warte();
    expect(loeschen).toHaveBeenCalledTimes(2);
    expect(queryPortal(".ant-modal").textContent).toContain(
      "Artikel konnte nicht gelöscht werden.",
    );
  });

  it("sperrt X, Escape und Maskenklick waehrend einer laufenden Action", async () => {
    const tor = deferred();
    const schliessen = vi.fn();
    await mount(
      <LoeschDialog
        offen
        name="X"
        typLabel="Artikel"
        pruefen={async () => LOESCHBAR}
        onLoeschen={() => tor.promise}
        onSchliessen={schliessen}
      />,
    );
    await warte();
    await fillPortal(".ant-modal input", "X");
    await clickPortal("[data-rolle='loeschen']");

    const hatSchliessenKnopf = existsPortal(".ant-modal-close");
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
      const maske = queryPortal(".ant-modal-wrap");
      maske.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      maske.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const schliessenVorResolve = schliessen.mock.calls.length;

    await act(async () => {
      tor.resolve();
      await tor.promise;
    });
    await warte();

    expect({
      hatSchliessenKnopf,
      schliessenVorResolve,
      schliessenNachResolve: schliessen.mock.calls.length,
    }).toEqual({
      hatSchliessenKnopf: false,
      schliessenVorResolve: 0,
      schliessenNachResolve: 1,
    });
  });
});

describe("LoeschButton", () => {
  it("oeffnet den Dialog erst auf Klick — `pruefen` laeuft nicht beim Rendern", async () => {
    const pruefen = vi.fn(async () => LOESCHBAR);
    await mount(
      <LoeschButton
        name="X"
        typLabel="Gerät"
        label="Gerät löschen"
        pruefen={pruefen}
        onLoeschen={async () => {}}
      />,
    );
    await warte();
    expect(pruefen).not.toHaveBeenCalled();
    await click("button");
    await warte();
    expect(pruefen).toHaveBeenCalledTimes(1);
  });

  it("traegt `danger` — Rot auf einer HANDLUNG ist richtig", async () => {
    await mount(
      <LoeschButton
        name="X"
        typLabel="Gerät"
        label="Gerät löschen"
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}}
      />,
    );
    expect(document.querySelector(".ant-btn-dangerous")).not.toBeNull();
  });

  it("mit `nurZeichen` traegt der Knopf ein aria-label", async () => {
    // Ein Zeichen OHNE danebenstehenden Text ist ein Bedienelement und traegt
    // sein Label am KNOPF, nicht am <svg> (§6.5.2).
    await mount(
      <LoeschButton
        name="111-111"
        typLabel="Zugangs-Code"
        nurZeichen
        pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}}
      />,
    );
    expect(document.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Zugangs-Code 111-111 löschen",
    );
  });

  it("setzt `size` NICHT von selbst", () => {
    // `size` wird gar nicht gesetzt; die einzige Ausnahme sind Zeilenaktionen
    // INNERHALB einer Tabellenzeile, und das entscheidet der Aufrufer.
    const quelle = ohneKommentare(
      readFileSync("src/app/m/lagerbuch/_ui/LoeschButton.tsx", "utf8"),
    );
    expect(quelle).not.toMatch(/\bsize\s*=/);
  });
});

describe("Client-/Server-Grenze und Action-Injektion", () => {
  it("exportiert genau die sechs Element-Arten ohne Client-Direktive", () => {
    expect(ELEMENT_ARTEN).toEqual([
      "artikel",
      "fahrzeug",
      "token",
      "bzGeraet",
      "o2Flasche",
      "geraet",
    ]);
    const quelle = ohneKommentare(
      readFileSync("src/app/m/lagerbuch/_lib/loeschen.ts", "utf8"),
    );
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
    expect(quelle).not.toMatch(/^\s*["']use server["']/m);
  });

  it("Dialog und Button sind Client-Komponenten und importieren keine Actions", () => {
    for (const pfad of [
      "src/app/m/lagerbuch/_ui/LoeschDialog.tsx",
      "src/app/m/lagerbuch/_ui/LoeschButton.tsx",
    ]) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(quelle).toMatch(/^\s*["']use client["'];/);
      expect(quelle).not.toMatch(/from\s+["'][^"']*_actions\//);
    }
  });
});

describe("Kein Popconfirm fuer Stammdatensaetze", () => {
  it("LoeschDialog.tsx importiert kein Popconfirm", () => {
    // Ein Popconfirm verloere die serverseitige Vorpruefung, die
    // Namenseingabe und den zweiten Ausgang — drei Zusagen fuer eine Zeile
    // Ersparnis (§6.4.5).
    const quelle = ohneKommentare(
      readFileSync("src/app/m/lagerbuch/_ui/LoeschDialog.tsx", "utf8"),
    );
    expect(quelle).not.toMatch(/\bPopconfirm\b/);
  });
});
