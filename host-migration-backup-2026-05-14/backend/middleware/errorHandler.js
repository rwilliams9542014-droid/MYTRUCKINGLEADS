// Centralized error handling and custom error classes
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.field = field;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication failed") {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
  }
}

// Global error handler middleware
export function errorHandler(err, req, res, next) {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Log error
  console.error({
    timestamp: new Date().toISOString(),
    errorName: err.name,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(isDevelopment && { details: err.stack }),
    });
  }

  // Handle database errors
  if (err.code === "UNIQUE_VIOLATION" || err.code === "23505") {
    const constraint = String(err.constraint || "");
    if (constraint.includes("username")) {
      return res.status(409).json({
        error: "Username already in use",
      });
    }

    return res.status(409).json({
      error: "Email already in use",
    });
  }

  // Handle unknown errors
  return res.status(500).json({
    error: "Internal server error",
    ...(isDevelopment && { message: err.message, stack: err.stack }),
  });
}
