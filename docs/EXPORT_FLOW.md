# Export Flow

## Metadata Baseline

Source checked: `C:\Users\ADMIN\Downloads\$metadata (7).xml`

The analysis OData V4 service exposes these export contracts:

| Contract | Type | Purpose |
| --- | --- | --- |
| `AnalysesType/__OperationControl/PrepareSelectedExport` | `Edm.Boolean` | Controls whether the Export button is enabled for an analysis. |
| `PrepareSelectedExport` | Bound action on `AnalysesType` | Creates or prepares an export file for selected fields. |
| `ZA_MIG_PREPARE_EXPORT_RESULT` | Complex return type | Returns `DownloadUrl`, optional `ExportId`, `FileName`, `MimeType`, and `Status`. |
| `ExportJobs` | Entity set | Stores prepared async export jobs and stream content. |
| `ExportResult` | Entity set | Legacy/direct stream export by `ReportType`, `FileFormat`, and `ExportSection`. |

## Bound Action

Frontend action path:

```text
/Analyses(<AnalysisId>)/com.sap.gateway.srvd.zui_mig_analysis.v0001.PrepareSelectedExport(...)
```

Parameters:

| Parameter | Type | Constraint |
| --- | --- | --- |
| `FileFormat` | `Edm.String` | Max length `1`; supported values are `X`, `P`, `C`. |
| `ExportSection` | `Edm.String` | Max length `20`. |
| `SelectedFields` | `Edm.String` | Comma-separated export field keys. |

Return fields:

| Field | Type | Usage |
| --- | --- | --- |
| `DownloadUrl` | `Edm.String` | Preferred direct download URL. Can be absolute, `/sap/...`, `/ExportJobs(...)/Content`, or `ExportJobs(...)/Content`. |
| `ExportId` | `Edm.Guid` | Fallback async job id when no direct `DownloadUrl` is available. |
| `FileName` | `Edm.String` | Browser download filename. |
| `MimeType` | `Edm.String` | Browser download MIME type. |
| `Status` | `Edm.String` | Backend export status. |

## Frontend Flow

1. `AnalysisDetail.view.xml` enables the Export button only when:

```text
detail>/overview/__OperationControl/PrepareSelectedExport === true
```

2. `AnalysisDetail.controller.onOpenExportDialog` builds the selectable field list from the active detail section and the current table personalization state.

3. `AnalysisDetail.controller.onDownloadExport` calls:

```text
DocumentService.downloadSelectedExport(analysisId, { fileFormat, exportSection, selectedFields })
```

4. `DocumentService.prepareSelectedExport` executes the OData V4 bound action with `$direct`.

5. `DocumentService.downloadSelectedExport` downloads in this order:

| Backend result | Frontend behavior |
| --- | --- |
| `DownloadUrl` exists | Normalize the URL and fetch the stream directly. |
| `ExportId` exists | Poll `/ExportJobs(<ExportId>)`, then fetch `/ExportJobs(<ExportId>)/Content`. |
| Neither exists | Show export error. |

## URL Normalization

The backend may return different URL shapes. The frontend must normalize service-relative URLs to the analysis service root before calling `fetch`.

Examples:

| Backend `DownloadUrl` | Actual fetch URL |
| --- | --- |
| `ExportJobs(<guid>)/Content` | `/sap/opu/odata4/sap/zui_mig_analysis_o4/srvd/sap/zui_mig_analysis/0001/ExportJobs(<guid>)/Content?sap-client=324` |
| `/ExportJobs(<guid>)/Content` | `/sap/opu/odata4/sap/zui_mig_analysis_o4/srvd/sap/zui_mig_analysis/0001/ExportJobs(<guid>)/Content?sap-client=324` |
| `/sap/opu/odata4/.../ExportJobs(<guid>)/Content` | Used as-is. |
| `https://...` | Used as-is. |

This avoids `404` caused by the browser resolving `/ExportJobs(...)/Content` against the UI application host instead of the OData service root.

## Supported File Formats

| Code | Format | MIME fallback |
| --- | --- | --- |
| `X` | Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `P` | PDF | `application/pdf` |
| `C` | CSV | `text/csv;charset=utf-8` |

## Supported Export Sections

| Code | Meaning |
| --- | --- |
| `ALL` | All content |
| `OVERVIEW` | Overview |
| `UI_FILTER` | UI Filters |
| `DB_OBJ` | Database Objects |
| `BUS_LOGIC` | Business Logic |
| `ALV_OUTPUT` | ALV Outputs |
| `SRC_EVIDEN` | Source Evidences |
| `RECOMMEN` | Recommendations |
| `MESSAGE` | Analysis Messages |

## Implementation Files

| File | Responsibility |
| --- | --- |
| `webapp/view/AnalysisDetail.view.xml` | Export button and operation-control binding. |
| `webapp/view/fragments/ExportReportDialog.fragment.xml` | Export dialog UI. |
| `webapp/controller/AnalysisDetail.controller.js` | Dialog state, selected fields, action trigger. |
| `webapp/service/DocumentService.js` | Action execution, URL normalization, polling, stream download. |
| `webapp/model/AnalysisTableConfig.js` | Exportable field registry by section. |
| `webapp/util/TablePersonalizationService.js` | Uses visible personalized columns as export fields. |
| `webapp/util/Constants.js` | Entity sets, action names, file formats, export sections. |
| `test/DocumentService.test.js` | Export URL, action, polling, download behavior tests. |

## Troubleshooting 404

Check the failed URL in browser DevTools:

| Failed URL pattern | Likely cause | Expected fix |
| --- | --- | --- |
| `/ExportJobs(...)/Content` | URL was resolved against app root. | Use `DocumentService._normalizeDownloadUrl`. |
| `/index.html/ExportJobs(...)/Content` | Relative URL resolved from shell/hash route. | Use service-root normalization. |
| `/sap/opu/odata4/.../ExportJobs(...)/Content` returns 404 | Backend export job/content not found or expired. | Check `ExportId`, `Status`, `ExpiresAt`, and backend logs. |
| Action returns 404 | Wrong namespace/action path or service root. | Verify `Constants.action.prepareSelectedExportSuffix` and `manifest.json` `mainService`. |

## Verification

Run:

```powershell
npm.cmd test
npx.cmd ui5 build --all
```

Current export-related tests cover:

- Direct `ExportResult(...)/Content` path construction.
- `PrepareSelectedExport` bound action parameters.
- `DownloadUrl` direct download.
- Service-relative `DownloadUrl` normalization.
- Fallback `ExportJobs(<ExportId>)/Content` download.
