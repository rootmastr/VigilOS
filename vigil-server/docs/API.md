# VigilOS API Documentation

## Overview
VigilOS API provides RESTful endpoints for fleet management, real-time tracking, incident reporting, and analytics for public transit security operations.

**Base URL**: `https://api.vigilos.com/api/v1`  
**Authentication**: Bearer JWT token or API Key  
**Content-Type**: `application/json`

## Authentication

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "dispatcher@semarang.go.id",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_abc123...",
    "user": {
      "id": "usr-001",
      "email": "dispatcher@semarang.go.id",
      "role": "DISPATCHER",
      "tenantId": "ws-semarang-01"
    }
  }
}
```

### API Key Authentication
```http
Authorization: Bearer ak_prod_smg_xxxxxxxxxxxxxxxx
```

---

## Vehicles

### List Vehicles
```http
GET /api/v1/vehicles
Authorization: Bearer <token>
```

**Query Parameters:**
- `tenantId` (required): Workspace ID
- `status`: Filter by status (ACTIVE, INACTIVE, MAINTENANCE)
- `type`: Filter by type (BUS, PATROL, SHUTTLE)

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicles": [
      {
        "id": "veh-001",
        "code": "TS-101",
        "name": "Koridor 1 - Terboyo Express",
        "type": "BUS",
        "status": "ACTIVE",
        "location": {
          "lat": -6.9567,
          "lng": 110.4383,
          "heading": 45,
          "speed": 32.5
        },
        "lastUpdate": "2024-01-15T10:30:00.000Z"
      }
    ],
    "total": 5
  }
}
```

### Get Vehicle Details
```http
GET /api/v1/vehicles/:id
```

### Update Vehicle Status
```http
PATCH /api/v1/vehicles/:id
Content-Type: application/json

{
  "status": "MAINTENANCE",
  "reason": "Scheduled maintenance"
}
```

---

## Incidents

### List Incidents
```http
GET /api/v1/incidents
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (default: 1)
- `pageSize` (default: 20, max: 100)
- `type`: Filter by incident type
- `severity`: Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)
- `status`: Filter by status (OPEN, INVESTIGATING, RESOLVED)
- `dateFrom`: ISO date string
- `dateTo`: ISO date string

**Response:**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "id": "inc-001",
        "type": "PANIC_BUTTON",
        "severity": "CRITICAL",
        "status": "INVESTIGATING",
        "vehicle": {
          "id": "veh-001",
          "code": "TS-101",
          "name": "Koridor 1 - Terboyo Express"
        },
        "officer": {
          "id": "usr-001",
          "name": "Budi Hartono"
        },
        "location": {
          "lat": -6.9567,
          "lng": 110.4383
        },
        "description": "Passenger altercation",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "photos": [],
        "timeline": []
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Create Incident
```http
POST /api/v1/incidents
Content-Type: application/json
Authorization: Bearer <token>

{
  "vehicleId": "veh-001",
  "type": "PANIC_BUTTON",
  "severity": "CRITICAL",
  "lat": -6.9567,
  "lng": 110.4383,
  "description": "Emergency situation on board"
}
```

### Export Incidents CSV
```http
GET /api/v1/incidents/export/csv?dateFrom=2024-01-01&dateTo=2024-01-31
Authorization: Bearer <token>
```

**Response:** CSV file download

---

## Field Reports

### List Field Reports
```http
GET /api/v1/field-reports?status=SUBMITTED
Authorization: Bearer <token>
```

### Submit Field Report
```http
POST /api/v1/field-reports
Content-Type: application/json

{
  "vehicleId": "veh-001",
  "type": "ROUTE_COMPLIANCE",
  "lat": -6.9567,
  "lng": 110.4383,
  "description": "Route completed on time",
  "photos": ["base64encodedstring..."],
  "status": "SUBMITTED"
}
```

### Sync Offline Reports
```http
POST /api/v1/field-reports/sync
Content-Type: application/json

{
  "reports": [
    {
      "localId": "local-123",
      "vehicleId": "veh-001",
      "type": "VEHICLE_CONDITION",
      "lat": -6.9567,
      "lng": 110.4383,
      "description": "Tire pressure low",
      "capturedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Analytics

### Dashboard Stats
```http
GET /api/v1/analytics/dashboard
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalVehicles": 5,
    "activeVehicles": 4,
    "totalIncidents": 150,
    "openIncidents": 12,
    "criticalAlerts": 3,
    "responseTime": {
      "average": 4.2,
      "p95": 8.5,
      "p99": 12.3
    },
    "uptime": 99.97
  }
}
```

### Speed History
```http
GET /api/v1/analytics/speed-history/:vehicleId?duration=1h
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "veh-001",
    "history": [
      { "timestamp": "2024-01-15T10:00:00Z", "speed": 32.5 },
      { "timestamp": "2024-01-15T10:05:00Z", "speed": 35.2 }
    ]
  }
}
```

### Incident Timeline
```http
GET /api/v1/analytics/incidents/timeline/:vehicleId?duration=7d
```

---

## Emergency

### Trigger Panic Alert
```http
POST /api/v1/emergency/panic
Content-Type: application/json

{
  "vehicleId": "veh-001",
  "officerId": "usr-001",
  "lat": -6.9567,
  "lng": 110.4383,
  "message": "Medical emergency on board"
}
```

### Queue Panic Event
```http
POST /api/v1/emergency/queue
Content-Type: application/json

{
  "vehicleId": "veh-001",
  "type": "PANIC_BUTTON",
  "priority": "CRITICAL",
  "data": { ... }
}
```

---

## Route Planning

### Calculate ETA
```http
POST /api/v1/route/eta
Content-Type: application/json

{
  "from": { "lat": -6.9567, "lng": 110.4383 },
  "to": { "lat": -6.9900, "lng": 110.4200 },
  "mode": "bus"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "eta": 18,
    "unit": "minutes",
    "distance": 5.2,
    "distanceUnit": "km"
  }
}
```

### Optimize Route
```http
POST /api/v1/route/optimize
Content-Type: application/json

{
  "stops": [
    { "lat": -6.9567, "lng": 110.4383 },
    { "lat": -6.9900, "lng": 110.4200 },
    { "lat": -6.9750, "lng": 110.4220 }
  ],
  "vehicleType": "BUS"
}
```

---

## Subscriptions

### Get Subscription
```http
GET /api/v1/billing/subscription
Authorization: Bearer <token>
```

### Generate Invoice PDF
```http
GET /api/v1/billing/invoice/:invoiceId/pdf
Authorization: Bearer <token>
```

**Response:** PDF file download

---

## WebSocket Events

### Connection
```javascript
const ws = new WebSocket('wss://api.vigilos.com/ws?token=<jwt_token>');
```

### Subscribe to Channels
```json
{
  "type": "subscribe",
  "channels": ["vehicle:veh-001", "incidents", "alerts"]
}
```

### Receive Telemetry
```json
{
  "type": "telemetry",
  "channel": "vehicle:veh-001",
  "data": {
    "vehicleId": "veh-001",
    "lat": -6.9567,
    "lng": 110.4383,
    "speed": 32.5,
    "heading": 45,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Receive Alerts
```json
{
  "type": "alert",
  "channel": "alerts",
  "priority": "critical",
  "data": {
    "alertId": "alert-001",
    "type": "PANIC_BUTTON",
    "vehicleId": "veh-001",
    "message": "Emergency on board"
  }
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/v1/auth/login` | 5 requests | 15 minutes |
| `/api/v1/*` (API calls) | 100 requests | 1 minute |
| `/ws` (WebSocket) | 60 messages | 1 minute |
| File uploads | 10 requests | 1 minute |

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when window resets

---

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

**Common Error Codes:**
- `UNAUTHORIZED` (401): Invalid credentials
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request body
- `RATE_LIMITED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

---

## Versioning

API version is included in the URL path: `/api/v1/`. Breaking changes will result in a new version (v2, v3, etc.).

## Support

- **Documentation**: https://docs.vigilos.com
- **Status**: https://status.vigilos.com
- **Contact**: support@vigilos.com
