import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { initDatabase, query } from './db.js';
import { runMigrations } from './migrate.js';

export async function runSeed() {
  console.log('🌱 Seeding Comprehensive Multi-Site Factory VMS Database...');
  await initDatabase();
  await runMigrations();

  const saltRounds = 10;
  const devPasswordHash = await bcrypt.hash('Password@123', saltRounds);

  // 1. Roles
  const roles = [
    { id: '10000000-0000-0000-0000-000000000001', name: 'Super Administrator', slug: 'SUPER_ADMIN', desc: 'Full system and multi-organization access' },
    { id: '10000000-0000-0000-0000-000000000002', name: 'Organization Admin', slug: 'ADMIN', desc: 'Organization-wide management and reports' },
    { id: '10000000-0000-0000-0000-000000000003', name: 'Site Administrator', slug: 'SITE_ADMIN', desc: 'Site-specific operations and employee management' },
    { id: '10000000-0000-0000-0000-000000000004', name: 'Gate Security', slug: 'SECURITY', desc: 'Visitor check-in, check-out, QR scanner, gate pass' },
    { id: '10000000-0000-0000-0000-000000000005', name: 'Front Desk Reception', slug: 'RECEPTION', desc: 'Walk-in registration, pass printing, expected list' },
    { id: '10000000-0000-0000-0000-000000000006', name: 'Host / Employee', slug: 'EMPLOYEE', desc: 'Pre-register expected guests, view own visitors, approvals' },
  ];

  for (const r of roles) {
    await query(`
      INSERT INTO roles (id, name, slug, description, is_system)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    `, [r.id, r.name, r.slug, r.desc]);
  }

  // 2. Permissions
  const permissions = [
    { code: 'org:manage', name: 'Manage Organization', module: 'organization' },
    { code: 'site:manage', name: 'Manage Sites', module: 'site' },
    { code: 'user:manage', name: 'Manage Users', module: 'user' },
    { code: 'employee:manage', name: 'Manage Employees', module: 'employee' },
    { code: 'visitor:create', name: 'Register Visitor', module: 'visitor' },
    { code: 'visitor:edit', name: 'Edit Visitor Profile', module: 'visitor' },
    { code: 'visitor:blacklist', name: 'Blacklist Visitor', module: 'visitor' },
    { code: 'visit:approve', name: 'Approve/Reject Visits', module: 'visit' },
    { code: 'visit:checkin', name: 'Check In Visitor', module: 'visit' },
    { code: 'visit:checkout', name: 'Check Out Visitor', module: 'visit' },
    { code: 'pass:print', name: 'Print Visitor Pass', module: 'pass' },
    { code: 'pass:verify', name: 'Verify QR Code', module: 'pass' },
    { code: 'inside:view', name: 'View Currently Inside', module: 'gate' },
    { code: 'emergency:export', name: 'Emergency Evacuation Export', module: 'gate' },
    { code: 'report:view', name: 'View Reports', module: 'report' },
    { code: 'report:export', name: 'Export Reports', module: 'report' },
    { code: 'audit:view', name: 'View Audit Logs', module: 'audit' },
    { code: 'settings:manage', name: 'Manage Settings', module: 'settings' },
  ];

  for (const p of permissions) {
    await query(`
      INSERT INTO permissions (code, name, module, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO NOTHING
    `, [p.code, p.name, p.module, p.name]);
  }

  // Role Permissions
  const allPerms = (await query(`SELECT id, code FROM permissions`)).rows;
  const permMap = new Map(allPerms.map((p: any) => [p.code, p.id]));

  const rolePermMap: Record<string, string[]> = {
    SUPER_ADMIN: permissions.map(p => p.code),
    ADMIN: permissions.map(p => p.code),
    SITE_ADMIN: ['employee:manage', 'visitor:create', 'visitor:edit', 'visitor:blacklist', 'visit:approve', 'visit:checkin', 'visit:checkout', 'pass:print', 'pass:verify', 'inside:view', 'emergency:export', 'report:view', 'report:export', 'audit:view', 'settings:manage'],
    SECURITY: ['visitor:create', 'visitor:edit', 'visit:checkin', 'visit:checkout', 'pass:print', 'pass:verify', 'inside:view', 'emergency:export', 'report:view'],
    RECEPTION: ['visitor:create', 'visitor:edit', 'visit:checkin', 'visit:checkout', 'pass:print', 'pass:verify', 'inside:view', 'report:view'],
    EMPLOYEE: ['visitor:create', 'visit:approve', 'report:view'],
  };

  for (const [slug, permCodes] of Object.entries(rolePermMap)) {
    const roleId = roles.find(r => r.slug === slug)?.id;
    if (!roleId) continue;
    for (const code of permCodes) {
      const pId = permMap.get(code);
      if (pId) {
        await query(`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [roleId, pId]);
      }
    }
  }

  // 3. Organization
  const orgId = '20000000-0000-0000-0000-000000000001';
  await query(`
    INSERT INTO organizations (id, name, code, slug, settings)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (code) DO NOTHING
  `, [orgId, 'Akriti JewelCraftz Pvt Ltd', 'AKRITI_JC', 'akriti-jewelcraftz', '{"timezone": "Asia/Kolkata", "visitorPassHeader": "AKRITI JEWELCRAFTZ PASS"}']);

  // 4. Factory Sites / Branches (Baghpat & Basi)
  const siteBaghpatId = '30000000-0000-0000-0000-000000000001';
  const siteBasiId = '30000000-0000-0000-0000-000000000002';

  await query(`
    INSERT INTO sites (id, organization_id, name, code, address, city, state, postal_code, timezone, phone, email)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (organization_id, code) DO NOTHING
  `, [siteBaghpatId, orgId, 'Akriti JewelCraftz - Baghpat Branch', 'AKR-BGP', 'Industrial Area, Phase II', 'Baghpat', 'Uttar Pradesh', '250609', 'Asia/Kolkata', '+91-12345-67890', 'baghpat@akritijewelcraftz.com']);

  await query(`
    INSERT INTO sites (id, organization_id, name, code, address, city, state, postal_code, timezone, phone, email)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (organization_id, code) DO NOTHING
  `, [siteBasiId, orgId, 'Akriti JewelCraftz - Basi Branch', 'AKR-BASI', 'Main Industrial Road, Basi', 'Basi, Baghpat', 'Uttar Pradesh', '250611', 'Asia/Kolkata', '+91-12345-67891', 'basi@akritijewelcraftz.com']);

  // 5. Users (System Login Accounts)
  const users = [
    { id: '50000000-0000-0000-0000-000000000001', email: 'superadmin@vms.local', role: 'SUPER_ADMIN', first: 'Super', last: 'Admin', phone: '+91-9876543210', sites: [siteBaghpatId, siteBasiId] },
    { id: '50000000-0000-0000-0000-000000000002', email: 'admin@vms.local', role: 'ADMIN', first: 'Org', last: 'Administrator', phone: '+91-9876543211', sites: [siteBaghpatId, siteBasiId] },
    { id: '50000000-0000-0000-0000-000000000003', email: 'siteadmin@vms.local', role: 'SITE_ADMIN', first: 'Baghpat', last: 'Branch Admin', phone: '+91-9876543212', sites: [siteBaghpatId] },
    { id: '50000000-0000-0000-0000-000000000004', email: 'security@vms.local', role: 'SECURITY', first: 'Gate 1', last: 'Security Officer', phone: '+91-9876543213', sites: [siteBaghpatId] },
    { id: '50000000-0000-0000-0000-000000000005', email: 'reception@vms.local', role: 'RECEPTION', first: 'Front Desk', last: 'Receptionist', phone: '+91-9876543214', sites: [siteBaghpatId] },
    { id: '50000000-0000-0000-0000-000000000006', email: 'employee@vms.local', role: 'EMPLOYEE', first: 'Abhimanyu', last: 'Kumar', phone: '+91-9876543215', sites: [siteBaghpatId] },
  ];

  for (const u of users) {
    const roleId = roles.find(r => r.slug === u.role)?.id;
    await query(`
      INSERT INTO users (id, organization_id, role_id, email, password_hash, first_name, last_name, phone, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [u.id, orgId, roleId, u.email, devPasswordHash, u.first, u.last, u.phone]);

    for (let i = 0; i < u.sites.length; i++) {
      await query(`
        INSERT INTO user_sites (user_id, site_id, is_primary)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, site_id) DO NOTHING
      `, [u.id, u.sites[i], i === 0]);
    }
  }

  // 6. Logical Gates
  const gateMainBgpId = '60000000-0000-0000-0000-000000000001';
  const gateVendorBgpId = '60000000-0000-0000-0000-000000000002';
  const gateMainBasiId = '60000000-0000-0000-0000-000000000003';

  await query(`
    INSERT INTO gates (id, organization_id, site_id, name, code, gate_type, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    ON CONFLICT (site_id, code) DO NOTHING
  `, [gateMainBgpId, orgId, siteBaghpatId, 'Main Security Gate', 'GATE-BGP-01', 'MAIN']);

  await query(`
    INSERT INTO gates (id, organization_id, site_id, name, code, gate_type, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    ON CONFLICT (site_id, code) DO NOTHING
  `, [gateVendorBgpId, orgId, siteBaghpatId, 'Vendor & Material Gate', 'GATE-BGP-02', 'VENDOR']);

  await query(`
    INSERT INTO gates (id, organization_id, site_id, name, code, gate_type, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    ON CONFLICT (site_id, code) DO NOTHING
  `, [gateMainBasiId, orgId, siteBasiId, 'Main Entry Gate', 'GATE-BASI-01', 'MAIN']);

  // 7. Seed Default Department & Host Employee
  const deptId = '70000000-0000-0000-0000-000000000001';
  await query(`
    INSERT INTO departments (id, organization_id, site_id, name, code, description)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (organization_id, code) DO NOTHING
  `, [deptId, orgId, siteBaghpatId, 'Operations & Engineering', 'OPS-01', 'Plant Operations']);

  const empId = '80000000-0000-0000-0000-000000000001';
  await query(`
    INSERT INTO employees (id, organization_id, user_id, department_id, employee_code, first_name, last_name, email, phone, designation, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
    ON CONFLICT (organization_id, employee_code) DO NOTHING
  `, [empId, orgId, '50000000-0000-0000-0000-000000000006', deptId, 'EMP-HOST-001', 'Abhimanyu', 'Kumar', 'employee@vms.local', '+91-9876543215', 'Production Lead']);

  await query(`
    INSERT INTO employee_sites (employee_id, site_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `, [empId, siteBaghpatId]);

  console.log('✅ System initialized successfully with master configuration and persistent storage.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}

