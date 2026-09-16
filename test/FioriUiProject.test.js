const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(file, dependencies = {}) {
  let result;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    sap: { ui: { define(names, factory) { result = factory(...names.map((name) => dependencies[name])); } } },
    TextEncoder, Uint8Array, Promise, setTimeout
  }, { filename: file });
  return result;
}

const root = path.resolve(__dirname, "..");
const project = load(path.join(root, "webapp", "util", "FioriUiProject.js"));

function parseXml(source) {
  const document = { nodeType: 9, childNodes: [] };
  const stack = [{ node: document, namespaces: {} }];
  for (const token of source.match(/<[^>]+>|[^<]+/g) || []) {
    if (!token.startsWith("<")) {
      stack.at(-1).node.childNodes.push({ nodeType: 3, textContent: token });
      continue;
    }
    if (token.startsWith("<?")) continue;
    if (token.startsWith("</")) { stack.pop(); continue; }
    const match = /^<([\w:.-]+)([^>]*)>$/.exec(token);
    if (!match) throw new Error("Malformed fixture");
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w:.-]+)="([^"]*)"/g)) attributes[attr[1]] = attr[2];
    const namespaces = { ...stack.at(-1).namespaces };
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "xmlns") namespaces[""] = value;
      if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = value;
    }
    const parts = match[1].split(":");
    const node = {
      nodeType: 1, localName: parts.at(-1), namespaceURI: namespaces[parts.length > 1 ? parts[0] : ""],
      childNodes: [], getAttribute(name) { return attributes[name] ?? null; },
      get textContent() { return this.childNodes.map((child) => child.textContent || "").join(""); }
    };
    stack.at(-1).node.childNodes.push(node);
    if (!token.endsWith("/>")) stack.push({ node, namespaces });
  }
  if (stack.length !== 1) throw new Error("Unclosed fixture");
  document.documentElement = document.childNodes.find((node) => node.nodeType === 1);
  document.getElementsByTagName = function (name) {
    const found = [];
    function walk(node) {
      for (const child of node.childNodes || []) {
        if (child.localName === name) found.push(child);
        walk(child);
      }
    }
    walk(document);
    return found;
  };
  return document;
}

const xml = `<?xml version="1.0"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
<edmx:Reference Uri="UI.xml"><edmx:Include Namespace="com.sap.vocabularies.UI.v1" Alias="UI"/></edmx:Reference>
<edmx:DataServices><Schema Namespace="Demo.Service" xmlns="http://docs.oasis-open.org/odata/ns/edm">
<EntityContainer Name="Main"><EntitySet Name="Products" EntityType="Demo.Service.Product"/></EntityContainer>
<EntityType Name="Product"><Key><PropertyRef Name="ProductID"/></Key>
<Property Name="ProductID" Type="Edm.String"/><Property Name="Name" Type="Edm.String"/>
<Property Name="Category" Type="Edm.String"/><Property Name="Price" Type="Edm.Decimal"/></EntityType>
<EntityType Name="Other"><Annotation Term="UI.LineItem"><Collection><Record Type="UI.DataField"><PropertyValue Property="Value" Path="OtherField"/></Record></Collection></Annotation></EntityType>
<Annotations Target="Demo.Service.Product">
<Annotation Term="UI.LineItem"><Collection>
<Record Type="UI.DataField"><PropertyValue Property="Value" Path="ProductID"/></Record>
<Record Type="UI.DataField"><PropertyValue Property="Value" Path="Name"/></Record>
</Collection></Annotation>
<Annotation Term="UI.SelectionFields"><Collection><PropertyPath>Category</PropertyPath></Collection></Annotation>
<Annotation Term="UI.Chart"><Record><PropertyValue Property="Dimensions"><Collection><PropertyPath>Category</PropertyPath></Collection></PropertyValue>
<PropertyValue Property="Measures"><Collection><PropertyPath>Price</PropertyPath></Collection></PropertyValue></Record></Annotation>
</Annotations></Schema></edmx:DataServices></edmx:Edmx>`;

function config(overrides = {}) {
  return {
    contractVersion: "1.0", analysisId: "8b95f36a-4f27-1fe1-a4a6-40de08121663",
    appTitle: "BAPI_EPM_PRODUCT_GET_LIST", template: "sap.fe.templates.ListReport", odataVersion: "4.0",
    serviceRootUrl: "/sap/opu/odata4/sap/demo/srvd/sap/demo/0001/", metadataUrl: "",
    entitySet: "Products", columns: [{ property: "ProductID" }, { property: "Name" }],
    filters: [{ property: "Category" }], defaultSort: [{ property: "ProductID" }],
    tableSupported: true, filterSupported: true, chartSupported: false, readOnly: true,
    ...overrides
  };
}

function entries(zipBytes) {
  const buffer = Buffer.from(zipBytes);
  const result = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    result[name] = buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size).toString("utf8");
    offset += 30 + nameLength + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  return result;
}

test("ZIP has a standalone OData V4 List Report routed to the configured entity set", () => {
  const built = project.build(config(), xml, null, parseXml);
  const archived = entries(built.bytes);
  const manifest = JSON.parse(archived[`${built.appName}/webapp/manifest.json`]);
  assert.equal(manifest["sap.app"].dataSources.mainService.uri,
    "/sap/opu/odata4/sap/demo/srvd/sap/demo/0001/?sap-client=324");
  assert.equal(manifest["sap.app"].dataSources.mainService.settings.odataVersion, "4.0");
  assert.equal(manifest["sap.ui5"].models[""].dataSource, "mainService");
  assert.equal(manifest["sap.ui5"].routing.routes[0].target, "ListReport");
  assert.equal(manifest["sap.ui5"].routing.targets.ListReport.name, "sap.fe.templates.ListReport");
  assert.equal(manifest["sap.ui5"].routing.targets.ListReport.options.settings.entitySet, "Products");
  assert.deepEqual(Object.keys(manifest["sap.ui5"].routing.targets), ["ListReport"]);
  assert.equal(JSON.stringify(manifest).includes("ObjectPage"), false);
  assert.equal(JSON.stringify(manifest).includes("s40lp1.ucc.cit.tum.de"), false);
  for (const file of ["package.json", "ui5.yaml", "README.md", "webapp/Component.js", "webapp/index.html",
    "webapp/i18n/i18n.properties", "webapp/annotations/local.xml"]) {
    assert.ok(archived[`${built.appName}/${file}`], file);
  }
  assert.match(archived[`${built.appName}/webapp/annotations/local.xml`], /Insertable" Bool="false/);
  assert.match(archived[`${built.appName}/README.md`], /npm install/);
  assert.match(archived[`${built.appName}/README.md`], /GET \/sap\/.+Products/);
  assert.equal(Buffer.from(project.build(config(), xml, null, parseXml).bytes).equals(Buffer.from(built.bytes)), true);
});

test("chartSupported=false omits chart views even if the service advertises UI.Chart", () => {
  const built = project.build(config(), xml, null, parseXml);
  const manifest = built.manifest;
  assert.equal(manifest["sap.ui5"].routing.targets.ListReport.options.settings.views, undefined);
  assert.equal(built.files["webapp/annotations/local.xml"].includes("GeneratedChart"), false);
});

test("annotation field content and order must match the selected entity contract", () => {
  assert.throws(() => project.build(config({ columns: [{ property: "Name" }, { property: "ProductID" }] }), xml, null, parseXml),
    (error) => error.issues.some((issue) => /UI.LineItem.*thứ tự/.test(issue)));
  assert.throws(() => project.build(config({ filters: [{ property: "Name" }] }), xml, null, parseXml),
    (error) => error.issues.some((issue) => /UI.SelectionFields/.test(issue)));
  const otherOnly = xml.replace(/<Annotations Target="Demo.Service.Product">[\s\S]*?<\/Annotations>/, "");
  assert.throws(() => project.build(config(), otherOnly, null, parseXml),
    (error) => error.issues.some((issue) => /UI.LineItem/.test(issue)));
});

test("chart is configured only with valid dimensions and numeric measures", () => {
  const built = project.build(config({ chartSupported: true }), xml, null, parseXml);
  assert.equal(built.manifest["sap.ui5"].routing.targets.ListReport.options.settings.views.paths.length, 2);
  const broken = xml.replace('Name="Price" Type="Edm.Decimal"', 'Name="Price" Type="Edm.String"');
  assert.throws(() => project.build(config({ chartSupported: true }), broken, null, parseXml),
    (error) => error.issues.some((issue) => /EDM type dạng số/.test(issue)));
});

test("dangerous app, namespace, file and ZIP paths are rejected", () => {
  assert.throws(() => project.build(config({ appTitle: "../evil" }), xml, null, parseXml), /appTitle/);
  assert.throws(() => project.build(config(), xml, { appName: "../evil" }, parseXml), /Tên app/);
  assert.throws(() => project.build(config(), xml, { namespace: "generated../evil" }, parseXml), /Namespace/);
  assert.throws(() => project.build(config(), xml, { fileName: "../../evil.zip" }, parseXml), /Tên file ZIP/);
  assert.throws(() => project.zip({ "../evil.txt": "x" }, "safeapp"), /Đường dẫn ZIP/);
  assert.throws(() => project.build(config({ serviceRootUrl: "https://sap.example/sap/service/" }), xml, null, parseXml), /serviceRootUrl/);
  assert.throws(() => project.build(config({ serviceRootUrl: "/sap/service/$metadata" }), xml, null, parseXml), /serviceRootUrl/);
});

test("ZIP identity requires a 36-character GUID and normalization accepts exactly 32 or 36 hex characters", () => {
  const canonical = config().analysisId;
  const compact = canonical.replace(/-/g, "");
  assert.equal(project.normalizeAnalysisId(compact.toUpperCase()), canonical);
  assert.equal(project.normalizeAnalysisId(canonical.toUpperCase()), canonical);
  assert.throws(() => project.safeIdentity(config({ analysisId: compact })), /analysisId không hợp lệ/);
  assert.throws(() => project.normalizeAnalysisId("not-a-guid"), /analysisId không hợp lệ/);
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

function controller(projectModule = project) {
  const definition = load(path.join(root, "webapp", "controller", "AnalysisDetail.controller.js"), {
    "sap/ui/core/Fragment": {}, "sap/m/MessageBox": {}, "sap/m/MessageToast": {},
    "sap/ui/model/Filter": function () {}, "sap/ui/model/FilterOperator": {}, "sap/ui/model/Sorter": function () {},
    "abap/to/fiori/system/controller/BaseController": { extend(name, value) { return value; } },
    "abap/to/fiori/system/model/models": {}, "abap/to/fiori/system/model/mailConstants": {},
    "abap/to/fiori/system/model/mailFormatter": {}, "abap/to/fiori/system/model/ComparisonConstants": {},
    "abap/to/fiori/system/model/AnalysisTableConfig": {},
    "abap/to/fiori/system/util/TablePersonalizationService": function () {},
    "abap/to/fiori/system/util/Constants": {}, "abap/to/fiori/system/util/FioriUiConfig": {},
    "abap/to/fiori/system/util/FioriUiMetadata": {}, "abap/to/fiori/system/util/FioriUiProject": projectModule,
    "abap/to/fiori/system/util/ODataGeneration": {}, "abap/to/fiori/system/util/formatter": {}
  });
  return Object.assign({}, definition, {
    _oViewModel: new Model({ analysisId: config().analysisId, fioriUi: {
      targetPackage: "Z_UI", serviceRootUrl: config().serviceRootUrl, hasResult: true,
      status: "CONFIG_READY", metadataStatus: "", metadataXml: xml,
      metadataSignature: "", config: config(), busy: false, zipStatus: "DOWNLOADED",
      zipFileName: "old.zip", zipIssues: []
    } }),
    getText(key) { return key; }, _downloadFioriUiProject() { throw new Error("Download must be gated"); }
  });
}

test("project action blocks unvalidated input and editing removes ZIP eligibility", () => {
  const instance = controller();
  instance.onCreateFioriUiProject();
  assert.equal(instance._oViewModel.getProperty("/fioriUi/zipStatus"), "INVALID");
  instance._oViewModel.setProperty("/fioriUi/metadataStatus", "VALIDATED");
  instance._oViewModel.setProperty("/fioriUi/metadataSignature", instance._fioriUiSignature());
  instance.onFioriUiInputChange({
    getSource() { return { getBinding() { return { getPath() { return "/fioriUi/serviceRootUrl"; } }; } }; },
    getParameter() { return "/sap/new/"; }
  });
  assert.equal(instance._oViewModel.getProperty("/fioriUi/metadataStatus"), "");
  assert.equal(instance._oViewModel.getProperty("/fioriUi/zipFileName"), "");
  assert.equal(instance._oViewModel.getProperty("/fioriUi/hasResult"), false);
});

test("current validated configuration downloads once; a changed analysis cannot use its validation", async () => {
  let downloads = 0;
  let downloadedZip;
  const instance = controller({ normalizeAnalysisId: project.normalizeAnalysisId,
    build(settings, metadataXml) { return project.build(settings, metadataXml, null, parseXml); } });
  const compact = config().analysisId.replace(/-/g, "");
  instance._oViewModel.setProperty("/analysisId", compact);
  instance._oViewModel.setProperty("/fioriUi/config", config({ analysisId: compact }));
  instance._oViewModel.setProperty("/fioriUi/configAnalysisId", compact);
  instance._oViewModel.setProperty("/fioriUi/prepareAnalysisId", config().analysisId);
  instance._sCurrentRouteAnalysisId = compact;
  instance._downloadFioriUiProject = (bytes, fileName) => { downloads += 1; downloadedZip = { bytes, fileName }; };
  instance._oViewModel.setProperty("/fioriUi/metadataStatus", "VALIDATED");
  instance._oViewModel.setProperty("/fioriUi/metadataSignature", instance._fioriUiSignature());
  instance.onCreateFioriUiProject();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(downloads, 1);
  assert.match(downloadedZip.fileName, /\.zip$/);
  const archived = entries(downloadedZip.bytes);
  assert.ok(archived[`${downloadedZip.fileName.slice(0, -4)}/webapp/manifest.json`]);
  instance._oViewModel.setProperty("/analysisId", "different-analysis");
  instance.onCreateFioriUiProject();
  assert.equal(downloads, 1);
  assert.equal(instance._oViewModel.getProperty("/fioriUi/zipFileName"), "");
});

test("ZIP refuses a route, ConfigJson or PrepareFioriUi ID from another analysis", async () => {
  for (const property of ["routeAnalysisId", "configAnalysisId", "prepareAnalysisId"]) {
    let downloads = 0;
    const instance = controller({ normalizeAnalysisId: project.normalizeAnalysisId,
      build() { throw new Error("Must reject before build"); } });
    instance._downloadFioriUiProject = () => { downloads += 1; };
    instance._oViewModel.setProperty("/fioriUi/metadataStatus", "VALIDATED");
    if (property === "routeAnalysisId") {
      instance._sCurrentRouteAnalysisId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    } else {
      instance._oViewModel.setProperty("/fioriUi/" + property,
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    }
    instance._oViewModel.setProperty("/fioriUi/metadataSignature", instance._fioriUiSignature());
    instance.onCreateFioriUiProject();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(downloads, 0);
    assert.equal(instance._oViewModel.getProperty("/fioriUi/zipStatus"), "INVALID");
    assert.match(instance._oViewModel.getProperty("/fioriUi/zipMessage"),
      new RegExp({ routeAnalysisId: "Route", configAnalysisId: "ConfigJson",
        prepareAnalysisId: "PrepareFioriUi" }[property]));
  }
});
