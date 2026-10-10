import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

function textCell(value) {
  return value == null ? '' : String(value).trim();
}

function authEmail(id) {
  const value = textCell(id);
  if (value.toLowerCase().endsWith('@juku.app')) return value;
  return `${value}@juku.app`;
}

const env = loadEnv('.env.local');
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function allRows(table, columns) {
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) {
    const result = await admin.from(table).select(columns).range(from, from + 999);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    const chunk = result.data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

async function findAuthUserId(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user) => textCell(user.email).toLowerCase() === target);
    if (found?.id) return found.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function syncUser(email, password, userMetadata) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (!created.error && created.data.user?.id) return 'created';
  const detail = created.error?.message?.toLowerCase() || '';
  const exists = detail.includes('already') || detail.includes('registered') || detail.includes('exists');
  if (!exists) throw created.error || new Error('createUser failed');
  const userId = await findAuthUserId(email);
  if (!userId) throw created.error || new Error('existing auth user was not found');
  const updated = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (updated.error) throw updated.error;
  return 'updated';
}

const summary = { created: 0, updated: 0, skipped: 0, failed: [] };

const teachers = await allRows('teachers', 'id,password,role');
for (const row of teachers) {
  const id = textCell(row.id);
  const password = textCell(row.password);
  if (!id || !password) {
    summary.skipped += 1;
    summary.failed.push({ id: id || '(empty)', table: 'teachers', error: 'id or password is empty' });
    continue;
  }
  try {
    const action = await syncUser(authEmail(id), password, { role: textCell(row.role) || 'teacher' });
    summary[action] += 1;
    console.log(`${action} teacher ${id}`);
  } catch (error) {
    summary.failed.push({ id, table: 'teachers', error: error?.message || String(error) });
    console.error(`failed teacher ${id}: ${error?.message || error}`);
  }
}

const students = await allRows('students', 'id,password');
for (const row of students) {
  const id = textCell(row.id);
  const password = textCell(row.password);
  if (!id || !password) {
    summary.skipped += 1;
    summary.failed.push({ id: id || '(empty)', table: 'students', error: 'id or password is empty' });
    continue;
  }
  try {
    const action = await syncUser(authEmail(id), password, { role: 'student' });
    summary[action] += 1;
    console.log(`${action} student ${id}`);
  } catch (error) {
    summary.failed.push({ id, table: 'students', error: error?.message || String(error) });
    console.error(`failed student ${id}: ${error?.message || error}`);
  }
}

console.log(JSON.stringify({
  created: summary.created,
  updated: summary.updated,
  skipped: summary.skipped,
  failed: summary.failed.length,
  failures: summary.failed,
}));
