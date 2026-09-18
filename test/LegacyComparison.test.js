const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
function load(file, dependencies = {}) {
  let result;
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), {
    sap: { ui: { define(names, factory) { result = factory(...names.map((name) => dependencies[name])); } } },
    Promise, URL, Set, Map, setTimeout, clearTimeout
  }, { filename: file });
  return result;
}
const comparison = load("webapp/util/LegacyComparison.js");
const constants = load("webapp/util/Constants.js");
const reportConfig = load("webapp/util/FioriUiReportConfig.js");

const columns = { ID: "ProductID", NAME: "ProductName", AMOUNT: "Amount", DATE: "PostingDate" };
const types = { ProductID: "Edm.String", ProductName: "Edm.String", Amount: "Edm.Decimal", PostingDate: "Edm.Date" };
const alv = [{ ID: "A", NAME: "Widget", AMOUNT: "12.50", DATE: "2026-09-18" }];
const odata = [{ ProductID: "A", ProductName: "Widget", Amount: "12.5", PostingDate: "2026-09-18" }];

test("matching mapped rows pass with exact decimal normalization", () => {
  const result = comparison.compare(alv, odata, columns, ["ID"], types);
  assert.equal(result.status, "PASS");
  assert.equal(result.alvCount, 1);
  assert.equal(result.odataCount, 1);
  assert.equal(result.differences.length, 0);
});

test("automatic metadata keys enable cell comparison, and full-row fallback counts duplicates", () => {
  assert.deepEqual(Array.from(comparison.metadataKeys(columns, ["ProductID"])), ["ID"]);
  assert.deepEqual(Array.from(comparison.metadataKeys(columns, ["Unknown"])), []);
  const duplicated = [alv[0], { ...alv[0] }];
  assert.equal(comparison.compare(duplicated, [odata[0], { ...odata[0] }], columns, [], types).status, "PASS");
  const missing = comparison.compare(duplicated, odata, columns, [], types);
  assert.equal(missing.status, "FAIL");
  assert.deepEqual(Array.from(missing.differences, (row) => row.kind), ["MISSING"]);
  const changed = comparison.compare(alv, [{ ...odata[0], ProductName: "Changed" }], columns, [], types);
  assert.deepEqual(Array.from(changed.differences, (row) => row.kind), ["MISSING", "EXTRA"]);
});

test("a changed cell fails and reports key, mapped column and both values", () => {
  const result = comparison.compare(alv, [{ ...odata[0], ProductName: "widget" }], columns, ["ID"], types);
  assert.equal(result.status, "FAIL");
  assert.equal(result.differences.length, 1);
  assert.deepEqual([result.differences[0].kind, result.differences[0].key,
    result.differences[0].column, result.differences[0].alv, result.differences[0].odata],
  ["VALUE", "ID=A", "NAME → ProductName", "Widget", "widget"]);
});

test("missing and extra rows fail without comparing their cells", () => {
  const result = comparison.compare(alv, [
    { ...odata[0], ProductID: "B" }
  ], columns, ["ID"], types);
  assert.equal(result.status, "FAIL");
  assert.deepEqual(Array.from(result.differences, (row) => row.kind), ["MISSING", "EXTRA"]);
});

test("duplicate keys, missing columns and unsupported values cannot conclude", () => {
  assert.throws(() => comparison.compare([...alv, { ...alv[0] }], odata, columns, ["ID"], types), /duplicate business key/);
  assert.throws(() => comparison.compare(alv, [{ ...odata[0], Amount: undefined }], columns, ["ID"], types), /Missing value/);
  assert.throws(() => comparison.compare(alv, [{ ProductID: "A", ProductName: "Widget", Amount: "12.5" }], columns, ["ID"], types), /missing column PostingDate/);
  assert.throws(() => comparison.compare(alv, odata, { ...columns, NEW: "Missing" }, ["ID"], types), /missing from metadata/);
  assert.throws(() => comparison.compare(alv, odata, { ID: "ProductID", NAME: "ProductID" }, ["ID"], types), /same OData column/);
  assert.notEqual(comparison.canonical("12.51", "Edm.Decimal"), comparison.canonical("12.50", "Edm.Decimal"));
});

test("exact metadata names repair a stale mapping and cover every captured ALV column", () => {
  const rows = [{ BUKRS: "1000", BUTXT: "Company", WAERS: "VND" },
    { BUKRS: "9999", WAERS: "VND" }];
  const entityTypes = { BUKRS: "Edm.String", BUTXT: "Edm.String", WAERS: "Edm.String" };
  const mapped = comparison.completeColumns(rows, { BUKRS: "CompanyCode" }, entityTypes);
  assert.deepEqual(JSON.parse(JSON.stringify(mapped)),
    { BUKRS: "BUKRS", BUTXT: "BUTXT", WAERS: "WAERS" });
  assert.throws(() => comparison.compare(rows, rows, mapped, ["BUKRS"], entityTypes),
    /ALV row 2 is missing column BUTXT/);
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.completeColumns(alv, columns, types))), columns);
  assert.throws(() => comparison.completeColumns([{ BUKRS: "1000", UNKNOWN: "x" }], {}, entityTypes),
    /ALV column UNKNOWN has no matching OData property.*Entity properties: BUKRS, BUTXT, WAERS/);
});

test("unique case and separator differences map captured columns to metadata properties", () => {
  const mapped = comparison.completeColumns([{ TYPE_CODE: "A", ITEM_ID: "1" }],
    { STALE: "Unused" }, { TypeCode: "Edm.String", ItemId: "Edm.String" });
  assert.deepEqual(JSON.parse(JSON.stringify(mapped)), { TYPE_CODE: "TypeCode", ITEM_ID: "ItemId" });
  assert.equal(comparison.compare([{ TYPE_CODE: "A", ITEM_ID: "1" }],
    [{ TypeCode: "A", ItemId: "1" }], mapped, ["ITEM_ID"],
    { TypeCode: "Edm.String", ItemId: "Edm.String" }).status, "PASS");
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.completeColumns([{ CODE: "A" }],
    { CODE: "Type_Code" }, { TypeCode: "Edm.String" }))), { CODE: "TypeCode" });
  assert.throws(() => comparison.completeColumns([{ TYPE_CODE: "A" }], {},
    { TypeCode: "Edm.String", TYPECODE: "Edm.String" }),
  /matches multiple OData properties: TypeCode, TYPECODE/);
  assert.throws(() => comparison.completeColumns([{ TYPE_CODE: "A" }], {},
    { Category: "Edm.String" }),
  /ALV column TYPE_CODE has no matching OData property.*Entity properties: Category/);
});

test("all unmatched ALV columns are reported in one comparison attempt", () => {
  const rows = [{ PRODUCT_ID: "1", TYPE_CODE: "A", DESCRIPTION: "Item", SUPPLIER_ID: "S1",
    STATUS: "Active" }];
  assert.throws(() => comparison.completeColumns(rows,
    { TYPE_CODE: "CATEGORY", DESCRIPTION: "NAME" },
    { PRODUCT_ID: "Edm.String", CATEGORY: "Edm.String", NAME: "Edm.String",
      SUPPLIER_NAME: "Edm.String" }),
  /ALV columns SUPPLIER_ID, STATUS have no matching OData properties.*Entity properties: PRODUCT_ID, CATEGORY, NAME, SUPPLIER_NAME/);
});

test("generated OData projection keeps exact matches and identifies omitted ALV columns", () => {
  const rows = [{ PRODUCT_ID: "HT-1000", TYPE_CODE: "PR", CATEGORY: "Notebooks",
    NAME: "Notebook Basic 15", DESCRIPTION: "Long description", SUPPLIER_ID: "0100000046",
    SUPPLIER_NAME: "SAP", CURRENCY_CODE: "EUR" }];
  const entityTypes = { PRODUCT_ID: "Edm.String", NAME: "Edm.String", CATEGORY: "Edm.String",
    SUPPLIER_NAME: "Edm.String", CURRENCY_CODE: "Edm.String" };
  const projection = comparison.projectedColumns(rows, {}, entityTypes);
  assert.deepEqual(JSON.parse(JSON.stringify(projection.columns)), {
    PRODUCT_ID: "PRODUCT_ID", CATEGORY: "CATEGORY", NAME: "NAME",
    SUPPLIER_NAME: "SUPPLIER_NAME", CURRENCY_CODE: "CURRENCY_CODE"
  });
  assert.deepEqual(Array.from(projection.omittedColumns), ["TYPE_CODE", "DESCRIPTION", "SUPPLIER_ID"]);
  assert.equal(projection.capturedColumnCount, 8);
  assert.deepEqual(Array.from(projection.unmatchedProperties), []);
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.schemaDifferences(projection))), []);
  const missingFromCapture = comparison.projectedColumns(rows, {},
    { ...entityTypes, SALES_ORG: "Edm.String" });
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.schemaDifferences(missingFromCapture))), [
    { kind: "ALV_COLUMN_MISSING", key: "", column: "SALES_ORG",
      alv: "column missing", odata: "property present" }
  ]);
  assert.throws(() => comparison.projectedColumns(rows,
    { TYPE_CODE: "CATEGORY" }, entityTypes),
  /TYPE_CODE and CATEGORY both map to OData property CATEGORY/);
});

test("mapping log records the applied filters, columns and business keys", () => {
  const mapped = { BUKRS: "BUKRS", BUTXT: "BUTXT", WAERS: "WAERS" };
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.mappingLog(mapped, ["BUKRS"], {}, {}))), [
    { kind: "NO_FILTER", source: "[]", target: "", isKey: false },
    { kind: "COLUMN", source: "BUKRS", target: "BUKRS", isKey: true },
    { kind: "COLUMN", source: "BUTXT", target: "BUTXT", isKey: false },
    { kind: "COLUMN", source: "WAERS", target: "WAERS", isKey: false }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(comparison.mappingLog(mapped, ["BUKRS"],
    { P_BUKRS: "BUKRS" }, { P_BUKRS: "1000" })))[0],
  { kind: "FILTER", source: "P_BUKRS", target: "BUKRS", isKey: false });
});

test("null, string, decimal and timezone values are handled deliberately", () => {
  assert.notEqual(comparison.canonical(null, "Edm.String"), comparison.canonical("", "Edm.String"));
  assert.notEqual(comparison.canonical("01", "Edm.String"), comparison.canonical("1", "Edm.String"));
  assert.notEqual(comparison.canonical("1.01", "Edm.Decimal"), comparison.canonical("1.00", "Edm.Decimal"));
  assert.equal(comparison.canonical("2026-09-18T07:00:00.100+07:00", "Edm.DateTimeOffset"),
    comparison.canonical("2026-09-18T00:00:00.1Z", "Edm.DateTimeOffset"));
  assert.throws(() => comparison.canonical(12.51, "Edm.Decimal"), /exact decimal string/);
});

test("capture is usable only when IDs, status, RowsJson and CountRow agree", () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "CAPTURED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  assert.equal(comparison.capture(response, "analysis", "request").count, 1);
  assert.throws(() => comparison.capture({ ...response, Status: "QUEUED" }, "analysis", "request"), /QUEUED/);
  assert.throws(() => comparison.capture({ ...response, CountRow: 2 }, "analysis", "request"), /CountRow/);
  assert.throws(() => comparison.capture(response, "other", "request"), /does not match/);
  assert.throws(() => comparison.capture({ ...response, RowsJson: "{}" }, "analysis", "request"), /array/);
});

test("SelectionJson [] means all rows and scalar EQ selections produce the same OData input", () => {
  assert.equal(Object.keys(comparison.filterValues(comparison.selections("[]"))).length, 0);
  const values = comparison.filterValues(comparison.selections(
    '[{"FieldName":"P_ID","Sign":"I","Option":"EQ","Low":"A"}]'));
  assert.equal(values.P_ID, "A");
  assert.throws(() => comparison.selections("all"), /valid JSON/);
  assert.throws(() => comparison.selections("{}"), /array/);
  assert.throws(() => comparison.filterValues(comparison.selections(
    '[{"FieldName":"P_ID","Sign":"E","Option":"EQ","Low":"A"}]')), /cannot map/);
  assert.throws(() => comparison.filterValues(comparison.selections(
    '[{"FieldName":"P_ID","Sign":"I","Option":"EQ","Low":"A","Dynamic":true}]')), /unknown filter semantics/);
});

function service(pages = []) {
  const calls = [];
  const actions = [];
  class ODataModel {
    getMetaModel() { return { requestObject(name) {
      return Promise.resolve(name === "/$EntityContainer/" ?
        { Products: { $kind: "EntitySet" } } :
        { $kind: "EntityType", $Key: ["ProductID"], ProductID: { $kind: "Property", $Type: "Edm.String" },
          Amount: { $kind: "Property", $Type: "Edm.Decimal" } });
    } }; }
    destroy() {}
  }
  const Service = load("webapp/service/LegacyComparisonService.js", {
    "sap/ui/model/odata/v4/ODataModel": ODataModel,
    "abap/to/fiori/system/util/Constants": constants,
    "abap/to/fiori/system/util/FioriUiReportConfig": reportConfig,
    "abap/to/fiori/system/util/LegacyComparison": comparison
  });
  const api = new Service({ bindContext(name) {
    const action = { name, params: {}, setParameter(key, value) { this.params[key] = value; },
      execute(group) { this.group = group; return Promise.resolve(); },
      getBoundContext() { return { requestObject: () => Promise.resolve({ RequestId: "request", Status: "QUEUED" }) }; } };
    actions.push(action);
    return action;
  } }, async (url) => {
    calls.push(url);
    const page = pages.shift();
    if (page instanceof Error) { throw page; }
    return { ok: true, json: async () => page };
  }, "https://example.test");
  return { api, calls, actions };
}

test("capture actions use the current AnalysisId, request ID and direct group", async () => {
  const { api, actions } = service();
  await api.captureLegacyRows("analysis", "request", "[]");
  await api.getLegacyCapture("analysis", "request");
  assert.match(actions[0].name, /Analyses\(analysis\).*CaptureLegacyRows/);
  assert.deepEqual(actions[0].params, { RequestId: "request", SelectionJson: "[]" });
  assert.equal(actions[0].group, "$direct");
  assert.deepEqual(actions[1].params, { RequestId: "request" });
});

test("all OData pages are read with the mapped filter and no 30-row limit", async () => {
  const { api, calls } = service([
    { value: Array.from({ length: 30 }, (_, i) => ({ ProductID: String(i) })),
      "@odata.nextLink": "/sap/report/Products?$skiptoken=second" },
    { value: [{ ProductID: "30" }] }
  ]);
  const progress = [];
  const rows = await api.readAllRows("/sap/report/", "Products", { P_ID: "A'B" },
    { P_ID: "ProductID" }, { ID: "ProductID", AMOUNT: "Amount" },
    { ProductID: "Edm.String", Amount: "Edm.Decimal" }, (page) => progress.push(page));
  assert.equal(rows.length, 31);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(progress)), [
    { page: 1, rows: 30, totalRows: 30, hasNext: true },
    { page: 2, rows: 1, totalRows: 31, hasNext: false }
  ]);
  const first = new URL(calls[0]);
  assert.equal(first.searchParams.get("$filter"), "ProductID eq 'A''B'");
  assert.equal(first.searchParams.get("$select"), "ProductID,Amount");
  assert.equal(first.searchParams.has("$top"), false);
});

test("all selection leaves OData unfiltered even when optional filter mappings are prefilled", async () => {
  const { api, calls } = service([{ value: [] }]);
  await api.readAllRows("/sap/report/", "Products", {}, { P_ID: "ProductID" },
    { ID: "ProductID" }, { ProductID: "Edm.String" });
  assert.equal(new URL(calls[0]).searchParams.has("$filter"), false);
});

test("invalid column mapping reports the exact missing OData property and available names", () => {
  const { api } = service();
  assert.throws(() => api.readAllRows("/sap/report/", "Products", {}, {},
    { ID: "ProductId" }, { ProductID: "Edm.String", Amount: "Edm.Decimal" }),
  /EntitySet 'Products' has no OData property: ProductId.*Available properties: ProductID, Amount/);
  assert.throws(() => api.readAllRows("/sap/report/", "Products", {}, {}, {},
    { ProductID: "Edm.String" }), /No ALV columns match OData properties/);
});

test("metadata types and SAP client stay tied to the selected generated service", async () => {
  const { api, calls } = service([
    { value: [], "@odata.count": "1", "@odata.nextLink": "/sap/report/Products?$skiptoken=last" },
    { value: [{ ProductID: "A" }] }
  ]);
  const metadata = await api.getEntityMetadata("/sap/report/?sap-client=324", "Products");
  const metadataTypes = metadata.types;
  assert.equal(metadataTypes.ProductID, "Edm.String");
  assert.deepEqual(Array.from(metadata.keys), ["ProductID"]);
  const rows = await api.readAllRows("/sap/report/?sap-client=324", "Products", {}, {},
    { ID: "ProductID" }, metadataTypes);
  assert.equal(rows.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get("sap-client"), "324");
  assert.equal(new URL(calls[1]).searchParams.get("sap-client"), "324");
});

test("absolute backend nextLink stays on the local proxy while reading all OData pages", async () => {
  const { api, calls } = service([
    { value: [{ ProductID: "A" }], "@odata.nextLink":
      "https://backend.example.test/sap/report/Products?$skiptoken=second" },
    { value: [{ ProductID: "B" }] }
  ]);
  const rows = await api.readAllRows("/sap/report/?sap-client=324", "Products", {}, {},
    { ID: "ProductID" }, { ProductID: "Edm.String" });
  assert.equal(rows.length, 2);
  assert.equal(new URL(calls[1]).origin, "https://example.test");
  assert.equal(new URL(calls[1]).searchParams.get("sap-client"), "324");
});

test("unmapped filters and incomplete or unsafe OData paging cannot conclude", async () => {
  const { api } = service([{ value: [{ ProductID: "A" }], "@odata.nextLink": "/sap/report/Products?$skiptoken=2" },
    new Error("second page failed")]);
  const args = ["/sap/report/", "Products", { P_ID: "A" }, { P_ID: "ProductID" },
    { ID: "ProductID" }, { ProductID: "Edm.String" }];
  await assert.rejects(api.readAllRows(...args), /second page failed/);
  assert.throws(() => api.readAllRows("/sap/report/", "Products", { P_ID: "A" }, {},
    { ID: "ProductID" }, { ProductID: "Edm.String" }), /filter mapping/);
  const unsafe = service([{ value: [], "@odata.nextLink": "https://evil.test/data" }]);
  await assert.rejects(unsafe.api.readAllRows(...args), /nextLink/);
  const mismatch = service([{ value: [], "@odata.count": 2 }]);
  await assert.rejects(mismatch.api.readAllRows(...args), /count/);
});

class Model {
  constructor(data) { this.data = data; }
  getProperty(key) { return key.split("/").filter(Boolean).reduce((value, part) => value && value[part], this.data); }
  setProperty(key, value) {
    const parts = key.split("/").filter(Boolean);
    const last = parts.pop();
    parts.reduce((parent, part) => parent[part] || (parent[part] = {}), this.data)[last] = value;
  }
}

function controller(captureResponse, targetRows = odata) {
  const definition = load("webapp/controller/AnalysisDetail.controller.js", {
    "abap/to/fiori/system/controller/BaseController": { extend(name, methods) { return methods; } },
    "abap/to/fiori/system/util/LegacyComparison": comparison,
    "abap/to/fiori/system/util/FioriUiReportConfig": reportConfig,
    "abap/to/fiori/system/util/RequestHistory": load("webapp/util/RequestHistory.js"),
    "abap/to/fiori/system/util/ODataGeneration": { createUuid: () => "request" }
  });
  const state = {
    busy: false, requestId: "", captureStatus: "", captureCount: null, odataCount: null,
    status: "INCONCLUSIVE", reason: "", selectionJson: "[]",
    filterMappingJson: "{}", columnMappingJson: "{}",
    keyColumnsJson: "[]", serviceRootUrl: "/sap/report/", entitySet: "Products",
    differences: [], mappingLog: [], mappingLogReady: false, runLog: [], runLogText: "", ready: false
  };
  const instance = Object.assign({}, definition, {
    _oViewModel: new Model({ analysisId: "analysis", comparison: state, fioriUi: {
      metadataStatus: "VALIDATED", serviceRootUrl: "/sap/report/", entitySet: "Products",
      config: { columns: Object.entries(columns).map(([alvField, property]) => ({ alvField, property })) }
    } }),
    getText(key) { return key; },
    _recordSubmittedRequest() {},
    _oLegacyComparisonService: {
      captureLegacyRows(id, requestId, json) {
        assert.equal(id, "analysis");
        assert.equal(requestId, "request");
        assert.equal(json, "[]");
        return Promise.resolve({ RequestId: "request", Status: "QUEUED" });
      },
      getLegacyCapture(id, requestId) {
        assert.equal(id, "analysis");
        assert.equal(requestId, "request");
        return Promise.resolve(captureResponse);
      },
      getEntityMetadata() { return Promise.resolve({ types, keys: ["ProductID"] }); },
      readAllRows() { return Promise.resolve(targetRows); }
    }
  });
  instance._oViewModel.setProperty("/comparison/selectionJson", state.selectionJson);
  return { instance, state };
}

test("Compare all sends [] and automatically compares every row after CAPTURED", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "QUEUED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  const { instance, state } = controller(response);
  await instance.onRequestLegacyCapture();
  assert.equal(state.requestId, "request");
  assert.equal(state.captureStatus, "QUEUED");
  await instance.onCheckLegacyCapture();
  assert.equal(state.status, "INCONCLUSIVE");
  assert.equal(state.ready, false);
  assert.match(state.reason, /QUEUED/);
  assert.equal(instance.onCompareLegacyRows(), undefined);
  response.Status = "CAPTURED";
  await instance.onCheckLegacyCapture();
  assert.equal(state.ready, true);
  assert.equal(state.captureCount, 1);
  assert.equal(state.status, "PASS");
  assert.equal(state.odataCount, 1);
  assert.deepEqual(Array.from(state.runLog.filter((entry) => entry.step === "RESULT"), (entry) => entry.level), ["PASS"]);
  assert.match(state.runLogText, /\[CAPTURE\].*RequestId=request/);
  assert.match(state.runLogText, /\[WORKER\].*about every 2 minutes.*refreshes automatically/);
  assert.match(state.runLogText, /\[CAPTURE_CHECK\].*CountRow=1/);
  assert.match(state.runLogText, /\[METADATA\].*ProductID/);
  assert.match(state.runLogText, /\[MAPPING\].*No OData filter/);
  assert.match(state.runLogText, /\[MAPPING\].*ID -> ProductID.*business key/);
  assert.match(state.runLogText, /\[RESULT\].*Missing=0 Extra=0 MissingAlvColumns=0 Cells=0/);
});

test("an already captured response automatically loads details and compares", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "CAPTURED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  const { instance, state } = controller(response);
  instance._oLegacyComparisonService.captureLegacyRows = () => Promise.resolve(response);
  await instance.onRequestLegacyCapture();
  assert.equal(state.status, "PASS");
  assert.equal(state.odataCount, 1);
});

test("empty ALV capture checks every OData page and counts extra rows", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "CAPTURED",
    RowsJson: "[]", CountRow: 0 };
  const { instance, state } = controller(response);
  let selected;
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, parameters, filters, mapped) => {
    selected = mapped;
    return Promise.resolve([]);
  };
  await instance.onRequestLegacyCapture();
  await instance.onCheckLegacyCapture();
  assert.equal(state.status, "PASS");
  assert.equal(state.comparedColumnCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), { ProductID: "ProductID" });

  instance._oLegacyComparisonService.readAllRows = () => Promise.resolve([{ ProductID: "A" }]);
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "FAIL");
  assert.equal(state.odataCount, 1);
  assert.equal(state.differences[0].kind, "EXTRA");
});

test("run log reports a failed cell comparison with its difference counts", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "CAPTURED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  const { instance, state } = controller(response, [{ ...odata[0], ProductName: "Changed" }]);
  await instance.onRequestLegacyCapture();
  await instance.onCheckLegacyCapture();
  assert.equal(state.status, "FAIL");
  assert.match(state.runLogText, /\[FAIL\] \[RESULT\].*Missing=0 Extra=0 MissingAlvColumns=0 Cells=1/);
});

test("Compare all overrides a stale selection and reads OData without a filter", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "CAPTURED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  const { instance, state } = controller(response);
  state.selectionJson = '[{"FieldName":"P_ID","Sign":"I","Option":"EQ","Low":"A"}]';
  let capturePayload;
  let odataParameters;
  instance._oLegacyComparisonService.captureLegacyRows = (analysisId, requestId, selectionJson) => {
    capturePayload = { analysisId, requestId, selectionJson };
    return Promise.resolve({ RequestId: requestId, Status: "QUEUED" });
  };
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, parameters) => {
    odataParameters = parameters;
    return Promise.resolve(odata);
  };
  await instance.onRequestLegacyCapture();
  assert.deepEqual(capturePayload, { analysisId: "analysis", requestId: "request", selectionJson: "[]" });
  await instance.onCheckLegacyCapture();
  assert.equal(state.selectionJson, "[]");
  assert.equal(Object.keys(odataParameters).length, 0);
  assert.equal(state.status, "PASS");
});

test("queued capture polls only while the comparison dialog is open", async () => {
  const response = { AnalysisId: "analysis", RequestId: "request", Status: "QUEUED",
    RowsJson: JSON.stringify(alv), CountRow: 1 };
  const { instance, state } = controller(response);
  instance._bLegacyComparisonOpen = true;
  await instance.onRequestLegacyCapture();
  assert.ok(instance._iLegacyComparisonTimer);
  let duplicateSubmission = false;
  instance._oLegacyComparisonService.captureLegacyRows = () => { duplicateSubmission = true; };
  instance.onRequestLegacyCapture();
  assert.equal(duplicateSubmission, false);
  instance._stopLegacyComparison();
  assert.equal(instance._iLegacyComparisonTimer, null);
  instance._pLegacyComparisonDialog = Promise.resolve({ open() {} });
  instance.onOpenLegacyComparison();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(instance._iLegacyComparisonTimer);
  response.Status = "CAPTURED";
  await instance.onCheckLegacyCapture();
  assert.equal(state.status, "PASS");
  assert.equal(instance._iLegacyComparisonTimer, null);
  instance._bLegacyAutoCompare = true;
  state.captureStatus = "RUNNING";
  instance._scheduleLegacyComparisonPoll();
  assert.ok(instance._iLegacyComparisonTimer);
  instance._stopLegacyComparison();
  assert.equal(instance._iLegacyComparisonTimer, null);
});

test("comparison target is required before creating a capture request", () => {
  const { instance, state } = controller(null);
  state.serviceRootUrl = "";
  let submitted = false;
  instance._oLegacyComparisonService.captureLegacyRows = () => { submitted = true; };
  instance.onRequestLegacyCapture();
  assert.equal(submitted, false);
  assert.equal(state.requestId, "");
  assert.equal(state.reason, "legacyCompareTargetRequired");
});

test("comparison pre-fills the generated service and offers a column override", async () => {
  const { instance, state } = controller(null);
  state.serviceRootUrl = "";
  state.entitySet = "";
  instance._oViewModel.setProperty("/fioriUi/metadataStatus", "");
  instance._oViewModel.setProperty("/odataGeneration/result", {
    serviceUrl: "/sap/generated/", entityName: "Products"
  });
  let opened = false;
  instance._pLegacyComparisonDialog = Promise.resolve({ open() { opened = true; } });
  instance.getOwnerComponent = () => ({ getManifest: () => ({ "sap.app": { dataSources: {
    mainService: { uri: "/sap/analysis/?sap-client=324" }
  } } }) });
  instance.onOpenLegacyComparison();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened, true);
  assert.equal(state.serviceRootUrl, "/sap/generated/?sap-client=324");
  assert.equal(state.entitySet, "Products");
  instance._stopLegacyComparison();
  const xml = fs.readFileSync(path.join(root, "webapp/view/fragments/LegacyComparisonDialog.fragment.xml"), "utf8");
  assert.doesNotMatch(xml, /legacyParameters|legacyFilterMapping|legacyColumnMapping|legacyKeys/);
  assert.match(xml, /legacyManualColumnMapping/);
});

test("compare maps all same-name ALV columns and derives the entity key", async () => {
  const row = { BUKRS: "1000", BUTXT: "Company", WAERS: "VND" };
  const { instance, state } = controller(null);
  instance._oViewModel.setProperty("/fioriUi/metadataStatus", "");
  state.ready = true;
  state.captureStatus = "CAPTURED";
  instance._aLegacyCapturedRows = [row];
  instance._sLegacySelectionJson = "[]";
  instance._oLegacyComparisonService.getEntityMetadata = () => Promise.resolve({
    types: { BUKRS: "Edm.String", BUTXT: "Edm.String", WAERS: "Edm.String" }, keys: ["BUKRS"]
  });
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, params, filters, mapped) => {
    assert.deepEqual(JSON.parse(JSON.stringify(mapped)),
      { BUKRS: "BUKRS", BUTXT: "BUTXT", WAERS: "WAERS" });
    return Promise.resolve([row]);
  };
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "PASS");
  assert.equal(state.comparedColumnCount, 3);
  assert.deepEqual(JSON.parse(state.columnMappingJson),
    { BUKRS: "BUKRS", BUTXT: "BUTXT", WAERS: "WAERS" });
  assert.equal(state.mappingLogReady, true);
  assert.deepEqual(JSON.parse(state.keyColumnsJson), ["BUKRS"]);
  assert.deepEqual(JSON.parse(JSON.stringify(state.mappingLog.map((entry) =>
    [entry.kind, entry.source, entry.target, entry.isKey]))), [
    ["NO_FILTER", "[]", "", false],
    ["COLUMN", "BUKRS", "BUKRS", true],
    ["COLUMN", "BUTXT", "BUTXT", false],
    ["COLUMN", "WAERS", "WAERS", false]
  ]);
  instance.onLegacyComparisonInputChange({ getSource: () => ({ getBinding: () => ({ getPath: () =>
    "/comparison/entitySet" }) }), getParameter: () => "Changed" });
  assert.equal(state.mappingLogReady, false);
  assert.equal(state.mappingLog.length, 0);
  assert.equal(state.runLog.length, 1);
  assert.equal(state.runLog[0].step, "INPUT");
  assert.doesNotMatch(state.runLogText, /\[PASS\]/);
});

test("compare resolves TYPE_CODE to TypeCode in the generated entity", async () => {
  const { instance, state } = controller(null);
  state.ready = true;
  state.captureStatus = "CAPTURED";
  instance._aLegacyCapturedRows = [{ TYPE_CODE: "A" }];
  instance._sLegacySelectionJson = "[]";
  instance._oLegacyComparisonService.getEntityMetadata = () => Promise.resolve({
    types: { TypeCode: "Edm.String" }, keys: ["TypeCode"]
  });
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, params, filters, mapped) => {
    assert.deepEqual(JSON.parse(JSON.stringify(mapped)), { TYPE_CODE: "TypeCode" });
    return Promise.resolve([{ TypeCode: "A" }]);
  };
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "PASS");
  assert.equal(state.comparedColumnCount, 1);
  assert.deepEqual(JSON.parse(state.keyColumnsJson), ["TYPE_CODE"]);
});

test("manual TYPE_CODE mapping retries on the same capture and rejects absent target properties", async () => {
  const { instance, state } = controller(null);
  state.ready = true;
  state.captureStatus = "CAPTURED";
  state.requestId = "captured-request";
  instance._aLegacyCapturedRows = [{ PRODUCT_ID: "1", TYPE_CODE: "A" }];
  instance._sLegacySelectionJson = "[]";
  instance._oLegacyComparisonService.getEntityMetadata = () => Promise.resolve({
    types: { PRODUCT_ID: "Edm.String", CATEGORY: "Edm.String" }, keys: ["PRODUCT_ID"]
  });
  let reads = 0;
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, params, filters, mapped) => {
    reads += 1;
    if (reads === 1) {
      assert.deepEqual(JSON.parse(JSON.stringify(mapped)), { PRODUCT_ID: "PRODUCT_ID" });
    } else {
      assert.deepEqual(JSON.parse(JSON.stringify(mapped)),
        { PRODUCT_ID: "PRODUCT_ID", TYPE_CODE: "CATEGORY" });
    }
    return Promise.resolve([{ PRODUCT_ID: "1", CATEGORY: "A" }]);
  };
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "FAIL");
  assert.match(state.scopeMessage, /Additional ALV fields outside this OData service are ignored: TYPE_CODE/);
  assert.deepEqual(JSON.parse(JSON.stringify(state.differences.map((item) =>
    [item.kind, item.column]))), [["ALV_COLUMN_MISSING", "CATEGORY"]]);
  assert.equal(reads, 1);

  instance.onLegacyComparisonMappingChange({ getParameter: () => '{"TYPE_CODE":"MISSING"}' });
  assert.equal(state.requestId, "captured-request");
  assert.equal(state.ready, true);
  await instance.onCompareLegacyRows();
  assert.match(state.reason, /Manual mapping for TYPE_CODE refers to missing OData property MISSING/);
  assert.equal(reads, 1);

  instance.onLegacyComparisonMappingChange({ getParameter: () => '{"TYPE_CODE":"CATEGORY"}' });
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "PASS");
  assert.equal(state.comparedColumnCount, 2);
  assert.equal(reads, 2);
  assert.deepEqual(JSON.parse(state.columnMappingJson),
    { PRODUCT_ID: "PRODUCT_ID", TYPE_CODE: "CATEGORY" });
});

test("projection comparison reports truncated OData NAME while showing excluded ALV fields", async () => {
  const { instance, state } = controller(null);
  state.ready = true;
  state.captureStatus = "CAPTURED";
  instance._aLegacyCapturedRows = [{ PRODUCT_ID: "HT-1117", TYPE_CODE: "PR",
    CATEGORY: "Notebooks", NAME: "Wireless DSL Router / Repeater and Print Server",
    DESCRIPTION: "Different long description", SUPPLIER_ID: "0100000046",
    SUPPLIER_NAME: "SAP", CURRENCY_CODE: "EUR" }];
  instance._sLegacySelectionJson = "[]";
  instance._oLegacyComparisonService.getEntityMetadata = () => Promise.resolve({
    types: { PRODUCT_ID: "Edm.String", NAME: "Edm.String", CATEGORY: "Edm.String",
      SUPPLIER_NAME: "Edm.String", CURRENCY_CODE: "Edm.String" }, keys: ["PRODUCT_ID"]
  });
  instance._oLegacyComparisonService.readAllRows = (root, entitySet, params, filters, mapped) => {
    assert.deepEqual(JSON.parse(JSON.stringify(mapped)), {
      PRODUCT_ID: "PRODUCT_ID", CATEGORY: "CATEGORY", NAME: "NAME",
      SUPPLIER_NAME: "SUPPLIER_NAME", CURRENCY_CODE: "CURRENCY_CODE"
    });
    return Promise.resolve([{ PRODUCT_ID: "HT-1117", CATEGORY: "Notebooks",
      NAME: "Wireless DSL Router / Repeater and Print", SUPPLIER_NAME: "SAP",
      CURRENCY_CODE: "EUR" }]);
  };
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "FAIL");
  assert.equal(state.comparedColumnCount, 5);
  assert.match(state.scopeMessage, /Comparing 5 generated OData properties/);
  assert.match(state.scopeMessage, /TYPE_CODE, DESCRIPTION, SUPPLIER_ID/);
  assert.deepEqual(JSON.parse(JSON.stringify(state.differences.map((item) =>
    [item.kind, item.key, item.alv, item.odata]))), [
    ["VALUE", "PRODUCT_ID=HT-1117",
      "Wireless DSL Router / Repeater and Print Server",
      "Wireless DSL Router / Repeater and Print"]
  ]);
  assert.match(state.differences[0].column, /NAME/);
  assert.match(state.runLogText, /MissingAlvColumns=0 Cells=1/);
});

test("extra capture fields do not fail when every generated OData field and row matches", async () => {
  const { instance, state } = controller(null);
  state.ready = true;
  state.captureStatus = "CAPTURED";
  instance._aLegacyCapturedRows = [{ PRODUCT_ID: "HT-1000", TYPE_CODE: "PR",
    CATEGORY: "Notebooks", NAME: "Notebook Basic 15", DESCRIPTION: "Long text",
    SUPPLIER_ID: "0100000046", SUPPLIER_NAME: "SAP", CURRENCY_CODE: "EUR" }];
  instance._sLegacySelectionJson = "[]";
  instance._oLegacyComparisonService.getEntityMetadata = () => Promise.resolve({
    types: { PRODUCT_ID: "Edm.String", NAME: "Edm.String", CATEGORY: "Edm.String",
      SUPPLIER_NAME: "Edm.String", CURRENCY_CODE: "Edm.String" }, keys: ["PRODUCT_ID"]
  });
  instance._oLegacyComparisonService.readAllRows = () => Promise.resolve([{
    PRODUCT_ID: "HT-1000", CATEGORY: "Notebooks", NAME: "Notebook Basic 15",
    SUPPLIER_NAME: "SAP", CURRENCY_CODE: "EUR"
  }]);
  await instance.onCompareLegacyRows();
  assert.equal(state.status, "PASS");
  assert.equal(state.comparedColumnCount, 5);
  assert.equal(state.differences.length, 0);
  assert.match(state.scopeMessage, /TYPE_CODE, DESCRIPTION, SUPPLIER_ID/);
});

test("changing parameters invalidates the old request and a failed OData read remains inconclusive", async () => {
  const { instance, state } = controller({ AnalysisId: "analysis", RequestId: "request",
    Status: "CAPTURED", RowsJson: JSON.stringify(alv), CountRow: 1 });
  await instance.onRequestLegacyCapture();
  instance._oLegacyComparisonService.readAllRows = (...args) => {
    args[6]({ page: 1, rows: 30, totalRows: 30, hasNext: true });
    return Promise.reject(new Error("second page failed"));
  };
  await instance.onCheckLegacyCapture();
  assert.equal(state.status, "INCONCLUSIVE");
  assert.match(state.reason, /second page failed/);
  assert.match(state.runLogText, /\[ODATA_PAGE\].*Page 1: 30 rows.*nextLink=yes/);
  assert.match(state.runLogText, /\[INCONCLUSIVE\] \[COMPARE\] second page failed/);
  instance.onLegacyComparisonInputChange({ getSource: () => ({ getBinding: () => ({ getPath: () =>
    "/comparison/serviceRootUrl" }) }), getParameter: () => "/sap/other/" });
  assert.equal(state.requestId, "");
  assert.equal(state.ready, false);
  assert.equal(state.status, "INCONCLUSIVE");
});

test("capture HTTP 400 exposes the backend OData message on the dialog", async () => {
  const { instance, state } = controller(null);
  instance._oLegacyComparisonService.captureLegacyRows = () =>
    Promise.reject(new Error("Communication error: 400 Bad Request"));
  instance.parseError = () => ({ message: "SelectionJson: unsupported value ALL" });
  await instance.onRequestLegacyCapture();
  assert.equal(state.status, "INCONCLUSIVE");
  assert.equal(state.reason, "SelectionJson: unsupported value ALL");
  assert.equal(state.requestId, "");
});
