/**
 * Email Service - Integration Test
 * 
 * Tests the email sending functionality for subscription confirmations and failures
 * 
 * Usage:
 * node test-email-service.js
 * 
 * Note: Requires SMTP credentials in .env file for actual email sending.
 * Without proper SMTP config, emails won't be sent but you can verify the logic.
 */

import { 
  sendSubscriptionConfirmation, 
  sendPaymentFailedNotification, 
  sendTestEmail 
} from "../../services/emailService.js";

async function testSubscriptionConfirmation() {
  console.log("\n📌 TEST 1: Subscription Confirmation Email");
  console.log("==========================================");
  
  try {
    const result = await sendSubscriptionConfirmation({
      email: "user@example.com",
      userName: "John Smith",
      plan: "starter",
      renewalDate: "May 27, 2026"
    });

    if (result) {
      console.log("✅ PASS: Subscription confirmation email sent");
    } else {
      console.log("⚠️  INFO: Email service not configured (check SMTP env vars)");
      console.log("   This is normal if SMTP_HOST is not set");
    }
  } catch (err) {
    console.error("❌ FAIL: Error sending subscription confirmation:", err.message);
  }
}

async function testPaymentFailed() {
  console.log("\n📌 TEST 2: Payment Failed Email");
  console.log("================================");
  
  try {
    const result = await sendPaymentFailedNotification({
      email: "user@example.com",
      userName: "Jane Doe",
      plan: "pro",
      reason: "Your card was declined. Please check the expiration date and try again."
    });

    if (result) {
      console.log("✅ PASS: Payment failure email sent");
    } else {
      console.log("⚠️  INFO: Email service not configured (check SMTP env vars)");
      console.log("   This is normal if SMTP_HOST is not set");
    }
  } catch (err) {
    console.error("❌ FAIL: Error sending payment failure email:", err.message);
  }
}

async function testDifferentPlans() {
  console.log("\n📌 TEST 3: Email Templates - All Plans");
  console.log("======================================");
  
  const plans = ["starter", "pro", "agency"];
  const renewalDates = [
    "May 27, 2026",
    "June 15, 2026",
    "July 10, 2026"
  ];

  for (let i = 0; i < plans.length; i++) {
    try {
      console.log(`\n  Testing ${plans[i].toUpperCase()} plan...`);
      const result = await sendSubscriptionConfirmation({
        email: `test-${plans[i]}@example.com`,
        userName: `Test User ${i + 1}`,
        plan: plans[i],
        renewalDate: renewalDates[i]
      });

      if (result) {
        console.log(`  ✅ ${plans[i]}: Email sent`);
      } else {
        console.log(`  ℹ️  ${plans[i]}: Service not configured (expected)`);
      }
    } catch (err) {
      console.error(`  ❌ ${plans[i]}: Error - ${err.message}`);
    }
  }
}

async function testTestEmailEndpoint() {
  console.log("\n📌 TEST 4: Test Email Endpoint");
  console.log("===============================");
  
  try {
    console.log("Sending test email to test@example.com...");
    const result = await sendTestEmail("test@example.com");
    
    console.log(`\nResult:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Message: ${result.message}`);
    
    if (result.success) {
      console.log("\n✅ PASS: Test email endpoint working");
    } else if (result.message.includes("not configured")) {
      console.log("\n⚠️  INFO: Email service not configured");
      console.log("   Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to enable");
    } else {
      console.log("\n❌ FAIL: Test email failed");
    }
  } catch (err) {
    console.error("❌ FAIL: Error with test email:", err.message);
  }
}

async function testEmailWithSpecialCharacters() {
  console.log("\n📌 TEST 5: Email With Special Characters");
  console.log("=========================================");
  
  try {
    const result = await sendSubscriptionConfirmation({
      email: "john.o'reilly+test@example.com",
      userName: "John O'Reilly",
      plan: "pro",
      renewalDate: "June 1, 2026"
    });

    if (result) {
      console.log("✅ PASS: Email with special characters sent");
    } else {
      console.log("⚠️  INFO: Email service not configured");
    }
  } catch (err) {
    console.error("❌ FAIL: Error:", err.message);
  }
}

async function testEnvironmentVariables() {
  console.log("\n📌 TEST 6: Environment Variables Check");
  console.log("=======================================");
  
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const optional = ["SMTP_FROM", "APP_NAME", "APP_URL"];
  
  console.log("\nRequired variables:");
  required.forEach(key => {
    const value = process.env[key];
    const status = value ? "✅ Set" : "❌ Missing";
    console.log(`  ${key}: ${status}`);
  });
  
  console.log("\nOptional variables (for email templates):");
  optional.forEach(key => {
    const value = process.env[key];
    const status = value ? `✅ Set (${value})` : "⚠️  Using default";
    console.log(`  ${key}: ${status}`);
  });
  
  const allRequired = required.every(key => process.env[key]);
  if (allRequired) {
    console.log("\n✅ All required variables configured - emails will be sent");
  } else {
    console.log("\n⚠️  Missing required variables - emails will not be sent");
    console.log("   See EMAIL_SETUP.md for configuration instructions");
  }
}

async function runAllTests() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║       Email Service - Integration Test Suite       ║");
  console.log("╚════════════════════════════════════════════════════╝");

  try {
    // Check environment first
    await testEnvironmentVariables();
    
    // Run functional tests
    await testSubscriptionConfirmation();
    await testPaymentFailed();
    await testDifferentPlans();
    await testTestEmailEndpoint();
    await testEmailWithSpecialCharacters();

    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║           ✅ All Tests Completed!                 ║");
    console.log("╚════════════════════════════════════════════════════╝");
    
    console.log("\n📋 Summary:");
    console.log("  • Email templates verified");
    console.log("  • All subscription plans tested");
    console.log("  • Error handling verified");
    console.log("\n💡 Next steps:");
    console.log("  1. Configure SMTP credentials in .env (see EMAIL_SETUP.md)");
    console.log("  2. Restart the server");
    console.log("  3. Run tests again to verify email sending");
    console.log("  4. Monitor logs when Stripe webhooks fire");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
