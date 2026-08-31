import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Multi-Site Data Isolation & RBAC Security Tests', () => {
  let app: any;
  let siteAdminToken: string;
  let employeeToken: string;
  let baghpatSiteId: string;
  let basiSiteId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // Authenticate site admin (Baghpat Branch only)
    const siteAdminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'siteadmin@vms.local',
        password: 'Password@123'
      });

    siteAdminToken = siteAdminRes.body.data.token;
    baghpatSiteId = '30000000-0000-0000-0000-000000000001';
    basiSiteId = '30000000-0000-0000-0000-000000000002';

    // Authenticate regular host employee (No user management permission)
    const empLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employee@vms.local',
        password: 'Password@123'
      });

    employeeToken = empLoginRes.body.data.token;
  });

  it('should deny cross-site access when user attempts to access unauthorized site ID', async () => {
    // Baghpat branch admin attempting to access Basi Branch
    const res = await request(app)
      .get('/api/visits')
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .set('X-Site-Id', basiSiteId);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');
  });

  it('should block non-admin users from accessing User Administration endpoints', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${employeeToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('should restrict employee add, update, and delete exclusively to SUPER_ADMIN', async () => {
    const testSuffix = Math.floor(Math.random() * 100000);
    // Authenticate Super Admin
    const superAdminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@vms.local',
        password: 'Password@123',
      });
    const superAdminToken = superAdminRes.body.data.token;

    // 0. Super Admin creates a department for testing
    const deptRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `Safety & Environmental ${testSuffix}`,
        code: `SAF-${testSuffix}`,
        description: 'Test Department',
      });
    assert.strictEqual(deptRes.status, 201);
    const testDeptId = deptRes.body.data.id;

    // 1. Non-Super Admin (Site Admin) attempts to add employee -> Should be blocked (403 FORBIDDEN_ROLE)
    const siteAdminCreateRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .send({
        employee_code: `DENIED-${testSuffix}`,
        first_name: 'Test',
        last_name: 'Denied',
        email: `denied_${testSuffix}@vms.local`,
        phone: `+91-999${testSuffix}`,
        designation: 'Staff',
        department_id: testDeptId,
      });
    assert.strictEqual(siteAdminCreateRes.status, 403);
    assert.strictEqual(siteAdminCreateRes.body.error.code, 'FORBIDDEN_ROLE');

    // 2. Super Admin adds new employee -> Should succeed (201)
    const superCreateRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        employee_code: `EMP-${testSuffix}`,
        first_name: 'Rohan',
        last_name: 'Verma',
        email: `rohan_${testSuffix}@vms.local`,
        phone: `+91-987${testSuffix}`,
        designation: 'Safety Officer',
        department_id: testDeptId,
      });
    assert.strictEqual(superCreateRes.status, 201);
    assert.strictEqual(superCreateRes.body.success, true);
    const createdEmpId = superCreateRes.body.data.id;

    // 2b. Attempt to add another employee with DUPLICATE employee_code -> Should fail (409 Conflict)
    const dupCodeRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        employee_code: `EMP-${testSuffix}`,
        first_name: 'Sameer',
        last_name: 'Khan',
        email: `diff_${testSuffix}@vms.local`,
        phone: `+91-888${testSuffix}`,
        designation: 'Security',
        department_id: testDeptId,
      });
    assert.strictEqual(dupCodeRes.status, 409);
    assert.strictEqual(dupCodeRes.body.error.code, 'DUPLICATE_EMPLOYEE_CODE');

    // 2c. Attempt to add another employee with DUPLICATE email -> Should fail (409 Conflict)
    const dupEmailRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        employee_code: `UNIQ-${testSuffix}`,
        first_name: 'Sameer',
        last_name: 'Khan',
        email: `rohan_${testSuffix}@vms.local`,
        phone: `+91-777${testSuffix}`,
        designation: 'Security',
        department_id: testDeptId,
      });
    assert.strictEqual(dupEmailRes.status, 409);
    assert.strictEqual(dupEmailRes.body.error.code, 'DUPLICATE_EMAIL');

    // 2d. Super Admin adds employee without last name (only first name) -> Should succeed (201)
    const noLastNameRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        employee_code: `NOLAST-${testSuffix}`,
        first_name: 'Rameshwar',
        last_name: '',
        designation: 'Craftsman',
        department_id: testDeptId,
      });
    assert.strictEqual(noLastNameRes.status, 201);
    assert.strictEqual(noLastNameRes.body.success, true);
    assert.strictEqual(noLastNameRes.body.data.first_name, 'Rameshwar');
    assert.strictEqual(noLastNameRes.body.data.last_name, null);

    // 3. Site Admin attempts to update employee -> Should be blocked (403 FORBIDDEN_ROLE)
    const siteAdminUpdateRes = await request(app)
      .put(`/api/employees/${createdEmpId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .send({ designation: 'Hacked Designation' });
    assert.strictEqual(siteAdminUpdateRes.status, 403);
    assert.strictEqual(siteAdminUpdateRes.body.error.code, 'FORBIDDEN_ROLE');

    // 4. Super Admin updates employee -> Should succeed (200)
    const superUpdateRes = await request(app)
      .put(`/api/employees/${createdEmpId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ designation: 'Lead Safety Officer' });
    assert.strictEqual(superUpdateRes.status, 200);
    assert.strictEqual(superUpdateRes.body.success, true);

    // 5. Site Admin attempts to delete employee -> Should be blocked (403 FORBIDDEN_ROLE)
    const siteAdminDeleteRes = await request(app)
      .delete(`/api/employees/${createdEmpId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`);
    assert.strictEqual(siteAdminDeleteRes.status, 403);
    assert.strictEqual(siteAdminDeleteRes.body.error.code, 'FORBIDDEN_ROLE');

    // 6. Super Admin deletes employee -> Should succeed (200)
    const superDeleteRes = await request(app)
      .delete(`/api/employees/${createdEmpId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    assert.strictEqual(superDeleteRes.status, 200);
    assert.strictEqual(superDeleteRes.body.success, true);
  });

  it('should restrict department add, update, and delete exclusively to SUPER_ADMIN while allowing others to view', async () => {
    const testSuffix = Math.floor(Math.random() * 100000);
    const superAdminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@vms.local',
        password: 'Password@123',
      });
    const superAdminToken = superAdminRes.body.data.token;

    // 1. Regular employee / Site Admin can view departments (200)
    const viewRes = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${employeeToken}`);
    assert.strictEqual(viewRes.status, 200);
    assert.strictEqual(viewRes.body.success, true);

    // 2. Non-Super Admin (Site Admin) attempts to add department -> Should be blocked (403)
    const siteAdminCreateRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .send({
        name: 'Denied Department',
        code: `DEN-${testSuffix}`,
        description: 'Should fail',
      });
    assert.strictEqual(siteAdminCreateRes.status, 403);
    assert.strictEqual(siteAdminCreateRes.body.error.code, 'FORBIDDEN_ROLE');

    // 3. Super Admin creates department -> Should succeed (201)
    const superCreateRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `Advanced Robotics Lab ${testSuffix}`,
        code: `ROB-${testSuffix}`,
        description: 'Automated factory assembly and robotics testing',
      });
    assert.strictEqual(superCreateRes.status, 201);
    assert.strictEqual(superCreateRes.body.success, true);
    const createdDeptId = superCreateRes.body.data.id;

    // 4. Non-Super Admin attempts to update department -> Should be blocked (403)
    const siteAdminUpdateRes = await request(app)
      .put(`/api/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .send({ name: 'Hacked Department Name' });
    assert.strictEqual(siteAdminUpdateRes.status, 403);
    assert.strictEqual(siteAdminUpdateRes.body.error.code, 'FORBIDDEN_ROLE');

    // 5. Super Admin updates department -> Should succeed (200)
    const superUpdateRes = await request(app)
      .put(`/api/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: `Advanced Robotics & Automation Lab ${testSuffix}`, description: 'Updated description' });
    assert.strictEqual(superUpdateRes.status, 200);
    assert.strictEqual(superUpdateRes.body.success, true);

    // 6. Non-Super Admin attempts to delete department -> Should be blocked (403)
    const siteAdminDeleteRes = await request(app)
      .delete(`/api/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`);
    assert.strictEqual(siteAdminDeleteRes.status, 403);
    assert.strictEqual(siteAdminDeleteRes.body.error.code, 'FORBIDDEN_ROLE');

    // 7. Super Admin deletes department -> Should succeed (200)
    const superDeleteRes = await request(app)
      .delete(`/api/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    assert.strictEqual(superDeleteRes.status, 200);
    assert.strictEqual(superDeleteRes.body.success, true);
  });
});
