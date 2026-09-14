const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("manifest exposes the launchpad intent", () => {
  const manifest = JSON.parse(read("webapp/manifest.json"));
  const inbound = manifest["sap.app"].crossNavigation.inbounds.display;

  assert.equal(inbound.semanticObject, "ABAPMigrationAnalyzer");
  assert.equal(inbound.action, "display");
  assert.equal(manifest["sap.app"].id, "abap.to.fiori.system");
});

test("ABAP deployment uses environment credentials and strict certificate validation", () => {
  const config = read("ui5-deploy-abap.yaml");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(config, /name:\s*deploy-to-abap/);
  assert.match(config, /url:\s*env:UI5_MIDDLEWARE_SIMPLE_PROXY_BASEURI/);
  assert.match(config, /client:\s*["']324["']/);
  assert.match(config, /ignoreCertErrors:\s*false/);
  assert.match(config, /username:\s*env:UI5_MIDDLEWARE_SIMPLE_PROXY_USERNAME/);
  assert.match(config, /password:\s*env:UI5_MIDDLEWARE_SIMPLE_PROXY_PASSWORD/);
  assert.doesNotMatch(config, /password:\s*(?!env:)[^\s]+/);
  assert.equal(packageJson.devDependencies["@sap/ux-ui5-tooling"], "^1.32.0");
  assert.match(packageJson.scripts["deploy:abap"], /fiori deploy/);
});

test("ABAP deployment retains explicit package and transport placeholders", () => {
  const config = read("ui5-deploy-abap.yaml");

  assert.match(config, /package:\s*REPLACE_WITH_ABAP_PACKAGE/);
  assert.match(config, /transport:\s*REPLACE_WITH_TRANSPORT/);
});
