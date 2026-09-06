import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/core/auth",()=>({auth:vi.fn()}));
vi.mock("@/core/audit/storage",()=>({queryAuditEvents:vi.fn(),recordAuditEvent:vi.fn()}));
vi.mock("@/core/audit/transfer",()=>({transferAuditEvents:vi.fn()}));
import { auth } from "@/core/auth";
import { queryAuditEvents } from "@/core/audit/storage";
import { transferAuditEvents } from "@/core/audit/transfer";
import { readAuditView } from "./read";
import { GET } from "./data/route";
beforeEach(()=>{
 vi.stubEnv("ADMIN_GROUP","dashboard-admins");vi.stubEnv("SUITE_ADMIN_GROUP_PORTAL","portal-only");
 vi.mocked(auth).mockResolvedValue({user:{id:"suite",groups:["dashboard-admins"]}} as never);
 vi.mocked(queryAuditEvents).mockReset().mockReturnValue({events:[]});
 vi.mocked(transferAuditEvents).mockReset().mockReturnValue({transferred:0,pending:0,expired:0,failures:[]});
});
it.each([null,[],["regular"],["iuk-qr-admin"],["portal-only"]])("never reaches storage or transfer for %j through helper or direct GET",async groups=>{
 vi.mocked(auth).mockResolvedValue((groups ? {user:{id:"user",groups,isAdmin:true}} : null) as never);
 await expect(readAuditView({})).rejects.toThrow("Forbidden");
 expect((await GET(new Request("http://portal.localtest.me/admin/audit/data"))).status).toBe(403);
 expect(queryAuditEvents).not.toHaveBeenCalled();expect(transferAuditEvents).not.toHaveBeenCalled();
});
it("bounds server reads and distinguishes empty from no matches",async()=>{
 expect(await readAuditView({})).toMatchObject({state:"ready",filtered:false});
 expect(await readAuditView({module:"qr"})).toMatchObject({state:"ready",filtered:true});
 expect(queryAuditEvents).toHaveBeenLastCalledWith({module:"qr",limit:50});
});
it("preserves pending and transfer failure even with zero central entries",async()=>{
 vi.mocked(transferAuditEvents).mockReturnValue({transferred:0,pending:3,expired:0,failures:["qr"]});
 expect(await readAuditView({})).toMatchObject({state:"ready",pending:3,transferFailed:true});
});
it("never represents storage failure as an empty success",async()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});
 vi.mocked(queryAuditEvents).mockImplementation(()=>{throw Error("secret");});
 expect(await readAuditView({})).toMatchObject({state:"unavailable"});
 expect((await GET(new Request("http://portal.localtest.me/admin/audit/data"))).status).toBe(503);
 expect(log.mock.calls.flat().join()).not.toContain("secret");log.mockRestore();
});
it("invalid and duplicate filters do not run queries",async()=>{
 expect((await GET(new Request("http://portal.localtest.me/admin/audit/data?module=qr&module=files"))).status).toBe(400);
 expect(queryAuditEvents).not.toHaveBeenCalled();
});
