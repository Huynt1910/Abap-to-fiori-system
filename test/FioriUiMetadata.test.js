const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(file, dependencies = {}) {
  let result;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    sap: { ui: { define(names, factory) { result = factory(...names.map((name) => dependencies[name])); } } },
    Promise
  }, { filename: file });
  return result;
}

const root = path.resolve(__dirname, "..");
const metadata = load(path.join(root, "webapp", "util", "FioriUiMetadata.js"));
const configParser = load(path.join(root, "webapp", "util", "FioriUiConfig.js"));
const reportConfig = load(path.join(root, "webapp", "util", "FioriUiReportConfig.js"));

// A small DOM adapter for the controlled CSDL fixtures. Browser runtime uses DOMParser.
function parseFixture(xml) {
  const document = { childNodes: [], nodeType: 9 };
  const stack = [{ node: document, namespaces: {} }];
  for (const token of xml.match(/<[^>]+>/g) || []) {
    if (token.startsWith("<?")) continue;
    if (token.startsWith("</")) {
      if (stack.length === 1) throw new Error("Unexpected closing tag");
      stack.pop();
      continue;
    }
    const match = /^<([\w:.-]+)([^>]*)>$/.exec(token);
    if (!match) throw new Error("Malformed XML");
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w:.-]+)="([^"]*)"/g)) attributes[attr[1]] = attr[2];
    const namespaces = { ...stack[stack.length - 1].namespaces };
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "xmlns") namespaces[""] = value;
      if (name.startsWith("xmlns:")) namespaces[name.slice(6)] = value;
    }
    const parts = match[1].split(":");
    const node = {
      nodeType: 1, localName: parts.at(-1), namespaceURI: namespaces[parts.length > 1 ? parts[0] : ""],
      childNodes: [], getAttribute(name) { return attributes[name] ?? null; }
    };
    stack[stack.length - 1].node.childNodes.push(node);
    if (!token.endsWith("/>")) stack.push({ node, namespaces });
  }
  if (stack.length !== 1) throw new Error("Unclosed XML tag");
  document.documentElement = document.childNodes[0];
  document.getElementsByTagName = function (name) {
    const found = [];
    function visit(node) {
      for (const child of node.childNodes || []) {
        if (child.localName === name) found.push(child);
        visit(child);
      }
    }
    visit(document);
    return found;
  };
  return document;
}

const xml = `<?xml version="1.0"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:Reference Uri="https://example.test/UI.xml"><edmx:Include Namespace="com.sap.vocabularies.UI.v1" Alias="UI"/></edmx:Reference>
  <edmx:DataServices><Schema Namespace="Demo.Service" xmlns="http://docs.oasis-open.org/odata/ns/edm">
    <EntityContainer Name="Main"><EntitySet Name="ReportItems" EntityType="Demo.Service.ReportItem"/></EntityContainer>
    <EntityType Name="ReportItem"><Key><PropertyRef Name="ID"/></Key>
      <Property Name="ID" Type="Edm.String"/><Property Name="Amount" Type="Edm.Decimal"/>
      <Property Name="Currency" Type="Edm.String"/><Property Name="CompanyCode" Type="Edm.String"/>
    </EntityType>
    <EntityType Name="Other"><Annotation Term="UI.LineItem"/><Annotation Term="UI.SelectionFields"/><Annotation Term="UI.Chart"/></EntityType>
    <Annotations Target="Demo.Service.ReportItem"><Annotation Term="UI.LineItem"/><Annotation Term="UI.SelectionFields"/><Annotation Term="UI.Chart"/></Annotations>
  </Schema></edmx:DataServices>
</edmx:Edmx>`;

function config(overrides = {}) {
  return {
    serviceRootUrl: "/sap/report/", metadataUrl: "", entitySet: "ReportItems",
    columns: [
      { property: "ID", edmType: "Edm.String", isKey: true },
      { property: "Amount", edmType: "Edm.Decimal", isKey: false, currencyProperty: "Currency" }
    ],
    filters: [{ property: "CompanyCode" }], defaultSort: [{ property: "ID" }],
    tableSupported: true, filterSupported: true, chartSupported: true,
    ...overrides
  };
}

function result(source = xml, settings = config()) {
  return metadata.validate(source, settings, parseFixture);
}

test("valid OData V4 entity and its annotations are VALIDATED", () => {
  const parsed = configParser.parse({ Status: "CONFIG_READY", RuntimeCheck: "METADATA_REQUIRED",
    ConfigJson: JSON.stringify(config()) });
  assert.equal(result(xml, parsed.config).status, "VALIDATED");
  assert.equal(result(xml, parsed.config).issues.length, 0);
});

test("missing entity set, entity type, key and property report specific issues", () => {
  assert.match(result(xml, config({ entitySet: "Missing" })).issues[0], /EntitySet 'Missing'/);
  assert.match(result(xml.replace('EntityType="Demo.Service.ReportItem"', 'EntityType="Demo.Service.Missing"')).issues[0], /EntityType/);
  assert.match(result(xml.replace('<Key><PropertyRef Name="ID"/></Key>', "")).issues.join(" "), /has no Key/);
  assert.match(result(xml, config({ filters: [{ property: "Absent" }] })).issues.join(" "), /Filter 'Absent'/);
  assert.match(result(xml, config({ defaultSort: [{ property: "Absent" }] })).issues.join(" "), /DefaultSort 'Absent'/);
  assert.match(result(xml, config({ columns: [{ property: "Absent", edmType: "Edm.String", isKey: true }] })).issues.join(" "), /Column 'Absent'/);
  assert.match(result(xml, config({ columns: [{ property: "ID", edmType: "Edm.String", isKey: true, unitProperty: "Absent" }] })).issues.join(" "), /unitProperty/);
  assert.match(result(xml, config({ columns: [{ property: "ID", edmType: "Edm.String", isKey: true, currencyProperty: "Absent" }] })).issues.join(" "), /currencyProperty/);
});

test("wrong EDM type and key mapping are INVALID", () => {
  const wrongType = config();
  wrongType.columns[1].edmType = "Edm.String";
  assert.match(result(xml, wrongType).issues.join(" "), /mismatched EDM type.*Edm.String.*Edm.Decimal/);
  const wrongKey = config();
  wrongKey.columns[0].isKey = false;
  assert.match(result(xml, wrongKey).issues.join(" "), /not marked isKey/);
});

test("annotations on another entity do not satisfy the checked entity", () => {
  const withoutOwn = xml.replace(/<Annotations Target="Demo.Service.ReportItem">[\s\S]*?<\/Annotations>/, "");
  const issues = result(withoutOwn).issues.join(" ");
  assert.match(issues, /UI.LineItem/);
  assert.match(issues, /UI.SelectionFields/);
  assert.match(issues, /UI.Chart/);
  assert.equal(result(withoutOwn, config({ tableSupported: false, filterSupported: false, chartSupported: false })).status, "VALIDATED");
});

test("invalid XML and non-V4 metadata are INVALID", () => {
  assert.match(result("<broken>").issues[0], /XML metadata/);
  assert.match(result(xml.replace('Version="4.0"', 'Version="3.0"')).issues[0], /OData V4/);
});

test("metadata URL uses explicit URL or appends $metadata before the query", () => {
  assert.equal(metadata.metadataUrl(config({ metadataUrl: "/explicit/$metadata" })), "/explicit/$metadata");
  assert.equal(metadata.metadataUrl(config({ serviceRootUrl: "/sap/report///?sap-client=324" })), "/sap/report/$metadata?sap-client=324");
});

test("GET includes current session and HTTP/network errors become INVALID issues", async () => {
  let request;
  const valid = await metadata.check(config(), (url, options) => {
    request = { url, options };
    return Promise.resolve({ ok: true, text: () => Promise.resolve(xml) });
  }, parseFixture);
  assert.equal(valid.status, "VALIDATED");
  assert.equal(request.url, "/sap/report/$metadata");
  assert.equal(request.options.credentials, "include");
  const http = await metadata.check(config(), () => Promise.resolve({ ok: false, status: 403, statusText: "Forbidden" }), parseFixture);
  assert.equal(http.status, "INVALID");
  assert.match(http.issues[0], /HTTP 403/);
  const offline = await metadata.check(config(), () => Promise.reject(new Error("Network failed")), parseFixture);
  assert.match(offline.issues[0], /Network failed/);
});

class Model {
  constructor(data) { this.data = data; }
  getProperty(propertyPath) {
    return propertyPath.split("/").filter(Boolean).reduce((current, key) => current && current[key], this.data);
  }
  setProperty(propertyPath, value) {
    const keys = propertyPath.split("/").filter(Boolean);
    const last = keys.pop();
    const parent = keys.reduce((current, key) => current[key] || (current[key] = {}), this.data);
    parent[last] = value;
  }
}

function controller(metadataCheck, prepare) {
  const definition = load(path.join(root, "webapp", "controller", "AnalysisDetail.controller.js"), {
    "sap/ui/core/Fragment": {}, "sap/m/MessageBox": {}, "sap/m/MessageToast": {},
    "sap/ui/model/Filter": function () {}, "sap/ui/model/FilterOperator": {}, "sap/ui/model/Sorter": function () {},
    "abap/to/fiori/system/controller/BaseController": { extend(name, value) { return value; } },
    "abap/to/fiori/system/model/models": {}, "abap/to/fiori/system/model/mailConstants": {},
    "abap/to/fiori/system/model/mailFormatter": {}, "abap/to/fiori/system/model/ComparisonConstants": {},
    "abap/to/fiori/system/model/AnalysisTableConfig": {},
    "abap/to/fiori/system/util/TablePersonalizationService": function () {},
    "abap/to/fiori/system/util/Constants": {}, "abap/to/fiori/system/util/FioriUiConfig": configParser,
    "abap/to/fiori/system/util/FioriUiMetadata": { check: metadataCheck },
    "abap/to/fiori/system/util/FioriUiReportConfig": reportConfig,
    "abap/to/fiori/system/util/ODataGeneration": {}, "abap/to/fiori/system/util/formatter": {}
  });
  return Object.assign({}, definition, {
    _oViewModel: new Model({ analysisId: "A1", fioriUi: {
      serviceRootUrl: "/sap/report/", busy: false, error: "", hasResult: true,
      status: "CONFIG_READY", runtimeCheck: "METADATA_REQUIRED", config: config(),
      metadataStatus: "VALIDATED", metadataIssues: [], issues: [], columns: [], filters: []
    } }),
    getAnalysisService() { return { prepareFioriUi: prepare }; },
    getText(key) { return key; },
    parseError(error) { return { message: error.message }; }
  });
}

function inputEvent(propertyPath, value) {
  return {
    getSource() { return { getBinding() { return { getPath() { return propertyPath; } }; } }; },
    getParameter() { return value; }
  };
}

test("editing the service root URL clears VALIDATED and Prepare result", () => {
  const instance = controller(() => Promise.resolve({ status: "VALIDATED", issues: [] }), () => Promise.resolve({}));
  instance.onFioriUiInputChange(inputEvent("/fioriUi/serviceRootUrl", "new value"));
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataStatus"), "");
  assert.equal(instance._oViewModel.getProperty("/fioriUi/hasResult"), false);
  assert.equal(instance._oViewModel.getProperty("/fioriUi/config"), null);
});

test("Prepare Fiori uses the fixed target package and only requires a service root URL", async () => {
  const calls = [];
  const instance = controller(() => Promise.resolve({ status: "VALIDATED", issues: [] }),
    (analysisId, parameters) => {
      calls.push({ analysisId, parameters });
      return Promise.resolve({ Status: "CONFIG_READY", ConfigJson: JSON.stringify(config()) });
    });
  instance._oViewModel.setProperty("/fioriUi/serviceRootUrl", "");
  instance.onPrepareFioriUi();
  assert.equal(calls.length, 0);
  assert.equal(instance._oViewModel.getProperty("/fioriUi/error"), "fioriUiRequiredInputs");

  instance._oViewModel.setProperty("/fioriUi/serviceRootUrl", "/sap/report/");
  instance._oViewModel.setProperty("/fioriUi/targetPackage", "IGNORED_VALUE");
  instance.onPrepareFioriUi();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].analysisId, "A1");
  assert.equal(calls[0].parameters.targetPackage, "ZMIG_GEN_TEST");
  assert.equal(calls[0].parameters.serviceRootUrl, "/sap/report/");
});

test("dialog receives INVALID metadata issues separately from Prepare status", async () => {
  const instance = controller(() => Promise.resolve({ status: "INVALID", issues: ["Missing UI.LineItem"] }),
    () => Promise.resolve({}));
  instance.onValidateFioriUiMetadata();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance._oViewModel.getProperty("/fioriUi/status"), "CONFIG_READY");
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataStatus"), "INVALID");
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataIssues")[0].message, "Missing UI.LineItem");
});

test("metadata validation rejects a host URL before issuing any request", async () => {
  let requests = 0;
  const instance = controller(() => { requests += 1; return Promise.resolve({ status: "VALIDATED", issues: [] }); },
    () => Promise.resolve({}));
  instance._oViewModel.setProperty("/fioriUi/config", config({ metadataUrl: "https://sap.example/$metadata" }));
  instance.onValidateFioriUiMetadata();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 0);
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataStatus"), "INVALID");
  assert.match(instance._oViewModel.getProperty("/fioriUi/metadataIssues")[0].message, /metadataUrl/);
});

test("late metadata and Prepare responses cannot overwrite changed inputs or analysis", async () => {
  let resolveCheck;
  const instance = controller(() => new Promise((resolve) => { resolveCheck = resolve; }),
    () => Promise.resolve({ Status: "CONFIG_READY", ConfigJson: JSON.stringify(config()) }));
  instance.onValidateFioriUiMetadata();
  await Promise.resolve();
  instance.onFioriUiInputChange(inputEvent("/fioriUi/serviceRootUrl", "/sap/new/"));
  resolveCheck({ status: "VALIDATED", issues: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataStatus"), "");

  let resolvePrepare;
  instance.getAnalysisService = () => ({ prepareFioriUi: () => new Promise((resolve) => { resolvePrepare = resolve; }) });
  instance.onPrepareFioriUi();
  instance._oViewModel.setProperty("/analysisId", "A2");
  resolvePrepare({ Status: "CONFIG_READY", ConfigJson: JSON.stringify(config()) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance._oViewModel.getProperty("/fioriUi/hasResult"), false);
});
