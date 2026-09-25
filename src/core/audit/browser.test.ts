import { afterEach, expect, it, vi } from "vitest";
import { reportBrowserExport } from "./browser";
import { parseBrowserExport } from "./browser-schema";
afterEach(()=>vi.unstubAllGlobals());
it("sends a minimal same-origin report without waiting for logging",()=>{
 const fetch=vi.fn().mockReturnValue(new Promise(()=>{}));vi.stubGlobal("fetch",fetch);
 expect(reportBrowserExport({module:"qr",format:"png"})).toBeUndefined();
 expect(fetch).toHaveBeenCalledWith("/api/audit/browser",expect.objectContaining({body:'{"module":"qr","format":"png"}',credentials:"same-origin"}));
});
it.each([()=>Promise.reject(Error("offline")),()=>{throw Error("offline");}])("logging failures cannot reject the caller",async implementation=>{
 vi.stubGlobal("fetch",vi.fn(implementation));expect(()=>reportBrowserExport({module:"qr",format:"png"})).not.toThrow();await Promise.resolve();
});
it("accepts a well-formed einsatzbuch reader event",()=>{
 expect(parseBrowserExport({module:"einsatzbuch",format:"reader_oeffnen",von:1,bis:3,anzahl:3})).toEqual({module:"einsatzbuch",format:"reader_oeffnen",von:1,bis:3,anzahl:3});
 expect(parseBrowserExport({module:"einsatzbuch",format:"reader_druck",von:5,bis:5,anzahl:1})).toEqual({module:"einsatzbuch",format:"reader_druck",von:5,bis:5,anzahl:1});
});
it.each([
 {module:"einsatzbuch",format:"reader_oeffnen",von:1,bis:3,anzahl:3,inhalt:"x"},
 {module:"einsatzbuch",format:"reader_oeffnen",von:1.5,bis:3,anzahl:1},
 {module:"einsatzbuch",format:"reader_oeffnen",von:3,bis:1,anzahl:1},
 {module:"einsatzbuch",format:"reader_oeffnen",von:1,bis:3,anzahl:4},
 {module:"einsatzbuch",format:"png",von:1,bis:3,anzahl:1},
])("rejects malformed einsatzbuch events %j",event=>{
 expect(parseBrowserExport(event)).toBeNull();
});
it("leaves qr/png unchanged",()=>{
 expect(parseBrowserExport({module:"qr",format:"png"})).toEqual({module:"qr",format:"png"});
 expect(parseBrowserExport({module:"qr",format:"svg"})).toBeNull();
});
