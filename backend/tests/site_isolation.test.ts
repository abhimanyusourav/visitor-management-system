import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Site Scoping & Isolation Tests', () => {
  let app: any;
  let siteAdminToken: string;
  let baghpatSiteId: string;
  let basiSiteId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // Authenticate Site Admin assigned ONLY to Baghpat Branch
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'siteadmin@vms.local',
        password: 'Password@123',
      });

    siteAdminToken = loginRes.body.data.token;
    baghpatSiteId = '30000000-0000-0000-0000-000000000001';
    basiSiteId = '30000000-0000-0000-0000-000000000002';
  });

  it('should reject Site Admin attempting to access Site B via X-Site-Id header with 403', async () => {
    const res = await request(app)
      .get('/api/visits')
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .set('X-Site-Id', basiSiteId);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');
  });

  it('should reject Site Admin attempting to access Site B via query string site_id with 403', async () => {
    const res = await request(app)
      .get(`/api/visits?site_id=${basiSiteId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');
  });

  it('should reject Site Admin attempting to access Site B via body site_id with 403', async () => {
    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteAdminToken}`)
      .send({
        site_id: basiSiteId,
        visitor_type: 'Guest',
        purpose: 'Unauthorized inspection',
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');
  });

  it('should reject Site Admin attempting to view site details of unauthorized Site B with 403', async () => {
    const res = await request(app)
      .get(`/api/sites/${basiSiteId}`)
      .set('Authorization', `Bearer ${siteAdminToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });
});
