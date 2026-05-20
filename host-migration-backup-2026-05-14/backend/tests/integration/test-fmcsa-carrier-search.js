import assert from "assert";

function createResponse() {
  return {
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

async function loadControllerWithoutWebKey() {
  const originalWebKey = process.env.FMCSA_WEBKEY;
  delete process.env.FMCSA_WEBKEY;

  try {
    return await import(`../../controllers/fmcsaController.js?case=${Date.now()}`);
  } finally {
    if (originalWebKey === undefined) {
      delete process.env.FMCSA_WEBKEY;
    } else {
      process.env.FMCSA_WEBKEY = originalWebKey;
    }
  }
}

async function testMissingLookupForwardsValidationError(searchFmcsaCarrier) {
  const req = {
    query: {}
  };
  const res = createResponse();
  let forwardedError = null;

  await searchFmcsaCarrier(req, res, (err) => {
    forwardedError = err;
  });

  assert(forwardedError, "missing lookup should forward a validation error");
  assert.strictEqual(forwardedError.message, "dot or mc query parameter is required");
  assert.strictEqual(res.body, null, "response should not be sent for validation errors");
}

async function testMissingWebKeyReturns503(searchFmcsaCarrier) {
  const req = {
    query: {
      dot: "3637136"
    }
  };
  const res = createResponse();
  let forwardedError = null;

  await searchFmcsaCarrier(req, res, (err) => {
    forwardedError = err;
  });

  assert.strictEqual(forwardedError, null, "missing webKey should not forward an error");
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body?.success, false);
  assert.match(String(res.body?.error || ""), /webkey is not configured/i);
}

async function run() {
  const { searchFmcsaCarrier } = await loadControllerWithoutWebKey();
  await testMissingLookupForwardsValidationError(searchFmcsaCarrier);
  await testMissingWebKeyReturns503(searchFmcsaCarrier);
  console.log("fmcsa carrier search tests passed");
}

run().catch((err) => {
  console.error("fmcsa carrier search tests failed:", err);
  process.exit(1);
});
