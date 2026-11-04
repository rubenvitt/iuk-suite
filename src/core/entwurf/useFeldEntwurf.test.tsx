// @vitest-environment jsdom
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { click, fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { ladeEntwurf, vergissFluechtig } from "./ablage";
import { useFeldEntwurf } from "./useFeldEntwurf";

function Formular() {
  const form = useRef<HTMLFormElement>(null);
  const e = useFeldEntwurf(form, "test:feld");
  return (
    <form ref={form}>
      <input id="name" name="name" defaultValue="" />
      <textarea id="text" name="text" defaultValue="" />
      <input id="geheim" name="geheim" type="password" defaultValue="" />
      <input id="ja" name="ja" type="checkbox" value="1" />
      <button id="weg" type="button" onClick={e.verwerfen}>weg</button>
    </form>
  );
}

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
});
afterEach(unmount);

describe("useFeldEntwurf", () => {
  it("sichert ungesteuerte Felder, aber kein Passwort, und stellt sie wieder her", async () => {
    await mount(<Formular />);
    await fill("#name", "Rucksack");
    await fill("#text", "Tupfer steril fehlt");
    await fill("#geheim", "x");
    await click("#ja");
    expect(JSON.stringify(ladeEntwurf("test:feld")?.stand)).not.toContain("geheim");
    await unmount();
    await mount(<Formular />);
    expect(query<HTMLInputElement>("#name").value).toBe("Rucksack");
    expect(query<HTMLTextAreaElement>("#text").value).toBe("Tupfer steril fehlt");
    expect(query<HTMLInputElement>("#geheim").value).toBe("");
    expect(query<HTMLInputElement>("#ja").checked).toBe(true);
    await click("#weg");
    expect(query<HTMLInputElement>("#name").value).toBe("");
    expect(ladeEntwurf("test:feld")).toBeNull();
  });
});
