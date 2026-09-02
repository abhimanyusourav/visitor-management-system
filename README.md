# 🏭 Multi-Site Factory Visitor Management System (VMS)

> A modern, secure, full-stack enterprise Visitor Management System designed specifically for industrial factories, manufacturing plants, and corporate campuses. Built for local development with zero external cloud dependencies, but architected from the ground up for seamless cloud scalability.

---

## 🌟 Highlights & Key Features

- 🏢 **Multi-Site Architecture**: Organization $\rightarrow$ Sites $\rightarrow$ Departments $\rightarrow$ Employees $\rightarrow$ Visitors $\rightarrow$ Visits hierarchy with strict cross-site data isolation.
- 👤 **Visitor vs. Visit Separation**: Reusable visitor profiles with fast phone auto-fill lookup and historical visit logs.
- 🛡️ **Zero-PII QR Code Verification**: High-entropy 48-char cryptographic QR tokens that prevent barcode duplication and leak zero sensitive PII.
- 🚨 **Live On-Site Rollcall & Emergency Evacuation Export**: Real-time roster of active visitors with a 1-click printable safety evacuation manifest for factory fire drills and plant emergencies.
- 📷 **Webcam & Mobile Camera Capture**: WebRTC live photo capture with instant local storage and file upload fallback.
- 🖨️ **Dual Badge Print Engine**: Standard A4 Sheet Passes with sign-off blocks and 4"x3" Thermal Sticky Badges with barcode and safety rules.
- 👥 **Granular Role-Based Access Control (RBAC)**: 6 distinct roles (`SUPER_ADMIN`, `ADMIN`, `SITE_ADMIN`, `SECURITY`, `RECEPTION`, `EMPLOYEE`) with 18 permission keys.
- 📱 **Progressive Web App (PWA)**: Installable as a standalone app on gate tablets and mobile phones with offline shell precaching.
- 📊 **Executive Analytics & CSV Export**: Real-time visitor KPI metric cards, 7-day traffic charts, category breakdowns, and streaming CSV reports.
- 📜 **Tamper-Proof Audit Logging**: Immutable security trail of all logins, check-ins, pass generations, and administrative changes.

---

## 🚀 Quick Start Guide

### 1. Start the Backend Server
```bash
cd backend
npm run migrate    # Apply database schema
npm run seed       # Seed demo multi-site data & credentials
npm run dev        # Start API server on http://localhost:5000
```

### 2. Start the Frontend Application
```bash
cd frontend
npm run dev        # Start Vite dev server on http://localhost:5173
```

Visit **http://localhost:5173** in your web browser.

---

## 🔑 Demo User Credentials

Password for all demo accounts: **`Password@123`**

| Role | Demo Email | Site Scope | Quick Actions |
| :--- | :--- | :--- | :--- |
| **👑 Super Admin** | `superadmin@vms.local` | All Sites | Global Tenant & System Management |
| **🏢 Org Admin** | `admin@vms.local` | All Sites | User Management, Multi-Site Analytics, Audit Logs |
| **🏭 Site Admin** | `siteadmin@vms.local` | Baghpat Factory | Plant Employees, Departments, Policy Settings |
| **🛡️ Gate Security** | `security@vms.local` | Baghpat Factory | Gate QR Scanner, Check-in/out, Emergency Evacuation |
| **🛎️ Receptionist** | `reception@vms.local` | Baghpat Factory | Walk-In Registration, Visitor Directory, Badge Print |
| **👤 Host Employee** | `employee@vms.local` | Baghpat Factory | Pre-Register Guests, Host Approvals Queue |

> [!TIP]
> The login screen contains **1-Click Demo Login Buttons** that pre-fill credentials for instantaneous role testing.

---

## 🧪 Automated Regression & Security Testing

To run the complete automated test suite (10 suites, 24 test cases):

```bash
cd backend
npm test
```

### Test Coverage:
- `tests/auth.test.ts`: Login validation, password verification, brute-force protection, 401 unauthorized checks.
- `tests/visits_workflow.test.ts`: Complete visit registration, QR token generation, public verification, live rollcall presence, gate checkout, token invalidation, and emergency evacuation export.
- `tests/rbac_isolation.test.ts`: Multi-site data isolation (Site A cannot access Site B) and RBAC permission enforcement.
- `tests/site_isolation.test.ts`: Strict rejection of header, query string, body, and URL site ID parameter spoofing with `HTTP 403 Forbidden`.
- `tests/host_authorization.test.ts`: Host employee approval guardrails (Employee A cannot approve Employee B's visitor).
- `tests/atomic_concurrency.test.ts`: Atomic check-in & check-out state transitions preventing double check-in and double check-out race conditions (HTTP 409 Conflict).
- `tests/qr_security.test.ts`: Token-only verification rejection of `pass_number`/`visit_code`, zero-PII public response validation.
- `tests/storage_security.test.ts`: Authenticated photo streaming, magic bytes image verification, path traversal prevention.
- `tests/audit_hash_chain.test.ts`: Failed login security audit logs and SHA-256 cryptographic audit chain verification.
- `tests/gates.test.ts`: Physical and logical checkpoint gate CRUD scoped to active plant site.

---

## 📂 Project Structure

```
Visitor-Management-System/
├── backend/
│   ├── src/
│   │   ├── common/         # Auth, RBAC, SiteContext middlewares, error handling, rate limiters
│   │   ├── config/         # Typed environment variable loader
│   │   ├── database/       # PostgreSQL DDL schema (18 tables), pool driver, migrate & seed scripts
│   │   ├── modules/        # Auth, visits, visitors, passes, employees, depts, sites, reports, audit
│   │   ├── app.ts          # Express application setup with Helmet & CORS
│   │   └── server.ts       # Server bootstrap
│   ├── tests/              # Node:test automated test suites
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/     # AppLayout, Sidebar, Header, WebcamModal, QRScannerModal, VisitorPassModal
│   │   ├── pages/          # Login, Dashboard, CurrentlyInside, GateScan, NewVisit, PreRegister, Visits...
│   │   ├── services/       # Configured Axios client with Bearer token & X-Site-Id injection
│   │   ├── stores/         # Zustand auth and site context store
│   │   ├── types/          # Full TypeScript domain models
│   │   ├── App.tsx         # React Router and protected routes
│   │   └── main.tsx        # React root
│   ├── vite.config.ts      # Vite config with PWA plugin
│   ├── tailwind.config.js  # Industrial enterprise theme
│   └── package.json
└── docs/
    ├── architecture.md     # System architecture, multi-site isolation, entity lifecycle
    ├── database.md         # 18-table schema documentation & ER diagrams
    ├── api.md              # REST API reference with unified envelopes
    ├── security.md         # RBAC matrix, QR token entropy, privacy & PII masking
    ├── development.md      # Local setup guide & testing workflows
    ├── deployment.md       # Production deployment, Docker, Nginx & scaling
    └── user-roles.md       # User roles, responsibilities, and gate SOPs
```

---

## 📖 Complete Documentation Index

For in-depth technical documentation, refer to the `docs/` folder:
- [Security Remediation & Hardening Report](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/security-remediation-report.md)
- [API Authorization Matrix & Scoping Rules](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/api-authorization-matrix.md)
- [System Architecture](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/architecture.md)
- [Database Schema & ER Diagrams](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/database.md)
- [REST API Specification](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/api.md)
- [Security, RBAC & Compliance](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/security.md)
- [Development & Testing Guide](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/development.md)
- [Production Deployment Guide](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/deployment.md)
- [User Roles & Standard Operating Procedures](file:///d:/04_Projects_&_Code/Visitor-Management-System/docs/user-roles.md)
