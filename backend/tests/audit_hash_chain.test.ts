import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Audit Trail & Cryptographic Hash Chain Tests', () => {
  let app: any;
  let superAdminToken: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = loginRes.body.data.token;
  });

  it('should record failed login attempts in audit logs', async () => {
    // 1. Trigger failed login
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'WrongPassword999!' });

    // 2. Query audit logs
    const auditRes = await request(app)
      .get('/api/audit-logs?action=LOGIN_FAILED')
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(auditRes.status, 200);
    assert.strictEqual(auditRes.body.success, true);
    assert.ok(auditRes.body.data.length > 0, 'Must record LOGIN_FAILED entry');
  });

  it('should verify that the cryptographic audit log hash chain is intact', async () => {
    const chainRes = await request(app)
      .get('/api/audit-logs/verify-chain')
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(chainRes.status, 200);
    assert.strictEqual(chainRes.body.success, true);
    assert.strictEqual(chainRes.body.data.isChainIntact, true, 'Audit log cryptographic hash chain must be verified and intact');
  });
});
