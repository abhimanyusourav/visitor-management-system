import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS QR Pass Security & Privacy Tests', () => {
  let app: any;
  let securityToken: string;
  let baghpatSiteId: string;
  let hostEmployeeId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    baghpatSiteId = '30000000-0000-0000-0000-000000000001';
    hostEmployeeId = '80000000-0000-0000-0000-000000000001';

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });
    securityToken = loginRes.body.data.token;
  });

  it('should reject verification attempts that supply pass_number instead of secure token', async () => {
    // 1. Register a visit
    const regRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        first_name: 'Manish',
        last_name: 'Gupta',
        mobile_number: '+91-9988112266',
        purpose: 'Vendor Meeting',
        visitor_type: 'Vendor',
        host_employee_id: hostEmployeeId,
      });

    const passNumber = regRes.body.data.pass_number;
    const visitCode = regRes.body.data.visit_code;
    const qrToken = regRes.body.data.qr_token;

    // 2. Attempt to verify using pass_number on public verify endpoint -> MUST be rejected with 400 or 404
    const passNumRes = await request(app)
      .get(`/api/passes/verify/${passNumber}`);
    assert.strictEqual(passNumRes.status, 404);

    // 3. Attempt to verify using visit_code on public verify endpoint -> MUST be rejected with 400 or 404
    const visitCodeRes = await request(app)
      .get(`/api/passes/verify/${visitCode}`);
    assert.strictEqual(visitCodeRes.status, 404);

    // 4. Verify using valid cryptographic QR token -> MUST succeed
    const validVerifyRes = await request(app)
      .get(`/api/passes/verify/${qrToken}`);
    assert.strictEqual(validVerifyRes.status, 200);
    assert.strictEqual(validVerifyRes.body.data.isValid, true);
    assert.strictEqual(validVerifyRes.body.data.visitorName, 'Manish Gupta');

    // 5. Verify Zero PII in public response
    assert.strictEqual(validVerifyRes.body.data.qrToken, undefined, 'Must never return qrToken in public response');
    assert.strictEqual(validVerifyRes.body.data.visitId, undefined, 'Must never return internal visitId in public response');
    assert.strictEqual(validVerifyRes.body.data.mobile_number, undefined, 'Must never return phone number');
    assert.strictEqual(validVerifyRes.body.data.id_number, undefined, 'Must never return government ID');
  });
});
