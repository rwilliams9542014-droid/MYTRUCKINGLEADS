# Database Setup Guide - PostgreSQL

This guide walks you through setting up PostgreSQL for MyTruckingLeads with all the necessary tables for user management, carriers, leads, and analytics.

## 📋 **Database Schema Overview**

Your database includes 9 tables with full relationships:

| Table | Purpose | Rows Expected |
|-------|---------|---|
| **users** | User accounts, subscription status | 1-1000 |
| **carriers** | FMCSA carrier data (DOT/MC) | 1-10M |
| **enriched_carrier_data** | Contact info from 7 free sources | 1-10M |
| **leads** | Carriers saved by users | 100-100K |
| **new_entrant_alerts** | Newly approved carriers | 1-10K |
| **insurance_expiration_alerts** | Insurance expiring in next 90 days | 1-50K |
| **search_history** | User search analytics | 1-1M |
| **api_usage_log** | API request logging | 1-10M |
| **stripe_events** | Payment webhook events | 1-10K |

---

## ✅ **Step 1: Install PostgreSQL**

### **Windows (Recommended)**

**Option A: PostgreSQL Installer (Easiest)**
1. Download from: https://www.postgresql.org/download/windows/
2. Run installer (choose version 15 or higher)
3. Set password for `postgres` user (remember this!)
4. Select default port: **5432**
5. Install pgAdmin (optional, helpful GUI)

**Option B: Using Chocolatey (if installed)**
```powershell
choco install postgresql
```

**Option C: Using Docker (if Docker Desktop is installed)**
```powershell
docker run --name mytruckingleads-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

### **Verify Installation**
```powershell
psql --version
```

---

## 🔧 **Step 2: Create Database**

### **Option A: Using psql Command Line**

Open PowerShell and connect to PostgreSQL:
```powershell
psql -U postgres
```

You'll see: `postgres=#`

Create the database:
```sql
CREATE DATABASE mytruckingleads;
```

Connect to it:
```sql
\c mytruckingleads
```

List tables (should be empty):
```sql
\dt
```

Exit:
```sql
\q
```

### **Option B: Using pgAdmin GUI (Easier)**
1. Open pgAdmin (installed with PostgreSQL)
2. Right-click "Databases" → Create → Database
3. Name: `mytruckingleads`
4. Click Save

---

## 📊 **Step 3: Load Schema (Create Tables)**

### **Option A: Command Line (Recommended)**

```powershell
# Navigate to backend folder
cd "c:\Users\RONNY W\Desktop\MY WEBSITE\backend"

# Load schema from file
psql -U postgres -d mytruckingleads -f schema.sql
```

You'll see output like:
```
CREATE TABLE
CREATE TABLE
CREATE INDEX
...
```

**Verify it worked:**
```powershell
psql -U postgres -d mytruckingleads -c "\dt"
```

You should see all 9 tables listed.

### **Option B: pgAdmin GUI**
1. Open pgAdmin
2. Select database `mytruckingleads`
3. Tools → Query Tool
4. Copy-paste entire `schema.sql` content
5. Click Execute (play button)

---

## 🔐 **Step 4: Configure Your App (.env)**

Update `.env` file in `backend/` folder:

```env
# Database Connection
DATABASE_URL=postgresql://postgres:insurance@localhost:5432/mytruckingleads
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mytruckingleads
DB_USER=postgres
DB_PASSWORD=insurance

# Other configs...
```

**Replace `YOUR_PASSWORD` with the password you set during PostgreSQL installation.**

---

## ✔️ **Step 5: Test Connection**

In your backend folder, test the connection:

```powershell
cd "c:\Users\RONNY W\Desktop\MY WEBSITE\backend"
npm run dev
```

You should see:
```
Database connected successfully
API server running on port 4000
```

If you see "Database connection failed", check:
1. PostgreSQL is running
2. `.env` password is correct
3. Database `mytruckingleads` exists

---

## 📝 **Database Table Details**

### **users**
Stores user accounts and Stripe subscription info
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "plan": "pro",
  "stripe_customer_id": "cus_123",
  "stripe_subscription_id": "sub_123",
  "subscription_status": "active",
  "created_at": "2026-04-24T12:00:00Z"
}
```

### **carriers**
FMCSA official carrier data
```json
{
  "id": 1,
  "dot_number": "1234567",
  "mc_number": "7654321",
  "carrier_name": "ABC Trucking LLC",
  "safety_rating": "Satisfactory",
  "insurance_expiration": "2026-08-15",
  "vehicle_count": 45,
  "driver_count": 52,
  "hq_address": "123 Main St",
  "phone": "(555) 123-4567"
}
```

### **enriched_carrier_data**
Contact info from 7 free data sources
```json
{
  "id": 1,
  "carrier_id": 1,
  "email": "dispatch@abctrucking.com",
  "email_source": "Google Maps",
  "email_verified": true,
  "phone": "(555) 123-4567",
  "phone_source": "Yellow Pages",
  "data_completeness_percent": 85,
  "free_sources_used": ["FMCSA", "Google Maps", "OpenStreetMap"],
  "premium_sources_used": []
}
```

### **leads**
Carriers saved by users
```json
{
  "id": 1,
  "user_id": 1,
  "carrier_id": 1,
  "carrier_name": "ABC Trucking LLC",
  "status": "Contacted",
  "priority": "High",
  "insurance_expiration": "2026-08-15",
  "notes": "Interested in hazmat quotes",
  "is_new_entrant": false,
  "is_insurance_expiring": true
}
```

### **new_entrant_alerts**
Newly approved carriers
```json
{
  "id": 1,
  "carrier_id": 2,
  "carrier_name": "New Carrier Inc",
  "dot_number": "9876543",
  "approval_date": "2026-04-20",
  "state": "OH"
}
```

### **insurance_expiration_alerts**
Insurance expiring in next 90 days
```json
{
  "id": 1,
  "carrier_id": 1,
  "carrier_name": "ABC Trucking LLC",
  "insurance_expiration": "2026-08-15",
  "days_until_expiration": 113,
  "expiration_month": 8,
  "expiration_year": 2026
}
```

---

## 🔍 **Useful SQL Queries**

Check table row counts:
```sql
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'carriers', COUNT(*) FROM carriers
UNION ALL
SELECT 'leads', COUNT(*) FROM leads;
```

Find carriers expiring soon:
```sql
SELECT carrier_name, insurance_expiration, 
       EXTRACT(DAY FROM insurance_expiration - NOW()) as days_until
FROM carriers
WHERE insurance_expiration > NOW() 
  AND insurance_expiration < NOW() + INTERVAL '90 days'
ORDER BY insurance_expiration;
```

View user subscriptions:
```sql
SELECT email, plan, subscription_status, subscription_expires_at
FROM users
WHERE subscription_status = 'active';
```

Find enriched carriers:
```sql
SELECT c.carrier_name, c.dot_number, e.data_completeness_percent
FROM carriers c
JOIN enriched_carrier_data e ON c.id = e.carrier_id
WHERE e.data_completeness_percent > 80;
```

---

## 🚨 **Troubleshooting**

### **"FATAL: authentication failed"**
- Wrong password in `.env`
- Reset password: `psql -U postgres` then `\password postgres`

### **"Database does not exist"**
- Run: `psql -U postgres -c "CREATE DATABASE mytruckingleads;"`

### **"Port 5432 already in use"**
- Close other PostgreSQL instance: `netstat -ano | findstr 5432`
- Or change port in `.env` and restart PostgreSQL

### **"psql: command not found"**
- PostgreSQL not installed or not in PATH
- Add to PATH: Usually `C:\Program Files\PostgreSQL\15\bin`

### **Slow queries**
- Check indexes: `SELECT * FROM pg_stat_user_indexes;`
- Rebuild if needed: `REINDEX INDEX index_name;`

---

## ✨ **Next Steps**

After database is set up:

1. ✅ Database created and populated
2. ⏭️ **Next: Implement authentication** - signup/login endpoints
3. ⏭️ Connect frontend to backend APIs
4. ⏭️ Test carrier search with real data
5. ⏭️ Integrate Stripe payments

---

## 📚 **PostgreSQL Resources**

- Official Docs: https://www.postgresql.org/docs/
- Interactive Queries: https://www.pgadmin.org/
- Backup/Restore: `pg_dump` and `pg_restore` commands
- Performance: Use `EXPLAIN ANALYZE` to optimize queries

**Your database is now ready to power MyTruckingLeads! 🎉**
