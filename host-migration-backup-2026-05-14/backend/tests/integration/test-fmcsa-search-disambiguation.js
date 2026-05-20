import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { searchCarrierIntelligence } from "../../controllers/carrierIntelligenceController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, "../../public");

function createResponse() {
  return {
    locals: {},
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function runCarrierSearch(query = {}) {
  const req = {
    query
  };
  const res = createResponse();
  await searchCarrierIntelligence(req, res);
  return res;
}

async function collectPublicFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPublicFiles(fullPath));
      continue;
    }
    if (/\.(?:js|html)$/i.test(entry.name)) files.push(fullPath);
  }

  return files;
}

async function testDotLookupStillResolvesExactDot() {
  const res = await runCarrierSearch({ dot: "3637136", limit: "1" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(Boolean(res.body?.multipleMatches), false);
  assert.strictEqual(String(res.body?.results?.[0]?.dot || ""), "3637136");
}

async function testMcLookupResolvesExpectedDot() {
  const res = await runCarrierSearch({ mc: "MC1248402", limit: "1" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(Boolean(res.body?.multipleMatches), false);
  assert.strictEqual(String(res.body?.results?.[0]?.dot || ""), "3637136");
}

async function testAmbiguousTrueTransportationReturnsMultipleCandidates() {
  const res = await runCarrierSearch({ name: "TRUE TRANSPORTATION LLC", limit: "5" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(Boolean(res.body?.multipleMatches), true);
  assert(Array.isArray(res.body?.results), "ambiguous name search should return candidate results");
  assert(res.body.results.length >= 2, "ambiguous name search should return multiple candidates");
  assert(
    res.body.results.some((candidate) => String(candidate.dot || candidate.dotNumber || "") === "3637136"),
    "candidate list should include DOT 3637136"
  );
}

async function testFrontendDoesNotExposeFmcsaWebKey() {
  const publicFiles = await collectPublicFiles(publicRoot);
  const forbiddenPatterns = [
    /FMCSA_WEBKEY/i,
    /\bwebKey\b/i,
    /mobile\.fmcsa\.dot\.gov/i,
    /qc\/services/i
  ];

  for (const file of publicFiles) {
    const contents = await fs.readFile(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert(
        !pattern.test(contents),
        `frontend file should not expose FMCSA secrets or QCMobile endpoints: ${path.relative(publicRoot, file)} matched ${pattern}`
      );
    }
  }
}

async function run() {
  await testDotLookupStillResolvesExactDot();
  await testMcLookupResolvesExpectedDot();
  await testAmbiguousTrueTransportationReturnsMultipleCandidates();
  await testFrontendDoesNotExposeFmcsaWebKey();
  console.log("FMCSA search disambiguation tests passed");
}

run().catch((err) => {
  console.error("FMCSA search disambiguation tests failed:", err);
  process.exit(1);
});
