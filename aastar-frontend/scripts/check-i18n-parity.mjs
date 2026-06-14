/**
 * i18n locale key-parity check.
 *
 * Fails (exit 1) if en.json and zh.json don't have an identical set of leaf
 * keys, so EN/ZH translations can't silently drift apart. Run in CI and via
 * `npm run i18n:check -w aastar-frontend`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "../lib/i18n/locales");
const load = file => JSON.parse(readFileSync(join(localesDir, file), "utf8"));

/** Flatten to dotted leaf-key paths. */
function leafKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v) ? leafKeys(v, path) : [path];
  });
}

const en = new Set(leafKeys(load("en.json")));
const zh = new Set(leafKeys(load("zh.json")));

const missingInZh = [...en].filter(k => !zh.has(k)).sort();
const missingInEn = [...zh].filter(k => !en.has(k)).sort();

if (missingInZh.length || missingInEn.length) {
  if (missingInZh.length) console.error(`Missing in zh.json (${missingInZh.length}):\n  ${missingInZh.join("\n  ")}`);
  if (missingInEn.length) console.error(`Missing in en.json (${missingInEn.length}):\n  ${missingInEn.join("\n  ")}`);
  console.error("\ni18n locale parity check FAILED — keep en.json and zh.json in sync.");
  process.exit(1);
}

console.log(`i18n locale parity OK — ${en.size} keys match across en/zh.`);
