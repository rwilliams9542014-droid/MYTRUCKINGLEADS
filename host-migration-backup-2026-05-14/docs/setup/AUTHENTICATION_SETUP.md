# Authentication System Setup Guide

## Overview

This document describes the complete authentication system that has been added to your MyTruckingLeads application. The system uses:

- **PostgreSQL** for user data storage (already configured)
- **bcrypt** for password hashing
- **JWT** (JSON Web Tokens) stored in **httpOnly cookies** for secure authentication
- **Protected routes** for lead-desk, crm, and API endpoints

## Files Changed

### Backend Files

1. **`backend/server.js`**
   - Added `cookie-parser` middleware for handling cookies
   - Added `requireAuth` middleware import
   - Protected `/lead-desk` and `/crm` routes with `requireAuth` middleware

2. **`backend/controllers/authController.js`**
   - Added `setAuthCookie()` function to set httpOnly cookies
   - Added `clearAuthCookie()` function to clear cookies on logout
   - Modified `signup()` to set httpOnly cookie instead of returning token in JSON
   - Modified `login()` to set httpOnly cookie instead of returning token in JSON
   - Added `logout()` function to clear authentication cookie
   - Added `getCurrentUser()` function to retrieve current user data

3. **`backend/routes/authRoutes.js`**
   - Added `logout` route: `POST /api/auth/logout`
   - Added `getCurrentUser` route: `GET /api/auth/me` (protected)

4. **`backend/middleware/authMiddleware.js`**
   - Added `extractToken()` function to get token from Authorization header OR httpOnly cookie
   - Updated `authRequired()` to support both Bearer tokens and cookies
   - Added `requireAuth()` middleware for page protection with redirect to login

### Frontend Files

5. **`assets/js/auth.js`**
   - Updated to work with cookie-based authentication
   - Added `credentials: "include"` to all fetch requests
   - Added `checkAuth()` function to verify authentication with server
   - Modified login/signup to store user data in localStorage (token in cookie)

6. **`assets/js/dashboard-auth.js`**
   - Updated logout to call `/api/auth/logout` endpoint
   - Added `verifyAuthentication()` function to check cookie validity
   - Added automatic redirect to login for unauthenticated users

7. **`backend/public/lead-desk.html`**
   - Updated `token()` function to check localStorage for cached user
   - Updated `api()` function to use `credentials: "include"`
   - Updated logout to call `/api/auth/logout` endpoint
   - Added cookie-based authentication check on page load

## Required Railway Environment Variables

You need to add the following environment variable in your Railway project:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT tokens. Must be a long, random string. | `your_super_secret_jwt_key_change_in_production` |

### How to Add JWT_SECRET in Railway

1. Go to your Railway project dashboard
2. Click on your environment
3. Click "Variables" tab
4. Click "New Variable"
5. Add:
   - **Key**: `JWT_SECRET`
   - **Value**: A secure random string (at least 32 characters recommended)

To generate a secure random string, you can use:
```bash
# On Linux/Mac
openssl rand -base64 48

# On Windows (PowerShell)
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## How the Authentication Works

### Registration (Signup)

1. User submits registration form with email, password, and other details
2. Backend validates input and checks for existing users
3. Password is hashed using bcrypt (12 salt rounds)
4. User is created in PostgreSQL database
5. JWT token is generated and stored in httpOnly cookie
6. User data is returned and cached in localStorage for UI state

### Login

1. User submits login form with email/username and password
2. Backend finds user by email or username
3. Password is verified using bcrypt
4. JWT token is generated and stored in httpOnly cookie
5. User data is returned and cached in localStorage

### Protected Pages

1. When user visits `/lead-desk` or `/crm`:
   - Server checks for valid JWT cookie
   - If valid, page is served
   - If invalid/missing, user is redirected to `/login.html`

### Protected API Routes

All `/api/leads`, `/api/prospects`, and other protected API routes require authentication via:
- httpOnly cookie (automatic with `credentials: "include"`)
- OR Bearer token in Authorization header

### Logout

1. Frontend calls `POST /api/auth/logout`
2. Backend clears the authentication cookie
3. Frontend clears localStorage and redirects to login page

## Cookie Configuration

The authentication cookie is configured with these settings:

```javascript
{
  httpOnly: true,           // Not accessible via JavaScript
  secure: true,             // Only sent over HTTPS (in production)
  sameSite: "none",         // Allows cross-site cookies (needed for Railway)
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/"
}
```

## Security Features

1. **httpOnly cookies** - Tokens cannot be accessed via JavaScript (XSS protection)
2. **Secure flag** - Cookies only sent over HTTPS in production
3. **SameSite=None** - Required for cross-origin requests to Railway
4. **bcrypt hashing** - Passwords are securely hashed before storage
5. **JWT expiration** - Tokens expire after 7 days
6. **Protected routes** - Sensitive pages and APIs require authentication

## Testing the Authentication

### 1. Test Registration

```bash
curl -X POST https://backend-production-fde3.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "phone": "555-123-4567",
    "billingAddressLine1": "123 Test St",
    "billingCity": "Test City",
    "billingState": "FL",
    "billingPostalCode": "33101",
    "billingCountry": "US"
  }' \
  -v
```

Look for `Set-Cookie: auth_token=...` in the response headers.

### 2. Test Login

```bash
curl -X POST https://backend-production-fde3.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }' \
  -v
```

### 3. Test Protected Page Access

Visit `https://backend-production-fde3.up.railway.app/lead-desk` in your browser.
- If logged in, you'll see the lead desk
- If not logged in, you'll be redirected to login

### 4. Test Logout

```bash
curl -X POST https://backend-production-fde3.up.railway.app/api/auth/logout \
  -b "auth_token=YOUR_TOKEN_HERE" \
  -v
```

## Troubleshooting

### "Not authenticated" errors

1. Make sure `JWT_SECRET` is set in Railway environment variables
2. Check that cookies are being set (check browser DevTools > Application > Cookies)
3. Ensure CORS is configured correctly for your frontend domain

### Cookie not being set

1. In production, cookies require HTTPS - make sure you're using HTTPS
2. Check that `NODE_ENV=production` is set in Railway
3. Verify `FRONTEND_URL` is set correctly in environment variables

### "Token has expired" errors

The token expires after 7 days. Users need to log in again.

## Database Schema

The authentication system uses the existing `users` table with these columns:

- `id` - Primary key
- `email` - User's email (unique)
- `username` - User's username (unique)
- `password_hash` - Bcrypt hashed password
- `name` - Full name
- `first_name` - First name
- `last_name` - Last name
- `plan` - Subscription plan
- `subscription_status` - Active/trialing/expired
- And other billing/profile fields

No additional database setup is required - the schema is already in place.