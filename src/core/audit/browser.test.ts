import { afterEach, expect, it, vi } from "vitest";
import { reportBrowserExport } from "./browser";
afterEach(()=>vi.unstubAllGlobals());
it("sends a minimal same-origin report without waiting for logging",()=>{
 const fetch=vi.fn().mockReturnValue(new Promise(()=>{}));vi.stubGlobal("fetch",fetch);
 expect(reportBrowserExport({module:"qr",format:"png"})).toBeUndefined();
 expect(fetch).toHaveBeenCalledWith("/api/audit/browser",expect.objectContaining({body:'{"module":"qr","format":"png"}',credentials:"same-origin"}));
});
it.each([()=>Promise.reject(Error("offline")),()=>{throw Error("offline");}])("logging failures cannot reject the caller",async implementation=>{
 vi.stubGlobal("fetch",vi.fn(implementation));expect(()=>reportBrowserExport({module:"zeichen",format:"svg"})).not.toThrow();await Promise.resolve();
});
