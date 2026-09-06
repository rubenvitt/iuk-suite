import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig, wechsleAnmeldung } from "./fixtures";
import Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
const PORTAL="http://portal.localtest.me:3100";
const QR="http://qr.localtest.me:3100";
const ZEICHEN="http://zeichen.localtest.me:3100";
const SCREENSHOTS="/private/tmp/audit-task3-shots";
const ACTOR="dev:audit-e2e@localtest.me";
function fixtureEvents() {
 const db=new Database(".data/e2e/audit.db");
 try {
  const insert=db.prepare("INSERT INTO audit_events (id,occurred_at,module,action,object_type,object_ref,actor,result,origin,correlation_id) VALUES (?,?,?,?,?,?,?,?,?,NULL)");
  db.transaction(()=>{ for(let i=0;i<55;i++) insert.run(randomUUID(),Date.now()-1000-i,"qr","export","qr_png","sha256:"+createHash("sha256").update("audit-private-object-"+i).digest("hex"),JSON.stringify({kind:"user",id:ACTOR,name:"Audit-Probe"}),"success","browser"); })();
 } finally { db.close(); }
}
test("Suite-Admin: Navigation, serverseitige Filter, Details, Seitengrenzen und drei Darstellungen",async({page})=>{
 test.setTimeout(240_000);
 expect((await page.request.get(PORTAL+"/api/auth/session")).status()).toBe(200);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await devLogin(page,{host:"portal.localtest.me",groups:"dashboard-admins",email:"audit-e2e@localtest.me"});
 fixtureEvents();
 await klickeWennRuhig(page.getByRole("link",{name:"Verwaltung",exact:true}).first());
 await expect(page).toHaveURL(/\/admin$/,{timeout:30_000});
 await klickeWennRuhig(page.getByRole("link",{name:"Audit-Log öffnen"}),{timeout:30_000});
 await expect(page.getByRole("heading",{name:"Audit-Log",exact:true})).toBeVisible({timeout:30_000});
 await page.getByRole("combobox",{name:"Modul",exact:true}).click();
 // Antd virtualizes its aria-options; select through the real combobox keyboard contract.
 await page.getByRole("combobox",{name:"Modul",exact:true}).press("ArrowDown");
 await page.getByRole("combobox",{name:"Modul",exact:true}).press("ArrowDown");
 await page.getByRole("combobox",{name:"Modul",exact:true}).press("Enter");
 await page.getByLabel("Personenkennung").fill(ACTOR);
 await page.getByRole("button",{name:"Filter anwenden"}).click();
 await expect(page).toHaveURL(/module=qr/);
 await expect(page.getByRole("status")).toContainText("50 Einträge");
 const firstResponse=await page.request.get(PORTAL+"/admin/audit/data?module=qr&actorId="+encodeURIComponent(ACTOR));
 expect(firstResponse.status()).toBe(200);const first=await firstResponse.json();expect(first.page.events).toHaveLength(50);
 await page.getByRole("button",{name:"Details: QR-Code als PNG",exact:true}).first().click();
 const dialog=page.getByRole("dialog");await expect(dialog).toContainText("Vom Browser gemeldet");await expect(dialog).toContainText(ACTOR);
 await expect(dialog).not.toContainText("audit-private-object-");
 await dialog.getByRole("button",{name:"Nur dieses Objekt"}).click();
 await expect(page).toHaveURL(/objectRefHash=[a-f0-9]{64}/);expect(page.url()).not.toContain("audit-private-object-");
 await expect(page.getByRole("status")).toContainText("1 Einträge");
 await page.getByRole("button",{name:"Objektfilter entfernen"}).click();await page.getByRole("button",{name:"Filter anwenden"}).click();
 await expect(page.getByRole("status")).toContainText("50 Einträge");
 mkdirSync(SCREENSHOTS,{recursive:true});
 await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({animations:"disabled",path:SCREENSHOTS+"/desktop.png"});
 await page.getByRole("button",{name:"Ältere Einträge"}).click();await expect(page).toHaveURL(/cursorId=/);
 await expect(page.getByRole("status")).toContainText("5 Einträge");
 const secondResponse=await page.request.get(PORTAL+"/admin/audit/data?"+new URL(page.url()).searchParams);expect(secondResponse.status()).toBe(200);
 const second=await secondResponse.json();expect(second.page.events).toHaveLength(5);
 expect(second.page.events.some((e:{id:string})=>first.page.events.some((f:{id:string})=>e.id===f.id))).toBe(false);
 await page.getByRole("button",{name:"Neueste Einträge"}).click();await expect(page).not.toHaveURL(/cursorId=/);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({animations:"disabled",path:SCREENSHOTS+"/mobile.png"});
 await page.getByRole("button",{name:"Details",exact:true}).first().scrollIntoViewIfNeeded();
 await page.screenshot({animations:"disabled",path:SCREENSHOTS+"/mobile-list.png"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const applyBox=await page.getByRole("button",{name:"Filter anwenden"}).boundingBox();expect(applyBox!.height).toBeGreaterThanOrEqual(44);
 const resetBox=await page.getByRole("button",{name:"Filter zurücksetzen"}).boundingBox();
 expect(resetBox!.width).toBeCloseTo(applyBox!.width,0);expect(resetBox!.y).toBeGreaterThanOrEqual(applyBox!.y+applyBox!.height);
 await page.context().addCookies([{name:"iuk-theme-pref",value:"dark",domain:".localtest.me",path:"/"}]);
 await page.reload();await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
 await page.getByRole("button",{name:"Details",exact:true}).first().click();
 await expect(page.getByRole("dialog")).toContainText("QR-Code als PNG");
 await page.screenshot({animations:"disabled",path:SCREENSHOTS+"/mobile-dark-details.png"});
 await page.keyboard.press("Escape");
 await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({animations:"disabled",path:SCREENSHOTS+"/desktop-dark.png"});
 await page.getByLabel("Personenkennung").fill("missing-audit-person");await page.getByRole("button",{name:"Filter anwenden"}).click();
 await expect(page.getByRole("heading",{name:"Keine passenden Einträge"})).toBeVisible();
 expect(errors).toEqual([]);
});

test("Direktaufruf und Navigation schließen Nutzer, Modul-Admin und Portal-Override aus",async({page})=>{
 test.setTimeout(240_000);
 for(const groups of ["", "iuk-qr-admin", "portal-only-admin"]) {
  await wechsleAnmeldung(page,{host:"portal.localtest.me",groups});
  await expect(page.getByRole("link",{name:"Audit-Log",exact:true})).toHaveCount(0);
  if(groups==="portal-only-admin") {
   await klickeWennRuhig(page.getByRole("link",{name:"Verwaltung",exact:true}).first());
   await expect(page).toHaveURL(/\/admin$/,{timeout:30_000});
   await expect(page.getByTestId("portal-admin")).toBeVisible({timeout:30_000});
   await expect(page.getByRole("link",{name:"Audit-Log öffnen"})).toHaveCount(0);
  }
  const response=await page.request.get(PORTAL+"/admin/audit/data");expect(response.status()).toBe(403);expect(await response.text()).not.toContain("events");
  const direct=await page.goto(PORTAL+"/m/portal/admin/audit");expect(direct?.status()).toBe(404);
  await expect(page.getByTestId("audit-log")).toHaveCount(0);
 }
});

test("Anonym erhält auch direkt keine Audit-Daten",async({page})=>{
 const response=await page.request.get(PORTAL+"/admin/audit/data",{maxRedirects:0});expect([302,307]).toContain(response.status());
 await page.goto(PORTAL+"/m/portal/admin/audit");await expect(page).toHaveURL(/\/login/);await expect(page.getByTestId("audit-log")).toHaveCount(0);
});

test("QR auf Modul-Host meldet echten PNG-Export; Meldefehler lassen den Export nutzbar",async({page})=>{
 await page.goto(QR+"/");
 expect((await page.request.get(QR+"/api/audit/browser")).status()).toBe(204);
 await page.getByLabel("Link oder Text").fill("https://example.org/audit-private-payload");await page.getByRole("button",{name:/erzeugen/i}).click();
 await expect(page.getByTestId("qr-display").locator("svg")).toBeVisible({timeout:30_000});
 const logged=page.waitForResponse(r=>r.url()===QR+"/api/audit/browser"&&r.request().method()==="POST");
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"PNG speichern"}).click();
 const file=await download;expect(readFileSync((await file.path())!).length).toBeGreaterThan(100);
 const response=await logged;expect(response.status()).toBe(204);expect(response.request().postDataJSON()).toEqual({module:"qr",format:"png"});
 await page.context().setOffline(true);
 const offlineDownload=page.waitForEvent("download");await page.getByRole("button",{name:"PNG speichern"}).click();expect((await offlineDownload).suggestedFilename()).toMatch(/\.png$/);
});

test("Zeichen auf Modul-Host meldet SVG, PNG und Datei erst beim Export",async({page})=>{
 test.setTimeout(240_000);
 await devLogin(page,{host:"zeichen.localtest.me",callbackPath:"/baukasten"});
 expect((await page.request.get(ZEICHEN+"/api/audit/browser")).status()).toBe(204);
 const kachel=page.getByTestId("tz-kachel-formation");await expect(kachel).toBeVisible({timeout:180_000});await kachel.click();
 for(const format of ["svg","png","json"]) {
  const logged=page.waitForResponse(r=>r.url()===ZEICHEN+"/api/audit/browser"&&r.request().method()==="POST");
  const download=page.waitForEvent("download");await page.getByTestId("tz-export-"+format).click();
  const file=await download;expect(readFileSync((await file.path())!).length).toBeGreaterThan(10);
  const response=await logged;expect(response.status()).toBe(204);expect(response.request().postDataJSON()).toEqual({module:"zeichen",format});
 }
 await page.route("**/api/audit/browser",route=>route.abort("internetdisconnected"));
 const offlineDownload=page.waitForEvent("download");await page.getByTestId("tz-export-svg").click();expect((await offlineDownload).suggestedFilename()).toBe("zeichen.svg");
});

test("Browserempfänger auf beiden Modul-Hosts verwirft fremde Herkunft und Akteursfälschung",async({page})=>{
 for(const host of [QR,ZEICHEN]) {
  expect((await page.request.get(host+"/api/audit/browser")).status()).toBe(204);
  const foreign=await page.request.post(host+"/api/audit/browser",{headers:{origin:"https://evil.example"},data:{module:"qr",format:"png"}});expect(foreign.status()).toBe(403);
  const forged=await page.request.post(host+"/api/audit/browser",{headers:{origin:host},data:{module:"qr",format:"png",actor:{id:"victim"}}});expect(forged.status()).toBe(400);
 }
});
