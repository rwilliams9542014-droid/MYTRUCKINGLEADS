import assert from "assert";
import { submitContactRequest } from "../../controllers/contactController.js";

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
    CONTACT_REQUEST_TO: process.env.CONTACT_REQUEST_TO
  };

  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  process.env.CONTACT_REQUEST_TO = "rwilliams9542014@gmail.com";

  const req = {
    body: {
      name: "Ron Test",
      email: "rwilliams9542014@gmail.com",
      phone: "5551234567",
      agency: "Test Agency",
      message: "Need access for Florida trucking leads.",
      website: ""
    },
    headers: { host: "www.mytruckingleads.com" },
    protocol: "https",
    originalUrl: "/api/contact-request",
    get(header) {
      return this.headers[String(header || "").toLowerCase()];
    }
  };
  const res = createResponse();
  let forwardedError = null;

  try {
    await submitContactRequest(req, res, (err) => {
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

  assert.strictEqual(forwardedError, null, "request should not forward an error when email is unavailable");
  assert.strictEqual(res.statusCode, 503, "request should return a 503 when SMTP is not configured");
  assert.strictEqual(res.body?.success, false, "response should indicate failure");
  assert.match(String(res.body?.error || ""), /email service not configured/i);
}

async function testHoneypotSucceedsQuietly() {
  const req = {
    body: {
      name: "Spam Bot",
      email: "spam@example.com",
      message: "This should not matter",
      website: "filled"
    }
  };
  const res = createResponse();
  let forwardedError = null;

  await submitContactRequest(req, res, (err) => {
    forwardedError = err;
  });

  assert.strictEqual(forwardedError, null, "honeypot submissions should not forward an error");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { success: true, message: "Request received." });
}

async function testInvalidEmailForwardsValidationError() {
  const req = {
    body: {
      name: "Ron Test",
      email: "not-an-email",
      message: "Need help with trucking leads.",
      website: ""
    }
  };
  const res = createResponse();
  let forwardedError = null;

  await submitContactRequest(req, res, (err) => {
    forwardedError = err;
  });

  assert(forwardedError, "invalid input should forward a validation error");
  assert.strictEqual(forwardedError.message, "Invalid email format");
  assert.strictEqual(res.body, null, "response should not be sent when validation fails");
}

async function run() {
  await testMissingEmailConfigReturns503();
  await testHoneypotSucceedsQuietly();
  await testInvalidEmailForwardsValidationError();
  console.log("contact request tests passed");
}

run().catch((err) => {
  console.error("contact request tests failed:", err);
  process.exit(1);
});
