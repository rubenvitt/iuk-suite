import { it, expect } from "vitest";
import { magicLink } from "./magicLink";
it("baut den Link aus SUITE_HOST_UAV, nie aus AUTH_URL", () => {
  expect(magicLink("ABCDEFGH", { SUITE_HOST_UAV: "uav-training.iuk-ue.de", AUTH_URL: "https://iuk-ue.de" })).toBe("https://uav-training.iuk-ue.de/login?code=ABCDEFGH");
  expect(magicLink("ABCDEFGH", {})).toBe("http://uav.localtest.me:3000/login?code=ABCDEFGH");
});
