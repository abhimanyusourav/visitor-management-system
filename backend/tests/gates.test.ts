import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Logical Gates & Checkpoint Tracking Tests', () => {
  let app: any;
  let superAdminToken: string;
  let baghpatSiteId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    baghpatSiteId = '30000000-0000-0000-0000-000000000001';

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = loginRes.body.data.token;
  });

  it('should list seeded gates for Baghpat plant', async () => {
    const res = await request(app)
      .get('/api/gates')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.length >= 2, 'Should have at least 2 seeded gates');
  });

  it('should create a new gate successfully', async () => {
    const code = 'GATE-TEST-' + Math.floor(Math.random() * 10000);
    const res = await request(app)
      .post('/api/gates')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        name: 'Warehouse North Gate',
        code,
        gate_type: 'MATERIAL',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Warehouse North Gate');
  });

  it('should reject visit creation if gate_id belongs to another site', async () => {
    // 40000000-0000-0000-0000-000000000003 is seeded for Basi site
    const siteBasiGateId = '40000000-0000-0000-0000-000000000003';
    const hostEmpAId = '80000000-0000-0000-0000-000000000001';

    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        first_name: 'CrossGate',
        last_name: 'Visitor',
        mobile_number: '+91-9988776633',
        purpose: 'Meeting',
        visitor_type: 'Guest',
        host_employee_id: hostEmpAId,
        gate_id: siteBasiGateId,
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_GATE');
  });
});
