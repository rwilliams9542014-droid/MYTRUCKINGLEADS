# Email Service Setup Guide

This guide explains how to configure and test the email notifications for subscription confirmations and payment failures.

## Overview

The application uses **Nodemailer** with SMTP to send emails. Emails are sent when:
- ✅ Subscription payment succeeds → Confirmation email
- ❌ Subscription payment fails → Failure notification
- 📝 User cancels subscription → (currently just logs to console)

## Configuration

### Step 1: Set Up Environment Variables

Add the following to your `.env` file:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=noreply@mytruckingleads.com

# Application Settings (optional, for email templates)
APP_NAME=MyTruckingLeads
APP_URL=https://yourdomain.com
```

### Step 2: Choose Your Email Provider

#### Option A: Gmail (Free)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable "2-Step Verification"
3. Create an **App Password** for "Mail"
4. Use the generated password as `SMTP_PASS`

**Settings:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  (16-character app password)
SMTP_FROM=your-email@gmail.com
```

#### Option B: Outlook/Hotmail

**Settings:**
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

#### Option C: SendGrid

1. Create a SendGrid account and API key
2. Create an SMTP relay username and password in SendGrid dashboard

**Settings:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxx...  (your SendGrid API key)
SMTP_FROM=noreply@yourdomain.com
```

#### Option D: Custom SMTP Server

Use any SMTP server (your own, hosted email, etc.):
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587  (or 465 for SSL)
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

## Testing

### Test 1: Using the API Endpoint

Make a POST request to test the email configuration:

```bash
curl -X POST http://localhost:5000/api/billing/test-email \
  -H "Content-Type: application/json" \
  -d '{"email": "your-test-email@example.com"}'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Test email sent successfully (ID: ...)"
}
```

**Expected Response (Failure):**
```json
{
  "success": false,
  "message": "Error: [reason]"
}
```

### Test 2: Check Console Logs

When the server starts, check the console for:
```
✅ Email service ready
```

If you see a warning:
```
⚠️ Email service not configured. Emails will not be sent.
```

This means your environment variables are not properly set.

### Test 3: Using Stripe Test Events

1. Go to Stripe Dashboard → Developers → Webhooks
2. Find your webhook endpoint
3. Click "Send test event"
4. Select `invoice.payment_succeeded`
5. Verify that an email would be sent (check server logs and database)

## Troubleshooting

### "Email service not configured"

**Cause:** Missing SMTP environment variables
**Solution:** 
- Verify all 4 required variables are set: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Restart the server after adding variables
- Check `.env` file is in the correct location

### "Authentication failed"

**Cause:** Invalid SMTP credentials
**Solution:**
- Double-check username and password
- For Gmail, ensure you're using an **App Password** (not your regular password)
- Verify the email account isn't locked

### "Connection timeout"

**Cause:** Wrong host or port
**Solution:**
- Verify `SMTP_HOST` is correct for your email provider
- Check that `SMTP_PORT` matches your provider (usually 587 or 465)
- Ensure your firewall allows outbound connections on that port

### "Invalid email address"

**Cause:** Test email address has incorrect format
**Solution:**
- Use a valid email format: `user@example.com`
- Verify the email address in your user database

## Email Templates

The application includes two email templates:

### 1. Subscription Confirmation Email
- Sent when payment succeeds
- Shows plan details and renewal date
- Includes link to dashboard
- Professional HTML formatting

### 2. Payment Failed Email
- Sent when payment fails
- Shows failure reason
- Includes link to update payment method
- Professional HTML formatting

To customize templates, edit [backend/services/emailService.js](emailService.js) - look for the `emailTemplates` object.

## Security Considerations

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use app-specific passwords** - Don't use main account passwords
3. **Limit sending rate** - Stripe's webhooks are sent periodically, not per request
4. **Validate emails** - Only send to verified user addresses in your database
5. **Log attempts** - All email sends are logged for audit purposes

## API Reference

### Test Email Endpoint
```
POST /api/billing/test-email
Content-Type: application/json

{
  "email": "test@example.com"
}

Response:
{
  "success": true,
  "message": "Test email sent successfully (ID: ...)"
}
```

### Webhook Events (Automatic)

Emails are automatically sent for these Stripe webhook events:

| Event | Email Sent |
|-------|-----------|
| `invoice.payment_succeeded` | ✅ Confirmation |
| `invoice.payment_failed` | ❌ Failure Notice |
| `customer.subscription.created` | (Database sync only) |
| `customer.subscription.deleted` | (Database sync only) |

## Next Steps

1. Set up your SMTP credentials in `.env`
2. Restart the server
3. Test using the API endpoint above
4. Monitor server logs when Stripe webhooks fire
5. Verify emails are received in user inboxes
6. Check spam/junk folder if emails aren't appearing

## Further Customization

To modify email content or add new email types:

1. Add templates to `emailTemplates` object in [emailService.js](emailService.js)
2. Export a new function (e.g., `sendSubscriptionCancellationEmail`)
3. Import and call in [stripeService.js](stripeService.js) handlers
4. Test with appropriate Stripe webhook events

## Support

For issues with:
- **Stripe**: See [Stripe Documentation](https://stripe.com/docs)
- **Gmail**: See [Gmail App Passwords Help](https://support.google.com/accounts/answer/185833)
- **General SMTP**: Verify credentials with your email provider's support
