# Reports & Analytics Dashboard - Documentation

## Overview

The Reports & Analytics dashboard provides users with insights into their subscription status and account activity, including:

- **Subscription Analytics**: Current plan, renewal status, days remaining, and billing information
- **Account Activity**: Lead metrics by status, account age, and recent activity timeline

## Features

### 1. Subscription Metrics

Displays real-time subscription information:

- **Current Plan**: Shows which plan tier the user is on (Free, Starter, Pro, Agency)
- **Subscription Status**: Active, expired, or no subscription
- **Days Remaining**: Time until next renewal
- **Plan Value**: Monthly cost of current plan
- **Renewal Date**: Next billing date
- **Renewal Progress**: Visual bar showing progress through current billing cycle

### 2. Lead Analytics

Shows lead distribution by status:

- **Total Leads**: Sum of all leads in the account
- **Leads by Status**: Breakdown showing:
  - New: Leads just added
  - In Progress: Leads being worked
  - Contacted: Leads already reached out to
  - Converted: Closed leads
  - Lost: Leads that didn't convert

Displayed as an interactive doughnut chart using Chart.js.

### 3. Account Information

Provides historical context about the account:

- **Account Name & Email**: User identity
- **Account Age**: How long the account has existed
- **Account Age in Months**: User tenure
- **Last Activity**: Most recent lead action

### 4. Recent Activity

Timeline showing the 5 most recent lead updates:

- **Carrier Name**: Which carrier the lead is about
- **Status**: Current lead status (with color-coded badges)
- **Update Date**: When the lead was last modified

## API Endpoints

All endpoints require authentication (`Authorization: Bearer <token>` header).

### GET /api/reports/subscription-analytics

Returns subscription details for the authenticated user.

**Response:**
```json
{
  "currentPlan": "pro",
  "subscriptionStatus": "active",
  "daysRemaining": 24,
  "percentageRemaining": 80.5,
  "expiresAt": "2026-05-27T15:38:30.000Z",
  "planHistory": [
    {
      "plan": "pro",
      "date": "2026-04-27T15:38:30.000Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Subscription data retrieved
- `401 Unauthorized`: No valid token provided
- `404 Not Found`: User not found
- `500 Server Error`: Database error

### GET /api/reports/account-activity

Returns account activity and lead metrics.

**Response:**
```json
{
  "accountInfo": {
    "name": "John Smith",
    "email": "john@example.com",
    "createdAt": "2025-12-15T10:00:00.000Z",
    "accountAgeDays": 134,
    "accountAgeMonths": 4,
    "lastActivity": "2026-04-27T14:30:00.000Z"
  },
  "leadMetrics": {
    "totalLeads": 45,
    "byStatus": {
      "New": 12,
      "In Progress": 8,
      "Contacted": 15,
      "Converted": 8,
      "Lost": 2
    }
  },
  "recentActivity": [
    {
      "id": 123,
      "carrierName": "ABC Trucking",
      "status": "Contacted",
      "createdAt": "2026-04-25T10:00:00.000Z",
      "updatedAt": "2026-04-27T14:30:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Activity data retrieved
- `401 Unauthorized`: No valid token provided
- `404 Not Found`: User not found
- `500 Server Error`: Database error

### GET /api/reports/summary

Returns a consolidated summary for dashboard display.

**Response:**
```json
{
  "subscription": {
    "currentPlan": "pro",
    "status": "active",
    "monthlyValue": 149,
    "expiresAt": "2026-05-27T15:38:30.000Z"
  },
  "activity": {
    "totalLeads": 45,
    "upcomingExpirations": 3,
    "accountAge": 134
  }
}
```

**Status Codes:**
- `200 OK`: Summary data retrieved
- `401 Unauthorized`: No valid token provided
- `404 Not Found`: User not found
- `500 Server Error`: Database error

## Frontend Implementation

### Location
- **File**: `reports.html`
- **Route**: `/reports.html`
- **Access**: From dashboard sidebar → Reports

### Technologies Used

- **HTML5**: Structure and semantic markup
- **Bootstrap 5**: Responsive layout and components
- **Chart.js**: Data visualization (doughnut chart)
- **Font Awesome**: Icons
- **Vanilla JavaScript**: No dependencies for logic

### Key Features

1. **Responsive Design**: Works on desktop, tablet, and mobile
2. **Real-time Data**: Fetches current data from API on page load
3. **Error Handling**: Displays user-friendly error messages
4. **Loading States**: Shows spinners while data is being fetched
5. **Color-Coded Status Badges**: Easy visual identification of lead statuses
6. **Progress Indicators**: Visual representation of subscription renewal progress

### User Flow

1. User clicks "Reports" in dashboard sidebar
2. Page loads and authenticates with stored JWT token
3. Three parallel data fetches:
   - Subscription analytics
   - Account activity
   - Dashboard summary
4. Page displays:
   - Subscription metrics cards
   - Renewal progress bar
   - Leads by status chart
   - Account information
   - Recent activity timeline
5. All updates happen automatically on page load (no manual refresh needed)

## Data Sources

### Subscription Data From:
- `users` table: `plan`, `subscription_status`, `subscription_expires_at`
- Calculated fields: days remaining, percentage remaining, monthly value

### Activity Data From:
- `users` table: `name`, `email`, `created_at`, `updated_at`
- `leads` table: Count by status, recent updates

### Lead Status Categories

Standard lead statuses in the system:
- **New**: Newly discovered leads (default status)
- **In Progress**: Actively being worked on
- **Contacted**: Already reached out to carrier
- **Converted**: Successfully sold to carrier
- **Lost**: Lead decided not to purchase or wasn't viable

## Testing

### Frontend Testing

1. **Without API**: Open `reports.html` in browser and check layout
2. **With API**: Make sure backend server is running, then test:
   - Load reports page while logged in
   - Verify all metrics display correctly
   - Check error handling (disable network and refresh)

### API Testing

Run the automated test suite:

```bash
cd backend
node test-reports-api.js
```

This tests:
- Server connectivity
- Authentication requirement
- Subscription analytics endpoint
- Account activity endpoint
- Dashboard summary endpoint
- Data accuracy

### Manual Testing via cURL

```bash
# Get subscription analytics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/reports/subscription-analytics

# Get account activity
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/reports/account-activity

# Get dashboard summary
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/reports/summary
```

## Security Considerations

1. **Authentication Required**: All endpoints require valid JWT token
2. **User Isolation**: Each user only sees their own data
3. **Database Queries**: Uses parameterized queries to prevent SQL injection
4. **Token Validation**: Token verified before any data access
5. **Error Messages**: No sensitive information leaked in error responses

## Performance Considerations

1. **Database Indexes**: Queries use indexes on:
   - `leads.user_id` (for fast filtering by user)
   - `leads.status` (for status grouping)
   - `users.id` (primary key)

2. **Query Optimization**: 
   - Aggregations done at database level, not in application
   - Limits on result sets (e.g., only 5 recent activities)
   - No N+1 queries

3. **Caching Opportunities** (future enhancement):
   - Could cache subscription status for 5 minutes
   - Could cache lead metrics for 1 minute
   - Would reduce database load for frequently accessed reports

## Future Enhancements

Possible additions to Reports dashboard:

1. **Date Range Filtering**: Show activity within specific date ranges
2. **Lead Performance Metrics**: Conversion rate, average time to close
3. **Search History**: Top 10 most searched carriers
4. **Insurance Alerts**: Summary of upcoming insurance expirations
5. **Revenue Analytics**: Monthly/annual revenue trends
6. **Export Functionality**: Download reports as CSV or PDF
7. **Email Reports**: Automated weekly/monthly report emails
8. **Comparison Charts**: Compare current month vs. previous month
9. **Custom Date Ranges**: User-selectable reporting periods
10. **Alert Thresholds**: Notifications when conversion rate drops

## Troubleshooting

### "Failed to load subscription data"

**Cause**: API endpoint not responding
**Solution**:
- Verify backend server is running
- Check network connection
- Look at browser console for detailed error
- Verify JWT token is valid

### "No data displayed"

**Cause**: User has no leads or subscription data
**Solution**:
- This is normal for new accounts
- Create some leads in dashboard first
- Data will populate once leads are created

### Charts not displaying

**Cause**: Chart.js library failed to load
**Solution**:
- Check internet connection (CDN must be reachable)
- Check browser console for errors
- Verify JavaScript is enabled

### Incorrect metrics displayed

**Cause**: Stale cache or data sync issue
**Solution**:
- Refresh the page
- Clear browser cache
- Check that leads were created recently
- Verify database connection

## Support

For issues with the Reports dashboard:

1. Check the browser console (F12) for JavaScript errors
2. Check network tab for API failures
3. Verify JWT token is valid (check localStorage)
4. Test API endpoints directly with cURL
5. Check server logs for database errors
