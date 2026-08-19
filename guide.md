# VigilOS V3 — Local Testing Guide

## Prerequisites

- Node.js v18+ 
- PostgreSQL v14+
- Redis v7+
- npm atau yarn

## 1. Setup Environment

```bash
# Clone dan masuk ke directory
cd /Users/sun/Documents/VigilOS/vigil-server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

## 2. Konfigurasi .env

Edit file `.env` sesuai lokal setup:

```env
# Server
PORT=4000
NODE_ENV=development

# PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/vigilos?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-key-change-in-production"

# Midtrans (untuk testing)
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxxx"
MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxxx"
MIDTRANS_MERCHANT_ID="xxxxx"
MIDTRANS_IS_PRODUCTION=false
```

## 3. Setup Database

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed data
npx prisma db seed
```

## 4. Start Services

```bash
# Pastikan PostgreSQL dan Redis berjalan
# PostgreSQL: brew services start postgresql@14
# Redis: brew services start redis

# Start server
npm run dev
```

Server akan berjalan di `http://localhost:4000`

## 5. API Endpoints

### Authentication

```bash
# Login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@vigilos.id",
    -d "password": "password"
  }'

# Response: { token, refreshToken, user }
# Simpan token untuk request selanjutnya
TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

### Tenant Management (Super Admin)

```bash
# List tenants
curl -X GET http://localhost:4000/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN"

# Create tenant
curl -X POST http://localhost:4000/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dishub Jakarta",
    "slug": "jakarta",
    "contactEmail": "admin@jakarta.go.id",
    "region": "DKI Jakarta"
  }'
```

### Billing & Subscription

```bash
# Get subscriptions
curl -X GET http://localhost:4000/api/v1/billing/subscriptions \
  -H "Authorization: Bearer $TOKEN"

# Create trial subscription
curl -X POST http://localhost:4000/api/v1/billing/subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "ws-semarang-01"}'

# Upgrade subscription
curl -X PUT http://localhost:4000/api/v1/billing/subscriptions/sub-001/upgrade \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan": "PROFESSIONAL"}'

# Get invoices
curl -X GET http://localhost:4000/api/v1/billing/invoices \
  -H "Authorization: Bearer $TOKEN"

# Get current usage
curl -X GET http://localhost:4000/api/v1/billing/usage \
  -H "Authorization: Bearer $TOKEN"
```

### Fleet Management

```bash
# List vehicles
curl -X GET http://localhost:4000/api/v1/fleet/vehicles \
  -H "Authorization: Bearer $TOKEN"

# List drivers
curl -X GET http://localhost:4000/api/v1/fleet/drivers \
  -H "Authorization: Bearer $TOKEN"
```

### Incidents

```bash
# List incidents
curl -X GET http://localhost:4000/api/v1/incidents \
  -H "Authorization: Bearer $TOKEN"
```

### Portal (Tenant Admin)

```bash
# Dashboard
curl -X GET http://localhost:4000/api/v1/portal/dashboard \
  -H "Authorization: Bearer $TOKEN"

# Team members
curl -X GET http://localhost:4000/api/v1/portal/team \
  -H "Authorization: Bearer $TOKEN"

# API Keys
curl -X GET http://localhost:4000/api/v1/portal/api-keys \
  -H "Authorization: Bearer $TOKEN"

# Create API key
curl -X POST http://localhost:4000/api/v1/portal/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "permissions": ["vehicles:read", "incidents:read"]
  }'

# Quota status
curl -X GET http://localhost:4000/api/v1/portal/quota \
  -H "Authorization: Bearer $TOKEN"
```

### System Management (Super Admin)

```bash
# Partition health
curl -X GET http://localhost:4000/api/v1/system/partitions \
  -H "Authorization: Bearer $TOKEN"

# Run partition maintenance
curl -X POST http://localhost:4000/api/v1/system/partitions/maintenance \
  -H "Authorization: Bearer $TOKEN"

# Cron job status
curl -X GET http://localhost:4000/api/v1/system/cron \
  -H "Authorization: Bearer $TOKEN"

# Retention report
curl -X GET http://localhost:4000/api/v1/system/retention \
  -H "Authorization: Bearer $TOKEN"

# Process deletions
curl -X POST http://localhost:4000/api/v1/system/retention/process-deletions \
  -H "Authorization: Bearer $TOKEN"

# Security dashboard
curl -X GET http://localhost:4000/api/v1/system/health \
  -H "Authorization: Bearer $TOKEN"
```

### Health Check

```bash
# Public health check
curl -X GET http://localhost:4000/api/v1/health

# System status
curl -X GET http://localhost:4000/api/v1/system/status
```

## 6. WebSocket Testing

```bash
# Install websocat
brew install websocat

# Connect to WebSocket
websocat ws://localhost:4000/ws

# Atau gunakan Node.js script
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4000/ws');
ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => console.log('Message:', data.toString()));
ws.on('close', () => console.log('Disconnected'));
"
```

## 7. MQTT Telemetry Testing

```bash
# Install MQTT client
npm install -g mqtt-cli

# Subscribe to telemetry
mqtt-cli sub -t "fleet/+/telemetry" -h localhost -p 1883

# Subscribe to emergencies
mqtt-cli sub -t "fleet/+/emergency" -h localhost -p 1883
```

## 8. Testing Scenarios

### Scenario 1: Tenant Provisioning
1. Login sebagai Super Admin
2. Create new tenant
3. Create trial subscription
4. Login sebagai Tenant Admin
5. Verify dashboard works

### Scenario 2: Subscription Lifecycle
1. Create trial subscription
2. Upgrade to STARTER plan
3. Verify invoice generated
4. Process payment
5. Upgrade to PROFESSIONAL
6. Cancel subscription
7. Verify 90-day retention

### Scenario 3: API Key Management
1. Create API key
2. Use API key for authentication
3. Rotate API key
4. Verify old key revoked
5. Revoke key

### Scenario 4: Security Monitoring
1. Trigger multiple failed logins
2. Check security events
3. Verify brute force detection
4. Check audit logs

### Scenario 5: Usage Metering
1. Make API calls
2. Check usage statistics
3. Verify quota enforcement
4. Check usage history

## 9. Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL status
brew services list | grep postgresql

# Restart PostgreSQL
brew services restart postgresql@14

# Check database exists
psql -U postgres -l
```

### Redis Connection Issues
```bash
# Check Redis status
brew services list | grep redis

# Restart Redis
brew services restart redis

# Test connection
redis-cli ping
```

### Server Issues
```bash
# Check server logs
npm run dev

# Check port usage
lsof -i :4000

# Kill process on port
kill -9 $(lsof -t -i :4000)
```

## 10. Useful Commands

```bash
# Database
npx prisma studio          # Open Prisma Studio
npx prisma migrate reset    # Reset database
npx prisma db seed          # Re-seed data

# Development
npm run lint                # Run linter
npm run dev                 # Start dev server

# Production build
npm run build               # Build for production
npm start                   # Start production server
```

## Default Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@vigilos.id | password | SUPER_ADMIN |
| operator@vigilos.id | password | COMMAND_CENTER_OPERATOR |
| hendra@vigilos.id | password | PATROL_OFFICER |
| rina@semarang.go.id | password | TENANT_FINANCE |

## Default Tenant

| ID | Name | Plan |
|----|------|------|
| ws-semarang-01 | Dishub Kota Semarang | ENTERPRISE |
