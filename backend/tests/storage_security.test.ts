import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Storage & Image Security Tests', () => {
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

  it('should deny unauthenticated requests to visitor photos with 401', async () => {
    const res = await request(app)
      .get('/api/storage/visitors/sample_photo_test.jpg');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it('should reject invalid non-image payload upon visitor registration with photo', async () => {
    const maliciousPayload = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');

    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        first_name: 'Test',
        last_name: 'Attacker',
        mobile_number: '+91-9988112277',
        purpose: 'Security Test',
        host_employee_id: hostEmployeeId,
        photo_base64: maliciousPayload,
      });

    // Magic bytes verification will reject this non-PNG content
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
  });
});
