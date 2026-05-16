import { query } from "../config/db.js";
import { getPlanAccessSummary, hasActiveSubscription, normalizePlan } from "../utils/planAccess.js";
import { getTrialUsage } from "../utils/trialAccess.js";

export async function getMySubscription(req, res) {
  const access = getPlanAccessSummary(req.user);

  res.json({
    userId: req.user.id,
    plan: access.plan,
    status: req.user.subscription_status || "inactive",
    active: hasActiveSubscription(req.user),
    subscriptionExpiresAt: req.user.subscription_expires_at || null,
    access,
    trialAccess: getTrialUsage(req.user)
  });
}

export async function updateLocalDevSubscriptionPlan(req, res) {
  if (process.env.NODE_ENV === "production" || process.env.LOCAL_DEV_FREE_ACCESS !== "true") {
    return res.status(404).json({ error: "Endpoint not found" });
  }

  const plan = normalizePlan(req.body?.plan);
  if (!["basic", "pro", "premium", "trial"].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  await query(
    "UPDATE users SET plan = $1, subscription_status = 'active', updated_at = NOW() WHERE id = $2",
    [plan, req.user.id]
  );

  const updatedUser = {
    ...req.user,
    plan,
    subscription_status: "active"
  };

  res.json({
    userId: req.user.id,
    plan,
    status: "active",
    active: true,
    access: getPlanAccessSummary(updatedUser)
  });
}
