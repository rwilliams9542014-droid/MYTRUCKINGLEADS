import assert from "assert";
import { sendContactRequestEmail, sendTestEmail } from "../../services/emailService.js";

const RESEND_API_URL = "https://api.resend.com/emails";

function clearSmtpEnv() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
}

async function testContactRequestUsesResend() {
  const requests = [];
  const originalFetch = global.fetch;
  const originalEnv = {
    APP_NAME: process.env.APP_NAME,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM
  };

  try {
    process.env.APP_NAME = "MyTruckingLeads";
    process.env.EMAIL_PROVIDER = "auto";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";
    delete process.env.RESEND_FROM_NAME;
    clearSmtpEnv();

    global.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ id: "email_123" });
        }
      };
    };

    const result = await sendContactRequestEmail({
      toEmail: "mytruckingleads@gmail.com",
      name: "Ron Test",
      email: "prospect@example.com",
      phone: "5551234567",
      agency: "Test Agency",
      message: "Need help with Florida leads.",
      submittedAt: "2026-05-20T12:00:00.000Z",
      sourcePage: "https://www.mytruckingleads.com"
    });

    assert.strictEqual(result.success, true);
    assert.match(String(result.message), /Contact request sent successfully/i);
    assert.strictEqual(requests.length, 1, "expected one Resend API call");
    assert.strictEqual(requests[0].url, RESEND_API_URL);
    assert.strictEqual(requests[0].options.method, "POST");
    assert.strictEqual(requests[0].options.headers.Authorization, "Bearer re_test_key");

    const payload = JSON.parse(requests[0].options.body);
    assert.strictEqual(payload.from, "MyTruckingLeads <noreply@example.com>");
    assert.deepStrictEqual(payload.to, ["mytruckingleads@gmail.com"]);
    assert.deepStrictEqual(payload.reply_to, ["prospect@example.com"]);
    assert.match(String(payload.subject), /Ron Test/);
    assert.match(String(payload.html), /New Contact Request/);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function testTestEmailUsesResend() {
  const requests = [];
  const originalFetch = global.fetch;
  const originalEnv = {
    APP_NAME: process.env.APP_NAME,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM
  };

  try {
    process.env.APP_NAME = "MyTruckingLeads";
    process.env.EMAIL_PROVIDER = "auto";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "noreply@example.com";
    delete process.env.RESEND_FROM_NAME;
    clearSmtpEnv();

    global.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ id: "email_456" });
        }
      };
    };

    const result = await sendTestEmail("test@example.com");

    assert.strictEqual(result.success, true);
    assert.match(String(result.message), /Test email sent successfully/i);
    assert.strictEqual(requests.length, 1, "expected one Resend API call");

    const payload = JSON.parse(requests[0].options.body);
    assert.deepStrictEqual(payload.to, ["test@example.com"]);
    assert.match(String(payload.subject), /Test Email/);
    assert.match(String(payload.html), /email configuration is working correctly/i);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function run() {
  await testContactRequestUsesResend();
  await testTestEmailUsesResend();
  console.log("resend email provider tests passed");
}

run().catch((err) => {
  console.error("resend email provider tests failed:", err);
  process.exit(1);
});
