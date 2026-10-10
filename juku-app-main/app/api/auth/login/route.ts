import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const DEFAULT_LOGIN_PASSWORD = '1234';

type DirectoryUser = {
  id: string;
  name: string;
  role: string;
  classroom: string;
  password: string;
  grade: string;
  highSchool: string;
  english: string;
  math: string;
  japanese: string;
  classicJp: string;
  physics: string;
  chemistry: string;
  biology: string;
  japaneseHistory: string;
  worldHistory: string;
  individual: string;
  isPendingDelete: boolean;
};

function textCell(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function authEmailForId(id: string): string {
  const candidate = id.trim();
  if (candidate.includes('@')) return candidate;
  return `${candidate}@juku.app`;
}

function lookupKeys(id: string): string[] {
  const keys = [id.trim()];
  const at = id.lastIndexOf('@');
  if (at > 0 && id.slice(at + 1).toLowerCase() === 'juku.app') keys.push(id.slice(0, at).trim());
  return [...new Set(keys.filter(Boolean))];
}

function passwordMatches(userId: string, storedPassword: string, inputPassword: string): boolean {
  const stored = storedPassword.trim();
  if (stored) return stored === inputPassword;
  return inputPassword === userId || inputPassword === DEFAULT_LOGIN_PASSWORD;
}

function tokenRole(accessToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as { role?: string };
    return String(payload.role || '');
  } catch {
    return '';
  }
}

function publicUser(user: DirectoryUser, email: string) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    classroom: user.classroom,
    email,
    grade: user.grade,
    highSchool: user.highSchool,
    english: user.english,
    math: user.math,
    japanese: user.japanese,
    classicJp: user.classicJp,
    physics: user.physics,
    chemistry: user.chemistry,
    biology: user.biology,
    japaneseHistory: user.japaneseHistory,
    worldHistory: user.worldHistory,
    individual: user.individual,
    isPendingDelete: user.isPendingDelete,
  };
}

function studentFromRow(row: Record<string, unknown>): DirectoryUser | null {
  const id = textCell(row.id);
  if (!id) return null;
  return {
    id,
    name: textCell(row.name) || '名前未設定',
    role: 'student',
    classroom: textCell(row.branch_id),
    password: textCell(row.password),
    grade: textCell(row.grade),
    highSchool: textCell(row.high_school),
    english: textCell(row.english),
    math: textCell(row.math),
    japanese: textCell(row.modern_jp),
    classicJp: textCell(row.classic_jp),
    physics: textCell(row.physics),
    chemistry: textCell(row.chemistry),
    biology: textCell(row.biology),
    japaneseHistory: textCell(row.jp_history),
    worldHistory: textCell(row.world_history),
    individual: textCell(row.individual),
    isPendingDelete: row.is_pending_delete === true,
  };
}

function staffFromRow(row: Record<string, unknown>): DirectoryUser | null {
  const id = textCell(row.id);
  if (!id) return null;
  return {
    id,
    name: textCell(row.name) || '名前未設定',
    role: textCell(row.role) || 'teacher',
    classroom: textCell(row.branch_id),
    password: textCell(row.password),
    grade: '',
    highSchool: '',
    english: '',
    math: '',
    japanese: '',
    classicJp: '',
    physics: '',
    chemistry: '',
    biology: '',
    japaneseHistory: '',
    worldHistory: '',
    individual: '',
    isPendingDelete: false,
  };
}

async function rowsForId(admin: SupabaseClient, table: 'students' | 'teachers' | 'users', id: string) {
  const columns = table === 'students'
    ? 'id,name,password,branch_id,grade,high_school,english,math,modern_jp,classic_jp,physics,chemistry,biology,jp_history,world_history,individual,is_pending_delete'
    : 'id,name,password,role,branch_id';
  const exact = await admin.from(table).select(columns).eq('id', id).limit(1);
  if (!exact.error && exact.data && exact.data.length > 0) return exact;
  return admin.from(table).select(columns).ilike('id', id.replace(/[%_\\]/g, (char) => `\\${char}`)).limit(1);
}

async function findDirectoryUser(admin: SupabaseClient, id: string): Promise<DirectoryUser | null> {
  for (const key of lookupKeys(id)) {
    const students = await rowsForId(admin, 'students', key);
    if (!students.error && students.data?.[0]) {
      const user = studentFromRow(students.data[0] as Record<string, unknown>);
      if (user) return user;
    }
    const teachers = await rowsForId(admin, 'teachers', key);
    if (!teachers.error && teachers.data?.[0]) {
      const user = staffFromRow(teachers.data[0] as Record<string, unknown>);
      if (user) return user;
    }
    const users = await rowsForId(admin, 'users', key);
    if (!users.error && users.data?.[0]) {
      const user = staffFromRow(users.data[0] as Record<string, unknown>);
      if (user) return user;
    }
  }
  return null;
}

async function findAuthUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) return null;
    const found = listed.data.users.find((user) => (user.email || '').toLowerCase() === target);
    if (found?.id) return found.id;
    if (listed.data.users.length < 200) return null;
  }
  return null;
}

async function syncAuthPassword(admin: SupabaseClient, email: string, password: string) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error) return;
  const detail = created.error.message.toLowerCase();
  const exists = detail.includes('already') || detail.includes('registered') || detail.includes('exists');
  if (!exists) throw created.error;
  const userId = await findAuthUserId(admin, email);
  if (!userId) throw created.error;
  const updated = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (updated.error) throw updated.error;
}

function sessionPayload(accessToken: string, refreshToken: string, expiresAt?: number | null) {
  return { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt ?? null };
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }

  let body: { id?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const id = textCell(body.id);
  const password = textCell(body.password);
  if (!id || !password || id.length > 200 || password.length > 200) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const email = authEmailForId(id);
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const signed = await anon.auth.signInWithPassword({ email, password });
  const admin = serviceKey
    ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    : null;

  if (!signed.error && signed.data.session && tokenRole(signed.data.session.access_token) === 'authenticated') {
    if (!admin) return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
    const directoryUser = await findDirectoryUser(admin, id);
    if (!directoryUser) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    return NextResponse.json({
      session: sessionPayload(signed.data.session.access_token, signed.data.session.refresh_token, signed.data.session.expires_at),
      user: publicUser(directoryUser, email),
    });
  }

  const signInDetail = `${signed.error?.message || ''}`.toLowerCase();
  if (signInDetail.includes('fetch') || signInDetail.includes('network')) {
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }

  const directoryUser = await findDirectoryUser(admin, id);
  if (!directoryUser || !passwordMatches(directoryUser.id, directoryUser.password, password)) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  try {
    await syncAuthPassword(admin, email, password);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }

  const migrated = await anon.auth.signInWithPassword({ email, password });
  const migratedSession = migrated.data.session;
  if (migrated.error || !migratedSession || tokenRole(migratedSession.access_token) !== 'authenticated') {
    console.error(migrated.error);
    return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });
  }

  return NextResponse.json({
    session: sessionPayload(migratedSession.access_token, migratedSession.refresh_token, migratedSession.expires_at),
    user: publicUser(directoryUser, email),
  });
}
