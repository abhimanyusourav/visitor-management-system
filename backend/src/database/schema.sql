-- Multi-Site Factory Visitor Management System (VMS)
-- Complete PostgreSQL Schema

-- Enable UUID extension if on older Postgres, gen_random_uuid() is built-in on Postgres 13+
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations (Top-level multi-tenant container)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 2. Sites / Factory Locations
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    postal_code VARCHAR(20) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    phone VARCHAR(50),
    email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_org_site_code UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_sites_org_active ON sites(organization_id, is_active);

-- 2.1 Logical Gates (Physical Site Entry/Exit Checkpoints)
CREATE TABLE IF NOT EXISTS gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    gate_type VARCHAR(50) NOT NULL DEFAULT 'MAIN',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_site_gate_code UNIQUE (site_id, code)
);
CREATE INDEX IF NOT EXISTS idx_gates_site_active ON gates(site_id, is_active);

-- 3. Roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 7. User Site Mappings
CREATE TABLE IF NOT EXISTS user_sites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, site_id)
);

-- 8. Departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_dept_org_code UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_departments_org_site ON departments(organization_id, site_id);

-- 9. Employees (Host Directory)
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    designation VARCHAR(100) NOT NULL,
    photo_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_employee_org_code UNIQUE (organization_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_employees_org_dept ON employees(organization_id, department_id);

-- 10. Employee Site Mappings
CREATE TABLE IF NOT EXISTS employee_sites (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    PRIMARY KEY (employee_id, site_id)
);

-- 11. Visitors (Reusable Identity Profile)
CREATE TABLE IF NOT EXISTS visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    mobile_number VARCHAR(30) NOT NULL,
    company_name VARCHAR(200),
    designation VARCHAR(100),
    default_visitor_type VARCHAR(50) NOT NULL DEFAULT 'Guest',
    id_type VARCHAR(50),
    id_number_masked VARCHAR(100),
    photo_url VARCHAR(500),
    notes TEXT,
    is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
    blacklist_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_visitors_org_mobile ON visitors(organization_id, mobile_number);
CREATE INDEX IF NOT EXISTS idx_visitors_org_name ON visitors(organization_id, full_name);
CREATE INDEX IF NOT EXISTS idx_visitors_org_company ON visitors(organization_id, company_name);

-- 12. Visits (Specific Visit Event)
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE RESTRICT,
    host_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    visit_code VARCHAR(50) UNIQUE NOT NULL,
    visitor_type VARCHAR(50) NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
    expected_date DATE NOT NULL,
    expected_time VARCHAR(20) NOT NULL,
    expected_exit_time VARCHAR(20),
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    accompanying_count INT NOT NULL DEFAULT 0,
    remarks TEXT,
    checked_in_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    checked_out_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    entry_gate_id UUID REFERENCES gates(id) ON DELETE SET NULL,
    exit_gate_id UUID REFERENCES gates(id) ON DELETE SET NULL,
    emergency_muster_status VARCHAR(30) NOT NULL DEFAULT 'NOT_VERIFIED',
    assembly_point VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_visits_site_status ON visits(site_id, status);
CREATE INDEX IF NOT EXISTS idx_visits_site_expected ON visits(site_id, expected_date);
CREATE INDEX IF NOT EXISTS idx_visits_site_checkin ON visits(site_id, check_in_time);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_muster_status ON visits(site_id, emergency_muster_status);

-- 13. Visit Vehicles
CREATE TABLE IF NOT EXISTS visit_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(50) NOT NULL,
    vehicle_number VARCHAR(50) NOT NULL,
    driver_name VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_visit ON visit_vehicles(visit_id);

-- 14. Visitor Passes
CREATE TABLE IF NOT EXISTS visitor_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID UNIQUE NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    pass_number VARCHAR(50) UNIQUE NOT NULL,
    qr_token VARCHAR(128) UNIQUE NOT NULL,
    qr_token_hash VARCHAR(64) UNIQUE,
    pass_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    printed_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_passes_token_status ON visitor_passes(qr_token, status);
CREATE INDEX IF NOT EXISTS idx_passes_token_hash ON visitor_passes(qr_token_hash);

-- 15. Visitor Documents
CREATE TABLE IF NOT EXISTS visitor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    document_type VARCHAR(50) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, is_read);

-- 17. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,
    previous_hash VARCHAR(64),
    event_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_org_site ON audit_logs(organization_id, site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_hash ON audit_logs(event_hash);

-- 18. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
