import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("../../_db/client", () => ({ getDb: vi.fn() }));
vi.mock("../../_lib/host", () => ({ requireLagerbuchHost: vi.fn() }));
vi.mock("../../_lib/zugang", () => ({ requireLagerbuchAdmin: vi.fn() }));

import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireLagerbuchHost } from "../../_lib/host";
import { requireLagerbuchAdmin } from "../../_lib/zugang";
import VerwaltungUebersicht from "./page";

describe("Verwaltungsübersicht Autorisierung", () => {
  beforeEach(() => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    vi.mocked(requireLagerbuchHost).mockReset();
    vi.mocked(requireLagerbuchAdmin).mockReset();
    vi.mocked(getDb).mockReset();
  });

  it("öffnet die Datenbank nicht, wenn die Admin-Prüfung fehlschlägt", async () => {
    vi.mocked(requireLagerbuchAdmin).mockRejectedValue(new Error("nicht autorisiert"));

    await expect(VerwaltungUebersicht()).rejects.toThrow("nicht autorisiert");
    expect(requireLagerbuchHost).toHaveBeenCalledOnce();
    expect(requireLagerbuchAdmin).toHaveBeenCalledOnce();
    expect(getDb).not.toHaveBeenCalled();
  });
});
