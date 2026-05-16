/**
 * Settings Controller
 * 
 * Handles user account management, profile updates, and subscription management
 */

import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { ValidationError, NotFoundError, AuthenticationError } from "../middleware/errorHandler.js";
import { validateEmail, validatePassword, validateString } from "../utils/validators.js";

/**
 * Get current user profile
 */
export async function getUserProfile(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    const result = await query(
      `SELECT id, name, email, plan, subscription_status, subscription_expires_at, created_at 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      subscriptionStatus: user.subscription_status,
      subscriptionExpiresAt: user.subscription_expires_at,
      memberSince: user.created_at
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update user profile (name, email)
 */
export async function updateUserProfile(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    const { name, email } = req.body;

    // Validate inputs
    const validatedName = name ? validateString(name, "Name", 2, 100) : null;
    const validatedEmail = email ? validateEmail(email) : null;

    if (!validatedName && !validatedEmail) {
      return next(new ValidationError("At least one field (name or email) is required"));
    }

    // If email is being changed, check if it's already in use
    if (validatedEmail) {
      const existing = await query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [validatedEmail, userId]
      );

      if (existing.rows.length > 0) {
        return next(new ValidationError("Email already in use"));
      }
    }

    // Update user
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (validatedName) {
      updates.push(`name = $${paramCount}`);
      params.push(validatedName);
      paramCount++;
    }

    if (validatedEmail) {
      updates.push(`email = $${paramCount}`);
      params.push(validatedEmail);
      paramCount++;
    }

    updates.push(`updated_at = NOW()`);
    params.push(userId);

    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramCount} RETURNING id, name, email, plan`,
      params
    );

    const user = result.rows[0];

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Change user password
 */
export async function changePassword(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new ValidationError("Current password and new password are required"));
    }

    if (currentPassword === newPassword) {
      return next(new ValidationError("New password must be different from current password"));
    }

    // Validate new password
    const validatedPassword = validatePassword(newPassword);

    // Get user's current password hash
    const result = await query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = result.rows[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return next(new AuthenticationError("Current password is incorrect"));
    }

    // Hash new password
    const newHash = await bcrypt.hash(validatedPassword, 12);

    // Update password
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );

    res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get billing history
 */
export async function getBillingHistory(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // Get user's current subscription info
    const userResult = await query(
      `SELECT plan, subscription_status, subscription_expires_at, stripe_subscription_id 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = userResult.rows[0];

    // For now, return a simulated billing history
    // In production, this would come from Stripe's API
    const billingHistory = [];

    if (user.subscription_status === "active" && user.stripe_subscription_id) {
      // Create mock billing entries
      const today = new Date();
      const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twoMonthsAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

      const planPrices = {
        basic: 79,
        pro: 199,
        premium: 499,
        starter: 79,
        agency: 499
      };

      const amount = planPrices[user.plan] || 0;

      if (amount > 0) {
        billingHistory.push({
          id: "invoice_001",
          date: today,
          description: `${user.plan} subscription`,
          amount: amount,
          status: "paid",
          dueDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
        });

        billingHistory.push({
          id: "invoice_002",
          date: oneMonthAgo,
          description: `${user.plan} subscription`,
          amount: amount,
          status: "paid",
          dueDate: oneMonthAgo
        });

        billingHistory.push({
          id: "invoice_003",
          date: twoMonthsAgo,
          description: `${user.plan} subscription`,
          amount: amount,
          status: "paid",
          dueDate: twoMonthsAgo
        });
      }
    }

    res.json({
      currentPlan: user.plan,
      subscriptionStatus: user.subscription_status,
      nextBillingDate: user.subscription_expires_at,
      billingHistory: billingHistory
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // In production, this would cancel via Stripe API
    // For now, just update the database
    await query(
      `UPDATE users 
       SET plan = $1, stripe_subscription_id = NULL, subscription_status = $2, updated_at = NOW()
       WHERE id = $3`,
      ["basic", "canceled", userId]
    );

    res.json({
      success: true,
      message: "Subscription cancelled successfully",
      newPlan: "basic"
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete user account (with confirmation)
 */
export async function deleteAccount(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    const { password, confirmEmail } = req.body;

    if (!password || !confirmEmail) {
      return next(new ValidationError("Password and email confirmation are required"));
    }

    // Get user's email and password hash
    const result = await query(
      "SELECT email, password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return next(new NotFoundError("User not found"));
    }

    const user = result.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return next(new AuthenticationError("Password is incorrect"));
    }

    // Verify email confirmation
    if (confirmEmail !== user.email) {
      return next(new ValidationError("Email confirmation does not match"));
    }

    // Delete user and all associated data (CASCADE handled by database)
    await query(
      "DELETE FROM users WHERE id = $1",
      [userId]
    );

    res.json({
      success: true,
      message: "Account deleted permanently"
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get account preferences
 */
export async function getAccountPreferences(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    // For now, return default preferences
    // In future, could add a preferences column to users table
    res.json({
      emailNotifications: true,
      weeklyReports: true,
      insuranceAlerts: true,
      newLeadAlerts: true,
      marketingEmails: false
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update account preferences
 */
export async function updateAccountPreferences(req, res, next) {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return next(new ValidationError("User not authenticated"));
    }

    const preferences = req.body;

    // Validate that all fields are boolean
    const validFields = ["emailNotifications", "weeklyReports", "insuranceAlerts", "newLeadAlerts", "marketingEmails"];
    for (const field of Object.keys(preferences)) {
      if (!validFields.includes(field)) {
        return next(new ValidationError(`Invalid preference field: ${field}`));
      }
      if (typeof preferences[field] !== "boolean") {
        return next(new ValidationError(`${field} must be a boolean value`));
      }
    }

    // In future, save to database
    // For now, just return success
    res.json({
      success: true,
      message: "Preferences updated successfully",
      preferences: preferences
    });
  } catch (err) {
    next(err);
  }
}
