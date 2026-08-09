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

class Sorter {
  constructor(pathValue, descending) {
    this.path = pathValue;
    this.descending = descending;
  }
}

const ProgramValueHelpService = loadUi5Module(path.join(root, "webapp", "service", "ProgramValueHelpService.js"), {
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/util/Constants": Constants
});

test("program value help reads ProgramValueHelp with search and ProgramName select", async () => {
  let captured;
  const service = new ProgramValueHelpService({
    bindList(pathValue, context, sorters, filters, parameters) {
      captured = { pathValue, sorters, filters, parameters };
      return {
        requestContexts(start, length) {
          captured.start = start;
          captured.length = length;
          return Promise.resolve([
            { getObject: () => ({ ProgramName: "ZFOO" }) },
            { getObject: () => ({ ProgramName: "ZBAR" }) }
          ]);
        }
      };
    }
  });

  const result = await service.searchPrograms(" zfoo ", 25);

  assert.deepEqual(result, [{ ProgramName: "ZFOO" }, { ProgramName: "ZBAR" }]);
  assert.equal(captured.pathValue, "/ProgramValueHelp");
  assert.equal(captured.parameters.$select, "ProgramName");
  assert.equal(captured.parameters.$search, "ZFOO");
  assert.equal(captured.parameters.$$groupId, "$direct");
  assert.equal(captured.filters.length, 0);
  assert.equal(captured.sorters[0].path, "ProgramName");
  assert.equal(captured.start, 0);
  assert.equal(captured.length, 25);
});

test("program value help omits $search for initial load", async () => {
  let parameters;
  const service = new ProgramValueHelpService({
    bindList(pathValue, context, sorters, filters, bindingParameters) {
      parameters = bindingParameters;
      return {
        requestContexts() {
          return Promise.resolve([]);
        }
      };
    }
  });

  await service.searchPrograms("", 50);

  assert.equal(Object.prototype.hasOwnProperty.call(parameters, "$search"), false);
});
