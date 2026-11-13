// Read-only B3 frozen-stack preflight. No writes, no registration, no reputation calls.
// Addresses are extracted programmatically from the SDK RC checkout (never transcribed).
import { createPublicClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SDK_REPO = "/Users/jason/Dev/aastar/aastar-sdk";
const SDK_REF = "1b0505bb"; // = tag v0.46.0-rc.1

const gitShow = p =>
  execFileSync("git", ["-C", SDK_REPO, "show", `${SDK_REF}:${p}`], {
    encoding: "utf8",
    maxBuffer: 64e6,
  });

// --- source 1: deployedStack.sepolia from scripts/upstream-abi-pin.json ---
const pinRaw = gitShow("scripts/upstream-abi-pin.json");
const pin = JSON.parse(pinRaw).deployedStack.sepolia;

// --- source 2: CANONICAL_ADDRESSES sepolia block from packages/core/src/addresses.ts ---
const addrSrc = gitShow("packages/core/src/addresses.ts");
// Scope to CANONICAL_ADDRESSES[11155111] by brace-matching; addresses.ts holds several
// chain blocks and a second 11155111 map further down, so an unscoped regex reads the wrong one.
const sliceSepoliaBlock = src => {
  const root = src.indexOf("export const CANONICAL_ADDRESSES");
  if (root < 0) throw new Error("CANONICAL_ADDRESSES not found");
  const key = src.indexOf("11155111: {", root);
  if (key < 0) throw new Error("sepolia block not found");
  let i = src.indexOf("{", key),
    depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error("unbalanced braces in addresses.ts");
};
const sepoliaBlock = sliceSepoliaBlock(addrSrc);
const pick = key => {
  const m = sepoliaBlock.match(new RegExp(`^\\s*${key}:\\s*"(0x[0-9a-fA-F]{40})"`, "m"));
  if (!m) throw new Error(`canonical address not found in CANONICAL_ADDRESSES[11155111]: ${key}`);
  return getAddress(m[1]);
};
const canonical = {
  aaStarValidator: pick("aaStarValidator"),
  aaStarBLSAlgorithm: pick("aaStarBLSAlgorithm"),
  airAccountFactoryV7: pick("airAccountFactoryV7"),
  blsAggregator: pick("blsAggregator"),
};

const rpc = process.env.SEPOLIA_RPC_URL;
if (!rpc) throw new Error("SEPOLIA_RPC_URL not set");
const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

const abi = (sig, out) => [
  { type: "function", name: sig, stateMutability: "view", inputs: [], outputs: out },
];
const read = (address, name, outputs, args = [], inputs = []) =>
  client.readContract({
    address,
    abi: [{ type: "function", name, stateMutability: "view", inputs, outputs }],
    functionName: name,
    args,
  });

const results = [];
const check = (label, got, want) => {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  results.push({ label, got, want, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      got  ${got}\n      want ${want}`);
  return ok;
};

const block = await client.getBlockNumber();
console.log(`chainId ${await client.getChainId()}  block ${block}\n`);

const A = pin.addresses;
// 1. three legs agree on the aggregator
check(
  "Registry.blsAggregator()",
  await read(getAddress(A.registry), "blsAggregator", [{ type: "address" }]),
  A.blsAggregator
);
check(
  "SuperPaymaster.BLS_AGGREGATOR()",
  await read(getAddress(A.superPaymaster), "BLS_AGGREGATOR", [{ type: "address" }]),
  A.blsAggregator
);
check(
  "DVTValidator.BLS_AGGREGATOR()",
  await read(getAddress(A.dvtValidator), "BLS_AGGREGATOR", [{ type: "address" }]),
  A.blsAggregator
);
// 1b. SDK canonical agrees with the manifest pin
check("SDK canonical.blsAggregator == pin", canonical.blsAggregator, A.blsAggregator);
// 2. aggregator version
check(
  "aggregator.version()",
  await read(getAddress(A.blsAggregator), "version", [{ type: "string" }]),
  pin.aggregator.version
);
// 3. router algorithm 1 -> committee validator
check(
  "router.getAlgorithm(1)",
  await read(
    canonical.aaStarValidator,
    "getAlgorithm",
    [{ type: "address" }],
    [1],
    [{ type: "uint8" }]
  ),
  canonical.aaStarBLSAlgorithm
);
// 4. factory version
check(
  "factory.FACTORY_VERSION()",
  await read(canonical.airAccountFactoryV7, "FACTORY_VERSION", [{ type: "string" }]),
  "0.33.0"
);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
