// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { Testband } from "./Testband";

afterEach(unmount);

describe("Testband", () => {
  it("ist ein Status ohne Schließknopf", async () => {
    await mount(<Testband text="Testdaten — kein echter Einsatz" />);
    expect(query('[role="status"]').textContent).toBe("Testdaten — kein echter Einsatz");
    expect(queryAll("button").length).toBe(0);
  });
});
