import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function textCell(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function authEmailForId(id: string): string {
  const candidate = id.trim();
  if (candidate.toLowerCase().endsWith('@juku.app')) return candidate;
  return `${candidate}@juku.app`;
}

function serviceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function accountEmail(user: { email?: string | null; identities?: Array<{ email?: string | null; identity_data?: { email?: string | null } | null } | null> | null }): string {
  const direct = textCell(user.email);
  if (direct) return direct;
  for (const identity of user.identities || []) {
    if (!identity) continue;
    const email = textCell(identity.email) || textCell(identity.identity_data?.email);
    if (email) return email;
  }
  return '';
}

function safeAuthMessage(error: unknown, secret: string): string {
  const raw = error && typeof error === 'object' && 'message' in error
    ? textCell((error as { message?: unknown }).message)
    : textCell(error);
  const cleaned = secret ? raw.split(secret).join('') : raw;
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function findAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const users = Array.isArray(listed.data?.users) ? listed.data.users : [];
    const found = users.find((user) => accountEmail(user).toLowerCase() === target);
    if (found?.id) return found.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function updateAuthPassword(admin: SupabaseClient, userId: string, password: string) {
  return admin.auth.admin.updateUserById(userId, { password });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });

  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    id?: unknown;
    password?: unknown;
    role?: unknown;
    intent?: unknown;
    name?: unknown;
    classroom?: unknown;
    grade?: unknown;
    highSchool?: unknown;
    math?: unknown;
    english?: unknown;
    japanese?: unknown;
    classicJp?: unknown;
    physics?: unknown;
    chemistry?: unknown;
    biology?: unknown;
    japaneseHistory?: unknown;
    worldHistory?: unknown;
    individual?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const id = textCell(body.id);
  const password = textCell(body.password);
  const requestedRole = textCell(body.role);
  const intent = textCell(body.intent);
  const role = requestedRole === 'admin' || requestedRole === 'teacher' || requestedRole === 'student' ? requestedRole : '';
  if (!id || !role || id.length > 200 || password.length < 6 || password.length > 200) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const callerClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const caller = await callerClient.auth.getUser(token);
  const callerEmail = textCell(caller.data.user?.email);
  if (caller.error || !callerEmail) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = serviceClient(url, serviceKey);
  const callerId = callerEmail.split('@')[0]?.toLowerCase() || '';
  const teachers = await admin.from('teachers').select('id,role');
  if (teachers.error) return NextResponse.json({ error: 'directory_unavailable' }, { status: 503 });
  const callerRow = (teachers.data || []).find((row) => textCell(row.id).toLowerCase() === callerId);
  const callerRole = textCell(callerRow?.role);
  if (callerRole !== 'admin' && callerRole !== 'teacher') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const targetIsStaff = (teachers.data || []).some((row) => textCell(row.id).toLowerCase() === id.toLowerCase());
  if (callerRole !== 'admin' && (role !== 'student' || targetIsStaff)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (intent === 'register') {
    const name = textCell(body.name);
    if (!name) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const email = authEmailForId(id);
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });
    const createdMessage = textCell(created.error?.message).toLowerCase();
    const authExists = createdMessage.includes('already') || createdMessage.includes('registered') || createdMessage.includes('exists');
    if (created.error && !authExists) {
      return NextResponse.json({ error: 'auth_failed', message: safeAuthMessage(created.error, password) }, { status: 400 });
    }

    const studentRow = {
      id,
      name,
      high_school: textCell(body.highSchool),
      grade: textCell(body.grade),
      branch_id: textCell(body.classroom),
      math: textCell(body.math),
      english: textCell(body.english),
      modern_jp: textCell(body.japanese),
      classic_jp: textCell(body.classicJp),
      physics: textCell(body.physics),
      chemistry: textCell(body.chemistry),
      biology: textCell(body.biology),
      jp_history: textCell(body.japaneseHistory),
      world_history: textCell(body.worldHistory),
      individual: textCell(body.individual),
    };
    const teacherRow = {
      id,
      name,
      branch_id: textCell(body.classroom),
      role,
    };
    const table = role === 'student' ? 'students' : 'teachers';
    const inserted = await admin.from(table).insert([role === 'student' ? studentRow : teacherRow]);
    if (inserted.error) {
      const duplicate = inserted.error.code === '23505' || /duplicate key/i.test(inserted.error.message || '');
      if (!duplicate) {
        return NextResponse.json({ error: 'save_failed', message: textCell(inserted.error.message).slice(0, 180) }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const email = authEmailForId(id);
  let userId: string | null = null;
  try {
    userId = await findAuthUserId(admin, email);
  } catch (error) {
    return NextResponse.json({ error: 'auth_lookup_failed', message: safeAuthMessage(error, password) }, { status: 503 });
  }

  if (userId) {
    const updated = await updateAuthPassword(admin, userId, password);
    if (updated.error) {
      return NextResponse.json({ error: 'auth_failed', message: safeAuthMessage(updated.error, password) }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (!created.error && created.data.user?.id) return NextResponse.json({ ok: true });

  try {
    userId = await findAuthUserId(admin, email);
  } catch (error) {
    return NextResponse.json({ error: 'auth_lookup_failed', message: safeAuthMessage(error, password) }, { status: 503 });
  }
  if (!userId) {
    return NextResponse.json({ error: 'auth_failed', message: safeAuthMessage(created.error, password) }, { status: 400 });
  }

  const updated = await updateAuthPassword(admin, userId, password);
  if (updated.error) {
    return NextResponse.json({ error: 'auth_failed', message: safeAuthMessage(updated.error, password) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
