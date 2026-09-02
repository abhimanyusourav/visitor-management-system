# Multi-Site Factory VMS — Security, RBAC & Compliance

## 1. Authentication & Session Management
- **JWT (JSON Web Token)**: Standard RFC 7519 tokens signed using HMAC-SHA256 with strong configurable secrets (`JWT_SECRET`).
- **Token Expiry**: Configurable TTL (default `2h`).
- **Brute-Force Attack Protection**:
  - Automatic rate limiting on `/api/auth/login` (5 requests per 15-minute window per IP).
  - Failed login attempts recorded in `audit_logs` (`LOGIN_FAILED`) capturing IP, User Agent, and attempted email.
- **Password Security**: Bcrypt password hashing with configurable salt rounds (default 10).
- **Strict Site & Organization Scoping**: All routes enforce server-side organization retrieval from JWT. Client site parameters are strictly validated against user permissions (`siteContextMiddleware`), rejecting cross-site spoofing with `HTTP 403 Forbidden`.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission | Description | SUPER_ADMIN | ADMIN | SITE_ADMIN | SECURITY | RECEPTION | EMPLOYEE |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `org:manage` | Manage Organization & Billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `site:manage` | Create & Manage Factory Sites | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `user:manage` | Manage Users & Reset Passwords | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `employee:manage` | Add / Edit Plant Hosts | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `visitor:create` | Register Walk-In / Pre-Register | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `visitor:edit` | Edit Visitor Directory Profiles | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `visitor:blacklist`| Blacklist Problematic Visitors | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `visit:approve` | Approve / Reject Visitor Requests | ✅ | ✅ | ✅ | ❌ | ❌ | Host Only |
| `visit:checkin` | Check In Visitors at Gate | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `visit:checkout` | Check Out Visitors at Gate | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `pass:print` | Print Physical / Sticky Passes | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `pass:verify` | Scan & Verify QR Tokens | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `inside:view` | View Real-Time Rollcall | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `emergency:export` | Evacuation Manifest Export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `report:view` | View Visitor Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `report:export` | Export CSV Reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `audit:view` | View Tamper-Proof Audit Logs | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `settings:manage` | Configure Plant Policies | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

> **Host Employee Rule**: When an `EMPLOYEE` role user invokes `/api/visits/:id/approve` or `/api/visits/:id/reject`, the backend strictly enforces `visit.host_employee_id === req.user.employeeId`. Employee A cannot approve Employee B's visitors.

---

## 3. QR Code Cryptographic Token Security
To prevent visitor credential forging or barcode duplication:
1. QR codes encode a high-entropy 256-bit cryptographic hexadecimal token (`crypto.randomBytes(32).toString('hex')`).
2. Pass tokens are stored hashed in the database (`qr_token_hash = SHA256(token)`).
3. The public verification endpoint (`/api/passes/verify/:token`) accepts **only** cryptographic tokens (rejects `pass_number` and `visit_code`).
4. Upon visitor checkout, the pass status transitions to `USED`, rendering the QR token permanently invalid (`verificationStatus = 'ALREADY_CHECKED_OUT'`).

---

## 4. Privacy & Media Protection (Zero-PII Public Surface)
- **Zero-PII Public Verification**: The public badge verification page displays only non-sensitive verification status (`isValid`, `visitorName`, `companyName`, `hostName`, `department`, `siteName`, `purpose`, `checkInTime`). Contact numbers, government ID numbers, notes, internal visit IDs, and raw QR tokens are never returned.
- **Private Photo Endpoint**: Visitor photos are served strictly via authenticated routes (`/api/storage/visitors/:filename`) with `Cache-Control: private, no-cache, no-store, must-revalidate` and organization scoping checks.
- **Magic Bytes Validation**: Uploaded visitor images are verified against binary magic bytes (JPEG, PNG, WebP, GIF) to block disguised scripts or executables.

---

## 5. Atomic State Transitions & Concurrency
- Check-in and check-out updates execute with atomic conditional SQL constraints:
  - Check-in: `UPDATE visits SET status = 'CHECKED_IN' WHERE id = $1 AND status IN ('REGISTERED', 'APPROVED', 'PRE_REGISTERED')`
  - Check-out: `UPDATE visits SET status = 'CHECKED_OUT' WHERE id = $1 AND status = 'CHECKED_IN'`
- Concurrent double check-ins or double check-outs are safely rejected with `HTTP 409 Conflict`.

---

## 6. Tamper-Evident Cryptographic Audit Logging
Every sensitive action produces an immutable audit record chained via SHA-256 hashes:
- `previous_hash`: SHA-256 hash of the immediate preceding audit record.
- `event_hash`: `SHA256(previous_hash + ':' + action + ':' + entity_type + ':' + entity_id + ':' + timestamp + ':' + user_id)`
- Cryptographic integrity can be verified at any time via `GET /api/audit-logs/verify-chain`.
