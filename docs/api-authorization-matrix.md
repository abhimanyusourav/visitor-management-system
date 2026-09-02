# VMS API Authorization Matrix & Scoping Rules

This document specifies the server-side authentication, authorization (Role-Based Access Control), organization boundary enforcement, and site scoping applied across all API endpoints in the Visitor Management System.

---

## Authorization Enforcement Principles

1. **Authentication First**: Every protected route executes `authMiddleware`, validating the JWT and loading verified user context:
   - `req.user.userId`
   - `req.user.organizationId` (strictly sourced from JWT claim, never from request payload)
   - `req.user.role`
   - `req.user.authorizedSites` (array of site IDs user has access to)
   - `req.user.employeeId` (linked employee record, if applicable)
2. **Strict Site Isolation**: `siteContextMiddleware` verifies `req.headers['x-site-id']`, `req.query.site_id`, `req.query.siteId`, `req.body.site_id`, and `req.body.siteId`. If any parameter requests a site outside the user's authorized sites, the request is immediately rejected with `403 Forbidden` (`UNAUTHORIZED_SITE_ACCESS`).
3. **No Context Switching**: Non-superadmin requests cannot spoof or switch context via URL, query string, or payload.
4. **Host Employee Approval Authorization**: Employees can approve or reject **only** visits where `visit.host_employee_id === req.user.employeeId`. Cross-host approvals are rejected with `403 Forbidden` (`UNAUTHORIZED_HOST_APPROVAL`).
5. **Zero-PII Public Endpoints**: Public verification routes accept **only** high-entropy cryptographic tokens (not `pass_number` or `visit_code`) and return zero sensitive PII.

---

## Detailed Endpoint Authorization Matrix

| Endpoint | Method | Permitted Roles | Required Permission | Organization Scoping | Site Scoping | Additional Checks |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **Authentication & Profile** | | | | | | |
| `/api/auth/login` | POST | Public | None | Dynamic (by email) | Authorized sites loaded | Rate limited (5 req/15m); audit log on failure |
| `/api/auth/profile` | GET | Authenticated | None | `req.user.organizationId` | N/A | None |
| `/api/auth/switch-site` | POST | Authenticated | None | `req.user.organizationId` | Validates target site in authorized sites | Returns new JWT with target site |
| **Visits & Badges** | | | | | | |
| `/api/visits` | GET | Authenticated | `visit:view` | `organization_id = user.org` | Filtered by `req.siteId` / authorized sites | Multi-parametric filters sanitized |
| `/api/visits/currently-inside`| GET | Authenticated | `visit:view` | `organization_id = user.org` | Filtered by `req.siteId` | Status `CHECKED_IN` only |
| `/api/visits/pre-registered` | GET | Authenticated | `visit:view` | `organization_id = user.org` | Filtered by `req.siteId` | Expected today/upcoming |
| `/api/visits/emergency-export`| GET | Authenticated | `visit:view` | `organization_id = user.org` | Filtered by `req.siteId` | Generates active evacuation muster manifest |
| `/api/visits/:id` | GET | Authenticated | `visit:view` | `organization_id = user.org` | Checked against authorized sites | 403 if cross-site unauthorized |
| `/api/visits` | POST | Authenticated | `visit:create` | `organization_id = user.org` | Bound to active `site_id` | Collision-safe visit code generation |
| `/api/visits/:id/check-in` | POST | Authenticated | `visit:checkin` | `organization_id = user.org` | Verified against `visit.site_id` | Atomic status check (`REGISTERED`/`APPROVED` -> `CHECKED_IN`); records gate ID |
| `/api/visits/:id/check-out`| POST | Authenticated | `visit:checkout`| `organization_id = user.org` | Verified against `visit.site_id` | Atomic status check (`CHECKED_IN` -> `CHECKED_OUT`); invalidates pass |
| `/api/visits/:id/approve` | POST | Host, Site Admin, Admin, Super Admin | `visit:approve` | `organization_id = user.org` | Verified against authorized sites | If `EMPLOYEE`, `visit.host_employee_id === user.employeeId` strictly enforced |
| `/api/visits/:id/reject` | POST | Host, Site Admin, Admin, Super Admin | `visit:reject` | `organization_id = user.org` | Verified against authorized sites | If `EMPLOYEE`, `visit.host_employee_id === user.employeeId` strictly enforced |
| `/api/visits/:id/muster-status`| PUT | Safety Officer, Site Admin, Super Admin | `visit:checkout` | `organization_id = user.org` | Verified against active site | Validates status in `SAFE`, `MISSING`, `INJURED`, `NOT_VERIFIED` |
| **Passes & QR Verification** | | | | | | |
| `/api/passes/verify/:token`| GET | Public | None | Scoped by token | N/A | Validates high-entropy token only; zero PII response |
| `/api/passes/visit/:visitId`| GET | Authenticated | `visit:view` | `organization_id = user.org` | Checked against authorized sites | Returns full pass for badge printing |
| `/api/passes/:id/reprint` | POST | Authenticated | `visit:checkin` | `organization_id = user.org` | Checked against authorized sites | Increments reprint count; records audit trail |
| **Logical Gates** | | | | | | |
| `/api/gates` | GET | Authenticated | None | `organization_id = user.org` | Filtered by active `site_id` | Active gates list |
| `/api/gates` | POST | Super Admin, Site Admin, Admin | `org:manage` / `site:manage` | `organization_id = user.org` | Bound to active `site_id` | Unique constraint on `(site_id, code)` |
| `/api/gates/:id` | PUT | Super Admin, Site Admin, Admin | `org:manage` / `site:manage` | `organization_id = user.org` | Bound to active `site_id` | Soft update |
| **Visitors Directory** | | | | | | |
| `/api/visitors` | GET | Authenticated | `visitor:view` | `organization_id = user.org` | Scoped to org | Excludes deleted visitors |
| `/api/visitors/:id` | GET | Authenticated | `visitor:view` | `organization_id = user.org` | Scoped to org | Returns full profile |
| `/api/visitors/:id/blacklist` | POST | Admin, Super Admin, Security Supervisor | `visitor:blacklist` | `organization_id = user.org` | Scoped to org | Toggles blacklist; audits action |
| **Employees Directory** | | | | | | |
| `/api/employees` | GET | Authenticated | None | `organization_id = user.org` | Scoped to org | Host directory lookup |
| `/api/employees` | POST | Super Admin | `user:manage` | `organization_id = user.org` | Bound to assigned sites | Checks duplicate code, email, phone |
| `/api/employees/:id` | PUT | Super Admin | `user:manage` | `organization_id = user.org` | Scoped to org | Soft update |
| `/api/employees/:id` | DELETE | Super Admin | `user:manage` | `organization_id = user.org` | Scoped to org | Soft delete & unmaps sites |
| **Departments** | | | | | | |
| `/api/departments` | GET | Authenticated | None | `organization_id = user.org` | Scoped to org | Active departments list |
| `/api/departments` | POST | Super Admin | `org:manage` | `organization_id = user.org` | Scoped to org | Unique code check |
| `/api/departments/:id` | PUT | Super Admin | `org:manage` | `organization_id = user.org` | Scoped to org | Updates department metadata |
| `/api/departments/:id` | DELETE | Super Admin | `org:manage` | `organization_id = user.org` | Scoped to org | Soft delete |
| **Sites & Infrastructure** | | | | | | |
| `/api/sites` | GET | Authenticated | None | `organization_id = user.org` | Filters only user's authorized sites (unless Super Admin) | Directory of accessible sites |
| `/api/sites/:id` | GET | Authenticated | None | `organization_id = user.org` | Checked against authorized sites | 403 if unauthorized cross-site attempt |
| `/api/sites` | POST | Super Admin | `site:manage` | `organization_id = user.org` | Scoped to org | Unique site code enforcement |
| `/api/sites/:id` | PUT | Super Admin | `site:manage` | `organization_id = user.org` | Scoped to org | Updates site settings |
| **Reports & Analytics** | | | | | | |
| `/api/dashboard/stats` | GET | Authenticated | None | `organization_id = user.org` | Scoped to `req.siteId` | Real-time aggregate count metrics |
| `/api/dashboard/charts`| GET | Authenticated | None | `organization_id = user.org` | Scoped to `req.siteId` | Multi-parametric graphical distributions |
| `/api/reports/visitor-log`| GET | Authenticated | `report:view` | `organization_id = user.org` | Scoped to `req.siteId` | Paginated audit log reporting |
| `/api/reports/export/csv` | GET | Authenticated | `report:export` | `organization_id = user.org` | Scoped to `req.siteId` | CSV stream with CSV-injection escaping |
| **Audit Logs & Tamper Evidence** | | | | | | |
| `/api/audit-logs` | GET | Super Admin, Site Admin | `audit:view` | `organization_id = user.org` | Filtered by site if requested | Immutable audit log trail |
| `/api/audit-logs/verify-chain` | GET | Super Admin, Site Admin | `audit:view` | `organization_id = user.org` | Scoped to org | Validates cryptographic SHA-256 hash chain |
| **Secure File Storage** | | | | | | |
| `/api/storage/visitors/:filename` | GET | Authenticated | None | Verified via linked visitor record | N/A | Magic bytes checked on save; private cache headers; path traversal blocked |
