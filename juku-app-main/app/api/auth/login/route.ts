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

function lookupKeys(id: string): string[] {
  const keys = [id.trim()];
  const at = id.lastIndexOf('@');
  if (at > 0) keys.push(id.slice(0, at).trim());
  return [...new Set(keys.filter(Boolean))];
}

async function findDirectoryUser(client: SupabaseClient, id: string) {
  for (const key of lookupKeys(id)) {
    const teachers = await client.from('teachers').select('id,name,role,branch_id').eq('id', key).limit(1);
    const teacher = teachers.data?.[0] as { id?: string; name?: string; role?: string; branch_id?: string } | undefined;
    if (!teachers.error && teacher?.id) {
      return {
        id: textCell(teacher.id),
        name: textCell(teacher.name) || '名前未設定',
        role: textCell(teacher.role) === 'admin' || textCell(teacher.role) === 'teacher' || textCell(teacher.role) === 'student'
          ? textCell(teacher.role)
          : (textCell(teacher.role) || 'teacher'),
        classroom: textCell(teacher.branch_id),
      };
    }
    const students = await client.from('students').select('id,name,branch_id,grade,high_school,english,math,modern_jp,classic_jp,physics,chemistry,biology,jp_history,world_history,individual,is_pending_delete').eq('id', key).limit(1);
    const student = students.data?.[0] as Record<string, unknown> | undefined;
    if (!students.error && student?.id) {
      return {
        id: textCell(student.id),
        name: textCell(student.name) || '名前未設定',
        role: 'student',
        classroom: textCell(student.branch_id),
        grade: textCell(student.grade),
        highSchool: textCell(student.high_school),
        english: textCell(student.english),
        math: textCell(student.math),
        japanese: textCell(student.modern_jp),
        classicJp: textCell(student.classic_jp),
        physics: textCell(student.physics),
        chemistry: textCell(student.chemistry),
        biology: textCell(student.biology),
        japaneseHistory: textCell(student.jp_history),
        worldHistory: textCell(student.world_history),
        individual: textCell(student.individual),
        isPendingDelete: student.is_pending_delete === true,
      };
    }
  }
  return null;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return NextResponse.json({ error: 'auth_unavailable' }, { status: 503 });

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
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signed = await supabase.auth.signInWithPassword({ email, password });
  const session = signed.data.session;
  if (signed.error || !session) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });

  let directoryUser: Awaited<ReturnType<typeof findDirectoryUser>> = null;
  try {
    directoryUser = await findDirectoryUser(supabase, id);
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
    },
    user: directoryUser
      ? { ...directoryUser, email }
      : { id, name: id, role: 'teacher', classroom: '', email },
  });
}
