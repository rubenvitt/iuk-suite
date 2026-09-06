# Task 2 — Audit request integration

## Scope and decisions

All nine business modules plus konto are integrated. Storage remains Task 1's approved API; this task does not add duplicate create/update/delete events. Existing exported async function declarations, first-guard rules, host checks, role distinctions, domain transactions and response codes are retained.

Confirmed SSO viewers feed `auditActor`. Lagerbuch helper tokens and Radio loan codes use `access` actors with `lagerbuch:token:<id>` / `radio:code:<id>` and the fixed label “Gemeinsamer Zugangscode”; no secret or free-form credential label is stored. UAV participants use `user` actors with `uav:participant:<id>`. Public Files flows and Feedback submissions reset the context to anonymous; feedback responses remain without correlation/reference. Empty identities are anonymous rather than invented users.

The core guard now returns the user it already authenticated. QR no longer authenticates twice. UAV `adminZugang` returns the confirmed viewer or the existing 403 response; `adminAbweisung` remains available to existing callers. Aufgaben' shared action helpers establish context once, its quick-plan action uses a private common implementation, and its JIT coordination insert has the confirmed SSO actor. Personenverwaltung reuses its existing permission decision and returns that confirmed actor. Lifecycle results carry a small `accessDenied` discriminator only for actual role/ownership rejection, keeping invalid-state errors distinct.

Auth.js hooks observe successful sign-in and local sign-out. OIDC sign-in uses `account.providerAccountId`, matching the JWT's provider `sub`, rather than Auth.js's random user ID. Credentials use the confirmed credentials account ID. Polling/refresh do not emit sign-in. Provider logout redirection is not claimed as a completed provider logout. Konto session revocation is wrapped around the existing mutation and records its explicit lifecycle event.

Local code redemption updates execute anonymously; the successfully issued session is then attributed to its confirmed access ID. Logout verifies the existing local cookie where possible and remains anonymous when expired/invalid. Audit errors cannot block cookie clearing. UAV logout similarly resolves the participant before deletion.

Files AV enqueue/worker starters, scheduled cleanup, and Aufgaben scan starters explicitly reset to system, including detached promises. An administrator's manual Files cleanup keeps their user context. Feedback's automatic survey closure on its public page is explicitly anonymous.

## Public integration API (`core/audit/server.ts`)

- `auditActor(confirmedViewer)`: pure confirmed `sub`/`id` + optional trusted display name; no auth/cookies lookup.
- `auditAccessActor(module, recordId)`: shared access actor with a fixed descriptive label.
- `auditParticipantActor(participantId)`: namespaced confirmed participant.
- Re-exported `withAuditContext(context, operation)` for synchronous and asynchronous business operations.
- `auditEvent(input, actor?)`: writes a typed explicit event, catches storage/validation failure, logs only `[audit] Ereignis konnte nicht gespeichert werden.`.
- `auditDenied(module, actor?, objectType?)`: fixed denied access event at existing decision points.
- `auditDelivery(module, action, objectType, actor, operation)`: awaits the prepared response, records success/denial/failure, preserves the response or thrown error; 401/403 also record explicit access denial. Ordinary 404s and parser errors are not misclassified as delivery success or access abuse. Stream success means provided response, not receipt by a client. Explicit delivery entries currently identify module/object type and actor; they carry no raw filenames, URLs or payloads.
- `auditSystem(operation)`: explicit system-context helper.

No helper imports auth, avoiding a config → logger → auth cycle. All event object types are fixed strings, no user request body or URL is used as event metadata.

## Verification

Initial RED: two real Portal action tests failed with actor `system` and absent user IDs in real outbox rows. GREEN: both passed after integration. Earlier focused runs: 26 files / 423 tests, 99 files / 2,022 tests and 44 files / 1,023 tests, all exit 0. These overlap and are not additive.

Additional real probes cover helper booking/access actor with no plaintext code, UAV sync with a session issued by the real login handler, Feedback submission under an existing user+correlation context, and a scan worker started under a user context. Auth hook tests prove provider/JWT consistency and credentials handling. Delivery probes exercise prepared bytes, the persistent download counter, and continued delivery under an injected central audit failure. The explicit-event failure test also proves an authorization rejection remains effective and only a fixed safe error is logged.

The final selected test arguments are stored in `task-2-test-paths.json`. Command reconstruction: Node 22 executable with `node node_modules/vitest/vitest.mjs run`, each JSON string as one argument, then `--maxWorkers=2`; environment `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=core.fsmonitor`, `GIT_CONFIG_VALUE_0=false`. All commands invoked through `rtk proxy`. Final totals and exits are recorded below.

An overlapping rerun of the Download test file caused collisions in its existing fixed fixture directory (UNIQUE/ENOTEMPTY). This is test-run contention, not accepted product failure; the isolated rerun and a subsequent complete selected-suite rerun both pass (details below).

## Complete callable inventory

`coverage-manifest.json` covers 211 callable entries: 145 context entries, 12 explicit-only entries and 54 deliberate exclusions. `coverage.test.ts` enumerates actual TypeScript exports, including Auth.js's destructured GET/POST, compares the exact set and checks context wiring or the named common helper. Existing module source guards continue enforcing first guard and role matrices. New Task 3 endpoints/actions must be classified here when added.

“Context” means the whole post-guard operation executes within the recorded actor context; “explicit-only” means observed auth/logout with context within the verified redemption helper where required. Exclusions include read/search/revalidation, generated icons/manifests/QR PNGs, previews, health/discovery/legacy redirects, the parser-only Radio import upload and the Files legacy POST that always returns 409. Feedback device release only clears an anonymous participation marker; it is not an authenticated logout.

- `src/app/.well-known/webfinger/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/api/auth/oidc-signout/route.ts#GET` — **excluded**: Provider redirect only; actual local logout is observed in the Auth.js signOut hook.
- `src/app/api/health/[modul]/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/api/health/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/aufgaben/a/[id]/nachweis/[nachweisId]/route.ts#GET` — **context**: via `GET`.
- `src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts#POST` — **context**: via `POST`.
- `src/app/m/aufgaben/actions.ts#aufgabeEinstellenAction` — **context**: via `aufgabeEinstellenAction`.
- `src/app/m/aufgaben/actions.ts#verteilenAction` — **context**: via `verteilenGemeinsam`.
- `src/app/m/aufgaben/actions.ts#umverteilenAction` — **context**: via `verteilenGemeinsam`.
- `src/app/m/aufgaben/actions.ts#zurueckziehenAction` — **context**: via `zurueckziehenAction`.
- `src/app/m/aufgaben/actions.ts#startenAction` — **context**: via `einfacherUebergang`.
- `src/app/m/aufgaben/actions.ts#zuruecksetzenAction` — **context**: via `einfacherUebergang`.
- `src/app/m/aufgaben/actions.ts#wiederaufnehmenAction` — **context**: via `einfacherUebergang`.
- `src/app/m/aufgaben/actions.ts#einplanenAnnehmenAction` — **context**: via `einplanenGemeinsam`.
- `src/app/m/aufgaben/actions.ts#fertigMeldenAction` — **context**: via `fertigMeldenAction`.
- `src/app/m/aufgaben/actions.ts#freigebenAction` — **context**: via `freigebenAction`.
- `src/app/m/aufgaben/actions.ts#zurueckweisenAction` — **context**: via `zurueckweisenAction`.
- `src/app/m/aufgaben/actions.ts#routineAnlegenAction` — **context**: via `routineFormularGemeinsam`.
- `src/app/m/aufgaben/actions.ts#routineAendernAction` — **context**: via `routineFormularGemeinsam`.
- `src/app/m/aufgaben/actions.ts#routineRuhenAction` — **context**: via `routineRuhenAction`.
- `src/app/m/aufgaben/actions.ts#rangVerschiebenAction` — **context**: via `rangVerschiebenAction`.
- `src/app/m/aufgaben/actions.ts#personenSucheAction` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/aufgaben/actions.ts#personAnlegenAction` — **context**: via `personFormularGemeinsam`.
- `src/app/m/aufgaben/actions.ts#personAendernAction` — **context**: via `personFormularGemeinsam`.
- `src/app/m/aufgaben/actions.ts#personBeendenAction` — **context**: via `personBeendenAction`.
- `src/app/m/aufgaben/actions.ts#einplanenAction` — **context**: via `einplanenGemeinsam`.
- `src/app/m/beta/manifest.webmanifest/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/beta/pwa-icon.svg/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/beta/sw.js/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/feedback/(admin)/groups/[groupId]/evenings/[eveningId]/export.csv/route.ts#GET` — **context**: via `GET`.
- `src/app/m/feedback/(admin)/groups/[groupId]/export.csv/route.ts#GET` — **context**: via `GET`.
- `src/app/m/feedback/actions.ts#createGroupAction` — **context**: via `createGroupAction`.
- `src/app/m/feedback/actions.ts#updateGroupAction` — **context**: via `updateGroupAction`.
- `src/app/m/feedback/actions.ts#regenerateSecretAction` — **context**: via `regenerateSecretAction`.
- `src/app/m/feedback/actions.ts#deleteGroupAction` — **context**: via `deleteGroupAction`.
- `src/app/m/feedback/actions.ts#suchePersonenAction` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/feedback/actions.ts#addGroupLeaderAction` — **context**: via `addGroupLeaderAction`.
- `src/app/m/feedback/actions.ts#removeGroupLeaderAction` — **context**: via `removeGroupLeaderAction`.
- `src/app/m/feedback/actions.ts#createEveningAction` — **context**: via `createEveningAction`.
- `src/app/m/feedback/actions.ts#updateEveningAction` — **context**: via `updateEveningAction`.
- `src/app/m/feedback/actions.ts#deleteEveningAction` — **context**: via `deleteEveningAction`.
- `src/app/m/feedback/actions.ts#activateSurveyAction` — **context**: via `activateSurveyAction`.
- `src/app/m/feedback/actions.ts#submitResponseAction` — **context**: via `submitResponseAction`.
- `src/app/m/feedback/actions.ts#releaseDeviceAction` — **excluded**: Clears only the anonymous device participation marker; no authenticated session or business mutation.
- `src/app/m/feedback/actions.ts#startFeedbackAction` — **context**: via `startFeedbackAction`.
- `src/app/m/feedback/actions.ts#beendeFeedbackAction` — **context**: via `beendeFeedbackAction`.
- `src/app/m/feedback/f/[slugSecret]/qr.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/files/(verwaltung)/ablage-actions.ts#aufraeumenAction` — **context**: via `aufraeumenAction`.
- `src/app/m/files/(verwaltung)/actions.ts#anlegenAction` — **context**: via `anlegenAction`.
- `src/app/m/files/(verwaltung)/actions.ts#bearbeitenAction` — **context**: via `bearbeitenAction`.
- `src/app/m/files/(verwaltung)/actions.ts#downloadsAufstockenAction` — **context**: via `downloadsAufstockenAction`.
- `src/app/m/files/(verwaltung)/actions.ts#shareLoeschenAction` — **context**: via `shareLoeschenAction`.
- `src/app/m/files/(verwaltung)/actions.ts#avWiederholenAction` — **context**: via `avWiederholenAction`.
- `src/app/m/files/(verwaltung)/posteingang/actions.ts#inboxLoeschenAction` — **context**: via `inboxLoeschenAction`.
- `src/app/m/files/(verwaltung)/zugangslinks/actions.ts#zugangslinkAnlegenAction` — **context**: via `zugangslinkAnlegenAction`.
- `src/app/m/files/(verwaltung)/zugangslinks/actions.ts#kontingentAufstockenAction` — **context**: via `kontingentAufstockenAction`.
- `src/app/m/files/(verwaltung)/zugangslinks/actions.ts#zugangslinkWiderrufenAction` — **context**: via `zugangslinkWiderrufenAction`.
- `src/app/m/files/api/download/[id]/route.ts#GET` — **context**: via `GET`.
- `src/app/m/files/api/download/[id]/zip/route.ts#GET` — **context**: via `GET`.
- `src/app/m/files/api/inbox/[id]/route.ts#GET` — **context**: via `GET`.
- `src/app/m/files/api/inbox/zip/route.ts#GET` — **context**: via `GET`.
- `src/app/m/files/api/preview/[id]/route.ts#GET` — **excluded**: Inline preview, not a business download.
- `src/app/m/files/api/s/[id]/qr.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/files/api/s/[id]/verify/route.ts#POST` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/files/api/u/[token]/qr.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/files/api/u/[token]/upload/route.ts#PUT` — **context**: via `PUT`.
- `src/app/m/files/api/u/[token]/upload/route.ts#POST` — **excluded**: Legacy endpoint always returns 409 and writes nothing.
- `src/app/m/files/api/upload/[fileId]/route.ts#PUT` — **context**: via `PUT`.
- `src/app/m/files/api/upload/[fileId]/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/files/api/upload/[fileId]/route.ts#DELETE` — **context**: via `DELETE`.
- `src/app/m/lagerbuch/_actions/artikel.ts#createArtikel` — **context**: via `createArtikel`.
- `src/app/m/lagerbuch/_actions/artikel.ts#updateArtikel` — **context**: via `updateArtikel`.
- `src/app/m/lagerbuch/_actions/artikel.ts#setArtikelAktiv` — **context**: via `setArtikelAktiv`.
- `src/app/m/lagerbuch/_actions/aussondern.ts#aussondern` — **context**: via `aussondern`.
- `src/app/m/lagerbuch/_actions/bestellung.ts#markiereBestellt` — **context**: via `markiereBestellt`.
- `src/app/m/lagerbuch/_actions/buchung.ts#bucheZugang` — **context**: via `bucheZugang`.
- `src/app/m/lagerbuch/_actions/buchung.ts#bucheEntnahme` — **context**: via `bucheEntnahme`.
- `src/app/m/lagerbuch/_actions/buchung.ts#bucheEntnahmeHelfer` — **context**: via `bucheEntnahmeHelfer`.
- `src/app/m/lagerbuch/_actions/bz.ts#geraetSpeichern` — **context**: via `geraetSpeichern`.
- `src/app/m/lagerbuch/_actions/bz.ts#setGeraetAktiv` — **context**: via `setGeraetAktiv`.
- `src/app/m/lagerbuch/_actions/bz.ts#geraetZuBarcode` — **context**: via `geraetZuBarcode`.
- `src/app/m/lagerbuch/_actions/bz.ts#kontrolleErfassen` — **context**: via `kontrolleErfassen`.
- `src/app/m/lagerbuch/_actions/check.ts#checkAbschluss` — **context**: via `checkAbschluss`.
- `src/app/m/lagerbuch/_actions/csv.ts#importArtikelCsv` — **context**: via `importArtikelCsv`.
- `src/app/m/lagerbuch/_actions/detail.ts#getDetail` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/lagerbuch/_actions/fahrzeuge.ts#createFahrzeug` — **context**: via `createFahrzeug`.
- `src/app/m/lagerbuch/_actions/fahrzeuge.ts#setFahrzeugAktiv` — **context**: via `setFahrzeugAktiv`.
- `src/app/m/lagerbuch/_actions/fahrzeuge.ts#sollPositionSetzen` — **context**: via `sollPositionSetzen`.
- `src/app/m/lagerbuch/_actions/fahrzeuge.ts#sollPositionEntfernen` — **context**: via `sollPositionEntfernen`.
- `src/app/m/lagerbuch/_actions/fahrzeuge.ts#sollPositionWiederherstellen` — **context**: via `sollPositionWiederherstellen`.
- `src/app/m/lagerbuch/_actions/gate.ts#einloesenAmGate` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/lagerbuch/_actions/geraete.ts#geraetSpeichern` — **context**: via `geraetSpeichern`.
- `src/app/m/lagerbuch/_actions/geraete.ts#setGeraetAktiv` — **context**: via `setGeraetAktiv`.
- `src/app/m/lagerbuch/_actions/geraete.ts#geraetZuBarcode` — **context**: via `geraetZuBarcode`.
- `src/app/m/lagerbuch/_actions/inventur.ts#inventurKorrektur` — **context**: via `inventurKorrektur`.
- `src/app/m/lagerbuch/_actions/lagerortVerfall.ts#verfallSetzen` — **context**: via `verfallSetzen`.
- `src/app/m/lagerbuch/_actions/loeschen.ts#pruefeLoeschbar` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/lagerbuch/_actions/loeschen.ts#loescheElement` — **context**: via `loescheElement`.
- `src/app/m/lagerbuch/_actions/loeschen.ts#deaktiviereElement` — **context**: via `deaktiviereElement`.
- `src/app/m/lagerbuch/_actions/sauerstoff.ts#flascheSpeichern` — **context**: via `flascheSpeichern`.
- `src/app/m/lagerbuch/_actions/sauerstoff.ts#setFlascheAktiv` — **context**: via `setFlascheAktiv`.
- `src/app/m/lagerbuch/_actions/sauerstoff.ts#messungErfassen` — **context**: via `messungErfassen`.
- `src/app/m/lagerbuch/_actions/sitzung.ts#erneuereSitzung` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/lagerbuch/_actions/sitzung.ts#beenden` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/lagerbuch/_actions/templates.ts#createTemplate` — **context**: via `createTemplate`.
- `src/app/m/lagerbuch/_actions/templates.ts#renameTemplate` — **context**: via `renameTemplate`.
- `src/app/m/lagerbuch/_actions/templates.ts#setTemplateAktiv` — **context**: via `setTemplateAktiv`.
- `src/app/m/lagerbuch/_actions/templates.ts#deleteTemplate` — **context**: via `deleteTemplate`.
- `src/app/m/lagerbuch/_actions/templates.ts#templatePositionSetzen` — **context**: via `templatePositionSetzen`.
- `src/app/m/lagerbuch/_actions/templates.ts#templatePositionEntfernen` — **context**: via `templatePositionEntfernen`.
- `src/app/m/lagerbuch/_actions/templates.ts#fahrzeugTemplateZuweisen` — **context**: via `fahrzeugTemplateZuweisen`.
- `src/app/m/lagerbuch/_actions/templates.ts#fahrzeugTemplateSync` — **context**: via `fahrzeugTemplateSync`.
- `src/app/m/lagerbuch/_actions/templates.ts#templateAufFahrzeugeSyncen` — **context**: via `templateAufFahrzeugeSyncen`.
- `src/app/m/lagerbuch/_actions/templates.ts#fahrzeugTemplateLoesen` — **context**: via `fahrzeugTemplateLoesen`.
- `src/app/m/lagerbuch/_actions/templates.ts#templateAusFahrzeug` — **context**: via `templateAusFahrzeug`.
- `src/app/m/lagerbuch/_actions/tokens.ts#createToken` — **context**: via `createToken`.
- `src/app/m/lagerbuch/_actions/tokens.ts#setTokenAktiv` — **context**: via `setTokenAktiv`.
- `src/app/m/lagerbuch/abmelden/route.ts#GET` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/lagerbuch/icon-192.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/lagerbuch/icon-512.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/lagerbuch/icon-maskable-512.png/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/lagerbuch/manifest.webmanifest/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/lagerbuch/pwa-icon.svg/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/lagerbuch/t/[code]/route.ts#GET` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/lagerbuch/verwaltung/(druck)/checklisten/pdf/route.ts#GET` — **context**: via `GET`.
- `src/app/m/portal/actions.ts#createServiceAction` — **context**: via `createServiceAction`.
- `src/app/m/portal/actions.ts#deleteServiceAction` — **context**: via `deleteServiceAction`.
- `src/app/m/portal/actions.ts#setzeAnsprechpartnerAction` — **context**: via `setzeAnsprechpartnerAction`.
- `src/app/m/portal/profil/actions.ts#alleSitzungenAbmelden` — **context**: via `alleSitzungenAbmelden`.
- `src/app/m/qr/actions.ts#createPresetAction` — **context**: via `createPresetAction`.
- `src/app/m/qr/actions.ts#updatePresetAction` — **context**: via `updatePresetAction`.
- `src/app/m/qr/actions.ts#deletePresetAction` — **context**: via `deletePresetAction`.
- `src/app/m/qr/actions.ts#reorderPresetsAction` — **context**: via `reorderPresetsAction`.
- `src/app/m/qr/manifest.webmanifest/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/qr/pwa-icon.svg/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/qr/sw.js/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/radio/_actions/ausleihe.ts#ausleiheAnlegen` — **context**: via `ausleiheAnlegen`.
- `src/app/m/radio/_actions/ausleihe.ts#rueckgabeBuchen` — **context**: via `rueckgabeBuchen`.
- `src/app/m/radio/_actions/ausleihe.ts#entleiherVorschlaege` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/radio/_actions/ausleihe.ts#listeAktualisieren` — **excluded**: Read/search/revalidation only; the existing authorization guard still logs denial.
- `src/app/m/radio/_actions/codes.ts#erstelleCode` — **context**: via `erstelleCode`.
- `src/app/m/radio/_actions/codes.ts#setzeCodeAktiv` — **context**: via `setzeCodeAktiv`.
- `src/app/m/radio/_actions/gate.ts#einloesenAmGate` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/radio/_actions/sitzung.ts#erneuereSitzung` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/radio/_actions/sitzung.ts#beenden` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/radio/abmelden/route.ts#GET` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/radio/admin/(arbeit)/geraete/export/route.ts#GET` — **context**: via `GET`.
- `src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts#POST` — **excluded**: Parses the upload only; importSchreibenAction performs the audited database mutation.
- `src/app/m/radio/admin/actions.ts#geraetAnlegenAction` — **context**: via `geraetAnlegenAction`.
- `src/app/m/radio/admin/actions.ts#geraetAendernAction` — **context**: via `geraetAendernAction`.
- `src/app/m/radio/admin/actions.ts#geraetLoeschenAction` — **context**: via `geraetLoeschenAction`.
- `src/app/m/radio/admin/actions.ts#notizAnfuegenAction` — **context**: via `notizAnfuegenAction`.
- `src/app/m/radio/admin/actions.ts#versionAnlegenAction` — **context**: via `versionAnlegenAction`.
- `src/app/m/radio/admin/actions.ts#versionZielSetzenAction` — **context**: via `versionZielSetzenAction`.
- `src/app/m/radio/admin/actions.ts#versionLoeschenAction` — **context**: via `versionLoeschenAction`.
- `src/app/m/radio/admin/actions.ts#versionenSortierenAction` — **context**: via `versionenSortierenAction`.
- `src/app/m/radio/admin/actions.ts#importSchreibenAction` — **context**: via `importSchreibenAction`.
- `src/app/m/radio/admin/devices/[id]/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/admin/devices/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/admin/einstellungen/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/admin/history/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/admin/login/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/admin/update/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/loan/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/return/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/radio/sw.js/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/radio/t/[code]/route.ts#GET` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/radio/token-setup/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/(teilnehmer)/aufgabe/[id]/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/_actions/katalog.ts#aufgabeAnlegenAction` — **context**: via `aufgabeAnlegenAction`.
- `src/app/m/uav/_actions/katalog.ts#aufgabeAendernAction` — **context**: via `aufgabeAendernAction`.
- `src/app/m/uav/_actions/katalog.ts#aufgabeLoeschenAction` — **context**: via `aufgabeLoeschenAction`.
- `src/app/m/uav/_actions/katalog.ts#aufgabenSortierenAction` — **context**: via `aufgabenSortierenAction`.
- `src/app/m/uav/_actions/teilnehmer.ts#teilnehmerAnlegenAction` — **context**: via `teilnehmerAnlegenAction`.
- `src/app/m/uav/_actions/teilnehmer.ts#teilnehmerAendernAction` — **context**: via `teilnehmerAendernAction`.
- `src/app/m/uav/_actions/teilnehmer.ts#teilnehmerLoeschenAction` — **context**: via `teilnehmerLoeschenAction`.
- `src/app/m/uav/_actions/teilnehmer.ts#codeNeuAction` — **context**: via `codeNeuAction`.
- `src/app/m/uav/api/abmeldung/route.ts#POST` — **explicit-only**: Observed authentication or logout; credential write context resides in the verified redemption helper.
- `src/app/m/uav/api/admin/participants/[id]/export/route.ts#GET` — **context**: via `GET`.
- `src/app/m/uav/api/admin/participants/[id]/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/api/admin/participants/[id]/route.ts#PATCH` — **context**: via `PATCH`.
- `src/app/m/uav/api/admin/participants/[id]/route.ts#DELETE` — **context**: via `DELETE`.
- `src/app/m/uav/api/admin/participants/export/route.ts#GET` — **context**: via `GET`.
- `src/app/m/uav/api/admin/participants/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/api/admin/participants/route.ts#POST` — **context**: via `POST`.
- `src/app/m/uav/api/admin/tasks/[id]/route.ts#PATCH` — **context**: via `PATCH`.
- `src/app/m/uav/api/admin/tasks/[id]/route.ts#DELETE` — **context**: via `DELETE`.
- `src/app/m/uav/api/admin/tasks/reorder/route.ts#POST` — **context**: via `POST`.
- `src/app/m/uav/api/admin/tasks/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/api/admin/tasks/route.ts#POST` — **context**: via `POST`.
- `src/app/m/uav/api/anmeldung/route.ts#POST` — **context**: via `POST`.
- `src/app/m/uav/api/me/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/api/progress/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/api/sync/route.ts#POST` — **context**: via `POST`.
- `src/app/m/uav/api/tasks/route.ts#GET` — **excluded**: Read-only lookup, health, discovery or legacy redirect; no business mutation or export.
- `src/app/m/uav/manifest.webmanifest/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/uav/pwa-icon.svg/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/uav/sw.js/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/zeichen/actions.ts#merkeZeichen` — **context**: via `merkeZeichen`.
- `src/app/m/zeichen/actions.ts#entferneZeichen` — **context**: via `entferneZeichen`.
- `src/app/m/zeichen/actions.ts#speichereEigenesZeichen` — **context**: via `speichereEigenesZeichen`.
- `src/app/m/zeichen/actions.ts#beantworte` — **context**: via `beantworte`.
- `src/app/m/zeichen/actions.ts#legeLernsetAn` — **context**: via `legeLernsetAn`.
- `src/app/m/zeichen/actions.ts#setzeLernsetAktiv` — **context**: via `setzeLernsetAktiv`.
- `src/app/m/zeichen/actions.ts#fuegeZeichenZuSetHinzu` — **context**: via `fuegeZeichenZuSetHinzu`.
- `src/app/m/zeichen/actions.ts#entferneZeichenAusSet` — **context**: via `entferneZeichenAusSet`.
- `src/app/m/zeichen/manifest.webmanifest/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/zeichen/pwa-icon.svg/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/m/zeichen/sw.js/route.ts#GET` — **excluded**: Technical generated asset, not a business export.
- `src/app/api/auth/[...nextauth]/route.ts#GET` — **excluded**: Delegates to Auth.js; authConfig signIn/signOut hooks observe lifecycle once. Polling and token refresh are not sign-ins.
- `src/app/api/auth/[...nextauth]/route.ts#POST` — **excluded**: Delegates to Auth.js; authConfig signIn/signOut hooks observe lifecycle once. Polling and token refresh are not sign-ins.

## Extra mutation and guard entries

- `core/auth/guards.ts`: module action/page denials and confirmed-viewer return.
- `core/auth/config.ts`: Auth.js lifecycle hooks.
- `proxy.ts`: real `forbidden` route decisions, module derived through registry; no raw request location persisted.
- `feedback/_lib/access.ts`, `requireFeedbackAccess.ts`: group/object and module denials.
- `files/_lib/access.ts`: existing administration permission decision.
- `lagerbuch/_lib/zugang.ts`, `helferZugang.ts`; `radio/_lib/zugang.ts`, `ausleihZugang.ts`: exact existing admin/updater/shared-access decision points.
- `uav/_lib/requireUavAdmin.ts`: existing page/action/API permission decisions with preserved status.
- `aufgaben/_lib/zugang.ts`: anonymous rejection and confirmed JIT person creation; actions record explicit permission rejection separately from impossible lifecycle transitions.
- `zeichen/actions.ts`: explicit missing-identity rejection.
- `feedback/f/[slugSecret]/page.tsx`: public automatic survey closure, anonymous context.
- `lagerbuch/_lib/schreibpfade/tokenEinloesung.ts`, `radio/_lib/schreibpfade/codeEinloesung.ts`: entire post-lookup mutation context.
- `files/_lib/av.ts`, `files/_lib/boot.ts`, `aufgaben/_lib/scan.ts`: system isolation at worker starts and cleanup tick.

Task 3 UI/browser reporting and the final repository-wide build/Playwright gate are parent-owned. No merge or deployment.

## Final verification evidence

- `rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH node node_modules/typescript/bin/tsc --noEmit --pretty false`: exit **0**, including the final added tests. Evidence: `task-2-evidence/typecheck.log` (empty successful output).
- Scoped `node node_modules/eslint/bin/eslint.js` for all modified TS/TSX plus new audit/helper files: exit **0**, **0 errors**, one pre-existing unused `_issi` warning in Radio admin actions. Evidence: `task-2-evidence/eslint.log`.
- `rtk proxy git -c core.fsmonitor=false diff --check`: exit **0**.
- The overlapping selected run ended with 84 passing files and one collision-affected file; exact output retained as `task-2-evidence/overlapped-selected.log`. Its two failures were SQLite migration/UNIQUE collisions against the fixture used by the concurrent rerun.
- After both ended, `rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/vitest/vitest.mjs run src/core/audit/integration.test.ts 'src/app/m/files/api/download/[id]/route.test.ts' --maxWorkers=2`: exit **0**, **2 files / 43 tests**, including all **39** download tests. Evidence: `task-2-evidence/delivery-isolated-43.log`.

The full exact selected-suite command is:

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/vitest/vitest.mjs run src/app/m/aufgaben/_lib/lebenszyklus.test.ts src/app/m/aufgaben/_lib/scan.test.ts src/app/m/aufgaben/_lib/zugang.test.ts 'src/app/m/aufgaben/a/[id]/nachweis/[nachweisId]/route.test.ts' 'src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.test.ts' src/app/m/aufgaben/actions.test.ts 'src/app/m/feedback/(admin)/groups/[groupId]/evenings/[eveningId]/export.csv/route.test.ts' 'src/app/m/feedback/(admin)/groups/[groupId]/export.csv/route.test.ts' src/app/m/feedback/_lib/access.test.ts src/app/m/feedback/actions.test.ts 'src/app/m/feedback/f/[slugSecret]/page.test.tsx' 'src/app/m/files/(verwaltung)/actions.test.ts' 'src/app/m/files/(verwaltung)/posteingang/actions.test.ts' 'src/app/m/files/(verwaltung)/zugangslinks/actions.test.ts' src/app/m/files/_lib/access.test.ts src/app/m/files/_lib/av.test.ts src/app/m/files/_lib/boot.test.ts 'src/app/m/files/api/download/[id]/route.test.ts' 'src/app/m/files/api/download/[id]/zip/route.test.ts' 'src/app/m/files/api/inbox/[id]/route.test.ts' src/app/m/files/api/inbox/zip/route.test.ts 'src/app/m/files/api/s/[id]/verify/route.test.ts' 'src/app/m/files/api/u/[token]/upload/route.test.ts' 'src/app/m/files/api/upload/[fileId]/route.test.ts' src/app/m/lagerbuch/_actions/artikel.test.ts src/app/m/lagerbuch/_actions/aussondern.test.ts src/app/m/lagerbuch/_actions/bestellung.test.ts src/app/m/lagerbuch/_actions/buchung.test.ts src/app/m/lagerbuch/_actions/bz.test.ts src/app/m/lagerbuch/_actions/check.test.ts src/app/m/lagerbuch/_actions/csv.test.ts src/app/m/lagerbuch/_actions/fahrzeuge.test.ts src/app/m/lagerbuch/_actions/gate.test.ts src/app/m/lagerbuch/_actions/geraete.test.ts src/app/m/lagerbuch/_actions/guards.test.ts src/app/m/lagerbuch/_actions/inventur.test.ts src/app/m/lagerbuch/_actions/lagerortVerfall.test.ts src/app/m/lagerbuch/_actions/loeschen.test.ts src/app/m/lagerbuch/_actions/sauerstoff.test.ts src/app/m/lagerbuch/_actions/sitzung.test.ts src/app/m/lagerbuch/_actions/templates.test.ts src/app/m/lagerbuch/_actions/tokens.test.ts src/app/m/lagerbuch/_lib/helferZugang.test.ts src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts src/app/m/lagerbuch/_lib/zugang.test.ts 'src/app/m/lagerbuch/t/[code]/route.test.ts' src/app/m/portal/actions.test.ts src/app/m/portal/profil/actions.test.ts src/app/m/qr/actions.test.ts src/app/m/radio/_actions/ausleihe.test.ts src/app/m/radio/_actions/guards.test.ts src/app/m/radio/_lib/ausleihZugang.test.ts src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts src/app/m/radio/_lib/zugang.test.ts 'src/app/m/radio/admin/(arbeit)/geraete/export/route.test.ts' src/app/m/radio/admin/actions.test.ts src/app/m/uav/_actions/katalog.test.ts src/app/m/uav/_actions/teilnehmer.test.ts 'src/app/m/uav/api/admin/participants/[id]/export/route.test.ts' 'src/app/m/uav/api/admin/participants/[id]/route.test.ts' src/app/m/uav/api/admin/participants/export/route.test.ts src/app/m/uav/api/admin/participants/route.test.ts 'src/app/m/uav/api/admin/tasks/[id]/route.test.ts' src/app/m/uav/api/admin/tasks/reorder/route.test.ts src/app/m/uav/api/admin/tasks/route.test.ts src/app/m/uav/api/anmeldung/route.test.ts src/app/m/uav/api/sync/route.test.ts src/app/m/zeichen/actions.test.ts src/core/audit src/core/auth src/core/auth/config.test.ts src/proxy.test.ts --maxWorkers=2
```

Final clean rerun of the exact selected command above: **exit 0, 85 files / 1,927 tests**, 26.11 seconds. No overlapping runner. Evidence: `task-2-evidence/clean-selected-1927.log`. This closes the fixture-contention failures; no outstanding targeted test failure.
