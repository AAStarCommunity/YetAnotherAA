// CJS shim for the ESM-only `uuid` package so ts-jest (commonjs) can load the
// full AppModule in e2e tests without transforming node_modules ESM. Backed by
// Node's crypto.randomUUID — good enough for tests that don't assert on the id.
const { randomUUID } = require("crypto");
module.exports = { v4: () => randomUUID(), v1: () => randomUUID() };
