import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, query } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Host Employee Authorization Tests', () => {
  let app: any;
  let superAdminToken: string;
  let employeeAToken: string;
  let employeeBToken: string;
  let employeeAId: string;
  let employeeBId: string;
  let siteBaghpatId: string;
  let testDeptId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    siteBaghpatId = '30000000-0000-0000-0000-000000000001';

    // 1. Super Admin
    const superRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = superRes.body.data.token;
    const orgId = superRes.body.data.user.organizationId;

    // 2. Default seeded department
    const deptRes = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${superAdminToken}`);
    testDeptId = deptRes.body.data[0].id;

    // 3. Employee A (Already seeded: employee@vms.local, linked to 80000000-0000-0000-0000-000000000001)
    const empALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'employee@vms.local', password: 'Password@123' });
    employeeAToken = empALogin.body.data.token;
    employeeAId = '80000000-0000-0000-0000-000000000001';

    // 4. Create User & Employee B with dynamic email and code
    const uniqueSuffix = Date.now().toString().slice(-6);
    const emailB = `employee_b_${uniqueSuffix}@vms.local`;
    const codeB = `EMP-B-${uniqueSuffix}`;

    const userBRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: emailB,
        password: 'Password@123',
        first_name: 'Vikram',
        last_name: 'Singh',
        role_id: '10000000-0000-0000-0000-000000000006', // EMPLOYEE role
        site_ids: [siteBaghpatId],
      });
    const userBId = userBRes.body.data.id;

    const empBRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        employee_code: codeB,
        first_name: 'Vikram',
        last_name: 'Singh',
        email: emailB,
        phone: `+91-98765${uniqueSuffix.slice(-5)}`,
        designation: 'Safety Lead',
        department_id: testDeptId,
        site_ids: [siteBaghpatId],
      });
    employeeBId = empBRes.body.data.id;

    // Link userB to employeeB
    await query(`UPDATE employees SET user_id = $1 WHERE id = $2`, [userBId, employeeBId]);

    const empBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: emailB, password: 'Password@123' });
    employeeBToken = empBLogin.body.data.token;
  });

  it('should block Employee A from approving a visit where Employee B is the designated host', async () => {
    // 1. Register visit for Employee B
    const registerRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Site-Id', siteBaghpatId)
      .send({
        first_name: 'Suresh',
        last_name: 'Chaudhary',
        mobile_number: '+91-9988776611',
        company_name: 'Precision Tools',
        purpose: 'Vendor Assessment',
        visitor_type: 'Vendor',
        host_employee_id: employeeBId, // Employee B is designated host
        department_id: testDeptId,
      });

    assert.strictEqual(registerRes.status, 201);
    const visitId = registerRes.body.data.id;

    // 2. Employee A attempts to approve Employee B's visitor
    const approveRes = await request(app)
      .post(`/api/visits/${visitId}/approve`)
      .set('Authorization', `Bearer ${employeeAToken}`);

    assert.strictEqual(approveRes.status, 403);
    assert.strictEqual(approveRes.body.success, false);
    assert.strictEqual(approveRes.body.error.code, 'UNAUTHORIZED_HOST_APPROVAL');

    // 3. Employee A attempts to reject Employee B's visitor
    const rejectRes = await request(app)
      .post(`/api/visits/${visitId}/reject`)
      .set('Authorization', `Bearer ${employeeAToken}`)
      .send({ rejection_reason: 'I do not want this meeting' });

    assert.strictEqual(rejectRes.status, 403);
    assert.strictEqual(rejectRes.body.success, false);
    assert.strictEqual(rejectRes.body.error.code, 'UNAUTHORIZED_HOST_APPROVAL');

    // 4. Employee B (the designated host) approves the visit
    const validApproveRes = await request(app)
      .post(`/api/visits/${visitId}/approve`)
      .set('Authorization', `Bearer ${employeeBToken}`);

    assert.strictEqual(validApproveRes.status, 200);
    assert.strictEqual(validApproveRes.body.success, true);
  });

  it('should reject visit creation if host employee is not assigned to the active site', async () => {
    // 80000000-0000-0000-0000-000000000002 is assigned to Basi site, not Baghpat
    const siteBasiHostId = '80000000-0000-0000-0000-000000000002';
    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Site-Id', siteBaghpatId)
      .send({
        first_name: 'CrossSite',
        last_name: 'Visitor',
        mobile_number: '+91-9988776622',
        purpose: 'Meeting',
        visitor_type: 'Guest',
        host_employee_id: siteBasiHostId,
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_HOST_SITE');
  });
});
