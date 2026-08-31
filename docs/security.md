# Multi-Site Factory VMS — Security, RBAC & Compliance

## 1. Authentication & Session Management
- **JWT (JSON Web Token)**: Standard RFC 7519 tokens signed using HMAC-SHA256 with strong configurable secrets (`JWT_SECRET`).
- **Token Expiry**: Configurable TTL (default `8h`).
- **Brute-Force Attack Protection**:
  - Automatic account lockout after 5 consecutive failed login attempts.
  - Rate limiting via `express-rate-limit` (10 login attempts per 15-minute window per IP).
- **Password Security**: Bcrypt password hashing with configurable salt rounds (default 10).

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission | Description | SUPER_ADMIN | ADMIN | SITE_ADMIN | SECURITY | RECEPTION | EMPLOYEE |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `org:manage` | Manage Organization & Billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `site:manage` | Create & Manage Factory Sites | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `user:manage` | Manage Users & Reset Passwords | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `employee:manage` | Add / Edit Plant Hosts | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `visitor:create` | Register Walk-In / Pre-Register | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `visitor:edit` | Edit Visitor Directory Profiles | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `visitor:blacklist`| Blacklist Problematic Visitors | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `visit:approve` | Approve / Reject Visitor Requests | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
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

---

## 3. QR Code Cryptographic Token Security
To prevent visitor credential forging or barcode duplication:
1. QR codes encode an ephemeral random string: `qr_<48-hex-chars>` generated via Node.js `crypto.randomBytes(24)`.
2. No plain-text phone numbers, government ID numbers, or host emails exist inside the QR payload.
3. Once a visitor is checked out at the security gate, the pass status transitions to `USED`, rendering the QR code permanently invalid for re-entry.

---

## 4. Privacy & Data Protection (PII Masking)
- Government identification numbers (Aadhaar, PAN, Passport, Driving License) are masked upon entry (`XXXX-XXXX-1234`).
- Visitor photos captured via webcam or mobile camera are saved locally to an access-controlled filesystem storage bucket and served only via authenticated streaming routes.
- The public QR verification page displays only basic confirmation info (Visitor Name, Company, Host, Department, Site Name, Photo). No contact numbers or confidential visit notes are exposed.

---

## 5. Security Audit Logging
Every sensitive action produces an immutable audit record in `audit_logs` storing:
- `user_id` / Actor
- `organization_id` & `site_id`
- `action` (e.g. `LOGIN`, `VISITOR_CHECKED_IN`, `VISITOR_CHECKED_OUT`, `VISITOR_BLACKLISTED`, `EMERGENCY_EVACUATION_EXPORT`)
- `entity_type` & `entity_id`
- `ip_address` & `user_agent`
- `old_values` & `new_values` (JSONB)
- Timestamp
