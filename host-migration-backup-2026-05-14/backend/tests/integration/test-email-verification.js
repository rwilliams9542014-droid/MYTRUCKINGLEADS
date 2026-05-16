import dotenv from "dotenv";
import { verifyEmailAddress } from "../../services/emailVerificationService.js";

dotenv.config({ path: "./.env" });

const email = process.argv[2] || "fleetcompliance@ups.com";

const result = await verifyEmailAddress(email);

console.log(JSON.stringify({
  email: result.email,
  verified: result.verified,
  status: result.status,
  provider: result.provider,
  confidence: result.confidence,
  reason: result.reason,
  checks: result.checks
}, null, 2));
