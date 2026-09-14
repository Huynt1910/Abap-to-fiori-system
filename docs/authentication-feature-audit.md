# Authentication and feature audit

Audit date: 2026-09-13. This report separates what is present in this repository from what still requires SAP BTP or ABAP system evidence.

## Evidence and scope

- The production entry point is the standalone AppRouter module in `mta.yaml`; both `approuter/xs-app.json` and the packaged application `xs-app.json` protect application and `/sap/*` routes with XSUAA.
- An embedded ABAP Fiori Launchpad deployment is now configured as an alternative target in `ui5-deploy-abap.yaml`. In that mode, SAP owns login/session/logout, the UI5 application calls OData through the same ABAP origin, and Launchpad catalog/PFCG assignments replace XSUAA UI scopes.
- Local development uses UI5 CLI and `ui5-middleware-simpleproxy` 3.7.1. Credentials are read server-side from an ignored `.env`; they are never requested by the browser.
- `webapp/manifest.json` defines three `sap.ui.model.odata.v4.ODataModel` instances. The service roots are same-origin `/sap/.../0001/?sap-client=324` URLs.
- Analysis metadata was inspected from `D:\$metadata.xml`. It contains 21 entity sets and the six actions listed below. It has no `Login`, `Authenticate`, `CurrentUser`, `UserInfo`, or token-issuing operation.
- Mail and comparison metadata were inspected from their real development service metadata on 2026-09-13. Those metadata files are not stored in this repository.
- No ABAP, CDS, RAP behavior, service definition, DPC, or authorization implementation is present in the repository. Backend existence below means that metadata exposes the contract; it does not prove its implementation or audit semantics.
- No frontend mutation payload sets `CreatedBy` or `LastChangedBy`. `test/AuthenticationConfig.test.js` enforces this rule for frontend service modules.

## Feature matrix

| Nhóm | Chức năng | Metadata có | Backend có | Frontend có | Đã nối end-to-end | Bằng chứng | Trạng thái |
| ---- | --------- | ----------: | ---------: | ----------: | ----------------: | ---------- | ---------- |
| Authentication | Login entry/flow | Not applicable | BTP AppRouter or ABAP FLP | Yes | Runtime pending | AppRouter redirects to XSUAA in BTP; embedded FLP uses the standard SAP logon/session and exposes no password form | Partial |
| Authentication | Logout | Not applicable | AppRouter or FLP shell | Yes | Unit-tested | BTP uses `/do/logout`; embedded FLP delegates to `sap.ushell.Container.logout()` | Partial |
| Authentication | Session restore after reload | Not applicable | AppRouter or SAP session | Yes | Unit-tested | BTP reads `/user-api/currentUser`; FLP reads the authenticated shell user and OData uses the browser's same-origin SAP session | Partial |
| Authentication | Route protection | Not applicable | AppRouter/XSUAA or FLP/PFCG | Yes | Configuration pending in FLP | BTP routes require XSUAA; embedded FLP needs catalog/page/space and OData authorizations assigned through PFCG | Partial |
| Authentication | Current BTP user | Not applicable | AppRouter user API | Yes | Configured | `AuthenticationService`; `/user-api/currentUser` route | Complete |
| Authentication | Current SAP execution user | No | No source/contract | FLP shell user shown; no fabricated audit value | No | Shell identity is available for display, but no `CurrentUser`/`UserInfo` OData operation proves the backend execution identity | Blocked |
| Authentication | Role/scope authorization | Not applicable | XSUAA scopes configured; SAP checks unknown | Yes, UI gating | Partial | `xs-security.json`; `auth` model gates Analysis, Comparison, Export and Mail commands. UI gating is not a security boundary | Partial |
| Authentication | Token expiry | Not applicable | AppRouter | Yes | Unit-tested only | One 401 redirect with a redirect guard; no retry loop | Partial |
| Authentication | 401/403 handling | Not applicable | Unknown | Yes | Unit-tested only | Central `BaseController.showError`; 401 redirects, 403 remains an authorization error | Partial |
| Authentication | Principal propagation | Not applicable | External configuration missing | No browser code required | No | Connectivity service is bound, but Destination `S40`, Cloud Connector mapping, IdP trust and SICF effective logon data are external | Blocked |
| Authentication | CSRF lifecycle | OData V4 | SAP service | SAPUI5 V4 model | Failed against current SAP config | UI5 owns token handling; proxy preservation test passes; real token fetch previously returned `/IWBEP/CM_V4H_RUN/075` | Blocked |
| Analysis | List | `Analyses` | Exposed | Yes | Read observed | GET through `AnalysisService.readAnalyses`; dashboard JSON model; tests in `AnalysisService.test.js` | Complete |
| Analysis | Filter/search | `Analyses` supports filtering | Exposed | Yes | Read observed | Server-side `Contains(ProgramName)` and `Status eq`; Dashboard controller/service | Complete |
| Analysis | Analyze | `Analyze` | Exposed; implementation unavailable | Yes | Identity not verified | POST bound collection action through `AnalysisService.analyzeProgram`; `AnalysisExecute` UI scope | Partial |
| Analysis | Generate AI assessment | `GenerateAIAssessment` | Exposed; implementation unavailable | Yes | Not runtime-tested | POST bound action in `ModernizationService.assess`; operation-control enablement | Partial |
| Analysis | Prepare Fiori UI | `PrepareFioriUi` | Exposed; implementation unavailable | Yes | Not runtime-tested | POST bound action with `TargetPackage` and `ServiceRootUrl`; `Modernization` page | Partial |
| Analysis | Generate technical document | `GenerateTechnicalDocument` | Exposed; implementation unavailable | Yes | Not runtime-tested | POST bound action, poll `ExportJobs`, authenticated same-origin download | Partial |
| Analysis | Delete | Dynamic `__EntityControl/Deletable` | Exposed; implementation unavailable | Yes | Not runtime-tested | DELETE through OData context only when backend control permits | Partial |
| Analysis | CreatedBy/CreatedAt | Properties exist; not `Core.Computed` | Source unavailable | Read/display only | No audit proof | Frontend never sends them; metadata alone cannot prove RAP-managed semantics | Blocked |
| Analysis | LastChangedBy | Property exists; not `Core.Computed` | Source unavailable | Read/display only | No audit proof | RAP behavior/determination and two-user test are unavailable | Blocked |
| Mail | Distribution list | `MailJobs` | Exposed | Yes | Metadata verified; runtime not repeated | GET OData V4 model `mail`; `MailJobs` view/controller | Partial |
| Mail | Create job and recipients | `MailJobs`, `_Recipients` | Exposed; implementation unavailable | Yes | Identity not verified | POST via `MailService.createMailJobWithRecipients`; no audit fields in payload | Partial |
| Mail | Update/delete | Dynamic entity controls | Exposed; implementation unavailable | Yes | Not runtime-tested | PATCH/DELETE through OData contexts in `MailService` | Partial |
| Mail | Send now | Bound `sendNow` | Exposed; implementation unavailable | Yes | Not runtime-tested | POST action in `MailService.sendNow`; controllers prevent duplicate UI submission | Partial |
| Mail | CreatedBy | Computed for MailJobs/Recipients; log semantics unverified | Source unavailable | Read/display only | No two-user proof | Real metadata plus frontend payload audit | Blocked |
| Mail | Authorization | Metadata operation controls; ABAP checks unknown | Source unavailable | `MailSend` UI gating | No | XSUAA scope does not replace SAP business authorization | Blocked |
| Chat | Sessions list/create/update/delete | `ChatSessions`; dynamic controls | Exposed; implementation unavailable | Yes | Not runtime-tested | GET/POST/PATCH/DELETE in `ModernizationService`; main OData model | Partial |
| Chat | Messages | `ChatMessages`, read-only | Exposed | Yes | Not runtime-tested | GET list filtered by `SessionId`; message creation is only through `ask` | Partial |
| Chat | Ask | Bound `ask` | Exposed; implementation unavailable | Yes | Not runtime-tested | POST bound action with `Question`; operation-control enablement | Partial |
| Chat | Audit fields | Computed on sessions/messages | Source unavailable | Read only | No two-user proof | `Core.Computed` annotations; no frontend audit identity payload | Blocked |
| Export | Jobs/result | `ExportJobs`, `ExportResult` | Exposed | Yes | Downloads unit-tested | GET job/poll and same-origin content download in `DocumentService`/`ModernizationService` | Partial |
| Export | Prepare selected export | `PrepareSelectedExport` | Exposed; implementation unavailable | Yes | Service unit-tested | POST bound action in `DocumentService`; Analysis Detail export dialog | Partial |
| Export | Audit fields | `ExportJobs.CreatedBy/CreatedAt` computed | Source unavailable | Read only | No two-user proof | Metadata annotations; no frontend audit identity payload | Blocked |
| Comparison | Execute/history/detail | `ComparisonRuns`, `ComparisonItems`, `ExecuteComparison` | Exposed; implementation unavailable | Yes | Service unit-tested | OData V4 model `comparison`; `ComparisonService` and controllers | Partial |

## OData contract details

| Operation | Expected HTTP/model | Caller | Required application scope | Audit owner |
| --- | --- | --- | --- | --- |
| `Analyses` list/filter | GET, main V4 model | `Dashboard.controller` → `AnalysisService` | `AnalysisRead` | Read only |
| `Analyze` | POST bound collection action, main V4 model | `Dashboard.controller` → `AnalysisService` | `AnalysisExecute` | SAP backend must use authenticated SAP context |
| `GenerateAIAssessment` | POST bound action | `Modernization.controller` → `ModernizationService` | `AnalysisExecute` | SAP backend |
| `PrepareFioriUi` | POST bound action | `Modernization.controller` → `ModernizationService` | `AnalysisExecute` | SAP backend |
| `GenerateTechnicalDocument` | POST bound action | `Modernization.controller` → `ModernizationService` | `Export` | SAP backend |
| `PrepareSelectedExport` | POST bound action | `AnalysisDetail.controller` → `DocumentService` | `Export` | SAP backend |
| `ChatSessions` | GET/POST/PATCH/DELETE, main V4 model | `Modernization.controller` → `ModernizationService` | `AnalysisRead` for GET; `AnalysisExecute` for mutations | Computed by SAP according to metadata; implementation still must be verified |
| `ask` | POST bound action | `Modernization.controller` → `ModernizationService` | `AnalysisExecute` | SAP backend creates messages |
| `MailJobs`/Recipients | GET/POST/PATCH/DELETE, mail V4 model | Mail controllers → `MailService` | `MailSend` for mutations | SAP backend; frontend sends no audit identity |
| `sendNow` | POST bound action, mail V4 model | Mail controllers → `MailService` | `MailSend` | SAP backend |
| `ExecuteComparison` | POST action, comparison V4 model | Analysis detail → `ComparisonService` | `ComparisonExecute` | SAP backend |

## Security conclusions

The prior fixed SICF service user explains why SAP audit fields can show `ZAISO_BOT_US`: SAP derives execution identity from the authenticated ABAP session, and a fixed service account collapses every caller to the same SAP identity. XSUAA alone cannot change `sy-uname`. This remains a configuration finding until the effective inherited SICF logon data and Destination authentication are inspected.

Production acceptance is blocked until all of the following are proven:

1. `S40` uses Principal Propagation and Cloud Connector maps two BTP identities to distinct SAP users.
2. The effective `/sap/opu/odata4` SICF logon configuration does not replace propagated users with a fixed service user.
3. ABAP/RAP behavior controls `Analyses.CreatedBy`, `CreatedAt`, `LastChangedBy`, and related action-created records from `sy-uname` or managed audit fields and ignores or rejects client audit values.
4. A read-only SAP current-user endpoint returns the actual ABAP execution user and client.
5. Integration tests with `DEV-030` and `DEV-130` prove distinct audit values, including a forged `CreatedBy=ADMIN` negative test.
6. An authenticated CSRF token fetch returns 2xx plus a real token, and a subsequent `$batch` uses that token and the same SAP session.

## Test inventory and remaining tests

- Existing unit coverage: analysis paths/actions, comparison, mail payloads/actions, exports/downloads, table configuration and personalization.
- Added coverage: `AuthenticationService.test.js`, `AuthenticationConfig.test.js`, `LaunchpadConfig.test.js`, `ModernizationService.test.js`, and `ODataProxy.test.js`.
- Blocked integration coverage: IdP redirect, AppRouter logout/session restoration, Destination principal propagation, SAP business authorization, two-user audit behavior, live CSRF and `$batch` lifecycle, and action results. These require deployed BTP services and ABAP access.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | Passed: 77/77 tests |
| `npm run build` | Passed with SAPUI5 1.108.33 |
| `ui5-deploy-abap.yaml` dry build | Passed with `deploy-to-abap` excluded; no SAP connection or deployment performed |
| Lint | Not applicable: no lint script is defined in `package.json` |
| `git check-ignore .env` | Passed: `.gitignore` ignores `.env` |
| `.env` tracked | No |
| `npm audit --omit=dev` | Passed: 0 production dependency vulnerabilities in the root package |
| Full root `npm audit` | Found 18 transitive development-tool findings (7 moderate, 10 high, 1 critical), primarily below `@ui5/cli`; no forced/breaking dependency change was applied |
| AppRouter dependency audit | Blocked: `approuter/package-lock.json` is absent |
| MTA deployment/integration | Blocked: external Destination, Connectivity, Cloud Connector, IdP and SAP backend configuration are unavailable |
