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

async function findAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const found = listed.data.users.find((user) => textCell(user.email).toLowerCase() === target);
    if (found?.id) return found.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });

  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { id?: unknown; password?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const id = textCell(body.id);
  const password = textCell(body.password);
  const requestedRole = textCell(body.role);
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

  const email = authEmailForId(id);
  const userMetadata = { role };
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (!created.error && created.data.user?.id) return NextResponse.json({ ok: true });

  let userId: string | null = null;
  try {
    userId = await findAuthUserId(admin, email);
  } catch {
    return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 503 });
  }
  if (!userId) return NextResponse.json({ error: 'auth_failed' }, { status: 400 });

  const updated = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (updated.error) return NextResponse.json({ error: 'auth_failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
