import type { AuditActor } from "@/core/audit/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actor, auditEventMock } = vi.hoisted(() => ({
  actor: { value: { kind: "anonymous" } as AuditActor },
  auditEventMock: vi.fn(),
}));

vi.mock("../_lib/audit", () => ({ logoutActor: vi.fn(async () => actor.value) }));
vi.mock("@/core/audit/server", () => ({ auditEvent: auditEventMock }));

import { GET } from "./route";
import { AUSLEIH_COOKIE } from "../_lib/ausleihSitzung";

function anfrage(cookie?: string): Request {
  return new Request("http://radio.localtest.me/m/radio/abmelden", {
    headers: {
      "x-forwarded-host": "radio.localtest.me",
      ...(cookie ? { cookie } : {}),
    },
  });
}

describe("GET /abmelden — Audit-Protokoll", () => {
  beforeEach(() => {
    actor.value = { kind: "anonymous" };
    auditEventMock.mockClear();
  });

  it("raeumt ohne gueltige Sitzung das Cookie auf, schreibt aber kein Audit-Ereignis", async () => {
    const antwort = await GET(anfrage());

    expect(antwort.status).toBe(303);
    expect(antwort.headers.get("set-cookie")).toContain(`${AUSLEIH_COOKIE}=`);
    expect(auditEventMock).not.toHaveBeenCalled();
  });

  it("protokolliert das Abmelden einer aufgeloesten Sitzung", async () => {
    actor.value = { kind: "access", id: "code-1" };

    const antwort = await GET(anfrage(`${AUSLEIH_COOKIE}=gueltig`));

    expect(antwort.status).toBe(303);
    expect(auditEventMock).toHaveBeenCalledOnce();
    expect(auditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ module: "radio", action: "sign_out", result: "success" }),
      actor.value,
    );
  });
});
