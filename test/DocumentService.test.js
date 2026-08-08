const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUi5Module(filePath, dependencies = {}) {
  let exported;
  const source = fs.readFileSync(filePath, "utf8");
  const context = {
    sap: {
      ui: {
        define(deps, factory) {
          exported = factory(...deps.map((dep) => dependencies[dep]));
        }
      }
    }
  };

  vm.runInNewContext(source, context, { filename: filePath });
  return exported;
}

const root = path.resolve(__dirname, "..");
const Constants = loadUi5Module(path.join(root, "webapp", "util", "Constants.js"));
const DocumentService = loadUi5Module(path.join(root, "webapp", "service", "DocumentService.js"), {
  "abap/to/fiori/system/util/Constants": Constants
});

function createService(options = {}) {
  return new DocumentService({
    getServiceUrl() {
      return "/sap/opu/odata4/sap/zui_mig_analysis_o4/srvd/sap/zui_mig_analysis/0001/?sap-client=324";
    }
  }, options);
}

function createDownloadStubs() {
  const calls = {
    createObjectURL: 0,
    revokeObjectURL: 0,
    click: 0,
    download: ""
  };
  const document = {
    body: {
      appendChild() {},
      removeChild() {}
    },
    createElement() {
      return {
        style: {},
        click() {
          calls.click += 1;
        },
        set download(value) {
          calls.download = value;
        },
        get download() {
          return calls.download;
        }
      };
    }
  };
  const URL = {
    createObjectURL() {
      calls.createObjectURL += 1;
      return "blob:test";
    },
    revokeObjectURL(value) {
      assert.equal(value, "blob:test");
      calls.revokeObjectURL += 1;
    }
  };

  return { calls, document, URL };
}

test("buildExportPath builds a dynamic OData stream path", () => {
  const service = createService();

  assert.equal(
    service.buildExportPath({
      reportType: "ZTEST_ABAP_PARSER_V2",
      fileFormat: "X",
      exportSection: "ALL"
    }),
    "/ExportResult(ReportType='ZTEST_ABAP_PARSER_V2',FileFormat='X',ExportSection='ALL')/Content"
  );
});

test("buildExportPath escapes single quotes for OData key predicates", () => {
  const service = createService();

  assert.equal(
    service.buildExportPath({
      reportType: "Z'TEST",
      fileFormat: "P",
      exportSection: "OVERVIEW"
    }),
    "/ExportResult(ReportType='Z''TEST',FileFormat='P',ExportSection='OVERVIEW')/Content"
  );
});

test("file format mappings return expected mime types and extensions", () => {
  const service = createService({
    now: () => new Date(2026, 7, 5, 10, 30, 0)
  });

  assert.equal(service.getFallbackMimeType("X"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(service.getFallbackMimeType("P"), "application/pdf");
  assert.equal(service.getFallbackMimeType("C"), "text/csv;charset=utf-8");
  assert.equal(service.getFallbackFileName({ reportType: "ZREP", fileFormat: "X", exportSection: "RECOMMEN" }), "ZREP_RECOMMEN_20260805_103000.xlsx");
  assert.equal(service.getFallbackFileName({ reportType: "ZREP", fileFormat: "P", exportSection: "OVERVIEW" }), "ZREP_OVERVIEW_20260805_103000.pdf");
  assert.equal(service.getFallbackFileName({ reportType: "ZREP", fileFormat: "C", exportSection: "UI_FILTER" }), "ZREP_UI_FILTER_20260805_103000.csv");
});

test("all supported export sections are accepted and invalid sections are rejected", () => {
  const service = createService();
  const sections = Object.values(Constants.exportSection);

  assert.equal(sections.length, 9);
  for (const exportSection of sections) {
    assert.doesNotThrow(() => service.buildExportPath({
      reportType: "ZREP",
      fileFormat: "X",
      exportSection
    }));
  }

  assert.throws(() => service.buildExportPath({
    reportType: "ZREP",
    fileFormat: "X",
    exportSection: "BAD"
  }), /Unsupported export section/);
});

test("empty report type and invalid file format are rejected before fetch", async () => {
  let fetchCalls = 0;
  const service = createService({
    fetch() {
      fetchCalls += 1;
    }
  });

  await assert.rejects(() => service.downloadExport({
    reportType: "",
    fileFormat: "X",
    exportSection: "ALL"
  }), /Program name is required/);
  await assert.rejects(() => service.downloadExport({
    reportType: "ZREP",
    fileFormat: "BAD",
    exportSection: "ALL"
  }), /Unsupported export file format/);
  assert.equal(fetchCalls, 0);
});

test("HTTP errors read OData JSON error and do not create downloads", async () => {
  const stubs = createDownloadStubs();
  const service = createService({
    ...stubs,
    fetch: async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: { message: "Report not found" } })
    })
  });

  await assert.rejects(() => service.downloadExport({
    reportType: "ZREP",
    fileFormat: "X",
    exportSection: "ALL"
  }), /HTTP 404: Report not found/);
  assert.equal(stubs.calls.createObjectURL, 0);
});

test("successful download uses Content-Disposition filename and revokes object URL", async () => {
  const stubs = createDownloadStubs();
  let requestedUrl = "";
  const service = createService({
    ...stubs,
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        headers: {
          get(name) {
            if (name === "Content-Type") {
              return "application/pdf";
            }
            if (name === "Content-Disposition") {
              return "attachment; filename=\"backend.pdf\"";
            }
            return "";
          }
        },
        blob: async () => new Blob(["pdf"], { type: "application/pdf" })
      };
    }
  });

  const result = await service.downloadExport({
    reportType: "ZREP",
    fileFormat: "P",
    exportSection: "OVERVIEW"
  });

  assert.match(requestedUrl, /ExportResult\(ReportType='ZREP',FileFormat='P',ExportSection='OVERVIEW'\)\/Content\?sap-client=324$/);
  assert.equal(result.fileName, "backend.pdf");
  assert.equal(stubs.calls.click, 1);
  assert.equal(stubs.calls.createObjectURL, 1);
  assert.equal(stubs.calls.revokeObjectURL, 1);
});

test("successful download falls back to generated filename", async () => {
  const stubs = createDownloadStubs();
  const service = createService({
    ...stubs,
    now: () => new Date(2026, 7, 5, 10, 30, 0),
    fetch: async () => ({
      ok: true,
      headers: {
        get() {
          return "";
        }
      },
      blob: async () => new Blob(["a,b"], { type: "text/csv" })
    })
  });

  const result = await service.downloadExport({
    reportType: "Z/REP",
    fileFormat: "C",
    exportSection: "MESSAGE"
  });

  assert.equal(result.fileName, "Z_REP_MESSAGE_20260805_103000.csv");
  assert.equal(stubs.calls.download, result.fileName);
});

test("prepare selected export executes bound action with property keys", async () => {
  const calls = [];
  const service = new DocumentService({
    bindContext(pathValue) {
      calls.push(["bindContext", pathValue]);
      return {
        setParameter(name, value) {
          calls.push(["setParameter", name, value]);
        },
        execute(groupId) {
          calls.push(["execute", groupId]);
          return Promise.resolve();
        },
        getBoundContext() {
          return {
            requestObject: async () => ({ DownloadUrl: "/download/1", FileName: "x.xlsx", MimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
          };
        }
      };
    }
  });

  const result = await service.prepareSelectedExport("11111111-2222-3333-4444-555555555555", {
    fileFormat: "X",
    exportSection: "UI_FILTER",
    selectedFields: ["FieldName", "DataElement"]
  });

  assert.equal(calls[0][0], "bindContext");
  assert.match(calls[0][1], /\/Analyses\(11111111-2222-3333-4444-555555555555\)\/com\.sap\.gateway\.srvd\.zui_mig_analysis\.v0001\.PrepareSelectedExport\(\.\.\.\)$/);
  assert.deepEqual(calls.slice(1, 5), [
    ["setParameter", "FileFormat", "X"],
    ["setParameter", "ExportSection", "UI_FILTER"],
    ["setParameter", "SelectedFields", "FieldName,DataElement"],
    ["execute", "$direct"]
  ]);
  assert.equal(result.DownloadUrl, "/download/1");
});

test("selected export validates selected fields and parameter lengths", async () => {
  const service = createService();

  assert.throws(() => service.prepareSelectedExport("A", {
    fileFormat: "XX",
    exportSection: "UI_FILTER",
    selectedFields: ["FieldName"]
  }), /Unsupported export file format|FileFormat/);

  assert.throws(() => service.prepareSelectedExport("A", {
    fileFormat: "X",
    exportSection: "THIS_SECTION_CODE_IS_TOO_LONG",
    selectedFields: ["FieldName"]
  }), /Unsupported export section|ExportSection/);

  assert.throws(() => service.prepareSelectedExport("A", {
    fileFormat: "X",
    exportSection: "UI_FILTER",
    selectedFields: []
  }), /Select at least one column/);
});

test("download selected export uses backend DownloadUrl and filename", async () => {
  const stubs = createDownloadStubs();
  let requestedUrl = "";
  const service = new DocumentService({
    bindContext() {
      return {
        setParameter() {},
        execute: async () => undefined,
        getBoundContext() {
          return {
            requestObject: async () => ({
              DownloadUrl: "/sap/export/url",
              FileName: "backend.xlsx",
              MimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            })
          };
        }
      };
    }
  }, {
    ...stubs,
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        headers: { get: () => "" },
        blob: async () => new Blob(["xlsx"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      };
    }
  });

  const result = await service.downloadSelectedExport("11111111-2222-3333-4444-555555555555", {
    fileFormat: "X",
    exportSection: "UI_FILTER",
    selectedFields: ["FieldName"]
  });

  assert.equal(requestedUrl, "/sap/export/url");
  assert.equal(result.fileName, "backend.xlsx");
  assert.equal(stubs.calls.click, 1);
});
