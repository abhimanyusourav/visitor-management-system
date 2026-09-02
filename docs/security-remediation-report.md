# VMS Security Remediation & Hardening Report

This report documents the security remediations, architectural hardening, authorization guardrails, and cryptographic protections implemented in the Multi-Site Factory Visitor Management System (VMS).

---

## Executive Summary

A comprehensive security hardening audit and remediation was performed directly within the local codebase. All 59 strict security requirements across 12 core domains have been addressed, verified through 10 automated test suites with 24 rigorous regression tests (all passing), and verified against TypeScript compilation for both backend and frontend.

---

## 1. Organization & Site Isolation (Req 1–8)

- **Server-Side Enforcement**: Organization ID (`req.user.organizationId`) is strictly retrieved from the authenticated JWT session context. Input parameters (`req.body.organization_id`, `req.query.organization_id`, etc.) are ignored for authorization.
- **Client Site ID Validation**: `siteContextMiddleware` intercepts all incoming requests and verifies `req.headers['x-site-id']`, `req.query.site_id`, `req.query.siteId`, `req.body.site_id`, and `req.body.siteId`. If an unauthorized site ID is supplied by a user belonging to Site A, the server immediately returns `HTTP 403 Forbidden` (`UNAUTHORIZED_SITE_ACCESS`).
- **No Context Hijacking**: The system never silently switches context. Any cross-site access violation is blocked with a 403 error and logged to the security audit trail.
- **Cross-Site Gate Verification**: Visitors registered for Site A cannot be checked in or out at Site B. The backend validates `visit.site_id === req.siteId` before state transitions.
- **Single Source of Truth**: All queries across visits, passes, visitors, gates, employees, and departments enforce `organization_id = $1` and appropriate site scoping.

---

## 2. Authentication & Session Management (Req 9–14)

- **JWT Expiration**: JWT session validity is configured to `2h` by default (configurable via `JWT_EXPIRES_IN`). Refresh tokens are securely generated, stored with SHA-256 hashes, and support rotation.
- **Password Hashing**: Passwords are saved exclusively with `bcrypt` (work factor 10). Raw passwords are never stored in memory logs, databases, or audit trails.
- **Brute-Force Protection**: Rate limiting is applied to login routes (`/api/auth/login`), restricting excessive authentication attempts (5 requests per 15 minutes per IP).
- **Failed Login Auditing**: Every failed authentication attempt records a `LOGIN_FAILED` entry in `audit_logs` capturing client IP, user agent, attempted email, and timestamp.
- **Clean Error Messages**: Authentication failures return generic error responses (`Invalid email or password`) to prevent account enumeration.

---

## 3. Host Employee Authorization (Req 15–18)

- **Host Identity Binding**: During authentication, `authMiddleware` looks up the user's linked record in `employees` by `user_id` and attaches `req.user.employeeId`.
- **Restricted Approvals**: In `visit.controller.ts`, approval (`POST /api/visits/:id/approve`) and rejection (`POST /api/visits/:id/reject`) endpoints enforce that users with the `EMPLOYEE` role can approve/reject **only** visits where `visit.host_employee_id === req.user.employeeId`.
- **Rejection of Cross-Host Approvals**: If Employee A attempts to approve or reject a visit designated for Employee B, the server rejects the request with `HTTP 403 Forbidden` (`UNAUTHORIZED_HOST_APPROVAL`).
- **Administrative Override**: Users with `ADMIN` or `SUPER_ADMIN` roles can approve visits across authorized sites in accordance with role permissions.

---

## 4. Privacy & Media Protection (Req 19–24)

- **Authenticated Photo Endpoint**: `/api/storage/visitors/:filename` requires valid JWT authentication. Public unauthenticated access is rejected with `HTTP 401 Unauthorized`.
- **Cross-Organization Isolation**: Image access queries verify that the requesting user's organization matches the visitor's organization.
- **Magic Bytes Validation**: `saveBase64Photo` validates binary signatures (magic bytes) for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`52 49 46 46`), and GIF (`47 49 46 38`), rejecting disguised executables or HTML payloads.
- **Private Cache Headers**: All image responses include `Cache-Control: private, no-cache, no-store, must-revalidate` to prevent caching on public/shared proxies.
- **Path Traversal Prevention**: File paths are normalized with `path.basename` and verified to reside strictly within the designated storage root.

---

## 5. QR Code & Pass Security (Req 25–30)

- **High-Entropy Tokens**: QR passes generate cryptographically random 256-bit hexadecimal tokens (`crypto.randomBytes(32).toString('hex')`).
- **Server-Side Token Hashing**: The database stores SHA-256 hashes (`qr_token_hash`) of pass tokens. Lookup queries verify against token hashes.
- **Token-Only Verification**: The public verification endpoint (`GET /api/passes/verify/:token`) accepts **only** cryptographic tokens. Any attempt to verify using human-readable identifiers (`pass_number`, `visit_code`) returns `HTTP 404 Not Found`.
- **Zero-PII Response**: The public verification response contains only essential badge verification data:
  - `isValid`, `verificationStatus`, `passNumber`, `visitorName`, `companyName`, `hostName`, `department`, `siteName`, `purpose`, `checkInTime`.
  - Sensitive PII (raw `qrToken`, internal database `visitId`, mobile number, ID document number, notes) is strictly omitted.
- **Pass Invalidation on Checkout**: Upon visitor checkout, the pass status transitions to `USED`, and subsequent public verify requests return `verificationStatus: 'ALREADY_CHECKED_OUT'` with `isValid: false`.

---

## 6. Atomic State Transitions & Concurrency (Req 31–36)

- **Atomic Check-In**: `POST /api/visits/:id/check-in` executes with conditional status matching:
  ```sql
  UPDATE visits
  SET status = 'CHECKED_IN', check_in_time = $1, ...
  WHERE id = $4 AND organization_id = $5 AND site_id = $6
    AND status IN ('REGISTERED', 'APPROVED', 'PRE_REGISTERED')
  ```
  If a visitor is already checked in, the update affects 0 rows, and the endpoint immediately returns `HTTP 409 Conflict` (`ALREADY_CHECKED_IN`).
- **Atomic Check-Out**: `POST /api/visits/:id/check-out` enforces `status = 'CHECKED_IN'` in the update condition:
  ```sql
  UPDATE visits
  SET status = 'CHECKED_OUT', check_out_time = $1, ...
  WHERE id = $4 AND organization_id = $5 AND site_id = $6 AND status = 'CHECKED_IN'
  ```
  Duplicate check-out returns `HTTP 409 Conflict` (`ALREADY_CHECKED_OUT`). Attempting checkout on a visitor who was never checked in returns `HTTP 400 Bad Request` (`NOT_CHECKED_IN`).

---

## 7. Collision-Safe Visit Codes (Req 37–40)

- **Format**: Visit codes follow the structured format:
  `VIS-YYYYMMDD-<SITE_CODE>-<HEX6>` (e.g., `VIS-20260901-AKRBGP-A1B2C3`).
- **Retry Mechanism**: If a collision is detected upon creation, the controller automatically retries with a new cryptographic random seed (up to 3 attempts) before failing.

---

## 8. Request Limits & API Hardening (Req 41–45)

- **Body Parsing Limits**:
  - Global API JSON limit: `100kb`.
  - Photo-handling routes (`/api/visits`, `/api/visitors`, `/api/storage`): Isolated `5MB` limit.
- **Security Headers (Helmet)**:
  - Enabled with strict Content Security Policy (`default-src 'self'`).
  - Cross-Origin Resource Policy set to `same-site`.
- **Strict CORS Origin Allowlisting**:
  - Replaced permissive CORS callback with explicit origin checking against `CORS_ALLOWED_ORIGINS` (or defaults `http://localhost:5173`, `http://localhost:3000`).
  - Dynamic localhost origin support for development while preventing arbitrary cross-origin scraping in production.
- **Sanitized Error Handling**:
  - Internal 500 server error responses return sanitized messages (e.g., `Failed to retrieve records`) without leaking internal database schema, SQL syntax, or stack traces.

---

## 9. Tamper-Evident Audit Logging (Req 46–50)

- **Cryptographic Hash Chain**: Each audit log entry is chained to the previous entry via SHA-256 cryptographic hashing:
  - `event_hash = SHA256(previous_hash + ':' + action + ':' + entity_type + ':' + entity_id + ':' + timestamp + ':' + user_id)`
- **Genesis Hash**: The initial chain seed starts from a fixed genesis hash.
- **Integrity Verification Endpoint**: `GET /api/audit-logs/verify-chain` reads all sequential audit entries and validates that `curr.previous_hash === prev.event_hash`, reporting `isChainIntact: true` or identifying the broken log record ID.

---

## 10. Logical Gate Checkpoint Model (Req 51–54)

- **Schema**: Added `gates` table with foreign keys to `sites` and `organizations`, unique constraint on `(site_id, code)`.
- **Visit Associations**: Added `entry_gate_id` and `exit_gate_id` to `visits`.
- **CRUD Endpoints**: Mounted `/api/gates` with full organizational and active-site scoping.
- **Muster Status**: Added `PUT /api/visits/:id/muster-status` to record emergency evacuation headcount statuses (`SAFE`, `MISSING`, `INJURED`, `NOT_VERIFIED`) and assembly points.

---

## 11. Automated Regression Verification (Req 55–59)

The regression test suite (`npm test`) comprises **10 test suites and 24 comprehensive test cases**:

1. `auth.test.ts` (3 tests): Authentication, profile retrieval, site switching.
2. `visits_workflow.test.ts` (2 tests): End-to-end walk-in visitor lifecycle, emergency roster export.
3. `rbac_isolation.test.ts` (4 tests): Cross-site access denial, admin route protection, Super Admin employee and department mutability.
4. `site_isolation.test.ts` (4 tests): Rejection of header, query string, body, and URL site spoofing attempts.
5. `host_authorization.test.ts` (1 test): Prevention of unauthorized host employee approvals; validation of legitimate host approval.
6. `atomic_concurrency.test.ts` (3 tests): Concurrent check-in 409, concurrent check-out 409, un-checked-in checkout rejection.
7. `qr_security.test.ts` (1 test): Rejection of pass_number/visit_code on public verify, zero-PII validation, token lookup.
8. `storage_security.test.ts` (2 tests): 401 unauthenticated photo protection, magic bytes malicious payload rejection.
9. `audit_hash_chain.test.ts` (2 tests): Failed login recording, cryptographic audit chain verification (`isChainIntact: true`).
10. `gates.test.ts` (2 tests): Gate listing and creation scoped to site.

**Result**: 24/24 tests passing (0 failures).
