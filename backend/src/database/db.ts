import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/env.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Primary PostgreSQL connection pool
let pgPool: Pool | null = null;
let isPgConnected = false;

// In-Memory relational store with automatic disk-persistence for local development resilience
const memoryDb = new Map<string, Map<string, any>>();

function getPersistentFilePath(): string {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'vms_local_db.json');
}

export function saveMemoryDbToDisk(): void {
  try {
    const filePath = getPersistentFilePath();
    const serializable: Record<string, Record<string, any>> = {};
    for (const [tableName, map] of memoryDb.entries()) {
      serializable[tableName] = Object.fromEntries(map.entries());
    }
    fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Failed to persist local database to disk:', err);
  }
}

export function loadMemoryDbFromDisk(): boolean {
  try {
    const filePath = getPersistentFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      for (const [tableName, records] of Object.entries(parsed)) {
        const map = new Map<string, any>();
        for (const [id, record] of Object.entries(records as Record<string, any>)) {
          map.set(id, record);
        }
        memoryDb.set(tableName, map);
      }
      console.log('📦 Loaded existing persistent records from disk.');
      return true;
    }
  } catch (err) {
    console.error('⚠️ Failed to load local database from disk:', err);
  }
  return false;
}

export async function initDatabase(): Promise<boolean> {
  try {
    pgPool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    isPgConnected = true;
    console.log('✅ PostgreSQL connected successfully.');
    return true;
  } catch (err: any) {
    isPgConnected = false;
    console.warn('⚠️  PostgreSQL connection unavailable (' + (err.message || 'Connection refused') + ').');
    console.log('ℹ️  Running file-backed persistent local database simulation.');
    loadMemoryDbFromDisk();
    return false;
  }
}

export function isUsingPostgres(): boolean {
  return isPgConnected;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  if (isPgConnected && pgPool) {
    try {
      const result: QueryResult<T> = await pgPool.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
      };
    } catch (error: any) {
      console.error('Database Query Error:', error.message, '\nQuery:', text);
      throw error;
    }
  }

  // Fallback memory database query execution
  return executeInMemoryQuery<T>(text, params);
}

export async function getClient() {
  if (isPgConnected && pgPool) {
    return await pgPool.connect();
  }
  return null;
}

// In-memory relational simulation helper for instant zero-dependency execution
function executeInMemoryQuery<T extends QueryResultRow = any>(
  sql: string,
  params: any[] = []
): { rows: T[]; rowCount: number } {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // 1. Handle table creation
  if (normalized.toUpperCase().startsWith('CREATE TABLE')) {
    const match = normalized.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z0-9_]+)/i);
    if (match) {
      const tableName = match[1].toLowerCase();
      if (!memoryDb.has(tableName)) {
        memoryDb.set(tableName, new Map());
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 2. Handle INSERT
  if (normalized.toUpperCase().startsWith('INSERT INTO')) {
    const match = normalized.match(/INSERT INTO ([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*(.+)/i);
    if (match) {
      const tableName = match[1].toLowerCase();
      const columns = match[2].split(',').map(c => c.trim().toLowerCase());
      const rest = match[3];

      if (!memoryDb.has(tableName)) {
        memoryDb.set(tableName, new Map());
      }
      const table = memoryDb.get(tableName)!;

      const isDoUpdate = /ON CONFLICT.*DO UPDATE/i.test(rest);
      const isReturning = /RETURNING/i.test(rest);

      const record: any = {};
      columns.forEach((col, idx) => {
        let val = params[idx];
        if (val === undefined) val = null;
        record[col] = val;
      });

      if (!record.id) {
        record.id = crypto.randomUUID();
      }
      if (record.is_active === undefined || record.is_active === null) {
        record.is_active = true;
      }
      if (!record.created_at) record.created_at = new Date().toISOString();
      if (!record.updated_at) record.updated_at = new Date().toISOString();

      const isDoNothing = /ON CONFLICT.*DO NOTHING/i.test(rest);

      let existingKey: string | null = null;
      for (const [id, row] of table.entries()) {
        if (tableName === 'users' && record.email && row.email && row.email.toLowerCase() === record.email.toLowerCase()) {
          existingKey = id;
          break;
        }
        if (tableName === 'organizations' && record.code && row.code && row.code === record.code) {
          existingKey = id;
          break;
        }
        if (tableName === 'roles' && record.slug && row.slug && row.slug === record.slug) {
          existingKey = id;
          break;
        }
        if (tableName === 'departments' && record.organization_id && record.code && row.organization_id === record.organization_id && row.code && row.code.toUpperCase() === record.code.toUpperCase() && !row.deleted_at) {
          existingKey = id;
          break;
        }
        if (tableName === 'employees' && record.organization_id && record.employee_code && row.organization_id === record.organization_id && row.employee_code && row.employee_code.toUpperCase() === record.employee_code.toUpperCase() && !row.deleted_at) {
          existingKey = id;
          break;
        }
        if (tableName === 'user_sites' && record.user_id && record.site_id && row.user_id === record.user_id && row.site_id === record.site_id) {
          existingKey = id;
          break;
        }
        if (tableName === 'employee_sites' && record.employee_id && record.site_id && row.employee_id === record.employee_id && row.site_id === record.site_id) {
          existingKey = id;
          break;
        }
        if (tableName === 'role_permissions' && record.role_id && record.permission_id && row.role_id === record.role_id && row.permission_id === record.permission_id) {
          existingKey = id;
          break;
        }
        if (record.pass_number && row.pass_number && row.pass_number === record.pass_number) {
          existingKey = id;
          break;
        }
        if (record.qr_token && row.qr_token && row.qr_token === record.qr_token) {
          existingKey = id;
          break;
        }
      }

      if (existingKey) {
        if (isDoUpdate) {
          const merged = { ...table.get(existingKey), ...record, id: existingKey, updated_at: new Date().toISOString() };
          table.set(existingKey, merged);
          saveMemoryDbToDisk();
          return { rows: isReturning ? [merged as T] : [], rowCount: 1 };
        }
        if (isDoNothing) {
          return { rows: isReturning ? [table.get(existingKey) as T] : [], rowCount: 0 };
        }
        throw new Error(`duplicate key value violates unique constraint in table "${tableName}"`);
      }

      table.set(record.id, record);
      saveMemoryDbToDisk();
      return { rows: isReturning ? [record as T] : [], rowCount: 1 };
    }
  }

  // 3. Handle DELETE
  if (normalized.toUpperCase().startsWith('DELETE FROM')) {
    const match = normalized.match(/DELETE FROM ([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (match) {
      const tableName = match[1].toLowerCase();
      const table = memoryDb.get(tableName);
      if (!table) return { rows: [], rowCount: 0 };

      let deletedCount = 0;
      for (const [id, record] of Array.from(table.entries())) {
        let matches = true;
        if (params.length > 0) {
          const hasIdMatch = params.some((p: any) => p === record.id || p === record.employee_id || p === record.user_id || p === record.visit_id);
          if (!hasIdMatch) matches = false;
        }
        if (matches) {
          table.delete(id);
          deletedCount++;
        }
      }
      if (deletedCount > 0) saveMemoryDbToDisk();
      return { rows: [], rowCount: deletedCount };
    }
  }

  // 4. Handle UPDATE
  if (normalized.toUpperCase().startsWith('UPDATE')) {
    const match = normalized.match(/UPDATE ([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (match) {
      const tableName = match[1].toLowerCase();
      const table = memoryDb.get(tableName);
      if (!table) return { rows: [], rowCount: 0 };

      let updatedCount = 0;
      const updatedRows: T[] = [];

      for (const [id, record] of table.entries()) {
        let matches = true;
        if (params.length > 0) {
          const whereMatch = normalized.match(/WHERE\s+(?:[a-zA-Z0-9_]+\.)?(id|visit_id|user_id|employee_id)\s*=\s*\$([0-9]+)/i);
          if (whereMatch) {
            const field = whereMatch[1].toLowerCase();
            const paramIdx = parseInt(whereMatch[2], 10) - 1;
            const targetVal = params[paramIdx];
            if (record[field] !== targetVal && record.id !== targetVal) {
              matches = false;
            }
          }
        }

        if (matches) {
          record.updated_at = new Date().toISOString();
          if (normalized.includes("status = 'CHECKED_IN'")) record.status = 'CHECKED_IN';
          if (normalized.includes("status = 'CHECKED_OUT'")) record.status = 'CHECKED_OUT';
          if (normalized.includes("status = 'USED'")) record.status = 'USED';
          if (normalized.includes("status = 'ACTIVE'")) record.status = 'ACTIVE';
          if (normalized.includes("status = 'APPROVED'")) record.status = 'APPROVED';
          if (normalized.includes("status = 'REJECTED'")) record.status = 'REJECTED';
          if (normalized.includes("is_read = TRUE")) record.is_read = true;
          if (normalized.includes("deleted_at = NOW()")) record.deleted_at = new Date().toISOString();
          if (normalized.includes("is_active = FALSE")) record.is_active = false;
          if (normalized.includes("is_blacklisted = $1") && params.length >= 1) {
            record.is_blacklisted = Boolean(params[0]);
          }

          if (tableName === 'departments') {
            if (normalized.includes('name = COALESCE($1, name)')) {
              if (params[0] !== undefined && params[0] !== null) record.name = params[0];
              if (params[1] !== undefined && params[1] !== null) record.code = params[1].toUpperCase();
              if (params[2] !== undefined && params[2] !== null) record.description = params[2];
              if (params[3] !== undefined && params[3] !== null) record.is_active = params[3];
            }
          }

          if (tableName === 'employees') {
            if (normalized.includes('first_name = COALESCE($1, first_name)')) {
              if (params[0] !== undefined && params[0] !== null) record.first_name = params[0];
              if (params[1] !== undefined) record.last_name = params[1];
              if (params[2] !== undefined) record.email = params[2];
              if (params[3] !== undefined) record.phone = params[3];
              if (params[4] !== undefined && params[4] !== null) record.designation = params[4];
              if (params[5] !== undefined && params[5] !== null) record.department_id = params[5];
              if (params[6] !== undefined && params[6] !== null) record.is_active = params[6];
            }
          }

          if (tableName === 'visits') {
            if (normalized.includes("status = 'CHECKED_OUT'")) {
              record.status = 'CHECKED_OUT';
              if (normalized.includes('check_out_time = $1') && params[0]) {
                record.check_out_time = params[0];
              } else {
                record.check_out_time = new Date().toISOString();
              }
              if (normalized.includes('checked_out_by_user_id = $2') && params[1]) {
                record.checked_out_by_user_id = params[1];
              }
            }
            if (normalized.includes("status = 'CHECKED_IN'")) {
              record.status = 'CHECKED_IN';
              if (normalized.includes('check_in_time = $1') && params[0]) {
                record.check_in_time = params[0];
              } else if (!record.check_in_time) {
                record.check_in_time = new Date().toISOString();
              }
              if (normalized.includes('checked_in_by_user_id = $2') && params[1]) {
                record.checked_in_by_user_id = params[1];
              }
            }
            if (normalized.includes("status = 'APPROVED'")) {
              record.status = 'APPROVED';
              record.approved_at = new Date().toISOString();
              if (params[0]) record.approved_by_user_id = params[0];
            }
            if (normalized.includes("status = 'REJECTED'")) {
              record.status = 'REJECTED';
              record.rejected_at = new Date().toISOString();
              if (params[0]) record.rejection_reason = params[0];
            }
          }

          if (tableName === 'visitor_passes') {
            if (normalized.includes("status = 'USED'")) record.status = 'USED';
            if (normalized.includes("status = 'ACTIVE'")) record.status = 'ACTIVE';
          }

          table.set(id, record);
          updatedRows.push(record as T);
          updatedCount++;
        }
      }

      if (updatedCount > 0) saveMemoryDbToDisk();
      return { rows: updatedRows, rowCount: updatedCount };
    }
  }

  // 5. Handle SELECT
  if (normalized.toUpperCase().startsWith('SELECT')) {
    const isCount = normalized.toUpperCase().includes('COUNT(');

    // Users Query
    if (normalized.toLowerCase().includes('from users')) {
      const usersTable = memoryDb.get('users') || new Map();
      const rolesTable = memoryDb.get('roles') || new Map();
      const orgsTable = memoryDb.get('organizations') || new Map();

      let results: any[] = [];
      for (const u of usersTable.values()) {
        if (u.deleted_at) continue;
        const role = rolesTable.get(u.role_id) || Array.from(rolesTable.values()).find((r: any) => r.id === u.role_id) || {};
        const org = orgsTable.get(u.organization_id) || Array.from(orgsTable.values()).find((o: any) => o.id === u.organization_id) || {};

        results.push({
          ...u,
          role_slug: role.slug || 'SUPER_ADMIN',
          role_name: role.name || 'Super Administrator',
          organization_name: org.name || 'Akriti JewelCraftz Pvt Ltd',
          organization_code: org.code || 'AKRITI_JC',
        });
      }

      if (params.length === 1 && typeof params[0] === 'string' && params[0].includes('@')) {
        results = results.filter(r => r.email && r.email.toLowerCase() === params[0].toLowerCase());
      } else if (params.length === 1 && typeof params[0] === 'string' && params[0].length === 36 && normalized.includes('WHERE u.id = $1')) {
        results = results.filter(r => r.id === params[0]);
      }

      if (isCount) {
        return { rows: [{ total: String(results.length), count: results.length }] as any, rowCount: 1 };
      }
      return { rows: results as T[], rowCount: results.length };
    }

    // Role Permissions & User Permissions Query
    if (normalized.toLowerCase().includes('from permissions') || normalized.toLowerCase().includes('from role_permissions')) {
      if (params.length > 0) {
        const targetId = params[0];
        const usersTable = memoryDb.get('users') || new Map();
        const user = usersTable.get(targetId) || Array.from(usersTable.values()).find((u: any) => u.id === targetId || u.role_id === targetId);
        const rolesTable = memoryDb.get('roles') || new Map();
        const role = user ? (rolesTable.get(user.role_id) || Array.from(rolesTable.values()).find((r: any) => r.id === user.role_id)) : null;
        const roleSlug = role?.slug || 'SUPER_ADMIN';

        if (roleSlug === 'EMPLOYEE') {
          return { rows: [{ code: 'visitor:create' }, { code: 'visit:approve' }, { code: 'report:view' }] as any, rowCount: 3 };
        } else if (roleSlug === 'SECURITY') {
          return { rows: [{ code: 'visitor:create' }, { code: 'visitor:edit' }, { code: 'visit:checkin' }, { code: 'visit:checkout' }, { code: 'pass:print' }, { code: 'pass:verify' }, { code: 'inside:view' }, { code: 'emergency:export' }, { code: 'report:view' }] as any, rowCount: 9 };
        }
      }

      const permsTable = memoryDb.get('permissions') || new Map();
      const allPerms = Array.from(permsTable.values());
      return { rows: allPerms as T[], rowCount: allPerms.length };
    }

    // User Sites & Sites Query
    if (normalized.toLowerCase().includes('from user_sites') || normalized.toLowerCase().includes('from sites')) {
      const sitesTable = memoryDb.get('sites') || new Map();
      const userSitesTable = memoryDb.get('user_sites') || new Map();
      const allSites = Array.from(sitesTable.values()).filter((s: any) => !s.deleted_at);

      if (normalized.toLowerCase().includes('from user_sites') && params.length > 0) {
        const userId = params[0];
        const assigned = Array.from(userSitesTable.values()).filter((us: any) => us.user_id === userId);
        if (assigned.length > 0) {
          const matched = allSites.filter(s => assigned.some((us: any) => us.site_id === s.id)).map((s, i) => ({
            ...s,
            site_id: s.id,
            is_primary: i === 0,
          }));
          return { rows: matched as any, rowCount: matched.length };
        }
      }

      if (normalized.toLowerCase().includes('from user_sites')) {
        return {
          rows: allSites.map((s: any, i: number) => ({
            ...s,
            site_id: s.id,
            is_primary: i === 0
          })) as any,
          rowCount: allSites.length
        };
      }

      return { rows: allSites as T[], rowCount: allSites.length };
    }

    // Departments Query
    if (normalized.toLowerCase().includes('from departments')) {
      const deptsTable = memoryDb.get('departments') || new Map();
      let allDepts = Array.from(deptsTable.values()).filter((d: any) => !d.deleted_at);
      if (params.length > 0) {
        if (normalized.includes('WHERE id = $1') || normalized.includes('WHERE d.id = $1')) {
          allDepts = allDepts.filter((d: any) => d.id === params[0]);
        }
        if (normalized.includes('UPPER(code) = $2') || normalized.includes('UPPER(code) = $1') || normalized.includes('code = $2') || normalized.includes('code = $1')) {
          const targetCode = String(params.length >= 2 ? params[1] : params[0]).toUpperCase();
          allDepts = allDepts.filter((d: any) => d.code && d.code.toUpperCase() === targetCode);
        }
        if (normalized.includes('UPPER(name) = $2') || normalized.includes('UPPER(name) = $1') || normalized.includes('name = $2') || normalized.includes('name = $1')) {
          const targetName = String(params.length >= 2 ? params[1] : params[0]).toUpperCase();
          allDepts = allDepts.filter((d: any) => d.name && d.name.toUpperCase() === targetName);
        }
        if (normalized.includes('id != $3') || normalized.includes('id != $2') || normalized.includes('id <> $')) {
          const excludeId = params.find(p => typeof p === 'string' && p.length === 36);
          if (excludeId) allDepts = allDepts.filter((d: any) => d.id !== excludeId);
        }
      }
      return { rows: allDepts as T[], rowCount: allDepts.length };
    }

    // Employees Query
    if (normalized.toLowerCase().includes('from employees')) {
      const empsTable = memoryDb.get('employees') || new Map();
      const deptsTable = memoryDb.get('departments') || new Map();
      let results = Array.from(empsTable.values()).filter((e: any) => !e.deleted_at).map((e: any) => {
        const dept = deptsTable.get(e.department_id) || Array.from(deptsTable.values()).find((d: any) => d.id === e.department_id) || {};
        return {
          ...e,
          department_name: dept.name || 'General',
          department_code: dept.code || 'GEN',
        };
      });

      if (params.length > 0) {
        if (normalized.includes('WHERE id = $1') || normalized.includes('WHERE e.id = $1')) {
          results = results.filter((e: any) => e.id === params[0]);
        }
        if (normalized.includes('UPPER(employee_code) = $2') || normalized.includes('employee_code = $2')) {
          const targetCode = String(params[1]).toUpperCase();
          results = results.filter((e: any) => e.employee_code && e.employee_code.toUpperCase() === targetCode);
        }
        if (normalized.includes('LOWER(email) = $2') || normalized.includes('email = $2')) {
          const targetEmail = String(params[1]).toLowerCase();
          results = results.filter((e: any) => e.email && e.email.toLowerCase() === targetEmail);
        }
        if (normalized.includes('phone = $2')) {
          const targetPhone = String(params[1]).trim();
          results = results.filter((e: any) => e.phone && e.phone.trim() === targetPhone);
        }
        if (normalized.includes('id != $3') || normalized.includes('id != $')) {
          const excludeId = params.length >= 3 ? params[2] : params.find(p => typeof p === 'string' && p.length === 36);
          if (excludeId) results = results.filter((e: any) => e.id !== excludeId);
        }
      }

      return { rows: results as T[], rowCount: results.length };
    }

    // Notifications Query
    if (normalized.toLowerCase().includes('from notifications')) {
      const notifsTable = memoryDb.get('notifications') || new Map();
      const allNotifs = Array.from(notifsTable.values()).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows: allNotifs as T[], rowCount: allNotifs.length };
    }

    // Audit Logs Query
    if (normalized.toLowerCase().includes('from audit_logs')) {
      const auditsTable = memoryDb.get('audit_logs') || new Map();
      const allAudits = Array.from(auditsTable.values()).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (isCount) {
        return { rows: [{ total: String(allAudits.length) }] as any, rowCount: 1 };
      }
      return { rows: allAudits as T[], rowCount: allAudits.length };
    }

    // Passes Query
    if (normalized.toLowerCase().includes('from visitor_passes')) {
      const passesTable = memoryDb.get('visitor_passes') || new Map();
      const visitsTable = memoryDb.get('visits') || new Map();
      const visitorsTable = memoryDb.get('visitors') || new Map();
      const empsTable = memoryDb.get('employees') || new Map();
      const deptsTable = memoryDb.get('departments') || new Map();
      const sitesTable = memoryDb.get('sites') || new Map();
      const orgsTable = memoryDb.get('organizations') || new Map();

      let results = Array.from(passesTable.values()).map((p: any) => {
        const visit = visitsTable.get(p.visit_id) || Array.from(visitsTable.values()).find((v: any) => v.id === p.visit_id) || {};
        const visitor = visitorsTable.get(visit.visitor_id) || Array.from(visitorsTable.values()).find((vt: any) => vt.id === visit.visitor_id) || {};
        const emp = empsTable.get(visit.host_employee_id) || Array.from(empsTable.values()).find((e: any) => e.id === visit.host_employee_id) || {};
        const dept = deptsTable.get(visit.department_id) || Array.from(deptsTable.values()).find((d: any) => d.id === visit.department_id) || {};
        const site = sitesTable.get(visit.site_id) || Array.from(sitesTable.values()).find((s: any) => s.id === visit.site_id) || {};
        const org = orgsTable.get(visit.organization_id) || Array.from(orgsTable.values()).find((o: any) => o.id === visit.organization_id) || {};

        const resolvedVisitorName = visitor.full_name || (visitor.first_name ? `${visitor.first_name} ${visitor.last_name || ''}`.trim() : null) || 'Visitor';

        return {
          ...p,
          pass_id: p.id,
          pass_status: p.status || 'ACTIVE',
          valid_until: p.valid_until || new Date(Date.now() + 86400000).toISOString(),
          visit_id: visit.id,
          visit_code: visit.visit_code || 'VIS-DEMO',
          visitor_type: visit.visitor_type || 'Guest',
          purpose: visit.purpose || 'Meeting',
          visit_status: visit.status || 'REGISTERED',
          expected_date: visit.expected_date,
          expected_time: visit.expected_time,
          check_in_time: visit.check_in_time,
          check_out_time: visit.check_out_time,
          accompanying_count: visit.accompanying_count || 0,
          visitor_name: resolvedVisitorName,
          company_name: visitor.company_name || 'Test Engineering Corp',
          visitor_photo: visitor.photo_url,
          host_first_name: emp.first_name || 'Host',
          host_last_name: emp.last_name || 'User',
          department_name: dept.name || 'Operations',
          site_id: site.id,
          site_name: site.name || 'Akriti JewelCraftz - Baghpat Branch',
          site_code: site.code || 'AKR-BGP',
          organization_name: org.name || 'Akriti JewelCraftz Pvt Ltd',
        };
      });

      if (params.length > 0) {
        const tokenOrId = params[0];
        results = results.filter((p: any) => p.qr_token === tokenOrId || p.visit_id === tokenOrId || p.id === tokenOrId || p.pass_number === tokenOrId);
      }

      return { rows: results as T[], rowCount: results.length };
    }

    // Visitors Query (Checked BEFORE visits to prevent subquery false matching)
    if (normalized.toLowerCase().includes('from visitors')) {
      const visitorsTable = memoryDb.get('visitors') || new Map();
      let results = Array.from(visitorsTable.values()).filter((v: any) => !v.deleted_at);

      if (normalized.includes('mobile_number = $2') && params.length >= 2) {
        const phone = params[1];
        const match = results.find(v => v.mobile_number && v.mobile_number.trim() === phone.trim());
        return { rows: match ? [match as T] : [], rowCount: match ? 1 : 0 };
      }

      if (params.length > 0 && typeof params[0] === 'string' && params[0].length === 36 && (normalized.includes('WHERE v.id = $1') || normalized.includes('WHERE id = $1'))) {
        const byId = results.filter(v => v.id === params[0]);
        if (byId.length > 0) return { rows: byId as T[], rowCount: byId.length };
      }

      // Filter by search keyword (ILIKE)
      const searchParam = params.find(p => typeof p === 'string' && p.startsWith('%') && p.endsWith('%'));
      if (searchParam) {
        const queryTerm = searchParam.replace(/%/g, '').toLowerCase().trim();
        if (queryTerm) {
          results = results.filter((v: any) => {
            const fullName = (v.full_name || `${v.first_name || ''} ${v.last_name || ''}`).toLowerCase();
            const phone = (v.mobile_number || '').toLowerCase();
            const comp = (v.company_name || '').toLowerCase();
            const mail = (v.email || '').toLowerCase();
            const idNum = (v.id_number_masked || '').toLowerCase();
            return fullName.includes(queryTerm) || phone.includes(queryTerm) || comp.includes(queryTerm) || mail.includes(queryTerm) || idNum.includes(queryTerm);
          });
        }
      }

      if (isCount) {
        return { rows: [{ total: String(results.length), count: results.length }] as any, rowCount: 1 };
      }
      return { rows: results as T[], rowCount: results.length };
    }

    // Visits Query
    if (normalized.toLowerCase().includes('from visits')) {
      const visitsTable = memoryDb.get('visits') || new Map();
      const visitorsTable = memoryDb.get('visitors') || new Map();
      const empsTable = memoryDb.get('employees') || new Map();
      const deptsTable = memoryDb.get('departments') || new Map();
      const sitesTable = memoryDb.get('sites') || new Map();
      const passesTable = memoryDb.get('visitor_passes') || new Map();
      const vehiclesTable = memoryDb.get('visit_vehicles') || new Map();

      let results = Array.from(visitsTable.values()).filter((v: any) => !v.deleted_at).map((v: any) => {
        const visitor = visitorsTable.get(v.visitor_id) || Array.from(visitorsTable.values()).find((vt: any) => vt.id === v.visitor_id) || {};
        const emp = empsTable.get(v.host_employee_id) || Array.from(empsTable.values()).find((e: any) => e.id === v.host_employee_id) || {};
        const dept = deptsTable.get(v.department_id) || Array.from(deptsTable.values()).find((d: any) => d.id === v.department_id) || {};
        const site = sitesTable.get(v.site_id) || Array.from(sitesTable.values()).find((s: any) => s.id === v.site_id) || {};
        const pass = Array.from(passesTable.values()).find((p: any) => p.visit_id === v.id) || {};
        const vehicle = Array.from(vehiclesTable.values()).find((vh: any) => vh.visit_id === v.id) || {};

        const resolvedVisitorName = visitor.full_name || (visitor.first_name ? `${visitor.first_name} ${visitor.last_name || ''}`.trim() : null) || 'Visitor';

        return {
          ...v,
          visitor_name: resolvedVisitorName,
          mobile_number: visitor.mobile_number,
          company_name: visitor.company_name,
          visitor_photo: visitor.photo_url,
          host_name: `${emp.first_name || 'Host'}${emp.last_name ? ' ' + emp.last_name : ''}`.trim(),
          host_first_name: emp.first_name || 'Host',
          host_last_name: emp.last_name || '',
          department: dept.name || 'Operations',
          department_name: dept.name || 'Operations',
          site_name: site.name || 'Akriti JewelCraftz - Baghpat Branch',
          site_code: site.code || 'AKR-BGP',
          pass_number: pass.pass_number,
          qr_token: pass.qr_token,
          pass_status: pass.status,
          vehicle_type: vehicle.vehicle_type,
          vehicle_number: vehicle.vehicle_number,
        };
      });

      if (params.length > 0 && typeof params[0] === 'string' && params[0].length === 36 && (normalized.includes('WHERE v.id = $1') || normalized.includes('WHERE id = $1'))) {
        results = results.filter(r => r.id === params[0]);
      }

      // Filter by search keyword (ILIKE)
      const searchParam = params.find(p => typeof p === 'string' && p.startsWith('%') && p.endsWith('%'));
      if (searchParam) {
        const queryTerm = searchParam.replace(/%/g, '').toLowerCase().trim();
        if (queryTerm) {
          results = results.filter(r => {
            const vName = (r.visitor_name || '').toLowerCase();
            const vPhone = (r.mobile_number || '').toLowerCase();
            const vComp = (r.company_name || '').toLowerCase();
            const vCode = (r.visit_code || '').toLowerCase();
            const vVeh = (r.vehicle_number || '').toLowerCase();
            const vHost = (r.host_name || '').toLowerCase();
            const vDept = (r.department_name || '').toLowerCase();
            const vPass = (r.pass_number || '').toLowerCase();
            const vPurp = (r.purpose || '').toLowerCase();
            return vName.includes(queryTerm) ||
                   vPhone.includes(queryTerm) ||
                   vComp.includes(queryTerm) ||
                   vCode.includes(queryTerm) ||
                   vVeh.includes(queryTerm) ||
                   vHost.includes(queryTerm) ||
                   vDept.includes(queryTerm) ||
                   vPass.includes(queryTerm) ||
                   vPurp.includes(queryTerm);
          });
        }
      }

      // Filter by status parameter or inline status check
      const statusParam = params.find(p => typeof p === 'string' && ['CHECKED_IN', 'CHECKED_OUT', 'APPROVED', 'PENDING_APPROVAL', 'REJECTED', 'REGISTERED'].includes(p));
      if (statusParam) {
        results = results.filter(r => r.status === statusParam);
      } else if (normalized.includes("v.status = 'CHECKED_IN'") || normalized.includes("status = 'CHECKED_IN'")) {
        results = results.filter(r => r.status === 'CHECKED_IN');
      } else if (normalized.includes("v.status = 'PENDING_APPROVAL'") || normalized.includes("status = 'PENDING_APPROVAL'")) {
        results = results.filter(r => r.status === 'PENDING_APPROVAL');
      } else if (normalized.includes("v.status = 'CHECKED_OUT'") || normalized.includes("status = 'CHECKED_OUT'")) {
        results = results.filter(r => r.status === 'CHECKED_OUT');
      }

      // Filter by visitor_type
      const validTypes = ['Guest', 'Vendor', 'Contractor', 'Service Engineer', 'Customer', 'Interview Candidate', 'Delivery'];
      const typeParam = params.find(p => typeof p === 'string' && validTypes.includes(p));
      if (typeParam) {
        results = results.filter(r => r.visitor_type === typeParam);
      }

      // Sort recent first
      results.sort((a, b) => new Date(b.created_at || b.check_in_time || 0).getTime() - new Date(a.created_at || a.check_in_time || 0).getTime());

      if (isCount) {
        return { rows: [{ total: String(results.length), count: results.length, cnt: results.length }] as any, rowCount: 1 };
      }
      return { rows: results as T[], rowCount: results.length };
    }

    // Default table fallback
    const fromMatch = normalized.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      const tableName = fromMatch[1].toLowerCase();
      const table = memoryDb.get(tableName);
      if (!table) return { rows: [], rowCount: 0 };
      const records = Array.from(table.values());
      return { rows: records as T[], rowCount: records.length };
    }
  }

  return { rows: [], rowCount: 0 };
}
