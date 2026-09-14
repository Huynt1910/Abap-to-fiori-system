const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("local secret template is safe and the real env file is ignored", () => {
  const gitignore = read(".gitignore").split(/\r?\n/).map((line) => line.trim());
  const example = read(".env.example");

  assert.ok(gitignore.includes(".env"));
  assert.match(example, /^UI5_MIDDLEWARE_SIMPLE_PROXY_PASSWORD=\s*$/m);
  assert.match(example, /^UI5_MIDDLEWARE_SIMPLE_PROXY_STRICT_SSL=true$/m);
  assert.doesNotMatch(example, /ZAISO_BOT_US|DEV-030|DEV-130/i);
});

test("production AppRouter routes require XSUAA and use the S40 destination", () => {
  for (const relativePath of ["xs-app.json", "approuter/xs-app.json"]) {
    const config = JSON.parse(read(relativePath));
    const sapRoute = config.routes.find((route) => route.destination === "S40");
    const userRoute = config.routes.find((route) => route.service === "sap-approuter-userapi");
    const appRoute = config.routes[config.routes.length - 1];

    assert.ok(sapRoute, `${relativePath}: S40 route`);
    assert.equal(sapRoute.authenticationType, "xsuaa");
    assert.equal(sapRoute.scope, "$XSAPPNAME.AnalysisRead");
    assert.ok(userRoute, `${relativePath}: current user route`);
    assert.equal(userRoute.authenticationType, "xsuaa");
    assert.equal(appRoute.authenticationType, "xsuaa");
  }
});

test("production config has connectivity and contains no fixed SAP credentials", () => {
  const production = [
    read("mta.yaml"),
    read("xs-security.json"),
    read("xs-app.json"),
    read("approuter/xs-app.json")
  ].join("\n");

  assert.match(production, /service:\s*connectivity/);
  assert.doesNotMatch(production, /strictSSL\s*:\s*false/i);
  assert.doesNotMatch(production, /SAP_(?:USERNAME|PASSWORD)|ZAISO_BOT_US|DEV-030|DEV-130/i);
});

test("frontend mutation payloads do not set audit identity fields", () => {
  const sourceDirectories = ["service", "controller"];
  const sources = sourceDirectories.flatMap((directory) => fs.readdirSync(path.join(root, "webapp", directory))
    .filter((name) => name.endsWith(".js"))
    .map((name) => read(path.join("webapp", directory, name))))
    .join("\n");

  assert.doesNotMatch(sources, /\b(?:CreatedBy|LastChangedBy)\s*:/);
});

test("installed simpleproxy version supports server-side env credentials", () => {
  const packageJson = JSON.parse(read("package.json"));
  const proxySource = read(path.join("node_modules", "ui5-middleware-simpleproxy", "lib", "proxy.js"));

  assert.equal(packageJson.devDependencies["ui5-middleware-simpleproxy"], "3.7.1");
  assert.match(proxySource, /UI5_MIDDLEWARE_SIMPLE_PROXY_USERNAME/);
  assert.match(proxySource, /UI5_MIDDLEWARE_SIMPLE_PROXY_PASSWORD/);
});
