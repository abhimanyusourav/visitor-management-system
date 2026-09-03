import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, query } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Storage & Image Security Tests', () => {
  let app: any;
  let superAdminToken: string;
  let siteASecurityToken: string;
  let siteBSecurityToken: string;

  const siteAId = '30000000-0000-0000-0000-000000000001'; // Baghpat
  const siteBId = '30000000-0000-0000-0000-000000000002'; // Basi
  const hostEmpAId = '80000000-0000-0000-0000-000000000001';
  const hostEmpBId = '80000000-0000-0000-0000-000000000002';

  // Minimal valid 1x1 PNG image as base64
  const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  let siteBPhotoUrl: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    const superRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = superRes.body.data.token;

    const siteALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });
    siteASecurityToken = siteALogin.body.data.token;

    const userBRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: `site_b_sec_storage_${Date.now()}@vms.local`,
        password: 'Password@123',
        first_name: 'Basi',
        last_name: 'Guard',
        role_id: '10000000-0000-0000-0000-000000000004',
        site_ids: [siteBId],
      });
    const siteBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userBRes.body.data.email, password: 'Password@123' });
    siteBSecurityToken = siteBLogin.body.data.token;

    // Register a visitor at Site B with a valid photo
    const regResB = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteBSecurityToken}`)
      .set('X-Site-Id', siteBId)
      .send({
        first_name: 'PhotoTest',
        last_name: 'Person',
        mobile_number: '+91-9988334411',
        purpose: 'Site B Inspection',
        host_employee_id: hostEmpBId,
        photo_base64: valid1x1Png,
      });

    assert.strictEqual(regResB.status, 201);
    
    // Retrieve visitor master record to get generated photo_url
    const vRes = await query(`SELECT photo_url FROM visitors WHERE id = $1`, [regResB.body.data.visitor_id]);
    siteBPhotoUrl = vRes.rows[0].photo_url;
  });

  it('should deny unauthenticated requests to visitor photos with 401', async () => {
    const res = await request(app).get('/api/storage/visitors/sample_photo_test.jpg');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it('should reject invalid non-image payload upon visitor registration with photo', async () => {
    const maliciousPayload = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');

    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteASecurityToken}`)
      .set('X-Site-Id', siteAId)
      .send({
        first_name: 'Test',
        last_name: 'Attacker',
        mobile_number: '+91-9988112277',
        purpose: 'Security Test',
        host_employee_id: hostEmpAId,
        photo_base64: maliciousPayload,
      });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
  });

  it('should deny Site A staff from accessing Site B visitor photo with 403 UNAUTHORIZED_PHOTO_ACCESS', async () => {
    assert.ok(siteBPhotoUrl, 'Site B photo URL must exist');
    const photoRes = await request(app)
      .get(siteBPhotoUrl)
      .set('Authorization', `Bearer ${siteASecurityToken}`);

    assert.strictEqual(photoRes.status, 403);
    assert.strictEqual(photoRes.body.error.code, 'UNAUTHORIZED_PHOTO_ACCESS');
  });

  it('should allow SUPER_ADMIN to access visitor photos across any site', async () => {
    assert.ok(siteBPhotoUrl, 'Site B photo URL must exist');
    const photoRes = await request(app)
      .get(siteBPhotoUrl)
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(photoRes.status, 200);
  });
});
