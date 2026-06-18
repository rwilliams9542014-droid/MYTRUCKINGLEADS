import { ValidationError } from "../middleware/errorHandler.js";
import { normalizeUSStateCode } from "./usStates.js";

// Input validation utilities
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ValidationError("Invalid email format", "email");
  }
  return email.toLowerCase().trim();
}

export function validateUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalized)) {
    throw new ValidationError("Username must be 3-30 characters and use only letters, numbers, dots, dashes, or underscores", "username");
  }
  return normalized;
}

export function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters", "password");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError("Password must contain at least one uppercase letter", "password");
  }
  if (!/[0-9]/.test(password)) {
    throw new ValidationError("Password must contain at least one number", "password");
  }
  return password;
}

export function validatePhone(phone) {
  const normalized = String(phone || "").trim();
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError("Phone number must include at least 10 digits", "phone");
  }
  return normalized;
}

export function validateString(value, fieldName, minLength = 1, maxLength = 255) {
  if (!value || typeof value !== "string") {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} must be between ${minLength} and ${maxLength} characters`, fieldName);
  }
  return trimmed;
}

export function validatePlan(plan) {
  const validPlans = ["basic", "pro", "premium", "starter", "agency", "growth", "trial"];
  if (!plan || !validPlans.includes(plan)) {
    throw new ValidationError("Invalid plan. Must be: trial or Producer Pro", "plan");
  }

  if (["basic", "starter", "premium", "agency", "growth"].includes(plan)) return "pro";
  return plan;
}

export function validateLeadState(state) {
  const normalized = normalizeUSStateCode(state);
  if (!normalized) {
    throw new ValidationError("Choose a valid lead state", "leadState");
  }
  return normalized;
}

export function validateDOT(dot) {
  if (!dot || !/^\d{7}$/.test(dot.toString())) {
    throw new ValidationError("DOT must be a 7-digit number", "dot");
  }
  return dot;
}
