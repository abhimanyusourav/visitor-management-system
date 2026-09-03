import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, query } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Audit Trail & Cryptographic Hash Chain Tests', () => {
  let app: any;
  let superAdminToken: string;

  before(async () => {
    process.env.NODE_ENV = 'test';
    await initDatabase();
    await runSeed();
    await query('DELETE FROM audit_logs');
    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = loginRes.body.data.token;
  });

  it('should record failed login attempts in audit logs', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'WrongPassword999!' });

    const auditRes = await request(app)
      .get('/api/audit-logs?action=LOGIN_FAILED')
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(auditRes.status, 200);
    assert.strictEqual(auditRes.body.success, true);
    assert.ok(auditRes.body.data.length > 0, 'Must record LOGIN_FAILED entry');
  });

  it('should verify that an untampered cryptographic audit log hash chain passes full re-computation', async () => {
    const chainRes = await request(app)
      .get('/api/audit-logs/verify-chain')
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(chainRes.status, 200);
    assert.strictEqual(chainRes.body.success, true);
    assert.strictEqual(chainRes.body.data.isChainIntact, true, 'Audit log cryptographic hash chain must be intact');
  });

  it('should detect tampering if an event payload or action is modified in the database', async () => {
    // 1. Fetch latest audit log
    const latestRes = await query(`SELECT id, action FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1`);
    assert.ok(latestRes.rows.length > 0);
    const targetId = latestRes.rows[0].id;
    const originalAction = latestRes.rows[0].action;

    try {
      // 2. Tamper with the action column directly in DB
      await query(`UPDATE audit_logs SET action = 'MALICIOUS_TAMPERED_ACTION' WHERE id = $1`, [targetId]);

      // 3. Verify-chain MUST detect recalculation failure
      const verifyRes = await request(app)
        .get('/api/audit-logs/verify-chain')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.data.isChainIntact, false, 'Tampered log MUST cause isChainIntact to be false');
      assert.strictEqual(verifyRes.body.data.brokenAtEntryId, targetId);
    } finally {
      // 4. Restore original action
      await query(`UPDATE audit_logs SET action = $1 WHERE id = $2`, [originalAction, targetId]);
    }
  });

  it('should detect broken chain continuity if previous_hash is modified', async () => {
    const latestRes = await query(`SELECT id, previous_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1`);
    assert.ok(latestRes.rows.length > 0);
    const targetId = latestRes.rows[0].id;
    const originalPrevHash = latestRes.rows[0].previous_hash;

    try {
      // Tamper with previous_hash
      await query(`UPDATE audit_logs SET previous_hash = '1'.repeat(64) WHERE id = $1`, [targetId]);

      const verifyRes = await request(app)
        .get('/api/audit-logs/verify-chain')
        .set('Authorization', `Bearer ${superAdminToken}`);

      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyRes.body.data.isChainIntact, false, 'Tampered previous_hash MUST cause isChainIntact to be false');
    } finally {
      // Restore
      await query(`UPDATE audit_logs SET previous_hash = $1 WHERE id = $2`, [originalPrevHash, targetId]);
    }
  });
});
