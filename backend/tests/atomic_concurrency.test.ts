import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Atomic State Transition Tests', () => {
  let app: any;
  let securityToken: string;
  let hostEmployeeId: string;
  let siteBaghpatId: string;
  let siteBasiId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    siteBaghpatId = '30000000-0000-0000-0000-000000000001';
    siteBasiId = '30000000-0000-0000-0000-000000000002';
    hostEmployeeId = '80000000-0000-0000-0000-000000000001';

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });
    securityToken = loginRes.body.data.token;
  });

  it('should prevent duplicate check-in and return 409 Conflict', async () => {
    // 1. Register an expected visit
    const regRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId)
      .send({
        first_name: 'Anil',
        last_name: 'Sharma',
        mobile_number: '+91-9988112233',
        company_name: 'Apex Machinery',
        purpose: 'HVAC Maintenance',
        visitor_type: 'Contractor',
        host_employee_id: hostEmployeeId,
        auto_check_in: false,
      });

    assert.strictEqual(regRes.status, 201);
    const visitId = regRes.body.data.id;

    // 2. First check-in succeeds
    const firstCheckIn = await request(app)
      .post(`/api/visits/${visitId}/check-in`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId);

    assert.strictEqual(firstCheckIn.status, 200);
    assert.strictEqual(firstCheckIn.body.success, true);

    // 3. Second concurrent/duplicate check-in MUST fail with 409
    const secondCheckIn = await request(app)
      .post(`/api/visits/${visitId}/check-in`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId);

    assert.strictEqual(secondCheckIn.status, 409);
    assert.strictEqual(secondCheckIn.body.success, false);
    assert.strictEqual(secondCheckIn.body.error.code, 'ALREADY_CHECKED_IN');
  });

  it('should prevent duplicate check-out and return 409 Conflict', async () => {
    // 1. Register an auto-checked-in visit
    const regRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId)
      .send({
        first_name: 'Deepak',
        last_name: 'Verma',
        mobile_number: '+91-9988112244',
        company_name: 'Logistics Express',
        purpose: 'Parcel Delivery',
        visitor_type: 'Delivery',
        host_employee_id: hostEmployeeId,
        auto_check_in: true,
      });

    assert.strictEqual(regRes.status, 201);
    const visitId = regRes.body.data.id;

    // 2. First check-out succeeds
    const firstCheckOut = await request(app)
      .post(`/api/visits/${visitId}/check-out`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId);

    assert.strictEqual(firstCheckOut.status, 200);
    assert.strictEqual(firstCheckOut.body.success, true);

    // 3. Second check-out MUST fail with 409
    const secondCheckOut = await request(app)
      .post(`/api/visits/${visitId}/check-out`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId);

    assert.strictEqual(secondCheckOut.status, 409);
    assert.strictEqual(secondCheckOut.body.success, false);
    assert.strictEqual(secondCheckOut.body.error.code, 'ALREADY_CHECKED_OUT');
  });

  it('should reject check-out for a visitor who was never checked in', async () => {
    const regRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId)
      .send({
        first_name: 'Pooja',
        last_name: 'Patel',
        mobile_number: '+91-9988112255',
        purpose: 'Job Interview',
        visitor_type: 'Interview Candidate',
        host_employee_id: hostEmployeeId,
        auto_check_in: false,
      });

    const visitId = regRes.body.data.id;

    const checkOutRes = await request(app)
      .post(`/api/visits/${visitId}/check-out`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', siteBaghpatId);

    assert.strictEqual(checkOutRes.status, 400);
    assert.strictEqual(checkOutRes.body.success, false);
    assert.strictEqual(checkOutRes.body.error.code, 'NOT_CHECKED_IN');
  });
});
