"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, Button, Card, Checkbox, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { AuditCursor, AuditEvent } from "@/core/audit/types";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "@/core/theme/schrift";
import { ACTION_LABELS, MODULE_LABELS, RESULT_LABELS, actorLabel, auditTime, objectLabel } from "./labels";
import { FILTER_KEYS, parseAuditFilters, type AuditSearch, AuditFilterError } from "./filters";
import type { AuditView } from "./read";
import css from "./audit.module.css";

export function AuditLog({ view, search }: { view: AuditView; search: AuditSearch }) {
  const router = useRouter(); const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [details, setDetails] = useState<AuditEvent | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState<AuditFilterError | null>(null);
  const [fields,setFields] = useState<Record<string,string>>(() => Object.fromEntries(FILTER_KEYS.map(k => [k, typeof search[k] === "string" ? search[k] : ""])));
  useEffect(() => {
    if (error?.field) document.getElementById(`audit-${error.field}`)?.focus();
    else if (error) errorRef.current?.focus();
  }, [error]);
  function navigate(values: Record<string,string>, cursor?: AuditCursor) {
    const query = new URLSearchParams();
    for (const key of FILTER_KEYS) if (values[key]) query.set(key,values[key]);
    if(cursor) { query.set("cursorTime",String(cursor.occurredAt));query.set("cursorId",cursor.id); }
    setDetails(null);
    startTransition(() => router.push(pathname + (query.size ? "?" + query.toString() : "")));
  }
  function apply() {
    if (pending) return;
    try { parseAuditFilters(fields); setError(null); navigate(fields); }
    catch(error) { setError(error instanceof AuditFilterError ? error : new AuditFilterError(error instanceof Error ? error.message : "Prüfe die Filter.")); }
  }
  function field(key: string, value: string) { setFields(previous=>({...previous,...(key === "module" && previous.objectRefHash ? {objectRefHash:"",objectType:""} : {}),[key]:value})); }
  const options = (labels: Record<string,string>) => [{value:"",label:"Alle"},...Object.entries(labels).map(([value,label])=>({value,label}))];
  const ready = view.state === "ready" ? view : null;
  const committed = Object.fromEntries(FILTER_KEYS.map(k=>[k,typeof search[k] === "string" ? search[k] : ""]));
  return <div className={css.root} style={{display:"grid",gap:SPACE.lg}} aria-busy={pending}>
    <Card title="Ereignisse eingrenzen">
      <form noValidate aria-describedby={error ? "audit-filter-error" : undefined} onSubmit={event=>{event.preventDefault();apply();}}>
        <div className={css.filters} style={{gap:SPACE.lg}}>
          <label>Von (UTC)<Input id="audit-from" aria-invalid={error?.field === "from" || undefined} aria-describedby={error?.field === "from" ? "audit-filter-error" : undefined} value={fields.from} placeholder="JJJJ-MM-TT" maxLength={10} allowClear onChange={e=>field("from",e.target.value)} aria-label="Von (UTC)" /></label>
          <label>Bis einschließlich (UTC)<Input id="audit-to" aria-invalid={error?.field === "to" || undefined} aria-describedby={error?.field === "to" ? "audit-filter-error" : undefined} value={fields.to} placeholder="JJJJ-MM-TT" maxLength={10} allowClear onChange={e=>field("to",e.target.value)} aria-label="Bis einschließlich (UTC)" /></label>
          <label>Modul<Select aria-label="Modul" value={fields.module} options={options(MODULE_LABELS)} onChange={v=>field("module",v)} /></label>
          <label>Person / Zugang<Input id="audit-actorId" aria-invalid={error?.field === "actorId" || undefined} aria-describedby={error?.field === "actorId" ? "audit-filter-error" : undefined} aria-label="Personenkennung" value={fields.actorId} placeholder="Genaue Kennung aus Details" maxLength={512} allowClear onChange={e=>field("actorId",e.target.value)} /></label>
          <label>Aktion<Select aria-label="Aktion" value={fields.action} options={options(ACTION_LABELS)} onChange={v=>field("action",v)} /></label>
          <label>Ergebnis<Select aria-label="Ergebnis" value={fields.result} options={options(RESULT_LABELS)} onChange={v=>field("result",v)} /></label>
        </div>
        <Checkbox style={{minHeight:44,alignItems:"center",marginBlockStart:SPACE.md}} checked={fields.includeSystem === "1"} onChange={event=>field("includeSystem",event.target.checked ? "1" : "")}>Systemeinträge anzeigen</Checkbox>
        {fields.objectRefHash && <p>Auf dieses Objekt im Modul {MODULE_LABELS[fields.module]} und Objekttyp „{objectLabel(fields.objectType)}“ eingegrenzt. Andere Objekttypen, auch Downloads und Exporte, bleiben getrennt. <Button onClick={()=>setFields(previous=>({...previous,module:"",objectType:"",objectRefHash:""}))}>Objektfilter entfernen</Button></p>}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" id="audit-filter-error">{error.message}</p>}
        <Space className={css.actions} wrap style={{marginBlockStart:SPACE.lg}}>
          <Button type="primary" htmlType="submit" loading={pending}>Filter anwenden</Button>
          <Button disabled={pending} onClick={()=>{setFields(Object.fromEntries(FILTER_KEYS.map(key=>[key,""])));setError(null);navigate({});}}>Filter zurücksetzen</Button>
          <Button disabled={pending} onClick={()=>startTransition(()=>router.refresh())}>Neu laden</Button>
        </Space>
        <p style={{...SCHRIFT.neben,marginBlockEnd:0}}>Zeiten und Tagesgrenzen in UTC. Die Personenkennung findest du in den Details eines Eintrags.</p>
      </form>
    </Card>
    <div role="status" aria-live="polite">{pending ? "Einträge werden geladen …" : ready ? `${ready.page.events.length} Einträge auf dieser Seite · Neueste zuerst` : ""}</div>
    {view.state !== "ready" && <Alert type="warning" showIcon title={view.state === "invalid" ? "Filter prüfen" : "Audit-Log nicht verfügbar"} description={view.message} />}
    {ready?.transferFailed && <Alert type="warning" showIcon title="Ereignisübernahme gestört" description="Einige Ereignisse konnten noch nicht übernommen werden. Die angezeigte Liste kann unvollständig sein. Lade die Ansicht erneut; bleibt die Meldung bestehen, prüfe die Ereignisübernahme." />}
    {ready && ready.pending > 0 && <Alert type="info" showIcon title="Ereignisse werden noch übernommen" description={`${ready.pending} Ereignisse warten noch auf die Übernahme. Lade die Ansicht erneut.`} />}
    {ready && (ready.page.events.length ? <>
      <div className={css.desktop}>
        <Table<AuditEvent> rowKey="id" dataSource={ready.page.events} pagination={false} scroll={{x:960}} columns={[
          {title:<span style={SCHRIFT.kicker}>Zeit (UTC)</span>,key:"time",width:190,render:(_,event)=><time dateTime={new Date(event.occurredAt).toISOString()} style={SCHRIFT.mono}>{auditTime(event.occurredAt)}</time>},
          {title:<span style={SCHRIFT.kicker}>Modul</span>,width:130,dataIndex:"module",render:(module:string)=>MODULE_LABELS[module]},
          {title:<span style={SCHRIFT.kicker}>Aktion / Objekt</span>,width:200,key:"action",render:(_,event)=><>{ACTION_LABELS[event.action]}<br/><span style={SCHRIFT.neben}>{objectLabel(event.objectType)}</span>{event.origin==="browser"&&<div><Tag>Vom Browser gemeldet</Tag></div>}</>},
          {title:<span style={SCHRIFT.kicker}>Person / Zugang</span>,width:200,key:"actor",render:(_,event)=><span className={css.break}>{actorLabel(event)}</span>},
          {title:<span style={SCHRIFT.kicker}>Ergebnis</span>,width:120,dataIndex:"result",render:(result:AuditEvent["result"])=><Tag>{RESULT_LABELS[result]}</Tag>},
          {title:<span style={SCHRIFT.kicker}>Details</span>,width:120,key:"details",render:(_,event)=><Button onClick={()=>setDetails(event)} aria-label={`Details: ${objectLabel(event.objectType)}`}>Details</Button>},
        ]} />
      </div>
      <div className={css.mobile} style={{gap:SPACE.md}}>{ready.page.events.map(event=><Card key={event.id}>
        <time dateTime={new Date(event.occurredAt).toISOString()} style={SCHRIFT.mono}>{auditTime(event.occurredAt)}</time>
        <p><strong>{ACTION_LABELS[event.action]} · {objectLabel(event.objectType)}</strong></p>
        <p className={css.break}>{MODULE_LABELS[event.module]} · {actorLabel(event)}</p>
        <Space wrap><Tag>{RESULT_LABELS[event.result]}</Tag>{event.origin==="browser"&&<Tag>Vom Browser gemeldet</Tag>}</Space>
        <div style={{marginBlockStart:SPACE.md}}><Button block onClick={()=>setDetails(event)}>Details</Button></div>
      </Card>)}</div>
    </> : <Card><h2 style={SCHRIFT.unterTitel}>{ready.filtered ? "Keine passenden Einträge" : ready.transferFailed || ready.pending ? "Noch keine übernommenen Einträge" : "Noch keine Ereignisse"}</h2>
      <p>{ready.filtered ? "Ändere die Filter oder setze sie zurück." : "Das Audit-Log erfasst Ereignisse ab der Aktivierung. Frühere Vorgänge werden nicht nachträglich rekonstruiert."}</p>
      {committed.includeSystem !== "1" && <p>Systemeinträge sind ausgeblendet. Aktiviere Systemeinträge anzeigen und wähle Filter anwenden, um sie einzublenden.</p>}</Card>)}
    {ready && <Space className={css.actions} wrap>
      {(search.cursorId || ready.filtered) && <Button disabled={pending} onClick={()=>navigate(committed)}>Neueste Einträge</Button>}
      <Button disabled={pending||!ready.page.nextCursor} onClick={()=>navigate(committed,ready.page.nextCursor)}>Ältere Einträge</Button>
    </Space>}
    <Modal styles={{ close: { width: 44, height: 44 } }} title="Ereignisdetails" open={!!details} onCancel={()=>setDetails(null)} footer={<Button onClick={()=>setDetails(null)}>Schließen</Button>} destroyOnHidden>
      {details && <>
        <dl className={css.details}>
          <dt>Zeit</dt><dd>{auditTime(details.occurredAt)}</dd>
          <dt>Modul</dt><dd>{MODULE_LABELS[details.module]}</dd>
          <dt>Aktion</dt><dd>{ACTION_LABELS[details.action]}</dd>
          <dt>Objekt</dt><dd>{objectLabel(details.objectType)}</dd>
          <dt>Person / Zugang</dt><dd>{actorLabel(details)}</dd>
          {"id" in details.actor && <><dt>Personen-ID</dt><dd style={SCHRIFT.mono}>{details.actor.id}</dd></>}
          <dt>Ergebnis</dt><dd>{RESULT_LABELS[details.result]}</dd>
          <dt>Herkunft</dt><dd>{details.origin==="browser" ? "Vom Browser gemeldet" : details.origin==="database" ? "Gespeicherte Änderung" : "Vom Server erfasst"}</dd>
          <dt>Ereignis-ID</dt><dd style={SCHRIFT.mono}>{details.id}</dd>
          {details.objectRef && <><dt>Objektkennung (geschützt)</dt><dd style={SCHRIFT.mono}>{details.objectRef}</dd></>}
          {details.correlationId&&<><dt>Zusammengehörige Anfrage</dt><dd style={SCHRIFT.mono}>{details.correlationId}</dd></>}
        </dl>
        {details.origin==="browser"&&<p>Der Browser meldet, dass er den Export ausgelöst hat. Das bestätigt weder den Empfang noch das Speichern der Datei.</p>}
        {(details.action==="download"||details.action==="export")&&details.origin==="server"&&<p>{details.result==="success" ? "Der Server hat die Datei zur Auslieferung bereitgestellt. Der Empfang auf dem Gerät ist damit nicht bestätigt." : details.result==="denied" ? "Der Server hat die Auslieferung verweigert." : "Bei der Auslieferung ist ein Fehler aufgetreten. Eine erfolgreiche Bereitstellung ist nicht bestätigt."}</p>}
        <Space className={css.actions} wrap>
          {"id" in details.actor && <Button onClick={()=>navigate({...committed,actorId:"id" in details.actor ? details.actor.id : ""})}>Nur diese Person / diesen Zugang</Button>}
          {details.objectRef?.startsWith("sha256:")&&<Button onClick={()=>navigate({...committed,module:details.module,objectType:details.objectType,objectRefHash:details.objectRef!.slice(7)})}>Nur dieses Objekt</Button>}
        </Space>
      </>}
    </Modal>
  </div>;
}
