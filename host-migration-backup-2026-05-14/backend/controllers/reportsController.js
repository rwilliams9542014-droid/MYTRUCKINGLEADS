/**
 * Reports Controller
 * 
 * Provides analytics data for the Reports dashboard
 * Includes subscription metrics and account activity
 */

import { query } from "../config/db.js";
import { ValidationError, NotFoundError } from "../middleware/errorHandler.js";

/**
 * Get subscription analytics for the current user
 */
export async function getSubscriptionAnalytics(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // Get user's current subscription info
    const userResult = await query(
      `SELECT plan, subscription_status, subscription_expires_at, created_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = userResult.rows[0];
    
    // Calculate days remaining on current subscription
    let daysRemaining = null;
    let percentageRemaining = null;
    if (user.subscription_expires_at) {
      const expiresDate = new Date(user.subscription_expires_at);
      const today = new Date();
      const diffTime = expiresDate - today;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Calculate percentage of subscription period remaining (assume 30-day billing cycle)
      percentageRemaining = Math.max(0, (daysRemaining / 30) * 100);
    }

    // Get plan history (all plans user has had)
    const historyResult = await query(
      `SELECT plan, updated_at FROM users 
       WHERE id = $1 
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get billing events (payment attempts)
    // For now, we'll show current status
    const billingStatus = {
      currentPlan: user.plan,
      subscriptionStatus: user.subscription_status || "inactive",
      daysRemaining: daysRemaining,
      percentageRemaining: percentageRemaining,
      expiresAt: user.subscription_expires_at,
      accountCreatedAt: user.created_at
    };

    res.json({
      currentPlan: billingStatus.currentPlan,
      subscriptionStatus: billingStatus.subscriptionStatus,
      daysRemaining: billingStatus.daysRemaining,
      percentageRemaining: billingStatus.percentageRemaining,
      expiresAt: billingStatus.expiresAt,
      planHistory: historyResult.rows.map(row => ({
        plan: row.plan,
        date: row.updated_at
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get account activity analytics
 */
export async function getAccountActivity(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // Get user info
    const userResult = await query(
      `SELECT name, email, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = userResult.rows[0];

    // Get lead counts by status
    const leadsResult = await query(
      `SELECT status, COUNT(*) as count 
       FROM leads 
       WHERE user_id = $1 
       GROUP BY status
       ORDER BY count DESC`,
      [userId]
    );

    const leadsByStatus = {};
    let totalLeads = 0;
    leadsResult.rows.forEach(row => {
      leadsByStatus[row.status] = parseInt(row.count);
      totalLeads += parseInt(row.count);
    });

    // Get recent lead activity
    const recentLeadsResult = await query(
      `SELECT id, carrier_name, status, created_at, updated_at 
       FROM leads 
       WHERE user_id = $1 
       ORDER BY updated_at DESC
       LIMIT 5`,
      [userId]
    );

    // Calculate account age in days
    const accountCreatedDate = new Date(user.created_at);
    const today = new Date();
    const accountAgeDays = Math.floor((today - accountCreatedDate) / (1000 * 60 * 60 * 24));
    const accountAgeMonths = Math.floor(accountAgeDays / 30);

    // Get last activity date
    const lastActivityResult = await query(
      `SELECT MAX(updated_at) as last_activity 
       FROM leads 
       WHERE user_id = $1`,
      [userId]
    );

    const lastActivity = lastActivityResult.rows[0]?.last_activity || user.created_at;

    res.json({
      accountInfo: {
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
        accountAgeDays: accountAgeDays,
        accountAgeMonths: accountAgeMonths,
        lastActivity: lastActivity
      },
      leadMetrics: {
        totalLeads: totalLeads,
        byStatus: leadsByStatus
      },
      recentActivity: recentLeadsResult.rows.map(row => ({
        id: row.id,
        carrierName: row.carrier_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get combined dashboard summary
 */
export async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // Get subscription info
    const userResult = await query(
      `SELECT plan, subscription_status, subscription_expires_at, created_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = userResult.rows[0];

    // Get lead count
    const leadCountResult = await query(
      `SELECT COUNT(*) as total FROM leads WHERE user_id = $1`,
      [userId]
    );
    const totalLeads = parseInt(leadCountResult.rows[0].total);

    // Get insurance expiration alerts
    const insuranceResult = await query(
      `SELECT COUNT(*) as count 
       FROM leads 
       WHERE user_id = $1 
       AND insurance_expiration IS NOT NULL
       AND insurance_expiration <= CURRENT_DATE + INTERVAL '30 days'`,
      [userId]
    );
    const upcomingExpirations = parseInt(insuranceResult.rows[0].count);

    // Calculate subscription value
    const planPrices = {
      basic: 79,
      pro: 199,
      premium: 499,
      starter: 79,
      agency: 499
    };

    const monthlyValue = planPrices[user.plan] || 0;

    res.json({
      subscription: {
        currentPlan: user.plan,
        status: user.subscription_status || "inactive",
        monthlyValue: monthlyValue,
        expiresAt: user.subscription_expires_at
      },
      activity: {
        totalLeads: totalLeads,
        upcomingExpirations: upcomingExpirations,
        accountAge: Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (err) {
    next(err);
  }
}
