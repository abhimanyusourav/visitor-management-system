# Multi-Site Factory VMS — REST API Specification

## 1. Global Conventions

### 1.1 Headers
| Header | Type | Description |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <JWT_TOKEN>` | Required on all protected endpoints. |
| `X-Site-Id` | `UUID` | Specifies active site context for site-scoped operations. |
| `Content-Type` | `application/json` | Required for POST/PUT payloads. |

### 1.2 Unified Response Envelope
All API endpoints return standard JSON responses:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED_SITE_ACCESS",
    "message": "You do not have access permissions for the requested site."
  }
}
```

---

## 2. API Endpoints Reference

### 2.1 Authentication (`/api/auth`)
- `POST /api/auth/login`: Authenticate with email and password. Returns JWT token, user info, permissions, and authorized sites list.
- `POST /api/auth/logout`: Invalidate session.
- `GET /api/auth/me`: Hydrate current user profile and active permissions.
- `POST /api/auth/change-password`: Change user password.

### 2.2 Visits & Gate Operations (`/api/visits`)
- `GET /api/visits`: List and search visits with filters (`status`, `visitorType`, `startDate`, `endDate`, `search`, `page`, `limit`).
- `GET /api/visits/currently-inside`: Real-time roster of visitors currently on plant premises.
- `GET /api/visits/emergency-export`: 1-Click Safety Evacuation Manifest with total headcount and contact details.
- `POST /api/visits`: Create walk-in visit or pre-register expected guest.
- `GET /api/visits/:id`: Detailed view of a visit record.
- `POST /api/visits/:id/check-in`: Perform gate check-in and timestamp entry.
- `POST /api/visits/:id/check-out`: Perform gate check-out and timestamp departure (invalidates QR pass).
- `POST /api/visits/:id/approve`: Host / Admin approval of pending visit.
- `POST /api/visits/:id/reject`: Host / Admin rejection of pending visit with reason.

### 2.3 Visitor Directory (`/api/visitors`)
- `GET /api/visitors`: Search reusable visitor profiles.
- `POST /api/visitors/lookup`: Fast auto-fill phone lookup.
- `GET /api/visitors/:id`: Get visitor profile and history of past visits.
- `POST /api/visitors`: Create or update reusable visitor profile.
- `POST /api/visitors/:id/blacklist`: Flag / Blacklist a visitor with reason.

### 2.4 Visitor Passes & QR Tokens (`/api/passes`)
- `GET /api/passes/verify/:token`: **Public Endpoint** for mobile QR verification (zero PII exposure).
- `GET /api/passes/:visitId`: Retrieve pass details, printable badge HTML, and generated QR Code Data URL.
- `POST /api/passes/:id/reprint`: Record pass reprint event in audit logs.

### 2.5 Employees & Hosts (`/api/employees`)
- `GET /api/employees`: Search host employee directory by name, code, or department.
- `POST /api/employees`: Add new host employee.
- `PUT /api/employees/:id`: Update employee details.

### 2.6 Plant Departments (`/api/departments`)
- `GET /api/departments`: List plant departments.
- `POST /api/departments`: Create new department.

### 2.7 Organizations & Sites (`/api/organizations`, `/api/sites`)
- `GET /api/sites`: List user-authorized sites.
- `POST /api/sites`: Create new factory site.
- `GET /api/sites/:id`: Get site details and settings.
- `PUT /api/sites/:id`: Update site details.

### 2.8 Reports & Analytics (`/api/reports`)
- `GET /api/reports/dashboard`: Live KPI metrics, weekly trends, and category breakdowns.
- `GET /api/reports/visitor-log`: Filterable report log.
- `GET /api/reports/export/csv`: Stream downloadable CSV report file.

### 2.9 System Security & Auditing (`/api/users`, `/api/audit-logs`, `/api/settings`)
- `GET /api/users`: List system accounts.
- `POST /api/users`: Create user with role and site assignments.
- `POST /api/users/:id/reset-password`: Administrator password reset.
- `GET /api/audit-logs`: Paginated immutable security audit trail.
- `GET /api/settings`: Get organization/site visitor policy settings.
- `PUT /api/settings`: Update visitor policy settings.
