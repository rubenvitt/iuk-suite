import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/core/audit/storage", () => ({ recordAuditEvent: vi.fn() }));
import { auth } from "@/core/auth";
import { recordAuditEvent } from "@/core/audit/storage";
import { currentAuditContext } from "@/core/audit/context";
import { POST } from "./route";
function request(body: unknown, headers: Record<string,string> = {}) {
 return new Request("http://qr.localtest.me:3100/api/audit/browser", { method: "POST", headers: { host: "qr.localtest.me:3100", origin: "http://qr.localtest.me:3100", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
let testTime = Date.now();
afterEach(() => vi.restoreAllMocks());
beforeEach(() => { testTime += 60_001; vi.spyOn(Date, "now").mockReturnValue(testTime); vi.mocked(auth).mockResolvedValue(null as never); vi.mocked(recordAuditEvent).mockReset(); });
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

it("bounds recorded anonymous denials and stops writing when exhausted", async () => {
 const statuses=[];
 for(let i=0;i<32;i++) statuses.push((await POST(request({module:"zeichen",format:"png"}))).status);
 expect(statuses.slice(0,30)).toEqual(Array(30).fill(403));expect(statuses.slice(30)).toEqual([429,429]);
 expect(recordAuditEvent).toHaveBeenCalledTimes(30);
 expect(recordAuditEvent).toHaveBeenCalledWith({module:"zeichen",action:"access_denied",objectType:"browser_export",result:"denied",origin:"server"});
});
it("shares one actor budget across successful exports and recorded denials", async () => {
 for(let i=0;i<15;i++) {
  expect((await POST(request({module:"qr",format:"png"}))).status).toBe(204);
  expect((await POST(request({module:"zeichen",format:"svg"}))).status).toBe(403);
 }
 for(const moduleKey of ["qr","zeichen"]) expect((await POST(request({module:moduleKey,format:"png"}))).status).toBe(429);
 expect(recordAuditEvent).toHaveBeenCalledTimes(30);
 expect(vi.mocked(recordAuditEvent).mock.calls.filter(([e])=>e.result==="denied")).toHaveLength(15);
});
it("charges denials to the global budget and exhausts both write branches", async () => {
 for(let i=0;i<30;i++) expect((await POST(request({module:"zeichen",format:"png"}))).status).toBe(403);
 for(let actor=0;actor<9;actor++) {
  vi.mocked(auth).mockResolvedValue({user:{id:"global-"+actor,groups:[]}} as never);
  for(let i=0;i<30;i++) expect((await POST(request({module:"qr",format:"png"}))).status).toBe(204);
 }
 vi.mocked(auth).mockResolvedValue({user:{id:"fresh-after-global-cap",groups:[]}} as never);
 expect((await POST(request({module:"qr",format:"png"}))).status).toBe(429);
 vi.mocked(auth).mockResolvedValue(null as never);
 expect((await POST(request({module:"zeichen",format:"png"}))).status).toBe(429);
 expect(recordAuditEvent).toHaveBeenCalledTimes(300);
});
