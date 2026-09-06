import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/core/audit/storage", () => ({ recordAuditEvent: vi.fn() }));
import { auth } from "@/core/auth";
import { recordAuditEvent } from "@/core/audit/storage";
import { currentAuditContext } from "@/core/audit/context";
import { POST } from "./route";
function request(body: unknown, headers: Record<string,string> = {}) {
 return new Request("http://qr.localtest.me:3100/api/audit/browser", { method: "POST", headers: { host: "qr.localtest.me:3100", origin: "http://qr.localtest.me:3100", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.mocked(auth).mockResolvedValue(null as never); vi.mocked(recordAuditEvent).mockReset(); });
it.each([{module:"qr",format:"png",actor:{id:"victim"}}, {module:"files",format:"png"}, {module:"qr",format:"svg"}, {module:"qr",format:"png",metadata:{text:"secret"}}, {module:"qr",format:"png",action:"delete"}])("rejects forged event %j", async body => {
 expect((await POST(request(body))).status).toBe(400); expect(recordAuditEvent).not.toHaveBeenCalled();
});
it.each(["https://evil.example", "null", ""]) ("rejects foreign or missing origin %s", async origin => {
 expect((await POST(request({module:"qr",format:"png"},{origin}))).status).toBe(403); expect(recordAuditEvent).not.toHaveBeenCalled();
});
it("bounds actual body without trusting content-length", async () => {
 expect((await POST(request({module:"qr",format:"png",payload:"x".repeat(1024)},{"content-length":"1"}))).status).toBe(413);
 expect(recordAuditEvent).not.toHaveBeenCalled();
});
it("records only server-confirmed identity and fixed fields", async () => {
 vi.mocked(auth).mockResolvedValue({user:{id:"confirmed",name:"Person",groups:[]}} as never);
 vi.mocked(recordAuditEvent).mockImplementation(() => { expect(currentAuditContext().actor).toEqual({kind:"user",id:"confirmed",name:"Person"}); });
 expect((await POST(request({module:"qr",format:"png"}))).status).toBe(204);
 expect(recordAuditEvent).toHaveBeenCalledWith({module:"qr",action:"export",objectType:"qr_png",origin:"browser",result:"success"});
});
it("allows anonymous QR but rejects anonymous Zeichen exports", async () => {
 expect((await POST(request({module:"qr",format:"png"}))).status).toBe(204);
 expect((await POST(request({module:"zeichen",format:"png"}))).status).toBe(403);
});
it("does not report persistence failure as accepted", async () => {
 vi.mocked(recordAuditEvent).mockImplementation(() => { throw new Error("secret"); });
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});
 expect((await POST(request({module:"qr",format:"png"}))).status).toBe(503);
 expect(log.mock.calls.flat().join()).not.toContain("secret");log.mockRestore();
});
it("caps confirmed actor submissions", async () => {
 vi.mocked(auth).mockResolvedValue({user:{id:"flood",groups:[]}} as never);
 const statuses=[]; for(let i=0;i<31;i++) statuses.push((await POST(request({module:"qr",format:"png"}))).status);
 expect(statuses.slice(0,30)).toEqual(Array(30).fill(204));expect(statuses[30]).toBe(429);
});
