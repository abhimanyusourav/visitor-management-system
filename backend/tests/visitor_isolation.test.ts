import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';
import { validateProductionSecrets } from '../src/config/env.js';

describe('VMS Strict Visitor Site Isolation & Privacy Tests', () => {
  let app: any;
  let superAdminToken: string;
  let siteAStaffToken: string;
  let siteBStaffToken: string;

  const siteAId = '30000000-0000-0000-0000-000000000001'; // Baghpat
  const siteBId = '30000000-0000-0000-0000-000000000002'; // Basi
  const hostEmpAId = '80000000-0000-0000-0000-000000000001';
  const hostEmpBId = '80000000-0000-0000-0000-000000000002';

  let testVisitorId: string;
  let visitSiteAId: string;
  let visitSiteBId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // 1. Super Admin login
    const superLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = superLogin.body.data.token;

    // 2. Site A Staff (Security Baghpat)
    const siteALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });
    siteAStaffToken = siteALogin.body.data.token;

    // 3. Create Site B Staff (assigned exclusively to Site Basi)
    const userBRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: `site_b_sec_${Date.now()}@vms.local`,
        password: 'Password@123',
        first_name: 'Basi',
        last_name: 'Security',
        role_id: '10000000-0000-0000-0000-000000000004',
        site_ids: [siteBId],
      });
    const siteBUser = userBRes.body.data;

    const siteBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: siteBUser.email, password: 'Password@123' });
    siteBStaffToken = siteBLogin.body.data.token;

    // 4. Create a Visit at Site A
    const regResA = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteAStaffToken}`)
      .set('X-Site-Id', siteAId)
      .send({
        first_name: 'Isolated',
        last_name: 'Visitor',
        mobile_number: '+91-9911223344',
        purpose: 'Site A Inspection',
        visitor_type: 'Guest',
        host_employee_id: hostEmpAId,
      });
    assert.strictEqual(regResA.status, 201);
    visitSiteAId = regResA.body.data.id;
    testVisitorId = regResA.body.data.visitor_id;

    // 5. Create a Visit for the SAME visitor at Site B
    const regResB = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteBStaffToken}`)
      .set('X-Site-Id', siteBId)
      .send({
        visitor_id: testVisitorId,
        first_name: 'Isolated',
        last_name: 'Visitor',
        mobile_number: '+91-9911223344',
        purpose: 'Site B Confidential Work',
        visitor_type: 'Contractor',
        host_employee_id: hostEmpBId,
      });
    assert.strictEqual(regResB.status, 201);
    visitSiteBId = regResB.body.data.id;
  });

  it('should restrict Site A staff from viewing Site B visit history on GET /api/visitors/:id/history', async () => {
    const historyRes = await request(app)
      .get(`/api/visitors/${testVisitorId}/history`)
      .set('Authorization', `Bearer ${siteAStaffToken}`)
      .set('X-Site-Id', siteAId);

    assert.strictEqual(historyRes.status, 200);
    const visits = historyRes.body.data;
    assert.ok(visits.length >= 1, 'Must include at least Site A visit');

    const hasSiteBVisit = visits.some((v: any) => v.site_id === siteBId || v.id === visitSiteBId);
    assert.strictEqual(hasSiteBVisit, false, 'Site A staff must not see Site B visit history');
  });

  it('should allow SUPER_ADMIN to view all site visits on GET /api/visitors/:id/history', async () => {
    const historyRes = await request(app)
      .get(`/api/visitors/${testVisitorId}/history`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(historyRes.status, 200);
    const visits = historyRes.body.data;
    const hasSiteA = visits.some((v: any) => v.id === visitSiteAId);
    const hasSiteB = visits.some((v: any) => v.id === visitSiteBId);
    assert.strictEqual(hasSiteA && hasSiteB, true, 'SUPER_ADMIN must see both site visits');
  });

  it('should scope visits to authorized site on GET /api/visitors/:id for Site A staff', async () => {
    const detailRes = await request(app)
      .get(`/api/visitors/${testVisitorId}`)
      .set('Authorization', `Bearer ${siteAStaffToken}`)
      .set('X-Site-Id', siteAId);

    assert.strictEqual(detailRes.status, 200);
    const attachedVisits = detailRes.body.data.visits;
    assert.ok(attachedVisits.length > 0);
    const containsSiteB = attachedVisits.some((v: any) => v.site_id === siteBId);
    assert.strictEqual(containsSiteB, false, 'Detail visits must not leak Site B records');
  });

  it('should return only minimal necessary fields on POST /api/visitors/lookup', async () => {
    const lookupRes = await request(app)
      .post('/api/visitors/lookup')
      .set('Authorization', `Bearer ${siteAStaffToken}`)
      .set('X-Site-Id', siteAId)
      .send({ mobile_number: '+91-9911223344' });

    assert.strictEqual(lookupRes.status, 200);
    assert.strictEqual(lookupRes.body.success, true);
    const data = lookupRes.body.data;
    assert.strictEqual(data.full_name, 'Isolated Visitor');
    assert.strictEqual(data.notes, undefined, 'Must not return internal notes in lookup');
    assert.strictEqual(data.blacklist_reason, undefined, 'Must not return blacklist reason in lookup');
    assert.strictEqual(data.created_at, undefined, 'Must not return internal creation timestamp');
  });

  it('should fail closed in production when JWT_SECRET or REFRESH_TOKEN_SECRET is missing or weak', () => {
    assert.throws(() => {
      validateProductionSecrets('production', '', '');
    }, /FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is mandatory/);

    assert.throws(() => {
      validateProductionSecrets('production', 'short_secret_under_32_chars', 'short_refresh_under_32_chars');
    }, /at least 32 characters in production/);

    assert.doesNotThrow(() => {
      validateProductionSecrets('production', 'a'.repeat(32), 'b'.repeat(32));
    });

    assert.doesNotThrow(() => {
      validateProductionSecrets('development', undefined, undefined);
    });
  });
});
