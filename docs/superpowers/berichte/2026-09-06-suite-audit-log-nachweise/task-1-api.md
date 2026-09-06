# Audit storage API (Task 1)

Imports directly from `@/core/audit/{types,context,storage,transfer,retention}`; no auth import in these modules.

- `AuditActor = { kind: "user" | "access"; id: string; name?: string } | { kind: "anonymous" | "system" }`
- `AuditContext = { actor: AuditActor; correlationId?: string }` (correlation must be UUID).
- `withAuditContext<T>(context: AuditContext, operation: () => T): T`; AsyncLocalStorage isolates async calls. Missing context means system.
- `AuditAction`: `create | update | delete | sign_in | sign_out | session_revoke | access_denied | download | export`.
- `AuditModule`: `portal | qr | feedback | files | lagerbuch | aufgaben | radio | uav | zeichen | konto`.
- `AuditResult = success | denied | failure`; `AuditOrigin = server | browser | database`.
- `recordAuditEvent({ module, action, objectType, objectRef?, result, origin })`: void, explicit server event, actor taken exclusively from context. Throws on write/validation failure: security decisions must remain effective when callers catch/log failure. objectType must be `[a-z][a-z0-9_]{0,63}`. objectRef is raw safe identity input hashed before persistence; never pass titles/URLs/body. No metadata accepted/stored. `safeAuditReference(value)` is exported from context for reference lookup only; do not prehash recordAuditEvent input.
- `AuditEvent`: input fields plus `id:string`, `occurredAt:number` (epoch milliseconds), `actor:AuditActor`, optional `correlationId`; persisted `objectRef` is SHA-256-prefixed string or undefined.
- `queryAuditEvents(filters={})`: `{ events: AuditEvent[], nextCursor?: {occurredAt:number,id:string} }`. Filters `{ module?, action?, actorId?, objectRef?:string, result?, from?:number, to?:number, cursor?, limit?:number }`; default 50, maximum 100. Stable descending timestamp/id. Caller MUST first enforce suite-admin rights (the pure storage cannot import auth).
- `transferAuditEvents()`: `{ transferred:number, expired:number, pending:number, failures:string[] }` (failure values are module keys, no error payload). Batch bound 500 per DB per invocation; persisted source rows deleted only after central transaction commits. Failure visible in result, background logger prints a fixed message.
- `startAuditBackgroundWork()`: idempotent unref timer every 30s; transfer and retention. Bootstrap wires this.
- `purgeAuditEvents(now=Date.now())`: number deleted; `auditRetentionDays()` validates env positive integer (default 90), `auditCutoff(now)` returns epoch-ms cutoff.
- `registerAuditFunctions(sqlite)` from context must run on any SQLite connection that mutates an audited schema. Application opener does this automatically. Plain SQLite can apply migrations; test-only openers must register before subsequent mutations.

All anonymous feedback response mutation events have anonymous actor, no correlation, no object reference. Other row references are hashed. Technical caches/session rows and duplicate per-module logs are explicitly inventoried/excluded in catalog.

`objectRef` filter accepts a known raw object ID; storage hashes it before lookup. Composite PK references are JSON arrays in declared catalog PK order. Submit raw references through POST/server action, never a URL query (IDs may grant access).

Actor `access` means confirmed shared access (e.g. loan code); its ID is the credential record identity, never a secret/code/token. It must be labeled separately from a known person.
