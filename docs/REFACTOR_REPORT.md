# Refactor Report

## Baseline

- Date: 2026-08-05
- Project: SAPUI5 freestyle application `abap.to.fiori.system`
- UI5 version: 1.120.0 from `ui5.yaml`
- Available npm scripts: `start`, `build`, `test`
- Lint script: Not configured
- OPA/integration script: Not configured

## Baseline Results

- `npm.cmd test`: Passed, 18/18 tests
- `npm.cmd run build`: Passed
- Build warning: UI5 CLI update check could not write to `C:\Users\ADMIN\.config`; not an application build error

## Current Architecture

- `Component.js` initializes router and domain services: `AnalysisService`, `DocumentService`, `MailService`.
- `manifest.json` owns OData V4 service roots:
  - default analysis model: `mainService`
  - named mail model: `mailService`
- Controllers own UI events, navigation, dialog lifecycle and view state.
- Services own OData list/context/action calls.
- `models.js` creates UI-only JSONModels for dashboard, analysis detail and mail UI state.
- `mailConstants.js` centralizes Mail entity sets, navigation names, action names and business codes.
- `mailFormatter.js` centralizes pure Mail display formatters.
- `ODataErrorHandler.js` centralizes OData error parsing and backend message extraction.

## Dependency Map

- Routes and targets:
  - `dashboard` -> `Dashboard.view.xml` / `Dashboard.controller.js`
  - `analysisDetail`, `detail` -> `AnalysisDetail.view.xml` / `AnalysisDetail.controller.js`
  - `mailJobs`, `mailJobsSlash` -> `MailJobs.view.xml` / `MailJobs.controller.js`
  - `mailJobDetail`, `mailJobDetailSlash` -> `MailJobDetail.view.xml` / `MailJobDetail.controller.js`
- Fragments:
  - `RunAnalysisDialog.fragment.xml` loaded by `Dashboard.controller.js`
  - `ExportReportDialog.fragment.xml`, `RecommendationDetail.fragment.xml`, `MailJobWizard.fragment.xml` loaded by `AnalysisDetail.controller.js`
  - `RecipientDialog.fragment.xml` loaded by `MailJobs.controller.js` and `MailJobDetail.controller.js`
- Models:
  - default OData model for analysis data
  - `mail` OData model for Mail Jobs, Recipients and Execution Logs
  - JSON models: `dashboard`, `detail`, `mailUi`, `device`
- Mail OData dependencies:
  - `/MailJobs`
  - `/MailJobs(<JobId>)/_Recipients`
  - `/ExecutionLogs`
  - bound action `com.sap.gateway.srvd.zui_mig_mail.v0001.sendNow(...)`

## Findings

### High

- `MailJobs.controller._onRouteMatched` refreshes the list binding immediately after route match. The table already has an initial OData V4 list binding, so this can invalidate the in-flight cache and produce an empty UI even when the backend returns `200 OK`.

### Medium

- Mail list reads still used the model default `$auto` group, producing `$batch` requests although the backend and Postman verification use a simple direct GET.
- Recipient count is intentionally loaded separately because backend does not support `$count` in `$expand`; this needs to run after the table has actually rendered contexts, not before the initial list settles.

### Low

- Mail controllers still contain helper methods from earlier recipient/status logic that are no longer referenced by XML or JavaScript.

## Refactor Plan

- Phase A: remove verified dead helper methods only.
- Phase B: normalize Mail read requests to `$direct` and avoid route-time duplicate refresh.
- Phase C: keep internal Status PATCH behavior in `MailService` and controllers because backend requires it, but keep Mail Job status hidden from UI.
- Phase D: update recipient count loading to follow table `updateFinished`.
- Phase E: run unit tests and UI5 build.

## Files Planned For Change

- `webapp/manifest.json`
- `webapp/view/MailJobs.view.xml`
- `webapp/controller/MailJobs.controller.js`
- `webapp/controller/MailJobDetail.controller.js`
- `webapp/service/MailService.js`
- `docs/REFACTOR_REPORT.md`

## Files Planned For Removal

- None.

## Phase A-B Changes

- `MailJobs.controller._onRouteMatched` no longer refreshes the list on every route match. The XML table binding now owns the initial load.
- `MailJobs.view.xml` listens to `updateFinished` so recipient counts are loaded only after visible job contexts exist.
- Mail OData model and MailService list bindings use `$direct` for Mail reads/actions where supported, matching the backend calls validated in Postman more closely.
- Removed verified dead helper methods:
  - `MailJobs.controller._jobHasRecipients`
  - `MailJobs.controller._handlePossible412`
  - `MailJobDetail.controller._jobHasRecipients`

## Removal Evidence

| Object | Reason | Search evidence | Replacement | Verification |
| --- | --- | --- | --- | --- |
| `MailJobs.controller._jobHasRecipients` | Old recipient gating logic after Send Now became always visible and backend validates recipient existence | `rg "_jobHasRecipients"` only found definitions before removal | `mailFormatter.canSendNow` and backend error handling | `npm.cmd test` and `npm.cmd run build` passed |
| `MailJobs.controller._handlePossible412` | No remaining caller in `MailJobs.controller.js` or XML handlers | `rg "_handlePossible412"` showed only definition in MailJobs and active usage in MailJobDetail before removal | `ODataErrorHandler` via `_showMailError` | `npm.cmd test` and `npm.cmd run build` passed |
| `MailJobDetail.controller._jobHasRecipients` | Old recipient gating logic no longer used | `rg "_jobHasRecipients"` only found definitions before removal | Backend validation on PATCH `Status=A` before `sendNow` | `npm.cmd test` and `npm.cmd run build` passed |

## Verification After Phase A-B

- `npm.cmd test`: Passed, 18/18 tests
- `npm.cmd run build`: Passed
- UI5 serve smoke check: `http://localhost:8081/index.html` returned `200`
  - Note: the temporary serve command returned exit code 1 during process cleanup, but the HTTP app shell check succeeded before shutdown.
- `rg '_jobHasRecipients|_handlePossible412|requestFailed|\\$select: .AnalysisId,CreatedAt,CreatedBy' webapp test`:
  - `_jobHasRecipients`: no remaining references
  - `requestFailed`: no unsupported OData V4 event usage
  - legacy MailJobs `$select` pattern: no remaining references
  - `_handlePossible412`: remains only in `MailJobDetail.controller.js`, where it is actively used by edit recipient error handling

## Behavior Preserved

- Mail Job creation still creates inactive by default and activates only after recipients exist.
- Add Recipient still posts only `RecipientType` and `SapUser`; `EmailAddress` remains read-only/computed.
- Send Now still patches `Status=A` before invoking the bound action, allowing backend validation to return the real error message when recipients are missing.
- Mail Job status remains hidden from the UI; execution log status remains visible because it describes send execution, not job management state.

## Remaining Risks

- Manual browser smoke test against the live SAP backend was not executed in this phase.
- SAPUI5 list binding may still add paging query options such as `$skip` and `$top`; this is standard OData V4 list behavior. The removed risky parts are forced `$select`, `$expand`, `$orderby`, `$count` and duplicate route-time refresh.

## Needs Review

- No CSS/i18n files are removed in this phase because SAPUI5 XML and dynamic fragment references require broader verification.
- Manual browser smoke test still requires a running backend session and credentials.
