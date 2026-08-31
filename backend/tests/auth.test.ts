import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Authentication & Security Tests', () => {
  let app: any;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();
  });

  it('should authenticate superadmin successfully with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@vms.local',
        password: 'Password@123'
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token, 'JWT Token must be returned');
    assert.strictEqual(res.body.data.user.role, 'SUPER_ADMIN');
    assert.ok(res.body.data.user.permissions.includes('visitor:create'));
    assert.ok(res.body.data.user.permissions.includes('emergency:export'));
  });

  it('should reject login with incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@vms.local',
        password: 'WrongPassword999'
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'AUTH_FAILED');
  });

  it('should deny unauthenticated access to protected endpoints', async () => {
    const res = await request(app)
      .get('/api/visits');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });
});
