// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { LoeschButton } from "./LoeschButton";

const BASIS = {
  name: "111-111",
  typLabel: "Zugangs-Code",
  pruefen: async () => ({ loeschbar: true as const }),
  onLoeschen: async () => {},
};

afterEach(async () => {
  await unmount();
});

describe("LoeschButton-Größe", () => {
  it("behält ohne size-Prop die bisherige antd-Defaultgröße", async () => {
    await mount(<LoeschButton {...BASIS} />);
    const knopf = document.querySelector("button");
    expect(knopf).not.toBeNull();
    expect(knopf?.classList.contains("ant-btn-sm")).toBe(false);
  });

  it("reicht size=small ausschließlich an den tatsächlichen Trigger weiter", async () => {
    await mount(<LoeschButton {...BASIS} size="small" />);
    const knopf = document.querySelector("button");
    expect(knopf).not.toBeNull();
    expect(knopf?.classList.contains("ant-btn-sm")).toBe(true);
  });
});
