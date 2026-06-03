import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { submitPrivacyRequest } from "../../controllers/privacyController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function testMissingEmailConfigReturns503() {
  const originalEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    CONTACT_REQUEST_TO: process.env.CONTACT_REQUEST_TO,
    PRIVACY_REQUEST_TO: process.env.PRIVACY_REQUEST_TO
  };

  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  process.env.CONTACT_REQUEST_TO = "mytruckingleads@gmail.com";
  process.env.PRIVACY_REQUEST_TO = "mytruckingleads@gmail.com";

  const req = {
    body: {
      requestType: "export",
      name: "Ron Test",
      email: "mytruckingleads@gmail.com",
      accountEmail: "account@example.com",
      location: "Florida",
      details: "Please send me a copy of my account information.",
      website: ""
    },
    headers: { host: "www.mytruckingleads.com" },
    protocol: "https",
    originalUrl: "/api/privacy-request",
    get(header) {
      return this.headers[String(header || "").toLowerCase()];
    }
  };
  const res = createResponse();
  let forwardedError = null;

  try {
    await submitPrivacyRequest(req, res, (err) => {
      forwardedError = err;
    });
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  assert.strictEqual(forwardedError, null);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body?.success, false);
  assert.match(String(res.body?.error || ""), /email service not configured/i);
}

async function testHoneypotSucceedsQuietly() {
  const req = {
    body: {
      requestType: "deletion",
      name: "Spam Bot",
      email: "spam@example.com",
      details: "This should not matter",
      website: "filled"
    }
  };
  const res = createResponse();
  let forwardedError = null;

  await submitPrivacyRequest(req, res, (err) => {
    forwardedError = err;
  });

  assert.strictEqual(forwardedError, null);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { success: true, message: "Request received." });
}

async function testInvalidRequestTypeForwardsValidationError() {
  const req = {
    body: {
      requestType: "not-real",
      name: "Ron Test",
      email: "mytruckingleads@gmail.com",
      details: "Please help with my privacy request.",
      website: ""
    }
  };
  const res = createResponse();
  let forwardedError = null;

  await submitPrivacyRequest(req, res, (err) => {
    forwardedError = err;
  });

  assert(forwardedError, "invalid input should forward a validation error");
  assert.strictEqual(forwardedError.message, "Choose a valid privacy request type");
  assert.strictEqual(res.body, null);
}

async function testPrivacyPageContainsRequestForm() {
  const privacyPath = path.resolve(__dirname, "../../public/privacy.html");
  const html = await fs.readFile(privacyPath, "utf8");
  assert(html.includes('id="privacyRequestForm"'), "privacy page should include the request form");
  assert(html.includes("/api/privacy-request") || html.includes("privacy.js"), "privacy page should wire the request flow");
}

async function run() {
  await testMissingEmailConfigReturns503();
  await testHoneypotSucceedsQuietly();
  await testInvalidRequestTypeForwardsValidationError();
  await testPrivacyPageContainsRequestForm();
  console.log("privacy request tests passed");
}

run().catch((err) => {
  console.error("privacy request tests failed:", err);
  process.exit(1);
});
