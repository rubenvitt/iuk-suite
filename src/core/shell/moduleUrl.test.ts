import { describe, it, expect } from "vitest";
import { moduleUrl } from "@/core/shell/moduleUrl";

describe("moduleUrl", () => {
  it("builds dev localtest.me url with port", () => {
    const prev = process.env.PORT;
    process.env.PORT = "3000";
    expect(moduleUrl("qr")).toBe("http://qr.localtest.me:3000");
    process.env.PORT = prev;
  });
});
