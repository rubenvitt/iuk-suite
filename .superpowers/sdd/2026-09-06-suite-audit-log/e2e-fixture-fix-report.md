# E2E fixture audit-function correction

Base: `73ad39fed595b9ac0a026778fced656e24e92996`. Scope: six E2E specs, with one existing API import and one immediate registration per file. Product code, trigger/transaction semantics, fixture pragmas, cleanup order and callbacks are unchanged. No new abstraction or test was added.

## RED and repair

The parent's completed full Playwright run exited **1: 379 passed / 26 failed, 18.2 minutes**. All 26 failure traces reported `SqliteError: no such function: suite_audit_id`. Audit SQL functions belong to each SQLite connection: registering them on the application/seed connection cannot equip separately opened fixture handles. Even preparing a DELETE on an audited table requires the functions.

Before this follow-up's first browser run, all 26 failed artifact directories were copied from `test-results` to `/private/tmp/audit-e2e-fixture-red-73ad39fe/`, retaining each `trace.zip` and `error-context.md`. The local `manifest.json` records all 26. These scratch artifacts are not committed.

Each affected constructor now immediately calls `registerAuditFunctions` from `@/core/audit/context`, before any statement or callback. The existing absent-context system actor applies to direct fixture provisioning. No trigger is weakened or disabled.

## Complete AST inventory

A read-only TypeScript AST traversal of all e2e TS/TSX/JS files resolves default imports from `better-sqlite3`, including `DatenbankLeser`, then enumerates each corresponding `new` expression and its next statement. Exit **0**, **18 raw constructor sites**, **6 immediate registrations**. Full local output: `/private/tmp/audit-e2e-fixture-inventory.json`. Line numbers below refer to the repaired files.

| Writable business connection | Helper / writes | Immediate registration |
| --- | --- | --- |
| `files-hosts.spec.ts:214` | `db`: INSERT shares/share_files/zugangslinks/inbox_files | `registerAuditFunctions(sqlite)` |
| `files-inbox.spec.ts:93` | `legeAbgabelinkAn`: INSERT zugangslinks | `registerAuditFunctions(sqlite)` |
| `files-mobil.spec.ts:191` | `sorgeFuerBestand`: DELETE then INSERT inbox_files/zugangslinks/share_files/shares | `registerAuditFunctions(sqlite)` |
| `lagerbuch-helfer.spec.ts:76` | `sperre`: UPDATE tokens.aktiv | `registerAuditFunctions(db)` |
| `radio-hosts.spec.ts:334` | `schreibend`: callback INSERT OR IGNORE / UPDATE zugangscodes | `registerAuditFunctions(db)` |
| `radio-zugang.spec.ts:240` | `schreibend`: callback INSERT OR IGNORE / UPDATE zugangscodes | `registerAuditFunctions(db)` |

All file paths in the table are under `e2e/`. The eleven explicit readonly constructors are unchanged: `files-fileshare.spec.ts:145,695,707,717`; `lagerbuch-helfer.spec.ts:63,86,105`; `lagerbuch-hosts.spec.ts:71`; `radio-hosts.spec.ts:325`; `radio-kiosk.spec.ts:139`; `radio-zugang.spec.ts:231`. They execute SELECTs. The remaining writable constructor, `suite-audit.spec.ts:10`, writes only the central `audit_events` table, which has no business outbox trigger; it needs no registration.

There are no executable child_process/execa or SQLite CLI writers under e2e. The sqlite3 text in radio-zugang is a manual SELECT comment. Browser/HTTP/QR helpers and the fake-clamd control file do not open SQLite. Playwright startup invokes `e2e/seed-lagerbuch.ts` and `scripts/seed-lokal.ts` for Aufgaben/Radio/UAV/Zeichen; these already use registered `openModuleDatabase`/`getModuleDb`/module-client paths. Lagerbuch retains its additional `lb_falte`. The separate PWA build/start config adds no raw SQL fixture writer.

## Verification

The following commands run from `/private/tmp/iuk-suite-audit-log`. The six-spec browser gate uses one worker and one controlled server; the full 405-case gate remains the parent's responsibility.

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH WATCHPACK_POLLING=1000 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/@playwright/test/cli.js test e2e/files-hosts.spec.ts e2e/files-inbox.spec.ts e2e/files-mobil.spec.ts e2e/lagerbuch-helfer.spec.ts e2e/radio-hosts.spec.ts e2e/radio-zugang.spec.ts --workers=1 --trace=on > /private/tmp/audit-e2e-fixture-targeted.log 2>&1
```

Browser result: **exit 0, 56 passed (2.1m)**. No retries or changes to assertions/timeouts. The owned server processes exited; `rtk proxy lsof -nP -iTCP:3100 -iTCP:3310 -sTCP:LISTEN` returned no listeners (exit 1).

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH node node_modules/typescript/bin/tsc --noEmit --pretty false
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH node node_modules/eslint/bin/eslint.js e2e/files-hosts.spec.ts e2e/files-inbox.spec.ts e2e/files-mobil.spec.ts e2e/lagerbuch-helfer.spec.ts e2e/radio-hosts.spec.ts e2e/radio-zugang.spec.ts
rtk proxy git -c core.fsmonitor=false diff --check
```

Typecheck **exit 0**, scoped lint **exit 0**, diff check **exit 0**. Only Next's generated dev type-reference paths in `next-env.d.ts` were restored to their tracked values after the browser gate. The final code diff is exactly twelve added lines across the six specs. Product source remains byte-identical to the base commit; no repeated Vitest/build or full browser claim is made here. Independent narrow review and the parent's complete browser gate follow this commit.
