import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/m/wartung/_db/client", () => ({ getDb: () => { throw new Error("nicht gebraucht"); } }));

import { findModule } from "@/core/registry";
import { MCP_MODULE } from "./module";

describe("Module im MCP-Server", () => {
  it("jeder Eintrag ist ein Modul der Registry, und keiner steht doppelt", () => {
    expect(MCP_MODULE.map((m) => findModule(m.key)?.key)).toEqual(MCP_MODULE.map((m) => m.key));
    expect(new Set(MCP_MODULE.map((m) => m.key)).size).toBe(MCP_MODULE.length);
  });
});
