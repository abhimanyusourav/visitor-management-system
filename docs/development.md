# Multi-Site Factory VMS — Local Development & Testing Guide

## 1. Prerequisites
- **Node.js**: Version 20.x or higher (Tested on Node v20/v24).
- **Package Manager**: `npm` (v10+).
- **PostgreSQL**: Optional for local testing (the system includes an automated in-memory relational simulation when PostgreSQL is offline, and connects natively to PostgreSQL on port 5432 when available).
- **Webcam / Camera**: Supported in modern browsers (Chrome, Edge, Firefox, Safari) for live photo capture and gate QR scanning.

---

## 2. Quick Start (Zero to Running in 60 Seconds)

### 2.1 Backend Setup
Open a terminal in the `backend/` directory:

```bash
cd backend

# Install dependencies (already installed in workspace)
npm install

# Run database migrations and seed sample multi-site data
npm run migrate
npm run seed

# Start development API server (starts on http://localhost:5000)
npm run dev
```

### 2.2 Frontend Setup
Open a second terminal in the `frontend/` directory:

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server (starts on http://localhost:5173)
npm run dev
```

Visit **http://localhost:5173** in your browser.

---

## 3. Demo Credentials
The seed script creates ready-to-use accounts for all roles with the password **`Password@123`**:

| Role | Email | Password | Site Access | Key Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@vms.local` | `Password@123` | All Sites | Global system administration |
| **Org Admin** | `admin@vms.local` | `Password@123` | All Sites | Organization analytics & user management |
| **Site Admin** | `siteadmin@vms.local` | `Password@123` | Baghpat Factory | Plant configuration, employees & reports |
| **Gate Security** | `security@vms.local` | `Password@123` | Baghpat Factory | Gate QR Scanner, check-in/out, passes |
| **Receptionist** | `reception@vms.local` | `Password@123` | Baghpat Factory | Walk-in registration & visitor directory |
| **Host Employee** | `employee@vms.local` | `Password@123` | Baghpat Factory | Pre-register expected guests & approvals |

> [!TIP]
> The login screen features **1-Click Role Quick Switchers** that pre-fill credentials for instantaneous role-based testing.

---

## 4. Running Automated Tests

Run the full integration test suite:

```bash
cd backend
npm test
```

This runs:
- **Authentication & Credential Tests**: Password verification, failed attempt throttling, 401 unauthorized protection.
- **Visitor Lifecycle & Gate Operations**: Walk-in registration, QR token generation, public verification, live rollcall presence, gate checkout, token invalidation, and emergency evacuation export.
- **Multi-Site Isolation & RBAC Security**: Cross-site access rejection and role permission guards.

---

## 5. Testing Key Enterprise Workflows

### 5.1 Walk-In Visitor Registration & Pass Issuance
1. Log in as **Receptionist** (`reception@vms.local`).
2. Click **New Walk-In Visit** in the sidebar.
3. Type a phone number (e.g., `+91-9811122233` for auto-fill or enter a new number).
4. Click **Take Photo** to test the webcam modal (or upload a photo).
5. Select a Host Employee, Plant Department, and enter vehicle details (`UP-14-EA-1234`).
6. Click **Register & Issue Pass**.
7. The **Visitor Pass Modal** opens with the generated QR code, printable in Standard A4 or 4"x3" Thermal Sticky format.

### 5.2 Gate Scanner & Instant Checkout
1. Log in as **Gate Security** (`security@vms.local`).
2. Click **Gate QR Scanner** in the sidebar.
3. Scan a visitor's digital or printed badge QR code with your camera (or enter the QR token / pass number manually).
4. View the verified badge and click **Check Out Visitor**.
5. The pass is instantly marked as `USED` and the visitor is removed from the Currently Inside roster.

### 5.3 Live On-Site Rollcall & Emergency Evacuation Export
1. Click **Currently Inside** in the sidebar.
2. View real-time active visitors and headcount.
3. Click **Emergency Evacuation Export** to generate a printable safety manifest formatted for factory safety officers.

### 5.4 Progressive Web App (PWA) Verification
1. Open Chrome or Edge developer tools $\rightarrow$ **Application** $\rightarrow$ **Service Workers**.
2. Notice the registered service worker `sw.js` and `manifest.webmanifest`.
3. The app can be installed directly to the desktop or mobile home screen as a standalone application.
