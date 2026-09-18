const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function load(relativePath, dependencies = {}) {
  let result;
  const filename = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    sap: { ui: { define(names, factory) {
      result = factory(...names.map((name) => dependencies[name]));
    } } },
    Promise, URL, Date
  }, { filename });
  return result;
}

const constants = load("webapp/util/Constants.js");
const history = load("webapp/util/RequestHistory.js");
const formatter = load("webapp/util/formatter.js");
const Service = load("webapp/service/RequestHistoryService.js", {
  "abap/to/fiori/system/util/Constants": constants
});
const serviceRoot = "/sap/opu/odata4/sap/zui_mig_analysis_o4/srvd/sap/zui_mig_analysis/0001/?sap-client=324";

function metadata(typeOverrides = {}) {
  const types = {};
  ["CaptureRequests", "GenerationRequests"].forEach((name) => {
    const fields = name === "CaptureRequests" ? constants.field.captureRequests : constants.field.generationRequests;
    const entity = { $kind: "EntityType" };
    fields.forEach((field) => {
      const type = typeOverrides[name + "." + field] ||
        (field === "CreatedAt" || field === "UpdatedAt" ? "Edm.DateTimeOffset" :
          field === "CountRow" ? "Edm.Int32" :
          field === "RequestId" || field === "AnalysisId" ? "Edm.Guid" : "Edm.String");
      entity[field] = { $kind: "Property", $Type: type };
    });
    types[name] = entity;
  });
  return { getMetaModel() { return { requestObject(name) {
    return Promise.resolve(name === "/$EntityContainer/" ?
      { CaptureRequests: { $kind: "EntitySet" }, GenerationRequests: { $kind: "EntitySet" } } :
      types[name.split("/")[1]]);
  } }; } };
}

test("history GETs both user-filtered entity sets through the configured SAP client and follows nextLink", async () => {
  const calls = [];
  const fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    const name = parsed.pathname.split("/").pop();
    const data = name === "GenerationRequests" ? { value: [{ RequestId: "g1" }] } :
      parsed.searchParams.has("$skiptoken") ? { value: [{ RequestId: "c2" }] } :
        { value: [{ RequestId: "c1" }], "@odata.nextLink": parsed.pathname + "?$skiptoken=next" };
    return { ok: true, json: async () => data };
  };
  const service = new Service(metadata(), serviceRoot, fetch, "https://sap.example.test");
  const result = await service.readMyRequests();

  assert.deepEqual(Array.from(result.captures, (row) => row.RequestId), ["c1", "c2"]);
  assert.deepEqual(Array.from(result.generations, (row) => row.RequestId), ["g1"]);
  assert.equal(calls.length, 3);
  calls.forEach(({ parsed, options }) => {
    assert.equal(parsed.origin, "https://sap.example.test");
    assert.equal(parsed.searchParams.get("sap-client"), "324");
    assert.equal(parsed.searchParams.has("RequestedBy"), false);
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "include");
  });
  assert.match(calls[0].parsed.searchParams.get("$select"), /CountRow/);
  assert.doesNotMatch(calls[0].parsed.searchParams.get("$select"), /RowCount/);
  assert.match(calls[1].parsed.searchParams.get("$select"), /Status/);
});

test("metadata rejects a changed field type before reading request data", async () => {
  let fetchCount = 0;
  const service = new Service(metadata({ "CaptureRequests.CountRow": "Edm.String" }), serviceRoot,
    async () => { fetchCount += 1; }, "https://sap.example.test");
  await assert.rejects(service.readMyRequests(), /CaptureRequests.CountRow.*Edm.String/);
  assert.equal(fetchCount, 0);
});

test("history paging rejects cross-origin and repeated nextLink", async () => {
  const unsafe = new Service(metadata(), serviceRoot, async () => ({ ok: true,
    json: async () => ({ value: [], "@odata.nextLink": "https://other.example.test/requests" })
  }), "https://sap.example.test");
  await assert.rejects(unsafe.readMyRequests(), /nextLink/);

  const repeated = new Service(metadata(), serviceRoot, async (url) => ({ ok: true,
    json: async () => ({ value: [], "@odata.nextLink": url })
  }), "https://sap.example.test");
  await assert.rejects(repeated.readMyRequests(), /nextLink/);
});

test("absolute backend nextLink is read through the same-origin /sap proxy", async () => {
  const calls = [];
  const service = new Service(metadata(), serviceRoot, async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    const second = parsed.searchParams.has("$skiptoken");
    return { ok: true, json: async () => ({ value: [],
      ...(!second && parsed.pathname.endsWith("CaptureRequests") ? {
        "@odata.nextLink": "https://backend.example.test" + parsed.pathname + "?$skiptoken=second"
      } : {}) }) };
  }, "http://localhost:8080");
  await service.readMyRequests();
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[2]).origin, "http://localhost:8080");
  assert.equal(new URL(calls[2]).searchParams.get("sap-client"), "324");
});

test("merged request history sorts newest first, filters current analysis and recognizes active statuses", () => {
  const older = history.normalize({ RequestId: "c", AnalysisId: "aaaaaaaa-bbbb", CreatedAt: "2026-09-17T10:00:00Z",
    Status: "CAPTURED", CountRow: 0 }, "CAPTURE");
  const newer = history.normalize({ RequestId: "g", AnalysisId: "cccccccc-dddd", CreatedAt: "2026-09-18T10:00:00Z",
    Status: "DISPATCHING" }, "GENERATION");
  const merged = history.merge([older, newer], [Object.assign({}, older, { status: "QUEUED" })]);
  assert.deepEqual(Array.from(merged, (row) => row.requestId), ["g", "c"]);
  assert.equal(merged[1].status, "CAPTURED");
  assert.equal(merged[1].rowCountText, "0");
  assert.deepEqual(Array.from(history.visible(merged, "aaaaaaaabbbb", "ANALYSIS"), (row) => row.requestId), ["c"]);
  assert.equal(history.visible(merged, "aaaaaaaa-bbbb", "ALL").length, 2);
  ["QUEUED", "DISPATCHING", "SCHEDULED", "RUNNING"].forEach((status) => assert.equal(history.isActive(status), true));
  ["CAPTURED", "GENERATED", "FAILED", "DISPATCH_FAILED"].forEach((status) => assert.equal(history.isActive(status), false));
  ["CAPTURED", "GENERATED"].forEach((status) => assert.equal(formatter.formatRequestStatusState(status), "Success"));
  ["FAILED", "DISPATCH_FAILED"].forEach((status) => assert.equal(formatter.formatRequestStatusState(status), "Error"));
});
