'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import confetti from 'canvas-confetti';
import { createClient } from '@supabase/supabase-js';
import { SCHEDULE_CATEGORY_MAP, scheduleCategoryFromInput, scheduleCategorySetting, type ScheduleCategoryId } from '@/constants/schedule';
import { SUBJECT_CODES, SUBJECT_CONFIG, SUBJECT_MAP, isSubjectCode, subjectCodeFromInput, subjectLabel, subjectSetting, type SubjectCode } from '@/constants/subjects';
export type { ScheduleCategoryId };

function supabaseEnvConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return Boolean(url && key && !url.includes('your_supabase') && !key.includes('your_supabase'));
}

function createSafeSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseEnvConfigured()) {
    return createClient(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

// =============================================================================
// プロの仕事とは「簡単で、簡潔で、丁寧で、見やすくて、チェックのしやすい、
// 一切のミスのない、絶対に誤解を生じないコードで、誰もが感動して涙するような実装を実現すること」
// =============================================================================

// =============================================================================
// SECTION 1. TypeScript 型定義 ＆ システム定数定義
//  - メールアドレス(email)属性を1文字たりとも含まず独自ID(id)のみで全データ管理
//  - DB欠損カラム(time_spent_minutes, created_at, max_score等)でエラーを出さない安全設計
//  - 科目一覧とカラーマッピング(HEX/Tailwind)を定義
// =============================================================================

export type UserRole = 'admin' | 'teacher' | 'student';

// 科目ボタンは24項目・この順序で固定。追加・削除・並べ替えをしない。
const SUBJECT_NAMES = Object.freeze([
  '英語',
  '英単語',
  '数学',
  '数学(学校用)',
  '現代文',
  '古典',
  '漢文',
  '物理',
  '化学',
  '生物',
  '地学',
  '物理基礎',
  '化学基礎',
  '生物基礎',
  '地学基礎',
  '日本史',
  '世界史',
  '地理',
  '政治経済',
  '倫理',
  '公共',
  '情報',
  '高校の予習',
  'その他',
] as const);

export type SubjectType = (typeof SUBJECT_NAMES)[number];

export interface SubjectColorConfig {
  subject: SubjectType;
  colorName: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeClass: string;
  hexCode: string;
}

function subjectColor(
  subject: SubjectType,
  colorName: string,
  bgClass: string,
  textClass: string,
  borderClass: string,
  badgeClass: string,
  hexCode: string,
): SubjectColorConfig {
  return { subject, colorName, bgClass, textClass, borderClass, badgeClass, hexCode };
}

const SUBJECT_COLOR_MAP: Record<SubjectType, SubjectColorConfig> = {
  英語: subjectColor('英語', '赤 (ローズ)', 'bg-rose-50', 'text-rose-800', 'border-rose-200', 'bg-rose-100 text-rose-900 border-rose-300 font-bold', '#e11d48'),
  英単語: subjectColor('英単語', 'ピンク', 'bg-pink-50', 'text-pink-800', 'border-pink-200', 'bg-pink-100 text-pink-900 border-pink-300 font-bold', '#db2777'),
  数学: subjectColor('数学', '青 (ブルー)', 'bg-blue-50', 'text-blue-800', 'border-blue-200', 'bg-blue-100 text-blue-900 border-blue-300 font-bold', '#2563eb'),
  '数学(学校用)': subjectColor('数学(学校用)', '水色 (スカイ)', 'bg-sky-50', 'text-sky-800', 'border-sky-200', 'bg-sky-100 text-sky-900 border-sky-300 font-bold', '#0284c7'),
  現代文: subjectColor('現代文', '緑 (エメラルド)', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold', '#059669'),
  古典: subjectColor('古典', '緑', 'bg-green-50', 'text-green-800', 'border-green-200', 'bg-green-100 text-green-900 border-green-300 font-bold', '#16a34a'),
  漢文: subjectColor('漢文', '青緑 (ティール)', 'bg-teal-50', 'text-teal-800', 'border-teal-200', 'bg-teal-100 text-teal-900 border-teal-300 font-bold', '#0f766e'),
  物理: subjectColor('物理', '紫 (パープル)', 'bg-purple-50', 'text-purple-800', 'border-purple-200', 'bg-purple-100 text-purple-900 border-purple-300 font-bold', '#9333ea'),
  化学: subjectColor('化学', 'バイオレット', 'bg-violet-50', 'text-violet-800', 'border-violet-200', 'bg-violet-100 text-violet-900 border-violet-300 font-bold', '#7c3aed'),
  生物: subjectColor('生物', 'フクシア', 'bg-fuchsia-50', 'text-fuchsia-800', 'border-fuchsia-200', 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 font-bold', '#c026d3'),
  地学: subjectColor('地学', '藍 (インディゴ)', 'bg-indigo-50', 'text-indigo-800', 'border-indigo-200', 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold', '#4f46e5'),
  物理基礎: subjectColor('物理基礎', '薄紫', 'bg-purple-50', 'text-purple-700', 'border-purple-200', 'bg-purple-100 text-purple-800 border-purple-300 font-bold', '#c084fc'),
  化学基礎: subjectColor('化学基礎', '薄バイオレット', 'bg-violet-50', 'text-violet-700', 'border-violet-200', 'bg-violet-100 text-violet-800 border-violet-300 font-bold', '#a78bfa'),
  生物基礎: subjectColor('生物基礎', '薄フクシア', 'bg-fuchsia-50', 'text-fuchsia-700', 'border-fuchsia-200', 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 font-bold', '#e879f9'),
  地学基礎: subjectColor('地学基礎', '薄インディゴ', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-200', 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold', '#818cf8'),
  日本史: subjectColor('日本史', 'オレンジ', 'bg-orange-50', 'text-orange-800', 'border-orange-200', 'bg-orange-100 text-orange-900 border-orange-300 font-bold', '#ea580c'),
  世界史: subjectColor('世界史', '深オレンジ', 'bg-orange-50', 'text-orange-900', 'border-orange-300', 'bg-orange-200 text-orange-950 border-orange-400 font-bold', '#c2410c'),
  地理: subjectColor('地理', 'アンバー', 'bg-amber-50', 'text-amber-800', 'border-amber-200', 'bg-amber-100 text-amber-900 border-amber-300 font-bold', '#d97706'),
  政治経済: subjectColor('政治経済', '黄 (イエロー)', 'bg-yellow-50', 'text-yellow-800', 'border-yellow-200', 'bg-yellow-100 text-yellow-900 border-yellow-300 font-bold', '#ca8a04'),
  倫理: subjectColor('倫理', 'ライム', 'bg-lime-50', 'text-lime-800', 'border-lime-200', 'bg-lime-100 text-lime-900 border-lime-300 font-bold', '#65a30d'),
  公共: subjectColor('公共', '黄緑', 'bg-lime-50', 'text-lime-900', 'border-lime-300', 'bg-lime-200 text-lime-950 border-lime-400 font-bold', '#4d7c0f'),
  情報: subjectColor('情報', 'グレー', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'bg-slate-200 text-slate-900 border-slate-400 font-bold', '#64748b'),
  '高校の予習': subjectColor('高校の予習', 'ストーン', 'bg-stone-100', 'text-stone-800', 'border-stone-300', 'bg-stone-200 text-stone-900 border-stone-400 font-bold', '#78716c'),
  その他: subjectColor('その他', 'スレート', 'bg-slate-50', 'text-slate-700', 'border-slate-200', 'bg-slate-100 text-slate-800 border-slate-300 font-bold', '#94a3b8'),
};

Object.freeze(SUBJECT_COLOR_MAP);

const LEGACY_SUBJECT_MAP: Record<string, SubjectType> = Object.freeze({
  古文: '古典',
  '古文・漢文': '古典',
  '学校のプリント': '高校の予習',
  '高校のプリント': '高校の予習',
  '公共など': '公共',
  現代社会: '公共',
  英熟語: '英語',
  他: 'その他',
  '物理・化学・生物': '物理',
  '物理基礎・化学基礎・生物基礎・地学基礎': '物理基礎',
  '日本史・世界史・地理': '日本史',
  '公民・政治経済・倫理': '政治経済',
  '情報・その他': '情報',
});

const SUBJECT_MATCH_ORDER = Object.freeze(
  [...SUBJECT_NAMES].filter((name) => name !== 'その他').sort((a, b) => b.length - a.length),
);

function isSubjectType(value: string): value is SubjectType {
  return Object.prototype.hasOwnProperty.call(SUBJECT_COLOR_MAP, value);
}

const SUBJECT_CODE_TONE: Record<SubjectCode, SubjectType> = {
  english: '英語',
  vocab: '英単語',
  math_school: '数学(学校用)',
  math_prep: '数学',
  modern_jp: '現代文',
  classic_jp: '古典',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  earth_science: '地学',
  jp_history: '日本史',
  world_history: '世界史',
  geography: '地理',
  politics_economy: '政治経済',
  ethics: '倫理',
  civics: '公共',
  info_tech: '情報',
  hs_prep: '高校の予習',
  other: 'その他',
};

const TEACHER_SUBJECT_DISPLAY: Partial<Record<SubjectCode, string>> = {
  vocab: '単語・熟語',
  math_school: '数学(学校)',
  math_prep: '数学(受験)',
};

function teacherSubjectLabel(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const code = subjectCodeFromInput(raw);
  if (code && TEACHER_SUBJECT_DISPLAY[code]) return TEACHER_SUBJECT_DISPLAY[code];
  return subjectLabel(raw);
}

function canonicalizeSubjectLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/（/g, '(').replace(/）/g, ')') : '';
}

function subjectFromInput(value: unknown): SubjectType | null {
  const raw = canonicalizeSubjectLabel(value);
  if (isSubjectType(raw)) return raw;
  return LEGACY_SUBJECT_MAP[raw] || null;
}

function exactSubjectFromRecord(record: Record<string, unknown> | null | undefined): SubjectType | null {
  if (!record) return null;
  const preferred = ['subject', 'category', '教科', 'subject_name', 'kamoku'];
  for (const key of preferred) {
    const subject = subjectFromInput(record[key]);
    if (subject) return subject;
  }
  return null;
}

function subjectFromMaterialTitle(title: string): SubjectType | null {
  const text = canonicalizeSubjectLabel(title);
  if (!text) return null;
  if (text.includes('数学(学校用)')) return '数学(学校用)';
  if (text.includes('古文')) return '古典';
  if (text.includes('現代社会')) return '公共';
  if (text.includes('英熟語')) return '英語';
  const named = SUBJECT_MATCH_ORDER.find((name) => text.includes(name));
  if (named) return named;
  if (/英単語|パス単|\bDUO\b/i.test(text)) return '英単語';
  if (/英語|英文|英作文|英検|イングリッシュ/i.test(text)) return '英語';
  return null;
}

function subjectForMasterRow(
  row: Record<string, unknown> | null | undefined,
  title: string,
  cached?: { subject?: unknown } | null,
): SubjectType {
  const stored = exactSubjectFromRecord(row) || subjectFromInput(cached?.subject);
  if (stored) return stored;
  return subjectFromMaterialTitle(title) || 'その他';
}

function subjectBadgeClass(subject: string): string {
  return isSubjectType(subject)
    ? SUBJECT_COLOR_MAP[subject].badgeClass
    : 'bg-slate-100 text-slate-800 border border-slate-300 font-bold';
}

function materialTitleKey(title: string): string {
  return title.trim();
}

function findMaterialByTitle(list: Material[], title: string): Material | undefined {
  const key = materialTitleKey(title);
  return list.find((item) => materialTitleKey(item.title) === key);
}

function upsertMaterialList(list: Material[], saved: Material): Material[] {
  const key = materialTitleKey(saved.title);
  const rest = list.filter((item) => item.id !== saved.id && materialTitleKey(item.title) !== key);
  return [saved, ...rest];
}

function readDisplayOrder(value: unknown): number | null {
  if (value == null || value === '') return null;
  const order = Number(value);
  return Number.isFinite(order) ? order : null;
}

function maxDisplayOrder(list: Material[], subject: SubjectType): number {
  let max = 0;
  for (const item of list) {
    if (item.subject !== subject) continue;
    const order = readDisplayOrder(item.display_order);
    if (order != null && order > max) max = order;
  }
  return max;
}

function createDisplayOrderAllocator(existingList: Material[]) {
  const cursor = new Map<SubjectType, number>();
  return (subject: SubjectType, existing: Material | undefined): number => {
    if (existing && existing.subject === subject && existing.display_order != null) return existing.display_order;
    if (!cursor.has(subject)) cursor.set(subject, maxDisplayOrder(existingList, subject));
    const next = (cursor.get(subject) ?? 0) + 1;
    cursor.set(subject, next);
    return next;
  };
}

function byDisplayOrder(list: readonly Material[]): Material[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = a.item.display_order;
      const bo = b.item.display_order;
      if (ao == null && bo == null) return a.index - b.index;
      if (ao == null) return 1;
      if (bo == null) return -1;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function materialsForSubject(list: Material[], subject: SubjectType): Material[] {
  return byDisplayOrder(list.filter((item) => item.subject === subject));
}

function bySubjectThenOrder(list: readonly Material[]): Material[] {
  const rank = new Map(SUBJECT_NAMES.map((name, index) => [name, index]));
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const subjectDiff = (rank.get(a.item.subject) ?? SUBJECT_NAMES.length) - (rank.get(b.item.subject) ?? SUBJECT_NAMES.length);
      if (subjectDiff !== 0) return subjectDiff;
      const ao = a.item.display_order;
      const bo = b.item.display_order;
      if (ao == null && bo == null) return a.index - b.index;
      if (ao == null) return 1;
      if (bo == null) return -1;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function mergeMaterialRecord(
  existing: Material | undefined,
  incoming: {
    id?: string;
    title: string;
    subject: SubjectType;
    description?: string;
    image_url?: string | null;
    difficulty?: Material['difficulty'];
    created_by?: string;
    display_order?: number;
    overwriteBlanks: boolean;
  },
): Material {
  const description = incoming.description?.trim()
    ? incoming.description.trim()
    : incoming.overwriteBlanks
      ? undefined
      : existing?.description;
  const imageUrl = incoming.image_url
    ? incoming.image_url
    : incoming.overwriteBlanks
      ? null
      : existing?.image_url || null;
  return {
    id: existing?.id || incoming.id || `mat_${Date.now()}`,
    title: incoming.title.trim(),
    subject: incoming.subject,
    difficulty: incoming.difficulty || existing?.difficulty || 'standard',
    image_url: imageUrl,
    description,
    color: subjectSetting(incoming.subject).color,
    created_by: existing?.created_by || incoming.created_by || '',
    display_order: incoming.display_order ?? existing?.display_order ?? 1,
  };
}

function materialWritePayload(
  saved: Material,
  _options?: { includeImage: boolean; includeDescription: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: saved.title,
    subject: saved.subject_code || saved.subject,
    description: saved.description ?? null,
    is_custom: saved.is_custom === true,
    owner_student_id: saved.owner_student_id ?? null,
  };
  if (saved.display_order != null) payload.order_index = saved.display_order;
  return payload;
}

function missingMaterialsColumn(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["']([^"']+)["'] of relation/i,
    /column ["']([^"']+)["'] does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function writeMaterialRow(
  supabase: any,
  id: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const body: Record<string, unknown> = { ...payload };
  const modes: Array<'upsert' | 'insert' | 'update'> = ['upsert', 'insert', 'update'];
  let lastMessage = '';
  for (const mode of modes) {
    const result = mode === 'update'
      ? await supabase.from('materials').update(body).eq('id', id)
      : mode === 'insert'
        ? await supabase.from('materials').insert([{ id, ...body }])
        : await supabase.from('materials').upsert([{ id, ...body }], { onConflict: 'id' });
    if (!result.error) return null;
    lastMessage = result.error.message || lastMessage;
  }
  return lastMessage || '教材の保存に失敗しました';
}

async function updateMaterialOrder(supabase: any, id: string, order: number): Promise<string | null> {
  const result = await supabase.from('materials').update({ order_index: order }).eq('id', id);
  if (!result.error) return null;
  return result.error.message || '表示順の保存に失敗しました';
}

const MATERIAL_COLUMNS = 'id, title, subject, description, order_index, is_custom, owner_student_id';

async function selectMaterialMaster(supabase: { from: (table: string) => any }): Promise<{ data: any[]; error: { message?: string } | null }> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const result = await supabase.from('materials').select(MATERIAL_COLUMNS).order('subject', { ascending: true }).order('order_index', { ascending: true }).range(from, from + pageSize - 1);
    if (result.error) return { data: [], error: result.error };
    const chunk = result.data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: rows, error: null };
}

async function selectStudentFavoriteIds(supabase: { from: (table: string) => any }, studentId: string): Promise<{ ids: Set<string> | null; error: { message?: string } | null }> {
  const pageSize = 1000;
  const ids = new Set<string>();
  for (let from = 0; from < 20000; from += pageSize) {
    const result = await supabase.from('student_favorites').select('student_id, material_id').eq('student_id', studentId).range(from, from + pageSize - 1);
    if (result.error) return { ids: null, error: result.error };
    for (const row of result.data || []) {
      const materialId = String(row?.material_id ?? '').trim();
      if (materialId) ids.add(materialId);
    }
    if ((result.data || []).length < pageSize) break;
  }
  return { ids, error: null };
}

async function saveStudentFavorite(supabase: { from: (table: string) => any }, studentId: string, materialId: string, nextFavorite: boolean): Promise<void> {
  const result = nextFavorite
    ? await supabase.from('student_favorites').insert([{ student_id: studentId, material_id: materialId }])
    : await supabase.from('student_favorites').delete().eq('student_id', studentId).eq('material_id', materialId);
  if (!result.error || /duplicate key|already exists/i.test(result.error.message || '')) return;
  throw result.error;
}

function reportMaterialError(error: unknown, fallback: string) {
  const detail = error instanceof Error
    ? error.message
    : String((error as { message?: string } | null)?.message || fallback);
  const message = `通信エラー: ${detail || fallback}`;
  console.error(message, error);
  alert(message);
}

async function selectAllRows(
  supabase: { from: (table: string) => any },
  table: string,
): Promise<{ data: any[]; error: { message?: string } | null }> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const result = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (result.error) {
      if (rows.length > 0) return { data: rows, error: null };
      return { data: [], error: result.error };
    }
    const chunk = result.data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: rows, error: null };
}

function messageFromStoredRow(row: any): StudentMessage | null {
  const id = String(row?.id ?? '').trim();
  const userId = String(row?.user_id ?? row?.student_id ?? '').trim();
  const body = String(row?.message_content ?? row?.body ?? row?.comment ?? row?.message ?? row?.content ?? '').trim();
  if (!id || !userId || !body) return null;
  const read = row?.is_read === true || Boolean(row?.read_at);
  return {
    id,
    user_id: userId,
    sender_id: String(row?.teacher_id ?? row?.sender_id ?? ''),
    sender_name: String(row?.sender_name ?? row?.sender ?? '講師'),
    body,
    sent_at: String(row?.sent_at ?? row?.created_at ?? new Date().toISOString()),
    read_at: read ? String(row?.read_at ?? row?.created_at ?? new Date().toISOString()) : null,
  };
}

async function insertCommentBatch(
  supabase: { from: (table: string) => any },
  rows: Record<string, unknown>[],
): Promise<boolean> {
  const body = rows.map((row) => ({ ...row }));
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await supabase.from('comments').insert(body);
    if (!result.error) return true;
    const message = String(result.error.message || '');
    const missing = missingMaterialsColumn(message);
    if (missing && body.some((item) => Object.prototype.hasOwnProperty.call(item, missing))) {
      body.forEach((item) => {
        delete item[missing];
      });
      continue;
    }
    const required = message.match(/null value in column "([^"]+)"/i);
    if (required?.[1] && body.some((item) => item[required[1]] == null)) {
      body.forEach((item) => {
        const column = required[1];
        if (item[column] != null) return;
        if (/user|student|sender/i.test(column)) item[column] = item.user_id || item.sender_id || '';
        else if (/time|date|at$/i.test(column)) item[column] = item.created_at || new Date().toISOString();
        else item[column] = item.body || item.comment || '';
      });
      continue;
    }
    if (/invalid input syntax for type (timestamp|date)/i.test(message) && body.some((item) => 'sent_at' in item)) {
      body.forEach((item) => {
        delete item.sent_at;
      });
      continue;
    }
    return false;
  }
  return false;
}

const STUDENT_PROFILE_FIELDS = [
  { key: 'grade', label: '学年', column: 'grade' },
  { key: 'highSchool', label: '高校', column: 'high_school' },
  { key: 'english', label: '英語', column: 'subject_english' },
  { key: 'math', label: '数学', column: 'subject_math' },
  { key: 'japanese', label: '国語', column: 'modern_jp' },
  { key: 'classicJp', label: '古典', column: 'classic_jp' },
  { key: 'physics', label: '物理', column: 'subject_physics' },
  { key: 'chemistry', label: '化学', column: 'subject_chemistry' },
  { key: 'biology', label: '生物', column: 'subject_biology' },
  { key: 'japaneseHistory', label: '日本史', column: 'jp_history' },
  { key: 'worldHistory', label: '世界史', column: 'world_history' },
  { key: 'individual', label: '個別', column: 'individual' },
] as const;

const STUDENT_LIST_COLUMNS = [
  { key: 'name', label: '氏名' },
  { key: 'grade', label: '学年' },
  { key: 'highSchool', label: '高校' },
  { key: 'classroom', label: '所属校舎' },
  { key: 'role', label: '区分' },
  { key: 'id', label: '独自ID' },
  { key: 'password', label: 'パスワード' },
  { key: 'english', label: '英語' },
  { key: 'math', label: '数学' },
  { key: 'japanese', label: '国語' },
  { key: 'classicJp', label: '古典' },
  { key: 'physics', label: '物理' },
  { key: 'chemistry', label: '化学' },
  { key: 'biology', label: '生物' },
  { key: 'japaneseHistory', label: '日本史' },
  { key: 'worldHistory', label: '世界史' },
  { key: 'individual', label: '個別' },
] as const;

type StudentProfileKey = (typeof STUDENT_PROFILE_FIELDS)[number]['key'];
type StudentProfile = Record<StudentProfileKey, string>;
type StudentListFilterKey = (typeof STUDENT_LIST_COLUMNS)[number]['key'];

function toHalfWidthAscii(value: string): string {
  return value
    .replace(/\u3000/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

function readAppSession(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!parsed?.id || !parsed.name || (parsed.role !== 'admin' && parsed.role !== 'teacher' && parsed.role !== 'student')) return null;
    return {
      ...emptyStudentProfile(),
      ...parsed,
      id: String(parsed.id),
      name: String(parsed.name),
      role: parsed.role,
      classroom: parsed.classroom || '本川越校',
      password: '',
    };
  } catch {
    return null;
  }
}

function writeAppSession(user: User) {
  if (typeof window === 'undefined') return;
  const stored: User = { ...user, password: '' };
  window.localStorage.setItem(APP_SESSION_KEY, JSON.stringify(stored));
}

function clearAppSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(APP_SESSION_KEY);
}

function readExplicitLogout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1';
}

function writeExplicitLogout() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EXPLICIT_LOGOUT_KEY, '1');
}

function clearExplicitLogout() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
}

function clearStoredLoginSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(APP_SESSION_KEY);
  const localKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isAuthStorageKey(key)) localKeys.push(key);
  }
  localKeys.forEach((key) => window.localStorage.removeItem(key));
  const sessionKeys: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key && (key === APP_SESSION_KEY || isAuthStorageKey(key))) sessionKeys.push(key);
  }
  sessionKeys.forEach((key) => window.sessionStorage.removeItem(key));
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();
    if (!name || !isAuthStorageKey(name)) return;
    document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

function isAuthStorageKey(key: string): boolean {
  const name = key.toLowerCase();
  return name.startsWith('sb-') || name.includes('supabase.auth') || name.includes('supabase-auth');
}

function emptyStudentProfile(): StudentProfile {
  return {
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
  };
}

export interface User {
  id: string; // 独自文字列ID (例: ext001, ext002, teacher01 等)
  name: string;
  role: UserRole;
  classroom: string;
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
  password: string;
  email?: string;
  isPendingDelete?: boolean;
}

export interface StudentMessage {
  id: string;
  user_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  sent_at: string;
  read_at: string | null;
}

const APP_SESSION_KEY = 'juku_app_session';
const EXPLICIT_LOGOUT_KEY = 'juku_explicit_logout';
const STUDENT_PROFILE_STORAGE_KEY = 'juku_student_profiles';
const STUDENT_MESSAGE_STORAGE_KEY = 'juku_student_messages';
const USER_PASSWORD_STORAGE_KEY = 'juku_user_passwords';
const DEFAULT_LOGIN_PASSWORD = '1234';

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStoredJson<T>(key: string, fallback: T, accept: (value: unknown) => value is T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const backupKey = `${key}__backup`;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!accept(parsed)) throw new Error('invalid stored json');
    return parsed;
  } catch {
    try {
      if (!window.localStorage.getItem(backupKey)) window.localStorage.setItem(backupKey, raw);
    } catch {
      // バックアップを書けなくても、元のキーは消さない
    }
    const backupRaw = window.localStorage.getItem(backupKey);
    if (backupRaw && backupRaw !== raw) {
      try {
        const backup: unknown = JSON.parse(backupRaw);
        if (accept(backup)) return backup;
      } catch {
        // 壊れた値では上書きしない
      }
    }
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocalProfiles(): Record<string, StudentProfile> {
  return readLocalJson<Record<string, StudentProfile>>(STUDENT_PROFILE_STORAGE_KEY, {});
}

function saveLocalProfile(userId: string, profile: StudentProfile) {
  const all = readLocalProfiles();
  all[userId] = profile;
  writeLocalJson(STUDENT_PROFILE_STORAGE_KEY, all);
}

function readLocalMessages(): StudentMessage[] {
  return readLocalJson<StudentMessage[]>(STUDENT_MESSAGE_STORAGE_KEY, []);
}

function writeLocalMessages(messages: StudentMessage[]) {
  writeLocalJson(STUDENT_MESSAGE_STORAGE_KEY, messages);
}

function readLocalPasswords(): Record<string, string> {
  return readLocalJson<Record<string, string>>(USER_PASSWORD_STORAGE_KEY, {});
}

function saveLocalPassword(userId: string, password: string) {
  const all = readLocalPasswords();
  const next = password.trim();
  if (next) all[userId] = next;
  else delete all[userId];
  writeLocalJson(USER_PASSWORD_STORAGE_KEY, all);
}

function textCell(value: unknown): string {
  return value == null ? '' : String(value);
}

function passwordFromRow(row: any): string {
  return textCell(row?.password).trim();
}

function acceptsLoginPassword(userId: string, storedPassword: string, inputPassword: string): boolean {
  const stored = storedPassword.trim();
  if (stored) return stored === inputPassword;
  return inputPassword === userId || inputPassword === DEFAULT_LOGIN_PASSWORD;
}

const USER_ROLE_CACHE_KEY = 'juku_user_roles';

function readCachedUserRole(userId: string): UserRole | null {
  const cached = readLocalJson<Record<string, string>>(USER_ROLE_CACHE_KEY, {})[userId];
  if (cached === 'admin' || cached === 'teacher' || cached === 'student') return cached;
  return null;
}

const KNOWN_ADMIN_LOGIN_IDS = ['admin@y.stlog'];
const BUILTIN_ADMIN_ID = 'admin@y.stlog';
const BUILTIN_ADMIN_PASSWORD = 'ylog-admin';

function isBuiltinAdminLogin(id: string, password: string): boolean {
  return normalizeLoginIdentity(id) === normalizeLoginIdentity(BUILTIN_ADMIN_ID) && password === BUILTIN_ADMIN_PASSWORD;
}

function normalizeLoginIdentity(value: unknown): string {
  return String(value ?? '').replace(/[\s\u3000]/g, '').toLowerCase();
}

function isKnownAdminIdentity(...values: unknown[]): boolean {
  return values.some((value) => KNOWN_ADMIN_LOGIN_IDS.includes(normalizeLoginIdentity(value)));
}

function rememberUserRole(userId: string, role: UserRole) {
  const id = userId.trim();
  if (!id) return;
  const stored: UserRole = isKnownAdminIdentity(id) ? 'admin' : role;
  const all = readLocalJson<Record<string, string>>(USER_ROLE_CACHE_KEY, {});
  if (all[id] === stored) return;
  all[id] = stored;
  writeLocalJson(USER_ROLE_CACHE_KEY, all);
}

function resolveAppRole(value: unknown, userId?: string, email?: string): UserRole {
  if (isKnownAdminIdentity(userId, email)) return 'admin';
  const raw = String(value ?? '').replace(/[\s\u3000]/g, '').toLowerCase();
  if (raw === 'admin' || raw === 'administrator' || raw.includes('admin') || raw === '管理者' || raw === '管理') return 'admin';
  if (raw === 'teacher' || raw === 'staff' || raw.includes('teacher') || raw === '講師' || raw === '教師' || raw === '先生') return 'teacher';
  if (raw === 'student' || raw === '生徒') return 'student';
  const cached = userId ? readCachedUserRole(userId) : null;
  if (cached === 'student' && isKnownAdminIdentity(userId, email)) return 'admin';
  return cached || 'student';
}

function isStaffRole(role: unknown, userId?: string, email?: string): boolean {
  const resolved = resolveAppRole(role, userId, email);
  return resolved === 'admin' || resolved === 'teacher';
}

function pickStudentProfile(source: Partial<StudentProfile> | null | undefined): StudentProfile {
  const profile = emptyStudentProfile();
  if (!source) return profile;
  STUDENT_PROFILE_FIELDS.forEach((field) => {
    const value = source[field.key];
    if (value != null && String(value).trim() !== '') profile[field.key] = String(value).trim();
  });
  return profile;
}

function profileFromRow(row: any): StudentProfile {
  const profile = emptyStudentProfile();
  if (row?.student_profile) {
    try {
      const parsed = typeof row.student_profile === 'string' ? JSON.parse(row.student_profile) : row.student_profile;
      Object.assign(profile, pickStudentProfile(parsed));
    } catch {
      // 壊れたJSONは無視してカラム値を優先する
    }
  }
  STUDENT_PROFILE_FIELDS.forEach((field) => {
    const columnValue = row?.[field.column];
    if (columnValue != null && String(columnValue).trim() !== '') {
      profile[field.key] = String(columnValue).trim();
    }
  });
  const local = readLocalProfiles()[row?.id];
  if (local) {
    STUDENT_PROFILE_FIELDS.forEach((field) => {
      if (!profile[field.key] && local[field.key]) profile[field.key] = local[field.key];
    });
  }
  return profile;
}

function profileToDbColumns(profile: StudentProfile): Record<string, string> {
  const columns: Record<string, string> = { student_profile: JSON.stringify(profile) };
  STUDENT_PROFILE_FIELDS.forEach((field) => {
    columns[field.column] = profile[field.key] || '';
  });
  return columns;
}

function blankUserForm(role: UserRole = 'student'): User {
  return {
    id: '',
    name: '',
    role,
    classroom: '本川越校',
    password: '',
    ...emptyStudentProfile(),
  };
}

function formatMessageTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSentAt(iso: string): string {
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatMessageTimestamp(date);
}

function StudentProfileFields({
  value,
  onChange,
}: {
  value: StudentProfile;
  onChange: (key: StudentProfileKey, next: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {STUDENT_PROFILE_FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block text-slate-600 mb-1">{field.label}</label>
          <input
            type="text"
            value={value[field.key]}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      ))}
    </div>
  );
}

export interface Material {
  id: string;
  title: string;
  subject: SubjectType;
  difficulty?: 'basic' | 'standard' | 'advanced';
  image_url?: string | null;
  description?: string;
  color?: string | null;
  created_by: string;
  display_order: number | null;
  is_favorite?: boolean;
  is_custom?: boolean;
  owner_student_id?: string | null;
  subject_code?: string | null;
}

export interface StudyLog {
  id: string;
  user_id: string;
  material_id: string;
  score: number;
  max_score?: number;
  time_spent_minutes: number;
  is_mission_completed: boolean;
  comment?: string;
  created_at?: string;
  start_time?: string;
  end_time?: string;
  subject?: string;
}

function studyLogRemoteRow(log: StudyLog, subject = ''): Record<string, unknown> {
  return {
    id: log.id,
    student_id: log.user_id,
    material_id: log.material_id,
    subject: subject || '',
    duration_minutes: log.time_spent_minutes ?? 0,
    study_date: log.created_at || new Date().toISOString(),
    memo: log.comment ?? '',
    is_mission_completed: log.is_mission_completed === true,
  };
}

export type WeekdayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type StaffScheduleTemplateId = 'plain' | 'high_school' | 'high_school_club';

export interface ScheduleSlot {
  id: string;
  day: WeekdayId;
  startHour: number;
  endHour: number;
  startMinute?: number;
  endMinute?: number;
  category: ScheduleCategoryId;
  title: string;
}

export interface MyScheduleFolderItem {
  id: string;
  name: string;
  hinaSlot?: number;
  slots: ScheduleSlot[];
}

export interface ScheduleSlotDraft {
  id: string | null;
  day: WeekdayId;
  startHour: number;
  endHour: number;
  startMinute: number;
  endMinute: number;
  category: ScheduleCategoryId;
  title: string;
}

export type ActiveTab = 
  | 'dashboard'
  | 'teachers'
  | 'students'
  | 'pending_delete'
  | 'student_detail'
  | 'schedule_planner'
  | 'materials'
  | 'logs'
  | 'progress';

export interface CsvRowError {
  rowNumber: number;
  field: string;
  message: string;
  rawValue?: string;
}

export interface NotificationState {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: string;
}

// =============================================================================
// SECTION 2. スケジュール（週間タイムテーブル）
// =============================================================================

const WEEKLY_GOAL_STORAGE_KEY = 'juku_weekly_goals';
const PENDING_STUDY_LOGS_KEY = 'juku_pending_study_logs';
const STUDY_LOG_OVERRIDES_KEY = 'juku_study_log_overrides';
const DELETED_STUDY_LOGS_KEY = 'juku_deleted_study_log_ids';
const MY_MATERIALS_KEY = 'juku_my_materials';
const COUNTDOWN_MINUTE_CHIPS = [15, 30, 45, 60, 90] as const;
const SCHEDULE_HOUR_HEIGHT = 36;
const STUDY_MINUTE_CHIPS = [15, 30, 45, 60, 90, 120] as const;
const JS_DAY_TO_WEEKDAY: WeekdayId[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const WEEKDAYS: { id: WeekdayId; label: string }[] = [
  { id: 'mon', label: '月' },
  { id: 'tue', label: '火' },
  { id: 'wed', label: '水' },
  { id: 'thu', label: '木' },
  { id: 'fri', label: '金' },
  { id: 'sat', label: '土' },
  { id: 'sun', label: '日' },
];

const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const SCHEDULE_MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const STAFF_SCHEDULE_TEMPLATES: { id: StaffScheduleTemplateId; name: string }[] = [
  { id: 'plain', name: 'プレーン(何も設定されていない)' },
  { id: 'high_school', name: '「高校」のみのパターン' },
  { id: 'high_school_club', name: '「高校」・「部活」パターン' },
];

function formatScheduleHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function startOfThisWeek(now = new Date()): Date {
  const startKey = weekStartKey(todayDateKey(now));
  const [year, month, day] = startKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, -9, 0, 0, 0));
}

function isStudyLog(value: unknown): value is StudyLog {
  if (!value || typeof value !== 'object') return false;
  const log = value as StudyLog;
  return Boolean(log.id && log.user_id);
}

function readPendingStudyLogs(): StudyLog[] {
  const stored = readStoredJson<StudyLog[]>(
    PENDING_STUDY_LOGS_KEY,
    [],
    (value): value is StudyLog[] => Array.isArray(value),
  );
  return stored.filter(isStudyLog);
}

function writeStudyRecordJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(value);
  if (serialized === '[]' || serialized === '{}') {
    const raw = window.localStorage.getItem(key);
    if (raw && raw !== '[]' && raw !== '{}') {
      try {
        JSON.parse(raw);
      } catch {
        return;
      }
    }
  }
  writeLocalJson(key, value);
}

function writePendingStudyLogs(logs: StudyLog[]) {
  writeStudyRecordJson(PENDING_STUDY_LOGS_KEY, logs);
}

function rememberPendingStudyLog(log: StudyLog) {
  writePendingStudyLogs([log, ...readPendingStudyLogs().filter((item) => item.id !== log.id)]);
}

function readWeeklyGoalMinutes(userId: string): number {
  const stored = readLocalJson<Record<string, number>>(WEEKLY_GOAL_STORAGE_KEY, {});
  const value = stored[userId];
  return typeof value === 'number' && value > 0 ? value : 0;
}

function writeWeeklyGoalMinutes(userId: string, minutes: number) {
  const stored = readLocalJson<Record<string, number>>(WEEKLY_GOAL_STORAGE_KEY, {});
  stored[userId] = minutes;
  writeLocalJson(WEEKLY_GOAL_STORAGE_KEY, stored);
}

function readStudyLogOverrides(): Record<string, StudyLog> {
  return readStoredJson<Record<string, StudyLog>>(
    STUDY_LOG_OVERRIDES_KEY,
    {},
    (value): value is Record<string, StudyLog> => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );
}

function writeStudyLogOverrides(overrides: Record<string, StudyLog>) {
  writeStudyRecordJson(STUDY_LOG_OVERRIDES_KEY, overrides);
}

function readDeletedStudyLogIds(): string[] {
  const stored = readStoredJson<string[]>(
    DELETED_STUDY_LOGS_KEY,
    [],
    (value): value is string[] => Array.isArray(value),
  );
  return stored.filter((id) => typeof id === 'string' && id);
}

function writeDeletedStudyLogIds(ids: string[]) {
  writeStudyRecordJson(DELETED_STUDY_LOGS_KEY, ids);
}

interface MyMaterialItem {
  id: string;
  title: string;
  subject: SubjectType;
  subject_code?: string | null;
  addedAt: string;
}

function readMyMaterials(userId: string): MyMaterialItem[] {
  const stored = readLocalJson<Record<string, MyMaterialItem[]>>(MY_MATERIALS_KEY, {});
  const items = stored[userId];
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item?.id || !item.title) return [];
    const subject = subjectFromInput(item.subject);
    if (!subject) return [];
    return [{ ...item, subject }];
  });
}

function writeMyMaterials(userId: string, items: MyMaterialItem[]) {
  const stored = readLocalJson<Record<string, MyMaterialItem[]>>(MY_MATERIALS_KEY, {});
  stored[userId] = items;
  writeLocalJson(MY_MATERIALS_KEY, stored);
}

function parseScannedMaterial(raw: string, catalog: Material[]): { title: string; subject: SubjectType } | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { title?: unknown; name?: unknown; subject?: unknown };
    const title = String(parsed.title || parsed.name || '').trim();
    const subject = subjectFromInput(parsed.subject);
    if (title && subject) return { title, subject };
    if (title) return { title, subject: 'その他' };
  } catch {
    // QRはJSON以外の文字列もある
  }
  const byId = catalog.find((item) => item.id === text);
  if (byId && isSubjectType(byId.subject)) return { title: byId.title, subject: byId.subject };
  const byTitle = findMaterialByTitle(catalog, text);
  if (byTitle && isSubjectType(byTitle.subject)) return { title: byTitle.title, subject: byTitle.subject };
  const parts = text.split(/[|｜,\t]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const subjectFirst = subjectFromInput(parts[0]);
    if (subjectFirst) return { title: parts.slice(1).join(' '), subject: subjectFirst };
    const subjectSecond = subjectFromInput(parts[1]);
    if (subjectSecond) return { title: parts[0], subject: subjectSecond };
  }
  return { title: text, subject: 'その他' };
}

type QrCodeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function QrMaterialScanner({
  onResult,
  onClose,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('カメラを起動しています。');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let stream: MediaStream | null = null;
    const DetectorCtor = (window as Window & {
      BarcodeDetector?: new (options: { formats: string[] }) => QrCodeDetector;
    }).BarcodeDetector;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('この端末ではカメラを起動できません。下のフォームから追加してください。');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!DetectorCtor) {
          setMessage('カメラは起動しました。このブラウザはQRの解析に未対応です。下のフォームから追加してください。');
          return;
        }
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        setMessage('QRコードをかざしてください。');
        const loop = async () => {
          if (stopped) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              const value = codes.find((code) => code.rawValue)?.rawValue;
              if (value) {
                onResultRef.current(value);
                return;
              }
            } catch {
              // 次のフレームで読み取りを続ける
            }
          }
          timer = window.setTimeout(() => { void loop(); }, 280);
        };
        void loop();
      } catch {
        setMessage('カメラを起動できませんでした。許可を確認するか、下のフォームから追加してください。');
      }
    };
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-4 pb-8 space-y-3" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-base">QRコードを読み取る</h3>
          <button type="button" onClick={onClose} className="text-xs font-black text-slate-400 cursor-pointer">閉じる</button>
        </div>
        <video ref={videoRef} muted playsInline className="w-full aspect-square bg-slate-900 rounded-2xl object-cover" />
        <p className="text-xs font-bold text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const ACTIVE_STUDY_CLOCK_KEY = 'juku_active_study_clock';

interface ActiveStudyClock {
  userId: string;
  mode: 'timer' | 'countdown';
  running: boolean;
  startedAt: number;
  targetSec: number;
  finished: boolean;
  subject: string;
  materialId: string;
  comment: string;
  mission: boolean;
  date: string;
  composer: StudyClockRange;
}

function isStudyClockRange(value: unknown): value is StudyClockRange {
  if (!value || typeof value !== 'object') return false;
  const range = value as StudyClockRange;
  return [range.startHour, range.startMinute, range.endHour, range.endMinute].every((item) => Number.isFinite(item));
}

function readActiveStudyClock(): ActiveStudyClock | null {
  const raw = readLocalJson<ActiveStudyClock | null>(ACTIVE_STUDY_CLOCK_KEY, null);
  if (!raw || (raw.mode !== 'timer' && raw.mode !== 'countdown')) return null;
  if (!raw.userId || !Number.isFinite(raw.startedAt) || raw.startedAt <= 0) return null;
  if (!isStudyClockRange(raw.composer)) return null;
  return raw;
}

function writeActiveStudyClock(clock: ActiveStudyClock) {
  writeLocalJson(ACTIVE_STUDY_CLOCK_KEY, clock);
}

function clearActiveStudyClock() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_STUDY_CLOCK_KEY);
}

function elapsedSecondsSince(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function playTimeAttackChime() {
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1174].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02 + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28 + index * 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.18);
      osc.stop(now + 0.32 + index * 0.18);
    });
    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // 音が出せない端末では画面の通知だけを出す
  }
}

const LEARNING_TRAIL_STAGES = [
  { key: 'apprentice', hours: 50 },
  { key: 'nobles', hours: 100 },
  { key: 'grandee', hours: 300 },
  { key: 'prince', hours: 500 },
  { key: 'archduke', hours: 1000 },
  { key: 'monarch', hours: 2000 },
  { key: 'hero', hours: 3000 },
  { key: 'demigod', hours: 5000 },
  { key: 'deity', hours: 7500 },
  { key: 'god', hours: 10000 },
  { key: 'ruler', hours: 12500 },
  { key: 'creator', hours: 15000 },
] as const;

const LEARNING_TRAIL_RARITIES = ['normal', 'silver', 'gold'] as const;

type LearningTrailStageKey = (typeof LEARNING_TRAIL_STAGES)[number]['key'];
type LearningTrailRarity = (typeof LEARNING_TRAIL_RARITIES)[number];

type LearningTrailCard = {
  stageKey: LearningTrailStageKey;
  hours: number;
  rarity: LearningTrailRarity;
};

const learningTrailGrantLocks = new Set<string>();
const learningTrailJobs = new Map<string, Promise<{ cards: LearningTrailCard[]; fresh: LearningTrailCard[] }>>();
const learningTrailPendingCelebrate = new Map<string, LearningTrailCard[]>();
const learningTrailCelebrated = new Set<string>();

function learningTrailRarity(value: unknown): LearningTrailRarity | null {
  return LEARNING_TRAIL_RARITIES.find((item) => item === value) ?? null;
}

function learningTrailTotalMinutes(logs: StudyLog[], cramMinutesByWeek: Record<string, number>): number {
  const study = logs.reduce((sum, log) => sum + (Number(log.time_spent_minutes) || 0), 0);
  const cram = Object.values(cramMinutesByWeek).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return Math.max(0, Math.round(study + cram));
}

function rollLearningTrailRarity(): LearningTrailRarity {
  const index = Math.floor(Math.random() * LEARNING_TRAIL_RARITIES.length);
  return LEARNING_TRAIL_RARITIES[index];
}

async function syncLearningTrail(
  supabase: { from: (table: string) => any },
  studentId: string,
  totalMinutes: number,
): Promise<{ cards: LearningTrailCard[]; fresh: LearningTrailCard[] }> {
  const jobKey = `${studentId}:${totalMinutes}`;
  const pending = learningTrailJobs.get(jobKey);
  if (pending) return pending;
  const job = (async () => {
    const loaded = await supabase.from('student_achievements').select('stage_key, rarity_type').eq('student_id', studentId);
    if (loaded.error) return { cards: [], fresh: [] };
    const owned = new Map<string, LearningTrailRarity>();
    (loaded.data || []).forEach((row: { stage_key?: unknown; rarity_type?: unknown }) => {
      const rarity = learningTrailRarity(row?.rarity_type);
      const stageKey = typeof row?.stage_key === 'string' ? row.stage_key : '';
      if (rarity && stageKey) owned.set(stageKey, rarity);
    });
    const before = new Set(owned.keys());
    for (const stage of LEARNING_TRAIL_STAGES) {
      if (totalMinutes < stage.hours * 60 || owned.has(stage.key)) continue;
      const lock = `${studentId}:${stage.key}`;
      if (learningTrailGrantLocks.has(lock)) continue;
      learningTrailGrantLocks.add(lock);
      const rarity = rollLearningTrailRarity();
      const inserted = await supabase.from('student_achievements').insert([{
        student_id: studentId,
        stage_key: stage.key,
        rarity_type: rarity,
      }]);
      if (inserted.error && inserted.error.code !== '23505') learningTrailGrantLocks.delete(lock);
    }
    const again = await supabase.from('student_achievements').select('stage_key, rarity_type').eq('student_id', studentId);
    const rows = again.error ? [] : (again.data || []);
    const cards = LEARNING_TRAIL_STAGES.flatMap((stage) => {
      const row = rows.find((item: { stage_key?: unknown }) => item?.stage_key === stage.key);
      const rarity = learningTrailRarity(row?.rarity_type);
      return rarity ? [{ stageKey: stage.key, hours: stage.hours, rarity }] : [];
    });
    const fresh = cards.filter((card) => !before.has(card.stageKey));
    if (fresh.length > 0) {
      const queued = learningTrailPendingCelebrate.get(studentId) || [];
      const merged = [...queued];
      fresh.forEach((card) => {
        if (!merged.some((item) => item.stageKey === card.stageKey)) merged.push(card);
      });
      learningTrailPendingCelebrate.set(studentId, merged);
    }
    return { cards, fresh };
  })().finally(() => {
    learningTrailJobs.delete(jobKey);
  });
  learningTrailJobs.set(jobKey, job);
  return job;
}

type ScreenWakeLockSentinel = { release: () => Promise<void>; addEventListener?: (type: string, listener: () => void) => void };

function requestScreenWakeLock(): Promise<ScreenWakeLockSentinel | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<ScreenWakeLockSentinel> } };
    if (!nav.wakeLock) return Promise.resolve(null);
    return nav.wakeLock.request('screen').catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

const LOG_SLOT_STORAGE_KEY = 'juku_log_schedule_slots';
const DAY_VIEW_HOURS = Array.from({ length: 19 }, (_, index) => index + 6);

interface StudySlotLink {
  date: string;
  startHour: number;
  endHour: number;
  startMinute?: number;
  endMinute?: number;
}

interface StudyClockRange {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

function clockMinutes(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

function studyRangeFromSlot(link: Pick<StudySlotLink, 'startHour' | 'endHour' | 'startMinute' | 'endMinute'>): StudyClockRange {
  return {
    startHour: link.startHour,
    startMinute: link.startMinute ?? 0,
    endHour: link.endHour,
    endMinute: link.endMinute ?? 0,
  };
}

function studyDurationMinutes(range: StudyClockRange): number {
  return Math.max(0, clockMinutes(range.endHour, range.endMinute) - clockMinutes(range.startHour, range.startMinute));
}

function clampStudyRange(range: StudyClockRange): StudyClockRange {
  const minStart = 6 * 60;
  const maxEnd = 25 * 60;
  let start = Math.round(clockMinutes(range.startHour, range.startMinute) / 5) * 5;
  let end = Math.round(clockMinutes(range.endHour, range.endMinute) / 5) * 5;
  start = Math.min(Math.max(start, minStart), maxEnd - 5);
  if (end < start + 5) end = start + 5;
  if (end > maxEnd) {
    end = maxEnd;
    if (start > end - 5) start = end - 5;
  }
  return {
    startHour: Math.floor(start / 60),
    startMinute: start % 60,
    endHour: Math.floor(end / 60),
    endMinute: end % 60,
  };
}

const STUDY_CLOCK_OPTIONS: { hour: number; minute: number; label: string }[] = [];
for (let hour = 6; hour <= 25; hour += 1) {
  const minutes = hour === 25 ? [0] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  minutes.forEach((minute) => {
    STUDY_CLOCK_OPTIONS.push({
      hour,
      minute,
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    });
  });
}

type HourSlice = {
  top: number;
  height: number;
  continuesUp: boolean;
  continuesDown: boolean;
  isStart: boolean;
};

function sliceInHour(hour: number, range: StudyClockRange): HourSlice | null {
  const start = clockMinutes(range.startHour, range.startMinute);
  const end = clockMinutes(range.endHour, range.endMinute);
  if (end <= start) return null;
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const overlapStart = Math.max(start, hourStart);
  const overlapEnd = Math.min(end, hourEnd);
  if (overlapEnd <= overlapStart) return null;
  return {
    top: ((overlapStart - hourStart) / 60) * 100,
    height: ((overlapEnd - overlapStart) / 60) * 100,
    continuesUp: start < hourStart,
    continuesDown: end > hourEnd,
    isStart: overlapStart === start,
  };
}

const JST_TIME_ZONE = 'Asia/Tokyo';

function todayDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function jstClock(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  let hour = read('hour');
  const minute = read('minute');
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  return { hour, minute: Number.isFinite(minute) ? minute : 0 };
}

type LogSummaryPeriod = 'today' | 'week' | 'month';

const LOG_SUMMARY_PERIODS: { id: LogSummaryPeriod; label: string }[] = [
  { id: 'today', label: '本日の集計' },
  { id: 'week', label: '今週の集計' },
  { id: 'month', label: '今月の集計' },
];

const MATERIAL_BAR_COLORS = ['#0284c7', '#ea580c', '#16a34a', '#9333ea', '#e11d48', '#ca8a04', '#0f766e', '#4f46e5', '#db2777', '#64748b'];

function studyLogInPeriod(
  log: StudyLog,
  period: LogSummaryPeriod,
  now = new Date(),
  slots: Record<string, StudySlotLink> = {},
): boolean {
  const placed = studyPlacement(log, slots);
  if (!placed?.date) return false;
  const today = todayDateKey(now);
  const weekStart = weekStartKey(today);
  const weekEnd = shiftDateKey(weekStart, 6);
  if (placed.date > weekEnd) return false;
  if (period === 'today') return placed.date === today;
  if (period === 'week') return placed.date >= weekStart && placed.date <= weekEnd;
  return placed.date.slice(0, 7) === today.slice(0, 7);
}

function formatStudyDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours <= 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

function formatHourAndMinute(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}時間${safe % 60}分`;
}

const STUDY_RANK_BADGES = [
  { id: 'bronze', label: 'ブロンズ', src: '/ranks/bronze.png' },
  { id: 'silver', label: 'シルバー', src: '/ranks/silver.png' },
  { id: 'gold', label: 'ゴールド', src: '/ranks/gold.png' },
  { id: 'platinum', label: 'プラチナ', src: '/ranks/platinum.png' },
  { id: 'diamond', label: 'ダイヤモンド', src: '/ranks/diamond.png' },
  { id: 'master', label: 'マスター', src: '/ranks/master.png' },
  { id: 'king', label: 'キング', src: '/ranks/king.png' },
  { id: 'god', label: 'ゴッド', src: '/ranks/god.png' },
  { id: 'legend', label: 'レジェンド', src: '/ranks/legend.png' },
] as const;

const EMPTY_STUDY_RANK = { id: 'none', label: 'ランクなし', src: '' } as const;

type StudyRank = (typeof STUDY_RANK_BADGES)[number] | typeof EMPTY_STUDY_RANK;

function rankFromMinutes(minutes: number): StudyRank {
  if (!(minutes > 0)) return EMPTY_STUDY_RANK;
  const hours = minutes / 60;
  if (hours < 15) return STUDY_RANK_BADGES[0];
  if (hours < 25) return STUDY_RANK_BADGES[1];
  if (hours <= 35) return STUDY_RANK_BADGES[2];
  if (hours <= 45) return STUDY_RANK_BADGES[3];
  if (hours <= 55) return STUDY_RANK_BADGES[4];
  if (hours <= 65) return STUDY_RANK_BADGES[5];
  if (hours <= 80) return STUDY_RANK_BADGES[6];
  if (hours <= 90) return STUDY_RANK_BADGES[7];
  return STUDY_RANK_BADGES[8];
}

function formatLogStamp(iso?: string): string {
  const date = new Date(iso || 0);
  if (Number.isNaN(date.getTime())) return '';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hour}:${minute}`;
}

function formatMeetingClock(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function minutesFromStoredClock(value: unknown): number | null {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function studyLogClockFields(range: StudyClockRange): { start_time: string; end_time: string } {
  return {
    start_time: `${formatMeetingClock(range.startHour, range.startMinute)}:00`,
    end_time: `${formatMeetingClock(range.endHour, range.endMinute)}:00`,
  };
}

function studyLogOverlapMessage(start: number, end: number): string {
  const label = (total: number) => formatMeetingClock(Math.floor(total / 60), total % 60);
  return `⚠️ すでにこの時間帯には学習記録が登録されています（${label(start)}〜${label(end)}）。時間を変更してください。`;
}

function boundsForStoredStudyLog(
  row: { id?: unknown; start_time?: unknown; end_time?: unknown },
  dateKey: string,
): { start: number; end: number } | null {
  const start = minutesFromStoredClock(row.start_time);
  const end = minutesFromStoredClock(row.end_time);
  if (start != null && end != null && end > start) return { start, end };
  const slot = readLogSlots()[String(row.id ?? '')];
  if (!slot?.date || slot.date.slice(0, 10) !== dateKey) return null;
  const slotStart = clockMinutes(slot.startHour, slot.startMinute || 0);
  const slotEnd = clockMinutes(slot.endHour, slot.endMinute || 0);
  if (slotEnd <= slotStart) return null;
  return { start: slotStart, end: slotEnd };
}

async function findOverlappingStudyLog(
  supabase: { from: (table: string) => any },
  studentId: string,
  dateKey: string,
  range: StudyClockRange,
  ignoreLogId: string | undefined,
  studentLogIds: Set<string>,
): Promise<{ start: number; end: number } | null> {
  const newStart = clockMinutes(range.startHour, range.startMinute);
  const newEnd = clockMinutes(range.endHour, range.endMinute);
  if (!(newEnd > newStart)) return null;
  const { data, error } = await supabase
    .from('study_logs')
    .select('id, start_time, end_time')
    .eq('student_id', studentId)
    .eq('study_date', dateKey);
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of data || []) {
    const id = String(row?.id ?? '');
    if (!id || id === ignoreLogId) continue;
    seen.add(id);
    const bounds = boundsForStoredStudyLog(row, dateKey);
    if (bounds && newStart < bounds.end && newEnd > bounds.start) return bounds;
  }
  const slots = readLogSlots();
  for (const [id, slot] of Object.entries(slots)) {
    if (!studentLogIds.has(id) || seen.has(id) || id === ignoreLogId) continue;
    if (!slot?.date || slot.date.slice(0, 10) !== dateKey) continue;
    const existStart = clockMinutes(slot.startHour, slot.startMinute || 0);
    const existEnd = clockMinutes(slot.endHour, slot.endMinute || 0);
    if (existEnd <= existStart) continue;
    if (newStart < existEnd && newEnd > existStart) return { start: existStart, end: existEnd };
  }
  return null;
}

function formatMeetingWhen(log: StudyLog, slot?: StudySlotLink): string {
  const weekMarks = '日月火水木金土';
  const placed = storedClockPlacement(log);
  if (placed) {
    const [year, month, day] = placed.date.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    const week = weekMarks[date.getDay()] || '';
    return `${String(month || 1).padStart(2, '0')}/${String(day || 1).padStart(2, '0')}(${week}) ${formatMeetingClock(placed.startHour, placed.startMinute)}〜${formatMeetingClock(placed.endHour, placed.endMinute)}`;
  }
  if (slot?.date) {
    const [year, month, day] = slot.date.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    const week = weekMarks[date.getDay()] || '';
    return `${String(month || 1).padStart(2, '0')}/${String(day || 1).padStart(2, '0')}(${week}) ${formatMeetingClock(slot.startHour, slot.startMinute || 0)}〜${formatMeetingClock(slot.endHour, slot.endMinute || 0)}`;
  }
  const start = new Date(log.created_at || 0);
  if (Number.isNaN(start.getTime())) return '日時未記録';
  const end = new Date(start.getTime() + Math.max(0, log.time_spent_minutes || 0) * 60 * 1000);
  const week = weekMarks[start.getDay()] || '';
  return `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}(${week}) ${formatMeetingClock(start.getHours(), start.getMinutes())}〜${formatMeetingClock(end.getHours(), end.getMinutes())}`;
}

function meetingMaterialInfo(materialId: string, userId: string, catalog: Material[]): { title: string; subject: SubjectType } {
  const master = catalog.find((item) => item.id === materialId);
  const masterSubject = subjectFromInput(master?.subject);
  if (master?.title && masterSubject) return { title: master.title, subject: masterSubject };
  const mine = readMyMaterials(userId).find((item) => item.id === materialId);
  if (mine) return { title: mine.title, subject: mine.subject };
  if (master?.title) return { title: master.title, subject: 'その他' };
  return { title: '学習', subject: 'その他' };
}

function meetingMaterialTitle(materialId: string, userId: string, catalog: Material[]): string {
  const info = meetingMaterialInfo(materialId, userId, catalog);
  return info.title === '学習' ? '教材名未登録' : info.title;
}

function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function civilWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay();
}

function studyPlacement(log: StudyLog, slots: Record<string, StudySlotLink>): (StudyClockRange & { date: string }) | null {
  const link = slots[log.id];
  if (link?.date) return { date: link.date.slice(0, 10), ...studyRangeFromSlot(link) };
  const stamp = new Date(log.created_at || 0);
  if (Number.isNaN(stamp.getTime())) return null;
  const dateKey = todayDateKey(stamp);
  const stampHour = jstClock(stamp).hour;
  if (stampHour === 0) return { date: shiftDateKey(dateKey, -1), startHour: 24, startMinute: 0, endHour: 25, endMinute: 0 };
  return { date: dateKey, startHour: stampHour, startMinute: 0, endHour: stampHour + 1, endMinute: 0 };
}

function storedClockPlacement(log: StudyLog): (StudyClockRange & { date: string }) | null {
  const dateKey = String(log.created_at || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const start = minutesFromStoredClock(log.start_time);
  const end = minutesFromStoredClock(log.end_time);
  if (start == null || end == null || end <= start) return null;
  return {
    date: dateKey,
    startHour: Math.floor(start / 60),
    startMinute: start % 60,
    endHour: Math.floor(end / 60),
    endMinute: end % 60,
  };
}

function slicesOverlap(left: HourSlice, right: HourSlice): boolean {
  const leftEnd = left.top + left.height;
  const rightEnd = right.top + right.height;
  return left.top < rightEnd - 0.05 && right.top < leftEnd - 0.05;
}

function laneBoxes(slices: HourSlice[]): { lane: number; laneCount: number }[] {
  const order = slices
    .map((slice, index) => ({ index, start: slice.top, end: slice.top + slice.height }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const lanes = slices.map(() => 0);
  order.forEach((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.start + 0.05);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(entry.end);
    } else {
      laneEnds[lane] = entry.end;
    }
    lanes[entry.index] = lane;
  });
  const laneCount = Math.max(1, laneEnds.length);
  return lanes.map((lane) => ({ lane, laneCount }));
}

function buildStudyStacks(
  periodLogs: StudyLog[],
  describe: (log: StudyLog) => { title: string; subject: SubjectType },
) {
  const subjectMap = new Map<SubjectType, Map<string, { id: string; title: string; minutes: number }>>();
  periodLogs.forEach((log) => {
    const info = describe(log);
    const key = log.material_id || info.title;
    const bucket = subjectMap.get(info.subject) || new Map();
    const current = bucket.get(key) || { id: key, title: info.title, minutes: 0 };
    current.minutes += log.time_spent_minutes || 0;
    bucket.set(key, current);
    subjectMap.set(info.subject, bucket);
  });
  const subjects = SUBJECT_NAMES.flatMap((subject) => {
    const bucket = subjectMap.get(subject);
    if (!bucket) return [];
    const items = Array.from(bucket.values()).filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
    const minutes = items.reduce((sum, item) => sum + item.minutes, 0);
    if (minutes <= 0) return [];
    const color = subjectSetting(subject).color;
    return [{
      subject,
      minutes,
      materials: items.map((item, index) => ({
        ...item,
        color: index === 0 ? color : MATERIAL_BAR_COLORS[(index - 1) % MATERIAL_BAR_COLORS.length],
      })),
    }];
  });
  const totalMinutes = periodLogs.reduce((sum, log) => sum + (log.time_spent_minutes || 0), 0);
  return { totalMinutes, subjects };
}

function weekdayIdFromDateKey(key: string): WeekdayId {
  return JS_DAY_TO_WEEKDAY[civilWeekday(key)] || 'mon';
}

function formatFocusDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const week = '日月火水木金土'[date.getDay()] || '';
  const prefix = key === todayDateKey() ? '今日 ' : '';
  return `${prefix}${month}/${day}（${week}）`;
}

function readLogSlots(): Record<string, StudySlotLink> {
  return readStoredJson<Record<string, StudySlotLink>>(
    LOG_SLOT_STORAGE_KEY,
    {},
    (value): value is Record<string, StudySlotLink> => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  );
}

function writeLogSlot(logId: string, link: StudySlotLink) {
  const all = readLogSlots();
  all[logId] = link;
  writeStudyRecordJson(LOG_SLOT_STORAGE_KEY, all);
}

function removeLogSlot(logId: string) {
  const all = readLogSlots();
  delete all[logId];
  writeStudyRecordJson(LOG_SLOT_STORAGE_KEY, all);
}

const HINA_BASES: { id: StaffScheduleTemplateId; label: string }[] = [
  { id: 'plain', label: 'プレーン' },
  { id: 'high_school', label: '高校のみ' },
  { id: 'high_school_club', label: '高校＋部活' },
];
const CATEGORY_CYCLE: (ScheduleCategoryId | null)[] = [null, 'school', 'club', 'activity', 'cram_school', 'other'];

interface WeekPlanRecord {
  templateId?: string;
  templateName: string;
  slots: ScheduleSlot[];
  dateSnapshots?: Record<string, ScheduleSlot[]>;
  is_customized?: boolean;
}

function weekStartKey(dateKey: string): string {
  const weekday = civilWeekday(dateKey);
  const diff = weekday === 0 ? 6 : weekday - 1;
  return shiftDateKey(dateKey, -diff);
}

function formatMonthDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const week = '日月火水木金土'[date.getDay()] || '';
  return `${month}月${day}日(${week})`;
}

function formatWeekRange(weekStart: string): string {
  return `${formatMonthDay(weekStart)}〜${formatMonthDay(shiftDateKey(weekStart, 6))}`;
}

function upcomingWeekStarts(months = 3): string[] {
  const weeks: string[] = [];
  let cursor = weekStartKey(todayDateKey());
  const limit = new Date();
  limit.setMonth(limit.getMonth() + months);
  const end = todayDateKey(limit);
  while (cursor <= end) {
    weeks.push(cursor);
    cursor = shiftDateKey(cursor, 7);
  }
  return weeks;
}

const SEEDED_JUKU_SLOT_IDS = new Set(['juku_mon', 'juku_tue', 'juku_wed', 'juku_thu', 'juku_fri', 'juku_sat', 'juku_sun']);

function withoutSeededScheduleSlots(slots: ScheduleSlot[] | undefined): ScheduleSlot[] {
  return (slots || []).filter((slot) => !SEEDED_JUKU_SLOT_IDS.has(String(slot.id)));
}

function withScheduleCategory(slot: ScheduleSlot): ScheduleSlot | null {
  const raw = slot as ScheduleSlot & { type?: unknown };
  const category = scheduleCategoryFromInput(raw.category) || scheduleCategoryFromInput(raw.type);
  if (!category) return null;
  const { type: _droppedType, ...rest } = raw;
  return { ...rest, category };
}

function normalizeScheduleSlots(slots: ScheduleSlot[] | undefined): ScheduleSlot[] {
  return withoutSeededScheduleSlots(slots).flatMap((slot) => {
    const next = withScheduleCategory(slot);
    return next ? [next] : [];
  });
}

function sanitizeWeekPlan(plan: WeekPlanRecord): WeekPlanRecord | null {
  const slots = normalizeScheduleSlots(plan.slots);
  const snapshots = plan.dateSnapshots
    ? Object.fromEntries(Object.entries(plan.dateSnapshots).map(([dateKey, list]) => [dateKey, normalizeScheduleSlots(list)]))
    : undefined;
  const snapshotSlots = snapshots ? Object.values(snapshots) : [];
  if (slots.length === 0 && snapshotSlots.every((list) => list.length === 0)) return null;
  return { ...plan, slots, dateSnapshots: snapshots };
}

function coerceWeekPlan(value: unknown): WeekPlanRecord | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<WeekPlanRecord>;
  if (!Array.isArray(plan.slots)) return null;
  return sanitizeWeekPlan({
    templateId: typeof plan.templateId === 'string' ? plan.templateId : undefined,
    templateName: typeof plan.templateName === 'string' ? plan.templateName : '',
    slots: plan.slots,
    dateSnapshots: plan.dateSnapshots && typeof plan.dateSnapshots === 'object' ? plan.dateSnapshots : undefined,
    is_customized: plan.is_customized === true,
  });
}

function alertScheduleError(error: { message?: string } | null | undefined) {
  console.error(error);
  alert('スケジュール通信エラー: ' + (error?.message || ''));
}

function unwrapScheduleJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseScheduleSlots(value: unknown): ScheduleSlot[] {
  const source = unwrapScheduleJson(value);
  if (!Array.isArray(source)) return [];
  return source.flatMap((slot) => {
    if (!slot || typeof slot !== 'object') return [];
    const row = slot as Partial<ScheduleSlot> & { type?: unknown };
    if (row.day !== 'mon' && row.day !== 'tue' && row.day !== 'wed' && row.day !== 'thu' && row.day !== 'fri' && row.day !== 'sat' && row.day !== 'sun') return [];
    if (typeof row.startHour !== 'number' || typeof row.endHour !== 'number') return [];
    const category = scheduleCategoryFromInput(row.category) || scheduleCategoryFromInput(row.type);
    if (!category) return [];
    return [{
      id: typeof row.id === 'string' && row.id ? row.id : `slot_${row.day}_${row.startHour}`,
      day: row.day,
      startHour: row.startHour,
      endHour: row.endHour,
      startMinute: typeof row.startMinute === 'number' ? row.startMinute : 0,
      endMinute: typeof row.endMinute === 'number' ? row.endMinute : 0,
      category,
      title: typeof row.title === 'string' ? row.title : '',
    }];
  });
}

function postgrestQuotedList(values: string[]): string {
  return `(${values.map((value) => `"${value.replace(/"/g, '')}"`).join(',')})`;
}

const EMPTY_STAFF_TEMPLATES: Record<StaffScheduleTemplateId, ScheduleSlot[]> = {
  plain: [],
  high_school: [],
  high_school_club: [],
};

const GLOBAL_TEMPLATE_NAME: Record<string, StaffScheduleTemplateId> = {
  plain: 'plain',
  high_school: 'high_school',
  high_school_club: 'high_school_club',
  'プレーン(何も設定されていない)': 'plain',
  '「高校」のみのパターン': 'high_school',
  '「高校」・「部活」パターン': 'high_school_club',
  'プレーン': 'plain',
  '高校のみ': 'high_school',
  '高校＋部活': 'high_school_club',
};

async function fetchGlobalScheduleTemplates(
  supabase: { from: (table: string) => any },
): Promise<Record<StaffScheduleTemplateId, ScheduleSlot[]> | null> {
  const result = await supabase.from('global_schedule_templates').select('template_name, description, schedule_data');
  if (result.error) {
    alertScheduleError(result.error);
    return null;
  }
  const next: Record<StaffScheduleTemplateId, ScheduleSlot[]> = { plain: [], high_school: [], high_school_club: [] };
  (result.data || []).forEach((row: { template_name?: unknown; description?: unknown; schedule_data?: unknown }) => {
    const key = GLOBAL_TEMPLATE_NAME[String(row?.template_name || '')] || GLOBAL_TEMPLATE_NAME[String(row?.description || '')];
    if (!key) return;
    next[key] = parseScheduleSlots(row.schedule_data);
  });
  return next;
}

async function saveGlobalScheduleTemplate(
  supabase: { from: (table: string) => any },
  templateId: StaffScheduleTemplateId,
  slots: ScheduleSlot[],
): Promise<boolean> {
  const description = STAFF_SCHEDULE_TEMPLATES.find((item) => item.id === templateId)?.name || templateId;
  const existing = await supabase.from('global_schedule_templates').select('template_name').eq('template_name', templateId).limit(1);
  if (existing.error) {
    alertScheduleError(existing.error);
    return false;
  }
  const payload = { description, schedule_data: slots };
  const result = existing.data && existing.data.length > 0
    ? await supabase.from('global_schedule_templates').update(payload).eq('template_name', templateId)
    : await supabase.from('global_schedule_templates').insert([{ template_name: templateId, ...payload }]);
  if (result.error) {
    alertScheduleError(result.error);
    return false;
  }
  return true;
}

function scheduleStudentKey(studentId: unknown): string {
  return String(studentId ?? '').trim();
}

function studentTemplateFromRow(row: { template_name?: unknown; schedule_data?: unknown }): MyScheduleFolderItem | null {
  const name = String(row?.template_name || '').trim();
  if (!name) return null;
  const raw = unwrapScheduleJson(row.schedule_data);
  if (Array.isArray(raw)) {
    return { id: `my_${name}`, name, slots: parseScheduleSlots(raw) };
  }
  if (!raw || typeof raw !== 'object') return { id: `my_${name}`, name, slots: [] };
  const record = raw as { id?: unknown; hinaSlot?: unknown; slots?: unknown; templates?: unknown };
  if (Array.isArray(record.templates)) return null;
  const hinaSlot = typeof record.hinaSlot === 'number' ? record.hinaSlot : undefined;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : `my_${name}`,
    name,
    hinaSlot,
    slots: parseScheduleSlots(record.slots),
  };
}

function studentTemplatesFromRow(row: { template_name?: unknown; schedule_data?: unknown }): MyScheduleFolderItem[] {
  const raw = unwrapScheduleJson(row.schedule_data);
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { templates?: unknown }).templates)) {
    return (raw as { templates: unknown[] }).templates.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as { id?: unknown; name?: unknown; hinaSlot?: unknown; slots?: unknown };
      const name = String(record.name || '').trim();
      if (!name) return [];
      return [{
        id: typeof record.id === 'string' && record.id ? record.id : `my_${name}`,
        name,
        hinaSlot: typeof record.hinaSlot === 'number' ? record.hinaSlot : undefined,
        slots: parseScheduleSlots(record.slots),
      }];
    });
  }
  const single = studentTemplateFromRow(row);
  return single ? [single] : [];
}

async function fetchStudentScheduleTemplates(
  supabase: { from: (table: string) => any },
  studentId: string,
): Promise<MyScheduleFolderItem[] | null> {
  const studentKey = scheduleStudentKey(studentId);
  if (!studentKey) return [];
  const result = await supabase.from('student_schedule_templates').select('student_id, template_name, schedule_data').eq('student_id', studentKey);
  if (result.error) {
    alertScheduleError(result.error);
    return null;
  }
  return (result.data || []).flatMap((row: { template_name?: unknown; schedule_data?: unknown }) => studentTemplatesFromRow(row));
}

async function saveStudentScheduleTemplates(
  supabase: { from: (table: string) => any },
  studentId: string,
  items: MyScheduleFolderItem[],
): Promise<void> {
  const studentKey = scheduleStudentKey(studentId);
  if (!studentKey) {
    alertScheduleError({ message: '生徒IDが空です' });
    return;
  }
  const listed = items.flatMap((item) => {
    const templateName = String(item.name || '').trim();
    if (!templateName) return [];
    return [{ ...item, name: templateName }];
  });
  const existing = await supabase.from('student_schedule_templates').select('template_name').eq('student_id', studentKey);
  if (existing.error) {
    alertScheduleError(existing.error);
    return;
  }
  const existingNames = new Set(
    (existing.data || []).map((row: { template_name?: unknown }) => String(row?.template_name || '').trim()).filter(Boolean),
  );
  const pending = listed.filter((item) => !existingNames.has(item.name));
  const current = listed.filter((item) => existingNames.has(item.name));
  for (const item of [...pending, ...current]) {
    const scheduleData = { id: item.id, hinaSlot: item.hinaSlot ?? null, slots: item.slots };
    const saved = existingNames.has(item.name)
      ? await supabase.from('student_schedule_templates').update({ schedule_data: scheduleData }).eq('student_id', studentKey).eq('template_name', item.name)
      : await supabase.from('student_schedule_templates').insert([{ student_id: studentKey, template_name: item.name, schedule_data: scheduleData }]);
    if (saved.error) {
      alertScheduleError(saved.error);
      return;
    }
  }
  const names = listed.map((item) => item.name);
  const removal = names.length === 0
    ? await supabase.from('student_schedule_templates').delete().eq('student_id', studentKey)
    : await supabase.from('student_schedule_templates').delete().eq('student_id', studentKey).not('template_name', 'in', postgrestQuotedList(names));
  if (removal.error) alertScheduleError(removal.error);
}

async function fetchWeeklySchedules(
  supabase: { from: (table: string) => any },
  studentId: string,
): Promise<{ plans: Record<string, WeekPlanRecord>; cramMinutes: Record<string, number> } | null> {
  const studentKey = scheduleStudentKey(studentId);
  if (!studentKey) return { plans: {}, cramMinutes: {} };
  const result = await supabase.from('weekly_schedules').select('student_id, week_start_date, schedule_data, cram_school_minutes').eq('student_id', studentKey);
  if (result.error) {
    alertScheduleError(result.error);
    return null;
  }
  const plans: Record<string, WeekPlanRecord> = {};
  const cramMinutes: Record<string, number> = {};
  (result.data || []).forEach((row: { week_start_date?: unknown; schedule_data?: unknown; cram_school_minutes?: unknown }) => {
    const weekStart = String(row?.week_start_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return;
    const raw = unwrapScheduleJson(row.schedule_data);
    const plan = coerceWeekPlan(raw) || (Array.isArray(raw) ? coerceWeekPlan({ templateName: '', slots: raw }) : null);
    if (!plan) return;
    plans[weekStart] = plan;
    const saved = Number(row?.cram_school_minutes);
    if (Number.isFinite(saved)) cramMinutes[weekStart] = Math.max(0, saved);
  });
  return { plans, cramMinutes };
}

async function saveWeeklySchedules(
  supabase: { from: (table: string) => any },
  studentId: string,
  plans: Record<string, WeekPlanRecord>,
): Promise<boolean> {
  const studentKey = scheduleStudentKey(studentId);
  if (!studentKey) {
    alertScheduleError({ message: '生徒IDが空です' });
    return false;
  }
  for (const [weekStart, plan] of Object.entries(plans)) {
    const weekKey = String(weekStart || '').trim();
    const existing = await supabase.from('weekly_schedules').select('week_start_date').eq('student_id', studentKey).eq('week_start_date', weekKey).limit(1);
    if (existing.error) {
      alertScheduleError(existing.error);
      return false;
    }
    const cramSchoolMinutes = weekCramSchoolMinutes(plan, weekKey);
    const saved = existing.data && existing.data.length > 0
      ? await supabase.from('weekly_schedules').update({ schedule_data: plan, cram_school_minutes: cramSchoolMinutes }).eq('student_id', studentKey).eq('week_start_date', weekKey)
      : await supabase.from('weekly_schedules').insert([{ student_id: studentKey, week_start_date: weekKey, schedule_data: plan, cram_school_minutes: cramSchoolMinutes }]);
    if (saved.error) {
      alertScheduleError(saved.error);
      return false;
    }
  }
  const keys = Object.keys(plans).map((key) => String(key).trim()).filter(Boolean);
  const removal = keys.length === 0
    ? await supabase.from('weekly_schedules').delete().eq('student_id', studentKey)
    : await supabase.from('weekly_schedules').delete().eq('student_id', studentKey).not('week_start_date', 'in', postgrestQuotedList(keys));
  if (removal.error) {
    alertScheduleError(removal.error);
    return false;
  }
  return true;
}

function findMyHina(items: MyScheduleFolderItem[], slotNumber: number): MyScheduleFolderItem | undefined {
  return items.find((item) => item.hinaSlot === slotNumber)
    || items.find((item) => item.name === `Myひな型${slotNumber}` || item.name === `Myスケジュール${slotNumber}`);
}

function hinaDisplayName(item: MyScheduleFolderItem | undefined, slotNumber: number): string {
  if (!item) return `Myひな型${slotNumber}`;
  const trimmed = item.name.trim();
  if (!trimmed || trimmed === `Myスケジュール${slotNumber}`) return `Myひな型${slotNumber}`;
  return trimmed;
}

function hinaMatchNames(item: MyScheduleFolderItem | undefined, slotNumber: number): string[] {
  const names = [`Myひな型${slotNumber}`, `Myスケジュール${slotNumber}`];
  if (item?.name.trim()) names.push(item.name.trim());
  const display = hinaDisplayName(item, slotNumber);
  if (!names.includes(display)) names.push(display);
  return names;
}

function planSlotsForDate(plan: WeekPlanRecord | undefined, dateKey: string): ScheduleSlot[] {
  if (!plan) return [];
  const frozen = dateKey < todayDateKey() ? plan.dateSnapshots?.[dateKey] : undefined;
  return frozen || plan.slots;
}

function slotRangeMinutes(slot: Pick<ScheduleSlot, 'startHour' | 'endHour' | 'startMinute' | 'endMinute'>): { start: number; end: number } {
  const start = slot.startHour * 60 + (slot.startMinute || 0);
  const end = slot.endHour * 60 + (slot.endMinute || 0);
  return { start, end };
}

function slotWithRange(slot: ScheduleSlot, start: number, end: number, id?: string): ScheduleSlot {
  return {
    ...slot,
    id: id || slot.id,
    startHour: Math.floor(start / 60),
    startMinute: start % 60,
    endHour: Math.floor(end / 60),
    endMinute: end % 60,
  };
}

function formatScheduleRange(slot: Pick<ScheduleSlot, 'startHour' | 'endHour' | 'startMinute' | 'endMinute'>): string {
  return `${formatMeetingClock(slot.startHour, slot.startMinute || 0)}〜${formatMeetingClock(slot.endHour, slot.endMinute || 0)}`;
}

function scheduleSlotSignature(slots: ScheduleSlot[]): string {
  return WEEKDAYS.map((day) => (
    slots
      .filter((slot) => slot.day === day.id)
      .map((slot) => {
        const range = slotRangeMinutes(slot);
        return `${range.start}-${range.end}:${slot.category}`;
      })
      .sort()
      .join(',')
  )).join(';');
}

function scheduleSlotsMatch(left: ScheduleSlot[], right: ScheduleSlot[]): boolean {
  return scheduleSlotSignature(left) === scheduleSlotSignature(right);
}

function categoryMinutesOnDay(slots: ScheduleSlot[], day: WeekdayId, category: ScheduleCategoryId): number {
  return slots
    .filter((slot) => slot.day === day && slot.category === category)
    .reduce((total, slot) => {
      const range = slotRangeMinutes(slot);
      if (range.end <= range.start) return total;
      return total + (range.end - range.start);
    }, 0);
}

function rankTotalMinutes(studyMinutes: number, jukuMinutes: number): number {
  return Math.max(0, studyMinutes) + Math.max(0, jukuMinutes);
}

function weekJukuMinutes(plan: WeekPlanRecord | undefined, weekStart: string): number {
  let total = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = shiftDateKey(weekStart, offset);
    const daySlots = planSlotsForDate(plan, dateKey);
    total += categoryMinutesOnDay(daySlots, weekdayIdFromDateKey(dateKey), 'cram_school');
  }
  return total;
}

function cramMinutesOnDate(plan: WeekPlanRecord | undefined, dateKey: string): number {
  if (!plan) return 0;
  const day = weekdayIdFromDateKey(dateKey);
  return planSlotsForDate(plan, dateKey).reduce((total, slot) => {
    if (slot.day !== day || scheduleCategoryFromInput(slot.category) !== 'cram_school') return total;
    const range = slotRangeMinutes(slot);
    if (range.end <= range.start) return total;
    return total + (range.end - range.start);
  }, 0);
}

function weekCramSchoolMinutes(plan: WeekPlanRecord | undefined, weekStart: string): number {
  let total = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    total += cramMinutesOnDate(plan, shiftDateKey(weekStart, offset));
  }
  return total;
}

function summaryPeriodBounds(period: LogSummaryPeriod, now = new Date()): { start: string; end: string } {
  const today = todayDateKey(now);
  if (period === 'today') return { start: today, end: today };
  const weekStart = weekStartKey(today);
  if (period === 'week') return { start: weekStart, end: shiftDateKey(weekStart, 6) };
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = today.slice(0, 7);
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

function resolvedWeekCramMinutes(weekStart: string, stored: number | undefined, plan: WeekPlanRecord | undefined): number {
  const computed = weekCramSchoolMinutes(plan, weekStart);
  const saved = Number(stored);
  if (!Number.isFinite(saved)) return computed;
  if (saved === 0 && computed > 0) return computed;
  return Math.max(0, saved);
}

function cramMinutesInSummaryPeriod(
  period: LogSummaryPeriod,
  storedByWeek: Record<string, number>,
  plans: Record<string, WeekPlanRecord>,
  now = new Date(),
): number {
  const range = summaryPeriodBounds(period, now);
  const weeks = new Set<string>();
  for (let date = range.start; date <= range.end; date = shiftDateKey(date, 1)) weeks.add(weekStartKey(date));
  let total = 0;
  weeks.forEach((weekStart) => {
    const weekEnd = shiftDateKey(weekStart, 6);
    const plan = plans[weekStart];
    if (weekStart >= range.start && weekEnd <= range.end) {
      total += resolvedWeekCramMinutes(weekStart, storedByWeek[weekStart], plan);
      return;
    }
    for (let date = weekStart < range.start ? range.start : weekStart; date <= range.end && date <= weekEnd; date = shiftDateKey(date, 1)) {
      total += cramMinutesOnDate(plan, date);
    }
  });
  return total;
}

function writeWeekFromTemplate(
  plan: WeekPlanRecord | undefined,
  weekStart: string,
  templateId: string,
  templateName: string,
  slots: ScheduleSlot[],
  preservePast: boolean,
): WeekPlanRecord {
  const today = todayDateKey();
  const weekEnd = shiftDateKey(weekStart, 6);
  const incoming = cloneScheduleSlots(slots);
  if (preservePast && plan && weekEnd < today) {
    return { ...plan, templateId: plan.templateId || templateId };
  }
  if (weekStart >= today || (!preservePast && !plan)) {
    return { templateId, templateName, slots: incoming, is_customized: false };
  }
  const snapshots: Record<string, ScheduleSlot[]> = { ...(plan?.dateSnapshots || {}) };
  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = shiftDateKey(weekStart, offset);
    if (dateKey < today) {
      if (!snapshots[dateKey]) snapshots[dateKey] = cloneScheduleSlots(plan?.slots || []);
    } else {
      delete snapshots[dateKey];
    }
  }
  return { templateId, templateName, slots: incoming, dateSnapshots: snapshots, is_customized: false };
}

function writeCustomizedWeek(
  plan: WeekPlanRecord | undefined,
  weekStart: string,
  templateId: string | undefined,
  templateName: string,
  slots: ScheduleSlot[],
): WeekPlanRecord {
  const today = todayDateKey();
  const weekEnd = shiftDateKey(weekStart, 6);
  const incoming = cloneScheduleSlots(slots);
  if (plan && weekEnd < today) return plan;
  const base: WeekPlanRecord = {
    templateId,
    templateName,
    slots: incoming,
    is_customized: true,
  };
  if (weekStart >= today || !plan) return base;
  const snapshots: Record<string, ScheduleSlot[]> = { ...(plan.dateSnapshots || {}) };
  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = shiftDateKey(weekStart, offset);
    if (dateKey < today) {
      if (!snapshots[dateKey]) snapshots[dateKey] = cloneScheduleSlots(plan.slots || []);
    } else {
      delete snapshots[dateKey];
    }
  }
  return { ...base, dateSnapshots: snapshots };
}

function categoryAtHour(slots: ScheduleSlot[], day: WeekdayId, hour: number): ScheduleCategoryId | null {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  let bestCategory: ScheduleCategoryId | null = null;
  let bestOverlap = 0;
  for (const slot of slots) {
    if (slot.day !== day) continue;
    const range = slotRangeMinutes(slot);
    const overlap = Math.min(range.end, hourEnd) - Math.max(range.start, hourStart);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestCategory = slot.category;
    }
  }
  return bestCategory;
}

function mergeTouchingSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  const grouped = new Map<WeekdayId, ScheduleSlot[]>();
  slots.forEach((slot) => {
    const list = grouped.get(slot.day) || [];
    list.push(slot);
    grouped.set(slot.day, list);
  });
  const merged: ScheduleSlot[] = [];
  grouped.forEach((list) => {
    const ordered = [...list].sort((a, b) => slotRangeMinutes(a).start - slotRangeMinutes(b).start);
    ordered.forEach((slot) => {
      const prev = merged[merged.length - 1];
      const prevRange = prev ? slotRangeMinutes(prev) : null;
      const range = slotRangeMinutes(slot);
      if (prev && prevRange && prev.day === slot.day && prev.category === slot.category && prevRange.end === range.start) {
        merged[merged.length - 1] = slotWithRange(prev, prevRange.start, range.end);
      } else {
        merged.push({ ...slot });
      }
    });
  });
  return merged;
}

function paintHourCategory(slots: ScheduleSlot[], day: WeekdayId, hour: number, category: ScheduleCategoryId | null): ScheduleSlot[] {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const kept: ScheduleSlot[] = [];
  slots.forEach((slot) => {
    if (slot.day !== day) {
      kept.push(slot);
      return;
    }
    const range = slotRangeMinutes(slot);
    if (range.end <= hourStart || range.start >= hourEnd) {
      kept.push(slot);
      return;
    }
    if (range.start < hourStart) kept.push(slotWithRange(slot, range.start, hourStart, `${slot.id}_a${hour}`));
    if (range.end > hourEnd) kept.push(slotWithRange(slot, hourEnd, range.end, `${slot.id}_b${hour}`));
  });
  if (category) {
    kept.push(slotWithRange({
      id: `slot_${day}_${hour}_${Date.now()}`,
      day,
      startHour: hour,
      startMinute: 0,
      endHour: hour,
      endMinute: 0,
      category,
      title: scheduleCategorySetting(category).label,
    }, hourStart, hourEnd));
  }
  return mergeTouchingSlots(kept);
}

function updateSlotClock(
  slots: ScheduleSlot[],
  slotId: string,
  next: { start: number; end: number; category: ScheduleCategoryId },
): ScheduleSlot[] {
  const target = slots.find((slot) => slot.id === slotId);
  if (!target || next.end <= next.start) return slots;
  const kept: ScheduleSlot[] = [];
  slots.forEach((slot) => {
    if (slot.id === slotId) return;
    if (slot.day !== target.day) {
      kept.push(slot);
      return;
    }
    const range = slotRangeMinutes(slot);
    if (range.end <= next.start || range.start >= next.end) {
      kept.push(slot);
      return;
    }
    if (range.start < next.start) kept.push(slotWithRange(slot, range.start, next.start, `${slot.id}_a`));
    if (range.end > next.end) kept.push(slotWithRange(slot, next.end, range.end, `${slot.id}_b`));
  });
  kept.push(slotWithRange({
    ...target,
    category: next.category,
    title: target.category === next.category ? target.title : scheduleCategorySetting(next.category).label,
  }, next.start, next.end));
  return mergeTouchingSlots(kept);
}

function categoryMeta(id: ScheduleCategoryId) {
  const setting = SCHEDULE_CATEGORY_MAP[id] ?? SCHEDULE_CATEGORY_MAP.other;
  return { label: setting.label, color: setting.color, bgColor: setting.bgColor };
}

function slotDisplayName(slot: ScheduleSlot): string {
  const trimmed = slot.title.trim();
  const setting = scheduleCategorySetting(slot.category);
  const titledCategory = scheduleCategoryFromInput(trimmed);
  if (!trimmed || titledCategory === (scheduleCategoryFromInput(slot.category) || 'other')) return setting.label;
  return trimmed;
}

function slotCaptionHour(slot: ScheduleSlot): number {
  const range = studyRangeFromSlot(slot);
  let fallback = range.startHour;
  for (let hour = Math.max(range.startHour, 6); hour <= Math.min(range.endHour, 24); hour += 1) {
    const slice = sliceInHour(hour, range);
    if (!slice) continue;
    fallback = hour;
    if (slice.height >= 50) return hour;
  }
  return fallback;
}

function planBandsForHour(slots: ScheduleSlot[], day: WeekdayId, hour: number): { key: string; slotId: string; color: string; bgColor: string; label?: string; slice: HourSlice }[] {
  return slots.flatMap((slot) => {
    if (slot.day !== day) return [];
    const slice = sliceInHour(hour, studyRangeFromSlot(slot));
    if (!slice) return [];
    const meta = categoryMeta(slot.category);
    const label = hour === slotCaptionHour(slot)
      ? `${formatScheduleRange(slot)} ${slotDisplayName(slot)}`
      : undefined;
    return [{ key: `${slot.id}-${hour}`, slotId: slot.id, color: meta.color, bgColor: meta.bgColor, label, slice }];
  });
}

function HourCategoryGrid({
  slots,
  onPaint,
  onCommit,
}: {
  slots: ScheduleSlot[];
  onPaint: (day: WeekdayId, hour: number, category: ScheduleCategoryId | null) => void;
  onCommit: (slots: ScheduleSlot[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState<StudyClockRange>({ startHour: 19, startMinute: 45, endHour: 21, endMinute: 50 });
  const [draftCategory, setDraftCategory] = useState<ScheduleCategoryId>('cram_school');
  const editing = slots.find((slot) => slot.id === editingId) || null;
  const dayOrigin = 6 * 60;
  const daySpan = 19 * 60;

  const openEditor = (slot: ScheduleSlot) => {
    setEditingId(slot.id);
    setDraftCategory(slot.category);
    setDraftRange(clampStudyRange(studyRangeFromSlot(slot)));
  };

  const saveEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const range = clampStudyRange(draftRange);
    onCommit(updateSlotClock(slots, editing.id, {
      start: clockMinutes(range.startHour, range.startMinute),
      end: clockMinutes(range.endHour, range.endMinute),
      category: draftCategory,
    }));
    setEditingId(null);
  };

  return (
    <>
      <div className="grid min-h-0 w-full flex-1 grid-cols-7 overflow-y-auto rounded-xl border border-slate-300 bg-white" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
        {WEEKDAYS.map((day) => (
          <div key={day.id} className={`flex h-full min-h-0 min-w-0 flex-col ${day.id === 'mon' ? '' : 'border-l border-slate-300'}`}>
            <div className="shrink-0 border-b border-slate-300 bg-slate-50 text-center text-[10px] font-black leading-[1.125rem] text-slate-700">
              {day.label}
            </div>
            <div className="relative min-h-0 flex-1 flex flex-col">
              {DAY_VIEW_HOURS.map((hour) => {
                const hourLabel = String(hour).padStart(2, '0');
                const paint = () => {
                  const current = categoryAtHour(slots, day.id, hour);
                  const nextIndex = (CATEGORY_CYCLE.indexOf(current) + 1) % CATEGORY_CYCLE.length;
                  onPaint(day.id, hour, CATEGORY_CYCLE[nextIndex] ?? null);
                };
                return (
                  <div
                    key={hour}
                    role="button"
                    tabIndex={0}
                    aria-label={`${day.label} ${hourLabel}`}
                    onClick={paint}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      paint();
                    }}
                    className="relative min-h-[0.875rem] flex-1 cursor-pointer border-b border-slate-300 bg-slate-50 active:ring-2 active:ring-inset active:ring-sky-500"
                  >
                    {slots.flatMap((slot) => {
                      if (slot.day !== day.id) return [];
                      const slice = sliceInHour(hour, studyRangeFromSlot(slot));
                      if (!slice) return [];
                      const meta = categoryMeta(slot.category);
                      return [(
                        <span
                          key={slot.id}
                          className="pointer-events-none absolute inset-x-0"
                          style={{
                            top: `${slice.top}%`,
                            height: `${slice.height}%`,
                            backgroundColor: meta.bgColor,
                            boxShadow: `inset 0 0 0 1px ${meta.color}`,
                          }}
                        />
                      )];
                    })}
                    {day.id === 'mon' && (
                      <span className="pointer-events-none absolute left-0 top-0 z-[1] w-5 pr-0.5 text-right text-[8px] font-mono font-bold leading-none text-slate-400">{hourLabel}</span>
                    )}
                  </div>
                );
              })}
              {slots.filter((slot) => slot.day === day.id).map((slot) => {
                const range = slotRangeMinutes(slot);
                const top = ((range.start - dayOrigin) / daySpan) * 100;
                const timeLabel = formatScheduleRange(slot);
                const name = slotDisplayName(slot);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    title={`${timeLabel} ${name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditor(slot);
                    }}
                    className="absolute z-10 overflow-hidden rounded bg-white/80 px-px py-px text-left leading-tight shadow-sm cursor-pointer"
                    style={{
                      top: `${Math.min(Math.max(top, 0), 96)}%`,
                      left: day.id === 'mon' ? '1.15rem' : 1,
                      right: 1,
                    }}
                  >
                    <span className="block break-all text-[7px] font-black text-slate-800">{timeLabel}</span>
                    <span className="block truncate text-[7px] font-black" style={{ color: categoryMeta(slot.category).color }}>{name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex h-3 shrink-0 items-start bg-slate-50">
              {day.id === 'mon' && <span className="w-5 pr-0.5 text-right text-[8px] font-mono font-bold leading-none text-slate-400">25</span>}
            </div>
          </div>
        ))}
      </div>
      {editing && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center" onClick={() => setEditingId(null)}>
          <form
            onSubmit={saveEditor}
            onClick={(event) => event.stopPropagation()}
            className="flex min-h-0 max-h-[min(100%,calc(100dvh-1.5rem))] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4">
              <h4 className="text-sm font-black text-slate-900">時間を5分単位で設定</h4>
              <button type="button" onClick={() => setEditingId(null)} className="text-xs font-black text-slate-400 cursor-pointer">閉じる</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
              <p className="text-[11px] font-bold text-slate-400">
                {WEEKDAYS.find((day) => day.id === editing.day)?.label}曜の予定。開始と終了は5分刻みです。
              </p>
              <label className="block text-[11px] font-black text-slate-600">
                種類
                <select
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value as ScheduleCategoryId)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm font-black"
                >
                  {(Object.keys(SCHEDULE_CATEGORY_MAP) as ScheduleCategoryId[]).map((categoryId) => {
                    const setting = SCHEDULE_CATEGORY_MAP[categoryId] ?? SCHEDULE_CATEGORY_MAP.other;
                    return <option key={categoryId} value={categoryId}>{setting.label}</option>;
                  })}
                </select>
              </label>
              <StudyTimeRangeFields value={draftRange} onChange={setDraftRange} totalLabel="合計" />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  onCommit(slots.filter((slot) => slot.id !== editing.id));
                  setEditingId(null);
                }}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 cursor-pointer"
              >
                この予定を消す
              </button>
              <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-black text-white cursor-pointer">
                この時間で保存
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}

function cloneScheduleSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return slots.map((slot) => ({ ...slot }));
}

function copyScheduleSlotsWithNewIds(slots: ScheduleSlot[]): ScheduleSlot[] {
  const stamp = Date.now();
  return slots.map((slot, index) => ({
    ...slot,
    id: `slot_${stamp}_${index}_${Math.random().toString(36).slice(2, 8)}`,
  }));
}

function slotsForHinaBase(
  templateId: StaffScheduleTemplateId,
  stored: Record<StaffScheduleTemplateId, ScheduleSlot[]>,
): ScheduleSlot[] {
  return stored[templateId] || [];
}

function WeeklyTimetable({
  slots,
  onAddAt,
  onEdit,
}: {
  slots: ScheduleSlot[];
  onAddAt: (day: WeekdayId, startHour: number) => void;
  onEdit: (slot: ScheduleSlot) => void;
}) {
  return (
    <div className="overflow-auto max-h-[72vh] border border-slate-200 rounded-2xl">
      <div className="min-w-[920px]">
        <div className="grid sticky top-0 z-20 bg-white border-b border-slate-200" style={{ gridTemplateColumns: '72px repeat(7, minmax(110px, 1fr))' }}>
          <div className="p-2 text-[10px] font-bold text-slate-400">時間</div>
          {WEEKDAYS.map((day) => (
            <div key={day.id} className="p-2 text-center text-sm font-black text-slate-800 border-l border-slate-100">
              {day.label}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: '72px repeat(7, minmax(110px, 1fr))' }}>
          <div>
            {SCHEDULE_HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: SCHEDULE_HOUR_HEIGHT }}
                className="pr-2 text-right text-[10px] font-mono font-bold text-slate-400 border-b border-slate-100 leading-none pt-1"
              >
                {formatScheduleHour(hour)}
              </div>
            ))}
          </div>
          {WEEKDAYS.map((day) => (
            <div key={day.id} className="relative border-l border-slate-200" style={{ height: SCHEDULE_HOURS.length * SCHEDULE_HOUR_HEIGHT }}>
              {SCHEDULE_HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  aria-label={`${day.label}曜日 ${formatScheduleHour(hour)} にコマを追加`}
                  onClick={() => onAddAt(day.id, hour)}
                  className="absolute left-0 right-0 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  style={{ top: hour * SCHEDULE_HOUR_HEIGHT, height: SCHEDULE_HOUR_HEIGHT }}
                />
              ))}
              {slots.filter((slot) => slot.day === day.id).map((slot) => {
                const meta = categoryMeta(slot.category);
                const range = slotRangeMinutes(slot);
                const heading = slotDisplayName(slot);
                const timeRange = formatScheduleRange(slot);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onEdit(slot)}
                    title={`${heading} ${timeRange}`}
                    className="absolute left-1 right-1 z-10 rounded-md border px-1 py-0.5 text-left overflow-hidden cursor-pointer"
                    style={{
                      top: (range.start / 60) * SCHEDULE_HOUR_HEIGHT + 1,
                      height: Math.max(((range.end - range.start) / 60) * SCHEDULE_HOUR_HEIGHT - 2, 16),
                      backgroundColor: meta.bgColor,
                      borderColor: meta.color,
                      color: meta.color,
                    }}
                  >
                    <div className="text-[10px] font-black truncate">{timeRange} {heading}</div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">{Math.max(range.end - range.start, 0)}分</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayTimetable({
  day,
  slots,
  onAddAt,
  onEdit,
}: {
  day: WeekdayId;
  slots: ScheduleSlot[];
  onAddAt: (day: WeekdayId, startHour: number) => void;
  onEdit: (slot: ScheduleSlot) => void;
}) {
  const hourHeight = 64;
  return (
    <div className="overflow-y-auto max-h-[68vh] border border-slate-200 rounded-2xl bg-white">
      <div className="relative" style={{ height: SCHEDULE_HOURS.length * hourHeight }}>
        {SCHEDULE_HOURS.map((hour) => (
          <button
            key={hour}
            type="button"
            aria-label={`${formatScheduleHour(hour)} にコマを追加`}
            onClick={() => onAddAt(day, hour)}
            className="absolute left-0 right-0 border-b border-slate-100 text-left cursor-pointer"
            style={{ top: hour * hourHeight, height: hourHeight }}
          >
            <span className="inline-block w-14 pt-1 pr-2 text-right text-[11px] font-mono font-bold text-slate-400">
              {formatScheduleHour(hour)}
            </span>
          </button>
        ))}
        {slots.filter((slot) => slot.day === day).map((slot) => {
          const meta = categoryMeta(slot.category);
          const range = slotRangeMinutes(slot);
          const heading = slotDisplayName(slot);
          const timeRange = formatScheduleRange(slot);
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onEdit(slot)}
              title={`${timeRange} ${heading}`}
              className="absolute left-14 right-2 z-10 rounded-xl border px-3 py-1 text-left overflow-hidden cursor-pointer"
              style={{
                top: (range.start / 60) * hourHeight + 2,
                height: Math.max(((range.end - range.start) / 60) * hourHeight - 4, 28),
                backgroundColor: meta.bgColor,
                borderColor: meta.color,
                color: meta.color,
              }}
            >
              <div className="text-sm font-black truncate">{timeRange} {heading}</div>
              <div className="text-[11px] font-mono text-slate-500 truncate">{Math.max(range.end - range.start, 0)}分</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudyMinuteChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {STUDY_MINUTE_CHIPS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          onClick={() => onChange(minutes)}
          className={`py-3 rounded-2xl text-sm font-black cursor-pointer ${
            value === minutes
              ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {minutes}分
        </button>
      ))}
    </div>
  );
}

function MissionToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-2xl px-3 py-2 cursor-pointer">
      <span className="text-sm font-black text-amber-950">👑 ミッション達成！</span>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
          aria-label="ミッション達成"
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-amber-500" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function WeekRankThumb({
  rank,
  onOpen,
}: {
  rank: StudyRank;
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(rank.src) && imageReady && !imageFailed;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event);
      }}
      className="relative shrink-0 h-11 w-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden cursor-pointer"
      aria-label={`${rank.label}ランクを拡大`}
    >
      {showImage ? (
        <img src={rank.src} alt={`${rank.label}ランク`} className="h-9 w-9 object-contain" />
      ) : (
        <span className="px-0.5 text-[9px] font-black leading-tight text-amber-900 text-center">{rank.label}</span>
      )}
      {!rank.src || imageFailed ? null : (
        <img
          src={rank.src}
          alt=""
          className="absolute h-0 w-0 opacity-0"
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
        />
      )}
    </button>
  );
}

function WeekRankPreviewModal({
  weekNumber,
  rank,
  totalMinutes,
  note,
  onClose,
}: {
  weekNumber: number;
  rank: StudyRank;
  totalMinutes: number;
  note?: string;
  onClose: () => void;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(rank.src) && imageReady && !imageFailed;
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
          {showImage ? (
            <img src={rank.src} alt={`${rank.label}ランク`} className="h-full w-full object-contain" />
          ) : (
            <div className="inline-flex items-center justify-center rounded-2xl bg-amber-50 px-6 py-5 text-xl font-black text-amber-900 border border-amber-200">
              {rank.label}
            </div>
          )}
          {!rank.src || imageFailed ? null : (
            <img
              src={rank.src}
              alt=""
              className="absolute h-0 w-0 opacity-0"
              onLoad={() => setImageReady(true)}
              onError={() => setImageFailed(true)}
            />
          )}
        </div>
        <p className="mt-4 text-lg font-black text-slate-900">{totalMinutes > 0 ? rank.label : 'ランクなし'}</p>
        <p className="mt-2 text-sm font-black leading-relaxed text-slate-600">
          {weekNumber}週目の達成ランク: {totalMinutes > 0 ? `${rank.label}（${formatHourAndMinute(totalMinutes)}）` : '0時間0分（ランクなし）'}
          {note ? <span className="mt-1 block text-xs">{note}</span> : null}
        </p>
        <button type="button" onClick={onClose} className="mt-5 px-5 py-2.5 rounded-xl bg-slate-200 text-slate-700 font-black cursor-pointer">閉じる</button>
      </div>
    </div>
  );
}

function PreviousWeekRankBadge({
  rank,
  totalMinutes,
}: {
  rank: StudyRank;
  totalMinutes: number;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(rank.src) && imageReady && !imageFailed;
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm px-4 py-5 text-center">
      <div className="relative mx-auto flex h-36 w-36 max-w-full items-center justify-center sm:h-44 sm:w-44">
        {showImage ? null : (
          <div className="inline-flex items-center justify-center rounded-2xl bg-amber-50 px-5 py-4 text-base font-black text-amber-900 border border-amber-200">
            {rank.id === 'none' ? 'ランクなし' : `${rank.label}ランク`}
          </div>
        )}
        {!rank.src || imageFailed ? null : (
          <img
            src={rank.src}
            alt={`${rank.label}ランク`}
            className={showImage ? 'h-full w-full object-contain' : 'absolute h-0 w-0 opacity-0'}
            onLoad={() => setImageReady(true)}
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <p className="mt-3 text-xs font-black leading-relaxed text-slate-600">
        {totalMinutes > 0
          ? `前週の達成ランク: ${rank.label}ランク（前週学習＋塾: ${formatHourAndMinute(totalMinutes)}）`
          : '前週の達成ランク: 0時間0分（ランクなし）'}
      </p>
    </section>
  );
}

function LearningTrailFrame({
  hours,
  card,
  ready,
  imageVersion,
}: {
  hours: number;
  card: LearningTrailCard | null;
  ready: boolean;
  imageVersion: number;
}) {
  const gilt = card
    ? 'linear-gradient(145deg, #fff4cc 0%, #e8c56a 16%, #8a6424 38%, #f8e7b0 52%, #6d5018 72%, #f3d48a 100%)'
    : 'linear-gradient(145deg, #6b6458 0%, #3a342c 42%, #8a8174 58%, #2a261f 100%)';
  return (
    <article
      className="p-3 sm:p-4"
      style={{
        background: gilt,
        boxShadow: card
          ? '0 18px 36px rgba(0,0,0,0.38), inset 0 0 0 2px rgba(255,248,220,0.55)'
          : '0 12px 24px rgba(0,0,0,0.28), inset 0 0 0 2px rgba(255,255,255,0.08)',
      }}
    >
      <div className="p-2 sm:p-3" style={{ background: card ? '#2a2114' : '#16130f' }}>
        <div
          className="relative flex aspect-[3/4] items-center justify-center overflow-hidden"
          style={{ background: card ? '#f4efe4' : '#100e0c' }}
        >
          {card ? (
            <img
              src={`/images/achievements/${card.stageKey}-${card.rarity}.png?v=${imageVersion}`}
              alt="獲得した画像"
              className="w-full h-full object-contain"
            />
          ) : ready ? (
            <p className="px-6 text-center text-sm font-black leading-relaxed text-stone-300">
              🔒 {hours}時間達成で解放
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LearningTrailCelebration({
  card,
  hasNext,
  imageVersion,
  onClose,
}: {
  card: LearningTrailCard;
  hasNext: boolean;
  imageVersion: number;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fanfareStartedRef = useRef(false);
  const keepFanfareAfterCloseRef = useRef(false);

  useEffect(() => {
    const audio = new Audio('/audio/fanfare.mp3');
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.addEventListener('playing', () => {
      fanfareStartedRef.current = true;
    });
    void audio.play().catch(() => {});
    const token = `${card.stageKey}:${card.rarity}`;
    if (!learningTrailCelebrated.has(token)) {
      learningTrailCelebrated.add(token);
      const colors = ['#fff7d6', '#f6d56a', '#7dd3fc', '#fb7185', '#86efac', '#ffffff'];
      const burst = {
        particleCount: 180,
        spread: 110,
        startVelocity: 55,
        ticks: 280,
        zIndex: 400,
        colors,
        disableForReducedMotion: false as const,
      };
      try {
        const fire = confetti as unknown as (options: Record<string, unknown>) => void;
        fire({ ...burst, origin: { y: 0.58 } });
        fire({ ...burst, particleCount: 90, angle: 60, spread: 65, origin: { x: 0, y: 0.7 } });
        fire({ ...burst, particleCount: 90, angle: 120, spread: 65, origin: { x: 1, y: 0.7 } });
      } catch {
        // 紙吹雪を出せない端末では画像だけを出す
      }
    }
    return () => {
      if (!keepFanfareAfterCloseRef.current) audio.pause();
    };
  }, [card.stageKey, card.rarity]);

  const handleClose = () => {
    const audio = audioRef.current;
    if (audio && !fanfareStartedRef.current) {
      keepFanfareAfterCloseRef.current = true;
      void audio.play().catch(() => {});
    }
    onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-xl font-black text-white sm:text-2xl">🎉 新しい画像をゲットしたよ！</p>
        <div className="mx-auto mt-5 aspect-[3/4] w-[min(88vw,380px)] bg-[#f6f1e4] p-3 shadow-2xl">
          <img
            src={`/images/achievements/${card.stageKey}-${card.rarity}.png?v=${imageVersion}`}
            alt="獲得した画像"
            className="w-full h-full object-contain"
          />
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="mt-6 rounded-2xl bg-white px-8 py-3 text-sm font-black text-slate-900 cursor-pointer"
        >
          {hasNext ? 'つぎの画像を見る' : 'とじる'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function LearningTrailAlbum({
  supabase,
  studentId,
  studyLogs,
  cramMinutesByWeek,
}: {
  supabase: { from: (table: string) => any };
  studentId: string;
  studyLogs: StudyLog[];
  cramMinutesByWeek: Record<string, number>;
}) {
  const totalMinutes = learningTrailTotalMinutes(studyLogs, cramMinutesByWeek);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const nextStage = LEARNING_TRAIL_STAGES.find((stage) => totalMinutes < stage.hours * 60);
  const remainHours = nextStage ? Math.ceil((nextStage.hours * 60 - totalMinutes) / 60) : 0;
  const [cards, setCards] = useState<LearningTrailCard[] | null>(null);
  const [celebrate, setCelebrate] = useState<LearningTrailCard[]>([]);
  const imageVersion = useRef(Date.now()).current;

  useEffect(() => {
    if (!studentId || !supabaseEnvConfigured()) {
      setCards([]);
      return;
    }
    let cancelled = false;
    void syncLearningTrail(supabase, studentId, totalMinutes).then((result) => {
      if (cancelled) return;
      setCards(result.cards);
      const pending = learningTrailPendingCelebrate.get(studentId) || [];
      if (pending.length > 0) setCelebrate((current) => (current.length > 0 ? current : pending));
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, studentId, totalMinutes]);

  const owned = new Map((cards || []).map((card) => [card.stageKey, card]));
  const showing = celebrate[0];

  return (
    <section className="rounded-[2rem] px-4 py-8 sm:px-6" style={{ background: 'linear-gradient(180deg, #2c261e 0%, #16130f 100%)' }}>
      <h3 className="text-center text-lg font-black tracking-wide text-amber-50">🏆 キミの学習の軌跡</h3>
      <p className="mt-4 text-center text-sm font-black leading-relaxed text-amber-50">
        キミの総学習時間：{hours} 時間（{mins}分）
      </p>
      <p className="mt-1 text-center text-sm font-black leading-relaxed text-amber-200">
        次の段階クリアーまであと {remainHours} 時間！
      </p>
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-8">
        {LEARNING_TRAIL_STAGES.map((stage) => (
          <LearningTrailFrame key={stage.key} hours={stage.hours} ready={cards !== null} imageVersion={imageVersion} card={owned.get(stage.key) ?? null} />
        ))}
      </div>
      {showing && (
        <LearningTrailCelebration
          key={showing.stageKey}
          card={showing}
          hasNext={celebrate.length > 1}
          imageVersion={imageVersion}
          onClose={() => {
            setCelebrate((items) => {
              const next = items.slice(1);
              learningTrailPendingCelebrate.set(studentId, next);
              return next;
            });
          }}
        />
      )}
    </section>
  );
}

function MissionCrown() {
  return (
    <span
      className="shrink-0 leading-none"
      style={{ filter: 'drop-shadow(0 0 2px #fde68a) drop-shadow(0 0 4px #f59e0b)' }}
      aria-hidden
    >
      👑
    </span>
  );
}

function StudyTimeRangeFields({
  value,
  onChange,
  totalLabel = '合計学習時間',
}: {
  value: StudyClockRange;
  onChange: (next: StudyClockRange) => void;
  totalLabel?: string;
}) {
  const range = clampStudyRange(value);
  const total = studyDurationMinutes(range);
  const startKey = `${range.startHour}:${range.startMinute}`;
  const endKey = `${range.endHour}:${range.endMinute}`;
  const startLimit = clockMinutes(24, 55);
  const startAt = clockMinutes(range.startHour, range.startMinute);
  const startOptions = STUDY_CLOCK_OPTIONS.filter((option) => clockMinutes(option.hour, option.minute) <= startLimit);
  const endOptions = STUDY_CLOCK_OPTIONS.filter((option) => clockMinutes(option.hour, option.minute) > startAt);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-black text-slate-600">
          開始時刻
          <select
            value={startKey}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(':').map(Number);
              onChange(clampStudyRange({ ...range, startHour: hour, startMinute: minute }));
            }}
            className="mt-1 w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-sm font-black"
          >
            {startOptions.map((option) => (
              <option key={`start-${option.label}`} value={`${option.hour}:${option.minute}`}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] font-black text-slate-600">
          終了時刻
          <select
            value={endKey}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(':').map(Number);
              onChange(clampStudyRange({ ...range, endHour: hour, endMinute: minute }));
            }}
            className="mt-1 w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-sm font-black"
          >
            {endOptions.map((option) => (
              <option key={`end-${option.label}`} value={`${option.hour}:${option.minute}`}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-black text-sky-800">
        {totalLabel} {total}分
      </div>
    </div>
  );
}

function DayHourLane({
  hour,
  showHourLabel,
  planColor,
  planLabel,
  planBands,
  studies,
  onEmpty,
  onDeleteSlot,
  splitLanes = false,
}: {
  hour: number;
  showHourLabel: boolean;
  planColor?: string | null;
  planLabel?: string;
  planBands?: { key: string; slotId: string; color: string; bgColor?: string; label?: string; slice: HourSlice; lane?: number; laneCount?: number }[];
  studies: {
    key: string;
    color: string;
    bgColor?: string;
    title: string;
    crown: boolean;
    slice: HourSlice;
    lane?: number;
    laneCount?: number;
    onClick?: () => void;
  }[];
  onEmpty?: () => void;
  onDeleteSlot?: (slotId: string) => void;
  splitLanes?: boolean;
}) {
  const laneItems = [
    ...(planBands || []).map((band) => band.slice),
    ...studies.map((study) => study.slice),
  ];
  const packed = splitLanes && laneItems.some((slice, index) => laneItems.some((other, otherIndex) => otherIndex !== index && slicesOverlap(slice, other)))
    ? laneBoxes(laneItems)
    : laneItems.map(() => ({ lane: 0, laneCount: 1 }));
  const bandLanes = (planBands || []).map((band, index) => (
    splitLanes && band.lane != null && band.laneCount != null
      ? { lane: band.lane, laneCount: band.laneCount }
      : (packed[index] || { lane: 0, laneCount: 1 })
  ));
  const studyLanes = studies.map((study, index) => (
    splitLanes && study.lane != null && study.laneCount != null
      ? { lane: study.lane, laneCount: study.laneCount }
      : (packed[(planBands?.length || 0) + index] || { lane: 0, laneCount: 1 })
  ));
  return (
    <div
      className={`relative flex-1 min-h-0 w-full flex border-b border-white/50 overflow-visible ${onEmpty ? 'cursor-pointer' : ''}`}
      style={{ backgroundColor: planBands?.length ? '#F8FAFC' : (planColor || '#F8FAFC') }}
      onClick={onEmpty}
    >
      {showHourLabel && (
        <span className="w-5 shrink-0 text-[8px] font-mono font-bold leading-none pt-px text-right pr-0.5 text-slate-400 pointer-events-none">
          {hour === 24 ? '24' : String(hour).padStart(2, '0')}
        </span>
      )}
      <div className="relative flex-1 min-w-0">
        {(planBands || []).map((band, index) => {
          const lane = bandLanes[index] || { lane: 0, laneCount: 1 };
          const shared = lane.laneCount > 1;
          return (
          <div
            key={band.key}
            className={`absolute overflow-hidden ${band.label && onDeleteSlot ? '' : 'pointer-events-none'} ${shared ? '' : 'inset-x-0'}`}
            style={{
              top: `${band.slice.top}%`,
              height: `${band.slice.height}%`,
              zIndex: 1,
              left: shared ? `calc(${(lane.lane / lane.laneCount) * 100}% + 1px)` : 0,
              width: shared ? `calc(${100 / lane.laneCount}% - 2px)` : undefined,
              right: shared ? 'auto' : 0,
              backgroundColor: band.bgColor || band.color,
              color: band.color,
              boxShadow: band.bgColor ? `inset 0 0 0 1px ${band.color}` : undefined,
            }}
          >
            {band.label && onDeleteSlot ? (
              <button
                type="button"
                title={`${band.label} を削除`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteSlot(band.slotId);
                }}
                className="flex w-full items-start justify-between gap-0.5 px-0.5 text-left cursor-pointer"
              >
                <span className={`min-w-0 font-black leading-tight ${shared ? 'truncate text-[10px] leading-none' : 'text-[8px] break-all'}`}>{band.label}</span>
                <span className="shrink-0 text-[8px] font-black text-red-700">削除</span>
              </button>
            ) : band.label ? (
              <span className={`block px-0.5 font-black ${splitLanes ? 'truncate whitespace-nowrap text-xs leading-none' : 'text-[8px] leading-tight break-all'}`} title={band.label}>
                {band.label}
              </span>
            ) : null}
          </div>
          );
        })}
        {studies.length === 0 && !planBands?.length && planLabel ? (
          <span className="absolute inset-0 flex items-center text-[8px] font-black truncate leading-none pl-0.5 text-slate-700 pointer-events-none">
            {planLabel}
          </span>
        ) : null}
        {studies.map((study, index) => {
          const { slice } = study;
          const lane = studyLanes[index] || { lane: 0, laneCount: 1 };
          const shared = lane.laneCount > 1;
          const style: React.CSSProperties = {
            left: shared ? `calc(${(lane.lane / lane.laneCount) * 100}% + 1px)` : 0,
            width: shared ? `calc(${100 / lane.laneCount}% - 2px)` : undefined,
            right: shared ? 'auto' : 0,
            zIndex: splitLanes ? 3 : 2,
            backgroundColor: splitLanes ? '#ffffff' : (study.bgColor || study.color),
            color: splitLanes ? study.color : (study.bgColor ? study.color : '#ffffff'),
            boxShadow: study.bgColor || splitLanes ? `inset 0 0 0 1px ${study.color}` : undefined,
            top: slice.continuesUp ? -1 : `${slice.top}%`,
            height: slice.continuesUp || slice.continuesDown
              ? `calc(${slice.height}% + ${slice.continuesUp && slice.continuesDown ? 2 : 1}px)`
              : `${slice.height}%`,
            borderTopLeftRadius: slice.continuesUp ? 0 : 3,
            borderTopRightRadius: slice.continuesUp ? 0 : 3,
            borderBottomLeftRadius: slice.continuesDown ? 0 : 3,
            borderBottomRightRadius: slice.continuesDown ? 0 : 3,
          };
          const body = (
            <>
              {slice.isStart && study.crown ? <span className="shrink-0 text-[10px] leading-none"><MissionCrown /></span> : null}
              {slice.isStart ? <span className={`min-w-0 flex-1 truncate font-black leading-none text-current ${splitLanes ? 'whitespace-nowrap text-xs' : 'text-[8px]'}`} title={study.title}>{study.title}</span> : null}
            </>
          );
          if (study.onClick) {
            return (
              <button
                key={study.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  study.onClick?.();
                }}
                className="absolute flex items-center gap-px overflow-hidden px-0.5 text-left cursor-pointer"
                style={style}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={study.key} className="absolute flex items-center gap-px overflow-hidden px-0.5" style={style}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudyMaterialStack({
  heading,
  rangeLabel,
  totalMinutes,
  subjects,
}: {
  heading: string;
  rangeLabel: string;
  totalMinutes: number;
  subjects: { subject: SubjectType; minutes: number; materials: { id: string; title: string; minutes: number; color: string }[] }[];
}) {
  const max = Math.max(...subjects.map((item) => item.minutes), 1);
  return (
    <section className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
      <div>
        <div className="text-[11px] font-bold text-slate-400">{heading}</div>
        <div className="text-2xl font-black text-slate-900 mt-1">{formatStudyDuration(totalMinutes)}</div>
        <div className="text-[11px] font-bold text-slate-400 mt-1">{rangeLabel}</div>
      </div>
      {subjects.length === 0 ? (
        <p className="text-xs font-bold text-slate-400">この期間の記録はまだありません。</p>
      ) : subjects.map((item) => {
        const setting = subjectSetting(item.subject);
        return (
          <div key={item.subject} className="space-y-1.5">
            <div className="flex justify-between text-xs font-black">
              <span style={{ color: setting.color }}>{item.subject}</span>
              <span className="text-slate-500">{formatStudyDuration(item.minutes)}</span>
            </div>
            <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
              {item.materials.map((material) => (
                <div
                  key={material.id}
                  title={`${material.title} ${formatStudyDuration(material.minutes)}`}
                  style={{ width: `${(material.minutes / max) * 100}%`, backgroundColor: material.color }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {item.materials.map((material) => (
                <span key={`${item.subject}-${material.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: material.color }} />
                  <span className="truncate max-w-[9rem]">{material.title}</span>
                  <span>{material.minutes}分</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function MeetingWeekBoard({
  weekStart,
  plans,
  studentLogs,
  slots,
  catalog,
  userId,
  compact = false,
  useStoredClock = false,
}: {
  weekStart: string;
  plans: Record<string, WeekPlanRecord>;
  studentLogs: StudyLog[];
  slots: Record<string, StudySlotLink>;
  catalog: Material[];
  userId: string;
  compact?: boolean;
  useStoredClock?: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDateKey(weekStart, index));
  return (
    <div className="overflow-x-auto">
      <div className={`grid grid-cols-7 gap-1 ${compact ? 'min-w-[640px] h-[520px]' : 'min-w-[980px] h-[680px]'}`}>
        {days.map((dateKey, columnIndex) => {
          const planSlots = planSlotsForDate(plans[weekStartKey(dateKey)], dateKey);
          const weekday = weekdayIdFromDateKey(dateKey);
          const dayLabel = WEEKDAYS.find((day) => day.id === weekday)?.label || '';
          const [, month, day] = dateKey.split('-');
          const placedLogs = useStoredClock ? studentLogs.flatMap((log) => {
            const placed = storedClockPlacement(log);
            if (!placed || placed.date !== dateKey) return [];
            const start = clockMinutes(placed.startHour, placed.startMinute);
            const end = clockMinutes(placed.endHour, placed.endMinute);
            if (end <= start) return [];
            return [{ log, placed, start, end }];
          }) : [];
          const dayPlanSlots = useStoredClock ? planSlots.filter((slot) => slot.day === weekday) : [];
          const laneSource = [
            ...dayPlanSlots.map((slot) => {
              const range = slotRangeMinutes(slot);
              return { key: `plan:${slot.id}`, top: range.start, height: Math.max(range.end - range.start, 0) };
            }),
            ...placedLogs.map((item) => ({ key: `study:${item.log.id}`, top: item.start, height: item.end - item.start })),
          ].filter((item) => item.height > 0);
          const laneAssignments = laneBoxes(laneSource.map((item) => ({
            top: item.top,
            height: item.height,
            continuesUp: false,
            continuesDown: false,
            isStart: true,
          })));
          const dayLanes = new Map(laneSource.map((item, index) => [item.key, laneAssignments[index]]));
          return (
            <div key={dateKey} className="min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="shrink-0 text-center text-[10px] font-black py-1 bg-slate-50 text-slate-700 border-b border-slate-100">
                {dayLabel} {Number(month)}/{Number(day)}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {DAY_VIEW_HOURS.map((hour) => {
                  const studies = studentLogs.flatMap((log) => {
                    const placed = useStoredClock ? storedClockPlacement(log) : studyPlacement(log, slots);
                    if (!placed || placed.date !== dateKey) return [];
                    const slice = sliceInHour(hour, placed);
                    if (!slice) return [];
                    const material = meetingMaterialInfo(log.material_id, userId, catalog);
                    const subjectSource = log.subject || material.subject;
                    const setting = subjectSetting(subjectSource);
                    const materialTitle = material.title === '学習' ? '教材名未登録' : material.title;
                    const subjectName = teacherSubjectLabel(subjectSource);
                    const lane = dayLanes.get(`study:${log.id}`);
                    return [{
                      key: `${log.id}-${hour}`,
                      color: setting.color,
                      bgColor: setting.bgColor,
                      title: useStoredClock ? [subjectName, materialTitle].filter(Boolean).join(' ') : materialTitle,
                      crown: Boolean(log.is_mission_completed),
                      slice,
                      lane: lane?.lane,
                      laneCount: lane?.laneCount,
                    }];
                  });
                  const planBands = planBandsForHour(planSlots, weekday, hour).map((band) => {
                    const lane = dayLanes.get(`plan:${band.slotId}`);
                    return lane ? { ...band, lane: lane.lane, laneCount: lane.laneCount } : band;
                  });
                  return (
                    <DayHourLane
                      key={hour}
                      hour={hour}
                      showHourLabel={columnIndex === 0}
                      planBands={useStoredClock || studies.length === 0 ? planBands : undefined}
                      studies={studies}
                      splitLanes={useStoredClock}
                    />
                  );
                })}
              </div>
              <div className="shrink-0 h-3 text-[8px] font-mono font-bold text-slate-400 pl-1 leading-none">25:00</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubjectTextPicker({
  subject,
  materialId,
  materials,
  myMaterials = [],
  favoriteIds,
  onSubject,
  onMaterial,
  onToggleFavorite,
  compact = false,
  fromConfig = false,
}: {
  subject: string;
  materialId: string;
  materials: Material[];
  myMaterials?: MyMaterialItem[];
  favoriteIds: string[];
  onSubject: (subject: string) => void;
  onMaterial: (materialId: string) => void;
  onToggleFavorite: (materialId: string) => void;
  compact?: boolean;
  fromConfig?: boolean;
}) {
  const selectedCode = fromConfig ? subjectCodeFromInput(subject) : null;
  const matchesSelected = (item: { subject: string; subject_code?: string | null; title: string }) => {
    if (!item.title.trim()) return false;
    if (selectedCode) {
      if (item.subject_code) return item.subject_code === selectedCode;
      return item.subject === SUBJECT_CODE_TONE[selectedCode];
    }
    return isSubjectType(subject) && item.subject === subject;
  };
  const mine = myMaterials.filter(matchesSelected);
  const catalog = (selectedCode || isSubjectType(subject)
    ? materials.filter(matchesSelected)
    : []
  ).slice().sort((a, b) => {
    const fav = Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id));
    if (fav !== 0) return fav;
    if (a.display_order == null && b.display_order == null) return 0;
    if (a.display_order == null) return 1;
    if (b.display_order == null) return -1;
    return a.display_order - b.display_order;
  });
  const pad = compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-3 text-sm';
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      <div className="text-[11px] font-black text-slate-500">① 科目</div>
      <div className="flex flex-wrap gap-1">
        {fromConfig ? (Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
          const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
          const selected = subject === subjectKey;
          return (
            <button
              key={subjectKey}
              type="button"
              onClick={() => onSubject(subjectKey)}
              className={`rounded-full font-black cursor-pointer border ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'} ${
                selected ? '' : 'bg-white text-slate-600 border-slate-200'
              }`}
              style={selected ? { color: setting.color, backgroundColor: setting.bgColor, borderColor: setting.color } : undefined}
            >
              {setting.label}
            </button>
          );
        }) : SUBJECT_NAMES.map((name) => {
          const setting = subjectSetting(name);
          const selected = subject === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSubject(name)}
              className={`rounded-full font-black cursor-pointer border ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'} ${
                selected ? '' : 'bg-white text-slate-600 border-slate-200'
              }`}
              style={selected ? { color: setting.color, backgroundColor: setting.bgColor, borderColor: setting.color } : undefined}
            >
              {name}
            </button>
          );
        })}
      </div>
      {(selectedCode || isSubjectType(subject)) && (
        <div className={compact ? 'space-y-1' : 'space-y-2'}>
          {mine.length > 0 && (
            <div className={compact ? 'space-y-1' : 'space-y-2'}>
              <div className="text-[11px] font-black text-orange-600">マイ教材</div>
              {mine.map((item) => (
                <button
                  key={`mine-${item.id}`}
                  type="button"
                  onClick={() => onMaterial(item.id)}
                  className={`w-full text-left rounded-xl font-black cursor-pointer border ${pad} ${
                    materialId === item.id ? 'bg-orange-50 border-orange-300 text-orange-900' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
          <div className="text-[11px] font-black text-slate-500">② テキスト</div>
          {catalog.length === 0 ? (
            <p className="text-[11px] font-bold text-slate-400">この科目の教材はまだありません。</p>
          ) : catalog.map((material) => {
            const pinned = favoriteIds.includes(material.id);
            return (
              <div key={material.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onMaterial(material.id)}
                  className={`flex-1 text-left rounded-xl font-black cursor-pointer border ${pad} ${
                    materialId === material.id ? 'bg-sky-50 border-sky-400 text-sky-900' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {material.title}
                </button>
                <button
                  type="button"
                  aria-label={pinned ? 'お気に入りを外す' : 'お気に入りに追加'}
                  onClick={() => onToggleFavorite(material.id)}
                  className={`${compact ? 'w-9' : 'w-12'} rounded-xl border border-slate-200 bg-white text-base cursor-pointer`}
                >
                  {pinned ? '⭐' : '☆'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SECTION 3. 共通サブコンポーネント群 (ダイアログ ＆ ポップアップ)
// =============================================================================

// =============================================================================
// SECTION 4. メインアプリケーションコンポーネント (Y Log - 生徒第一統合システム)
// =============================================================================

const RoleScreenContext = createContext<{
  admin: (currentUser: User) => React.ReactElement;
  student: (currentUser: User) => React.ReactElement;
} | null>(null);

function AdminView({ currentUser }: { currentUser: User }) {
  const screens = useContext(RoleScreenContext);
  if (!screens) return null;
  return screens.admin(currentUser);
}

function StudentView({ currentUser }: { currentUser: User }) {
  const screens = useContext(RoleScreenContext);
  if (!screens) return null;
  return screens.student(currentUser);
}

export default function Page() {
  const supabase = useMemo(() => createSafeSupabaseClient(), []);

  // ---------------------------------------------------------------------------
  // ログイン / セッション 状態管理 (メール不使用・独自ID認証)
  // ---------------------------------------------------------------------------
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loginInputId, setLoginInputId] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginPasswordVisible, setLoginPasswordVisible] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // 画面ナビゲーション状態
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');

  // メインデータ
  const [users, setUsers] = useState<User[]>([]);
  const [usersReady, setUsersReady] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [messages, setMessages] = useState<StudentMessage[]>([]);

  // スケジュール（週間タイムテーブル）
  const [staffTemplates, setStaffTemplates] = useState<Record<StaffScheduleTemplateId, ScheduleSlot[]>>(EMPTY_STAFF_TEMPLATES);
  const [selectedStaffTemplateId, setSelectedStaffTemplateId] = useState<StaffScheduleTemplateId>('plain');
  const [mySchedules, setMySchedules] = useState<MyScheduleFolderItem[]>([]);
  const [selectedMyScheduleId, setSelectedMyScheduleId] = useState<string | null>(null);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [slotDraft, setSlotDraft] = useState<ScheduleSlotDraft | null>(null);
  const [scheduleFocusDay, setScheduleFocusDay] = useState<WeekdayId>('mon');
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState<number>(0);
  const [noticesExpanded, setNoticesExpanded] = useState<boolean>(false);
  const [crownBurst, setCrownBurst] = useState<string | null>(null);
  const favoriteMaterialIds = useMemo(
    () => materials.filter((item) => item.is_favorite).map((item) => item.id),
    [materials],
  );
  const [myMaterials, setMyMaterials] = useState<MyMaterialItem[]>([]);
  const [myMaterialTitle, setMyMaterialTitle] = useState('');
  const [myMaterialSubject, setMyMaterialSubject] = useState<SubjectCode>('english');
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [logSummaryPeriod, setLogSummaryPeriod] = useState<LogSummaryPeriod>('today');
  const [pastWeekStart, setPastWeekStart] = useState<string | null>(null);
  const [weekRankPreview, setWeekRankPreview] = useState<{
    weekNumber: number;
    totalMinutes: number;
    rank: StudyRank;
    note?: string;
  } | null>(null);
  const [recordMode, setRecordMode] = useState<'timer' | 'countdown' | 'manual'>('timer');
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState(0);
  const [timerElapsedSec, setTimerElapsedSec] = useState(0);
  const [countdownTargetMin, setCountdownTargetMin] = useState(30);
  const [countdownRemainingSec, setCountdownRemainingSec] = useState(30 * 60);
  const [countdownRunning, setCountdownRunning] = useState(false);
  const [countdownStartedAt, setCountdownStartedAt] = useState(0);
  const [countdownFinished, setCountdownFinished] = useState(false);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const timeAttackFinishedRef = useRef(0);
  const clockRestoreUserRef = useRef('');
  const [editingLog, setEditingLog] = useState<StudyLog | null>(null);
  const [editSubject, setEditSubject] = useState<SubjectType | ''>('');
  const [editMaterialId, setEditMaterialId] = useState('');
  const [editRange, setEditRange] = useState<StudyClockRange>({ startHour: 19, startMinute: 0, endHour: 20, endMinute: 0 });
  const [editComment, setEditComment] = useState('');
  const [editMission, setEditMission] = useState(false);
  const countdownSaveLock = useRef(false);
  const [focusDateKey, setFocusDateKey] = useState<string>(() => todayDateKey());
  const [composerDateKey, setComposerDateKey] = useState<string>(() => todayDateKey());
  const [weekPlans, setWeekPlans] = useState<Record<string, WeekPlanRecord>>({});
  const [weekCramMinutes, setWeekCramMinutes] = useState<Record<string, number>>({});
  const [weekPlansResolved, setWeekPlansResolved] = useState(false);
  const [viewedWeekPlans, setViewedWeekPlans] = useState<Record<string, WeekPlanRecord>>({});
  const [openHinaSlot, setOpenHinaSlot] = useState<number | null>(null);
  const [hinaDraftSlots, setHinaDraftSlots] = useState<ScheduleSlot[]>([]);
  const [hinaDraftTitle, setHinaDraftTitle] = useState('');
  const [hinaBaseId, setHinaBaseId] = useState<StaffScheduleTemplateId | null>(null);
  const [hinaApplySerial, setHinaApplySerial] = useState(0);
  const [weekPickerStart, setWeekPickerStart] = useState<string | null>(null);
  const [weekDraftSlots, setWeekDraftSlots] = useState<ScheduleSlot[]>([]);
  const [weekDraftTemplateId, setWeekDraftTemplateId] = useState<string | undefined>(undefined);
  const [weekDraftTemplateName, setWeekDraftTemplateName] = useState('');
  const [logSlots, setLogSlots] = useState<Record<string, StudySlotLink>>({});
  const [studyComposer, setStudyComposer] = useState<StudyClockRange | null>(null);
  const [composerMission, setComposerMission] = useState(false);
  const [showMissionEffect, setShowMissionEffect] = useState(false);
  const [missionEffectToken, setMissionEffectToken] = useState(0);
  const composerContext = useRef<(StudyClockRange & { date: string; mission: boolean }) | null>(null);

  // 非同期通信 ＆ 通知
  const [loading, setLoading] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationState[]>([]);

  // 選択中詳細データ
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // モーダル開閉ステート
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false); // 新規ユーザー(教師/生徒)個別登録モーダル
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState<boolean>(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [meetingStudentId, setMeetingStudentId] = useState('');
  const [meetingStudentQuery, setMeetingStudentQuery] = useState('');
  const [meetingWeekStart, setMeetingWeekStart] = useState(() => weekStartKey(todayDateKey()));
  const [progressClassroom, setProgressClassroom] = useState('ALL');
  const [progressSortKey, setProgressSortKey] = useState<'week' | 'month'>('week');
  const [progressSortDir, setProgressSortDir] = useState<'desc' | 'asc'>('desc');
  const [isStudentCsvModalOpen, setIsStudentCsvModalOpen] = useState<boolean>(false);
  const [isTeacherCsvModalOpen, setIsTeacherCsvModalOpen] = useState<boolean>(false);
  const [isMaterialCsvModalOpen, setIsMaterialCsvModalOpen] = useState<boolean>(false);
  const [isStudentEditModalOpen, setIsStudentEditModalOpen] = useState<boolean>(false);
  const [isTeacherEditModalOpen, setIsTeacherEditModalOpen] = useState<boolean>(false);
  const [studentPasswordsVisible, setStudentPasswordsVisible] = useState<boolean>(false);
  const [teacherPasswordsVisible, setTeacherPasswordsVisible] = useState<boolean>(false);
  const [isNoticeListOpen, setIsNoticeListOpen] = useState<boolean>(false);
  const [activeNotice, setActiveNotice] = useState<StudentMessage | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  // 新規ユーザー(教師・生徒・管理者)個別追加フォーム
  const [newUserForm, setNewUserForm] = useState<User>(blankUserForm());
  const [studentEditForm, setStudentEditForm] = useState<User>(blankUserForm());
  const [editingStudentOriginalId, setEditingStudentOriginalId] = useState<string>('');
  const [studentFieldFilters, setStudentFieldFilters] = useState<Record<StudentListFilterKey, string>>({
    name: 'ALL',
    grade: 'ALL',
    highSchool: 'ALL',
    classroom: 'ALL',
    role: 'ALL',
    id: 'ALL',
    password: 'ALL',
    english: 'ALL',
    math: 'ALL',
    japanese: 'ALL',
    classicJp: 'ALL',
    physics: 'ALL',
    chemistry: 'ALL',
    biology: 'ALL',
    japaneseHistory: 'ALL',
    worldHistory: 'ALL',
    individual: 'ALL',
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [pendingDeleteSelectedIds, setPendingDeleteSelectedIds] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState<string>('');

  // CSVインポート用ステート
  const [csvImportKind, setCsvImportKind] = useState<'student' | 'teacher'>('student');
  const [csvUploading, setCsvUploading] = useState<boolean>(false);
  const [csvParsedPreview, setCsvParsedPreview] = useState<User[]>([]);
  const [csvValidationErrors, setCsvValidationErrors] = useState<CsvRowError[]>([]);
  const [csvStatusMessage, setCsvStatusMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({
    type: null,
    text: '',
  });

  const [materialCsvUploading, setMaterialCsvUploading] = useState<boolean>(false);
  const [materialCsvParsedPreview, setMaterialCsvParsedPreview] = useState<Material[]>([]);
  const [materialCsvStatusMessage, setMaterialCsvStatusMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({
    type: null,
    text: '',
  });

  // 新規教材登録フォーム (教科指定)
  const [newMaterialForm, setNewMaterialForm] = useState<{
    id: string;
    title: string;
    subject: SubjectCode | '';
    difficulty: 'basic' | 'standard' | 'advanced';
    description: string;
    created_by: string;
  }>({
    id: '',
    title: '',
    subject: '',
    difficulty: 'standard',
    description: '',
    created_by: '',
  });

  // サクサク学習記録フォーム (ミッション完了トグル付)
  const [newLogForm, setNewLogForm] = useState<{
    user_id: string;
    subject: string;
    material_id: string;
    score: number;
    max_score: number;
    time_spent_minutes: number;
    is_mission_completed: boolean;
    comment: string;
  }>({
    user_id: '',
    subject: '',
    material_id: '',
    score: 0,
    max_score: 100,
    time_spent_minutes: 0,
    is_mission_completed: false,
    comment: '',
  });

  // ---------------------------------------------------------------------------
  // 通知ヘルパー
  // ---------------------------------------------------------------------------

  const addNotification = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setNotifications((prev) => [{ id, type, message, timestamp: new Date().toLocaleTimeString('ja-JP') }, ...prev.slice(0, 4)]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // Supabase 完全安全データ取得 (全個別カラム直接要求を排出しフォールバック補完)
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async (): Promise<User[]> => {
    const [teachers, students] = await Promise.all([
      selectAllRows(supabase, 'teachers'),
      selectAllRows(supabase, 'students'),
    ]);
    if (teachers.error) {
      console.error(teachers.error);
      alert('通信エラー: ' + (teachers.error.message || '教師の取得に失敗しました'));
    }
    if (students.error) {
      console.error(students.error);
      alert('通信エラー: ' + (students.error.message || '生徒の取得に失敗しました'));
    }
    if (teachers.error && students.error) {
      throw new Error(teachers.error.message || students.error.message || 'ユーザーデータの取得失敗');
    }
    const teacherUsers = (teachers.data || []).flatMap((row: any) => {
      const id = textCell(row?.id).trim();
      if (!id) return [];
      const role = resolveAppRole(row?.role, id);
      if (textCell(row?.role).trim() || isKnownAdminIdentity(id)) rememberUserRole(id, role);
      return [{
        ...emptyStudentProfile(),
        id,
        name: textCell(row?.name) || '名前未設定',
        role,
        classroom: textCell(row?.branch_id),
        password: textCell(row?.password),
      }];
    });
    const studentUsers = (students.data || []).flatMap((row: any) => {
      const id = textCell(row?.id).trim();
      if (!id) return [];
      return [{
        ...emptyStudentProfile(),
        id,
        name: textCell(row?.name) || '名前未設定',
        role: 'student' as const,
        classroom: textCell(row?.branch_id),
        password: textCell(row?.password),
        grade: textCell(row?.grade),
        highSchool: textCell(row?.high_school),
        english: textCell(row?.english),
        math: textCell(row?.math),
        japanese: textCell(row?.modern_jp),
        classicJp: textCell(row?.classic_jp),
        physics: textCell(row?.physics),
        chemistry: textCell(row?.chemistry),
        biology: textCell(row?.biology),
        japaneseHistory: textCell(row?.jp_history),
        worldHistory: textCell(row?.world_history),
        individual: textCell(row?.individual),
        isPendingDelete: row?.is_pending_delete === true,
      }];
    });
    return [...teacherUsers, ...studentUsers];
  }, [supabase]);

  const materialViewerRef = useRef<User | null>(null);
  materialViewerRef.current = currentUser;

  const fetchMaterials = useCallback(async (): Promise<Material[]> => {
    const viewer = materialViewerRef.current || readAppSession();
    const studentView = Boolean(viewer && resolveAppRole(viewer.role, viewer.id, viewer.email) === 'student');
    try {
      const loaded = await selectMaterialMaster(supabase);
      if (loaded.error) {
        reportMaterialError(loaded.error, '教材の取得に失敗しました');
        return [];
      }
      let favoriteIds = new Set<string>();
      if (studentView && viewer) {
        const favorites = await selectStudentFavoriteIds(supabase, viewer.id);
        if (favorites.error) {
          reportMaterialError(favorites.error, 'お気に入りの取得に失敗しました');
        } else if (favorites.ids) {
          favoriteIds = favorites.ids;
        }
      }
      const list: Material[] = [];
      loaded.data.forEach((row: any) => {
        const id = String(row.id ?? '').trim();
        const title = String(row.title ?? '').trim();
        if (!id || !title) return;
        const ownerId = textCell(row?.owner_student_id).trim();
        const custom = row?.is_custom === true;
        if (studentView && viewer && custom && ownerId !== viewer.id) return;
        const code = isSubjectCode(row?.subject) ? subjectCodeFromInput(row?.subject) : null;
        const subject = code ? SUBJECT_CODE_TONE[code] : (subjectFromInput(row?.subject) || 'その他');
        list.push({
          id,
          title,
          subject,
          subject_code: code,
          created_by: '',
          description: row.description == null ? undefined : String(row.description),
          color: subjectSetting(code || subject).color,
          display_order: readDisplayOrder(row.order_index),
          is_favorite: favoriteIds.has(id),
          is_custom: custom,
          owner_student_id: ownerId || null,
        });
      });
      if (!studentView) return bySubjectThenOrder(list);
      return [...list].sort((a, b) => {
        const fav = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
        if (fav !== 0) return fav;
        if (a.display_order == null && b.display_order == null) return 0;
        if (a.display_order == null) return 1;
        if (b.display_order == null) return -1;
        return a.display_order - b.display_order;
      });
    } catch (error) {
      reportMaterialError(error, '教材の取得に失敗しました');
      return [];
    }
  }, [supabase]);

  const reloadMaterials = useCallback(async () => {
    const list = await fetchMaterials();
    setMaterials(list);
  }, [fetchMaterials]);

  const fetchStudentMessages = useCallback(async (options?: { silent?: boolean }): Promise<StudentMessage[] | null> => {
    const remote = await selectAllRows(supabase, 'teacher_messages');
    if (remote.error) {
      console.error(remote.error);
      if (!options?.silent) alert('通信エラー: ' + (remote.error.message || 'メッセージの取得に失敗しました'));
      return options?.silent ? null : [];
    }
    return (remote.data || []).flatMap((row: any) => {
      const message = messageFromStoredRow(row);
      return message ? [message] : [];
    });
  }, [supabase]);

  const refreshTeacherMessages = useCallback(async () => {
    const loaded = await fetchStudentMessages({ silent: true });
    if (loaded == null) return;
    setMessages((prev) => loaded.map((message) => {
      const existing = prev.find((item) => item.id === message.id);
      if (existing?.read_at && !message.read_at) return { ...message, read_at: existing.read_at };
      return message;
    }));
  }, [fetchStudentMessages]);

  const fetchLogs = useCallback(async (): Promise<StudyLog[]> => {
    const { data, error } = await supabase.from('study_logs').select('id, student_id, material_id, subject, duration_minutes, study_date, memo, is_mission_completed, start_time, end_time');
    if (error) {
      console.error(error);
      alert('通信エラー: ' + (error.message || '学習ログの取得に失敗しました'));
      throw new Error(error.message || '学習ログの取得失敗');
    }
    return (data || []).flatMap((row: any) => {
      const id = textCell(row?.id).trim();
      const userId = textCell(row?.student_id).trim();
      if (!id || !userId) return [];
      const minutes = Number(row?.duration_minutes ?? 0);
      return [{
        id,
        user_id: userId,
        material_id: textCell(row?.material_id),
        score: 0,
        max_score: 100,
        time_spent_minutes: Number.isFinite(minutes) ? minutes : 0,
        is_mission_completed: row?.is_mission_completed === true,
        comment: row?.memo == null ? '' : String(row.memo),
        created_at: row?.study_date ? String(row.study_date) : undefined,
        start_time: row?.start_time == null || row?.start_time === '' ? undefined : String(row.start_time),
        end_time: row?.end_time == null || row?.end_time === '' ? undefined : String(row.end_time),
        subject: row?.subject == null || row?.subject === '' ? undefined : String(row.subject),
      }];
    });
  }, [supabase]);

  const fetchAllData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    setGlobalError(null);
    try {
      const uData = await fetchUsers();
      setUsers(uData);
      setUsersReady(true);
      const [mData, lData] = await Promise.all([
        fetchMaterials(),
        fetchLogs(),
      ]);
      setMaterials(mData);
      setLogs((prev) => (lData.length === 0 && prev.length > 0 ? prev : lData));
      const loadedMessages = await fetchStudentMessages();
      if (loadedMessages) setMessages(loadedMessages);
      setConnectionError(null);
    } catch (err: any) {
      setConnectionError('通信エラーが発生しました');
      setGlobalError(err.message || '通信エラーが発生しました');
      if (!silent) addNotification('error', '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [fetchUsers, fetchMaterials, fetchLogs, fetchStudentMessages, addNotification]);

  useEffect(() => {
    void fetchAllData({ silent: true });
  }, [fetchAllData]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') return;
    let lastRefresh = 0;
    const refreshOnReturn = () => {
      const now = Date.now();
      if (now - lastRefresh < 1000) return;
      lastRefresh = now;
      void refreshTeacherMessages();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshOnReturn();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshOnReturn);
    const timer = window.setInterval(() => { void refreshTeacherMessages(); }, 45000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshOnReturn);
      window.clearInterval(timer);
    };
  }, [currentUser, refreshTeacherMessages]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student' || !supabaseEnvConfigured()) return;
    const studentId = currentUser.id.trim();
    const applyChange = (row: unknown) => {
      const message = messageFromStoredRow(row);
      if (!message || message.user_id.trim().toLowerCase() !== studentId.toLowerCase()) return;
      setMessages((prev) => {
        const existing = prev.find((item) => item.id === message.id);
        const next = existing?.sender_name && message.sender_name === '講師'
          ? { ...message, sender_name: existing.sender_name }
          : message;
        return [next, ...prev.filter((item) => item.id !== message.id)];
      });
    };
    const channel = supabase
      .channel(`teacher-messages-${studentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'teacher_messages', filter: `student_id=eq.${studentId}` }, (payload) => applyChange(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teacher_messages', filter: `student_id=eq.${studentId}` }, (payload) => applyChange(payload.new))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUser, supabase]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    void (async () => {
      const list = await fetchMaterials();
      if (!cancelled) setMaterials(list);
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, fetchMaterials]);

  useEffect(() => {
    if (readExplicitLogout()) {
      clearStoredLoginSession();
      setSessionChecked(true);
      return;
    }
    const saved = readAppSession();
    if (saved) {
      setCurrentUser(saved);
      setActiveTab(saved.role === 'student' ? 'schedule_planner' : 'dashboard');
      setSessionChecked(true);
      return;
    }
    if (!supabaseEnvConfigured()) {
      setSessionChecked(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session?.user?.email) return;
      const email = data.session.user.email;
      const restored: User = {
        id: email,
        name: String(data.session.user.user_metadata?.name || email),
        role: 'student',
        classroom: '本川越校',
        password: '',
        email,
        ...emptyStudentProfile(),
      };
      writeAppSession(restored);
      setCurrentUser(restored);
      setActiveTab('schedule_planner');
    }).catch(() => {
      if (active) setConnectionError('通信エラーが発生しました');
    }).finally(() => {
      if (active) setSessionChecked(true);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (currentUser?.role !== 'admin' && newUserForm.role === 'admin') {
      setNewUserForm((prev) => (prev.role === 'admin' ? { ...prev, role: 'student' } : prev));
    }
  }, [currentUser, newUserForm.role]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const templates = await fetchGlobalScheduleTemplates(supabase);
        if (cancelled || !templates) return;
        setStaffTemplates(templates);
        if (!currentUser) return;
        const role = resolveAppRole(currentUser.role, currentUser.id);
        const staff = role === 'admin' || role === 'teacher';
        if (staff) {
          setMySchedules([]);
          setSelectedMyScheduleId(null);
          setSelectedStaffTemplateId('plain');
          setScheduleSlots(cloneScheduleSlots(templates.plain));
          return;
        }
        const mine = await fetchStudentScheduleTemplates(supabase, currentUser.id);
        if (cancelled || !mine) return;
        setMySchedules(mine);
        setSelectedMyScheduleId(null);
        setScheduleSlots([]);
        setWeeklyGoalMinutes(readWeeklyGoalMinutes(currentUser.id));
        setNoticesExpanded(false);
      } catch (error: any) {
        if (!cancelled) alertScheduleError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, supabase]);

  const saveUserWithProfile = useCallback(async (user: User): Promise<string | null> => {
    const profile = pickStudentProfile(user);
    const safeRole: UserRole = resolveAppRole(user.role, user.id, user.email);
    const normalized: User = {
      ...blankUserForm(safeRole),
      ...user,
      ...profile,
      id: String(user.id || '').trim(),
      name: String(user.name || '').trim(),
      role: safeRole,
      classroom: String(user.classroom || '本川越校'),
      password: String(user.password || '').trim(),
    };
    if (!normalized.id || !normalized.name) return '独自IDと氏名は必須です。';

    const studentRow = {
      id: normalized.id,
      name: normalized.name,
      high_school: normalized.highSchool ?? '',
      grade: normalized.grade ?? '',
      branch_id: normalized.classroom ?? '',
      password: normalized.password ?? '',
      math: normalized.math ?? '',
      english: normalized.english ?? '',
      modern_jp: normalized.japanese ?? '',
      classic_jp: normalized.classicJp ?? '',
      physics: normalized.physics ?? '',
      chemistry: normalized.chemistry ?? '',
      biology: normalized.biology ?? '',
      jp_history: normalized.japaneseHistory ?? '',
      world_history: normalized.worldHistory ?? '',
      individual: normalized.individual ?? '',
    };
    const teacherRow = {
      id: normalized.id,
      name: normalized.name,
      branch_id: normalized.classroom ?? '',
      role: normalized.role,
      password: normalized.password ?? '',
    };
    try {
      const table = normalized.role === 'student' ? 'students' : 'teachers';
      const result = await supabase.from(table).upsert([normalized.role === 'student' ? studentRow : teacherRow], { onConflict: 'id' });
      if (result.error) return result.error.message || 'データベース保存に失敗しました';
      return null;
    } catch (err: any) {
      return err?.message || '保存処理でエラーが発生しました';
    }
  }, [supabase]);

  // 教師・生徒の手動個別追加処理
  const handleCreateUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.id || !newUserForm.name) {
      alert('独自IDと氏名は必須項目です。');
      return;
    }

    const requestedId = newUserForm.id.trim();
    const existingUser = users.find((u) => u.id.toLowerCase() === requestedId.toLowerCase());
    if (
      currentUser?.role !== 'admin' &&
      (newUserForm.role === 'admin' || existingUser?.role === 'admin')
    ) {
      alert('管理者以外は admin 権限のユーザーを作成・更新できません。');
      return;
    }

    try {
      const dbError = await saveUserWithProfile({ ...newUserForm, id: requestedId });
      if (dbError) {
        console.error(dbError);
        alert('通信エラー: ' + dbError);
        return;
      }
      addNotification('success', `新規ユーザー「${newUserForm.name}（${newUserForm.role}）」を追加登録いたしました！`);
      setIsUserModalOpen(false);
      setNewUserForm(blankUserForm());
      if (!dbError) await fetchAllData({ silent: true });
    } catch (err: any) {
      alert(`ユーザー登録エラー: ${err.message}`);
    }
  }, [newUserForm, users, currentUser, saveUserWithProfile, fetchAllData, addNotification]);

  const openStudentEditModal = useCallback((student: User) => {
    setEditingStudentOriginalId(student.id);
    setStudentEditForm({ ...blankUserForm(student.role), ...student, password: student.password || '' });
    setIsTeacherEditModalOpen(false);
    setIsStudentEditModalOpen(true);
  }, []);

  const openTeacherEditModal = useCallback((teacher: User) => {
    setEditingStudentOriginalId(teacher.id);
    setStudentEditForm({ ...blankUserForm(teacher.role), ...teacher, password: teacher.password || '' });
    setIsStudentEditModalOpen(false);
    setIsTeacherEditModalOpen(true);
  }, []);

  const replaceEditedUser = useCallback((originalId: string, saved: User) => {
    setUsers((prev) => {
      const oldIndex = prev.findIndex((user) => user.id === originalId || user.id === saved.id);
      const rest = prev.filter((user) => user.id !== originalId && user.id !== saved.id);
      const insertAt = oldIndex < 0 ? rest.length : Math.min(oldIndex, rest.length);
      rest.splice(insertAt, 0, saved);
      return rest;
    });
    if (currentUser && (currentUser.id === originalId || currentUser.id === saved.id)) {
      setCurrentUser(saved);
    }
  }, [currentUser]);

  const handleSaveTeacherEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const nextId = studentEditForm.id.trim();
    const nextName = studentEditForm.name.trim();
    if (!nextId || !nextName) {
      alert('氏名と独自IDは必須項目です。');
      return;
    }
    const nextRole: UserRole = studentEditForm.role === 'admin' ? 'admin' : 'teacher';
    const original = users.find((user) => user.id === editingStudentOriginalId);
    const idTaken = users.some((user) => user.id !== editingStudentOriginalId && user.id.toLowerCase() === nextId.toLowerCase());
    if (idTaken) {
      alert('その独自IDはすでに使われています。');
      return;
    }
    const saved: User = {
      ...(original || blankUserForm(nextRole)),
      ...studentEditForm,
      id: nextId,
      name: nextName,
      classroom: studentEditForm.classroom,
      role: nextRole,
      password: studentEditForm.password.trim(),
    };
    replaceEditedUser(editingStudentOriginalId, saved);

    try {
      const dbError = await saveUserWithProfile(saved);
      if (dbError) {
        console.error(dbError);
        alert('通信エラー: ' + dbError);
        return;
      }
      if (editingStudentOriginalId && editingStudentOriginalId !== nextId) {
        await supabase.from('teachers').delete().eq('id', editingStudentOriginalId);
      }
      replaceEditedUser(editingStudentOriginalId, saved);
      addNotification('success', `教師「${saved.name}」の情報を更新いたしました。`);
      setIsTeacherEditModalOpen(false);
    } catch (err: any) {
      replaceEditedUser(editingStudentOriginalId, saved);
      alert(`教師情報の更新エラー: ${err.message}`);
    }
  }, [studentEditForm, editingStudentOriginalId, users, saveUserWithProfile, supabase, addNotification, replaceEditedUser]);

  const handleDeleteTeacher = useCallback(async (teacher: User) => {
    if (!window.confirm(`「${teacher.name}」を削除しますか？`)) return;
    setUsers((prev) => prev.filter((user) => user.id !== teacher.id));
    if (selectedStudentId === teacher.id) setSelectedStudentId(null);
    const profiles = readLocalProfiles();
    delete profiles[teacher.id];
    writeLocalJson(STUDENT_PROFILE_STORAGE_KEY, profiles);
    const passwords = readLocalPasswords();
    delete passwords[teacher.id];
    writeLocalJson(USER_PASSWORD_STORAGE_KEY, passwords);
    const { error } = await supabase.from('teachers').delete().eq('id', teacher.id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    addNotification('success', `「${teacher.name}」を削除いたしました。`);
  }, [selectedStudentId, supabase, addNotification]);

  const handleSaveStudentEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const nextId = studentEditForm.id.trim();
    if (!nextId || !studentEditForm.name.trim()) {
      alert('氏名と独自IDは必須項目です。');
      return;
    }
    const idTaken = users.some((user) => user.id !== editingStudentOriginalId && user.id.toLowerCase() === nextId.toLowerCase());
    if (idTaken) {
      alert('その独自IDはすでに使われています。');
      return;
    }

    try {
      const dbError = await saveUserWithProfile({ ...studentEditForm, id: nextId, role: 'student', password: studentEditForm.password.trim() });
      if (dbError) {
        console.error(dbError);
        alert('通信エラー: ' + dbError);
        return;
      }
      if (editingStudentOriginalId && editingStudentOriginalId !== nextId) {
        await supabase.from('students').delete().eq('id', editingStudentOriginalId);
        const profiles = readLocalProfiles();
        delete profiles[editingStudentOriginalId];
        writeLocalJson(STUDENT_PROFILE_STORAGE_KEY, profiles);
        const passwords = readLocalPasswords();
        if (passwords[editingStudentOriginalId] && !passwords[nextId]) passwords[nextId] = passwords[editingStudentOriginalId];
        delete passwords[editingStudentOriginalId];
        writeLocalJson(USER_PASSWORD_STORAGE_KEY, passwords);
        const movedMessages = readLocalMessages().map((message) => (
          message.user_id === editingStudentOriginalId ? { ...message, user_id: nextId } : message
        ));
        writeLocalMessages(movedMessages);
        setMessages((prev) => prev.map((message) => (
          message.user_id === editingStudentOriginalId ? { ...message, user_id: nextId } : message
        )));
        await supabase.from('student_messages').update({ user_id: nextId }).eq('user_id', editingStudentOriginalId);
        setSelectedStudentIds((prev) => prev.map((id) => (id === editingStudentOriginalId ? nextId : id)));
        setUsers((prev) => prev.filter((user) => user.id !== editingStudentOriginalId));
      }
      addNotification('success', `生徒「${studentEditForm.name}」の情報を更新いたしました。`);
      setIsStudentEditModalOpen(false);
      setIsTeacherEditModalOpen(false);
      if (!dbError) await fetchAllData({ silent: true });
    } catch (err: any) {
      alert(`情報の更新エラー: ${err.message}`);
    }
  }, [studentEditForm, editingStudentOriginalId, users, saveUserWithProfile, supabase, fetchAllData, addNotification]);

  const handleDeleteStudent = useCallback(async (student: User) => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'teacher') {
      alert('生徒の削除は管理者・講師のみ実行できます。');
      return;
    }
    const confirmed = window.confirm('この生徒のデータを削除待ち一覧へ移動しますか？');
    if (!confirmed) return;

    const { error } = await supabase.from('students').update({ is_pending_delete: true }).eq('id', student.id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    setUsers((prev) => prev.map((user) => (user.id === student.id ? { ...user, isPendingDelete: true } : user)));
    setSelectedStudentIds((prev) => prev.filter((id) => id !== student.id));
    if (selectedStudentId === student.id) setSelectedStudentId(null);
    addNotification('success', `「${student.name}」を削除待ち一覧へ移動しました。`);
  }, [currentUser, selectedStudentId, supabase, addNotification]);

  const selectedPendingDeleteStudents = useCallback((selectedIds: string[]) => {
    return users.filter((user) => user.role === 'student' && user.isPendingDelete && selectedIds.includes(user.id));
  }, [users]);

  const handlePurgePendingStudents = useCallback(async () => {
    if (currentUser?.role !== 'admin') {
      alert('完全消去は管理者のみ実行できます。');
      return;
    }
    const targets = selectedPendingDeleteStudents(pendingDeleteSelectedIds);
    if (targets.length === 0) {
      alert('完全に消去する生徒を選択してください。');
      return;
    }
    const confirmed = window.confirm('⚠️ 選択した生徒のデータを完全に消去します。この操作は取り消せません。よろしいですか？');
    if (!confirmed) return;

    const ids = targets.map((student) => student.id);
    const { error } = await supabase.from('students').delete().in('id', ids);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    setUsers((prev) => prev.filter((user) => !ids.includes(user.id)));
    setPendingDeleteSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    setSelectedStudentIds((prev) => prev.filter((id) => !ids.includes(id)));
    if (selectedStudentId && ids.includes(selectedStudentId)) setSelectedStudentId(null);
    const profiles = readLocalProfiles();
    ids.forEach((id) => {
      delete profiles[id];
    });
    writeLocalJson(STUDENT_PROFILE_STORAGE_KEY, profiles);
    writeLocalMessages(readLocalMessages().filter((message) => !ids.includes(message.user_id)));
    setMessages((prev) => prev.filter((message) => !ids.includes(message.user_id)));
    addNotification('success', `${targets.length}名の生徒データを完全に消去しました。`);
  }, [currentUser, pendingDeleteSelectedIds, selectedPendingDeleteStudents, selectedStudentId, supabase, addNotification]);

  const handleRestorePendingStudents = useCallback(async () => {
    if (currentUser?.role !== 'admin') {
      alert('復元は管理者のみ実行できます。');
      return;
    }
    const targets = selectedPendingDeleteStudents(pendingDeleteSelectedIds);
    if (targets.length === 0) {
      alert('通常の一覧へ戻す生徒を選択してください。');
      return;
    }
    const ids = targets.map((student) => student.id);
    const { error } = await supabase.from('students').update({ is_pending_delete: false }).in('id', ids);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    setUsers((prev) => prev.map((user) => (ids.includes(user.id) ? { ...user, isPendingDelete: false } : user)));
    setPendingDeleteSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    addNotification('success', `${targets.length}名を通常の生徒一覧へ戻しました。`);
  }, [currentUser, pendingDeleteSelectedIds, selectedPendingDeleteStudents, supabase, addNotification]);

  const handleSendStudentMessages = useCallback(async () => {
    const text = messageDraft.trim();
    if (!text) {
      alert('送信するコメントを入力してください。');
      return;
    }
    if (selectedStudentIds.length === 0) {
      alert('送信先の生徒を選択してください。');
      return;
    }

    const teacherId = String(currentUser?.id || '').trim();
    try {
      const rows = selectedStudentIds.map((studentId) => ({
        student_id: studentId,
        teacher_id: teacherId || null,
        message_content: text,
        is_read: false,
      }));
      const { data, error } = await supabase
        .from('teacher_messages')
        .insert(rows)
        .select('id, student_id, teacher_id, message_content, is_read, created_at');
      if (error) throw error;
      const created = (data || []).flatMap((row: any) => {
        const message = messageFromStoredRow(row);
        return message ? [{ ...message, sender_name: currentUser?.name || '講師' }] : [];
      });
      setMessageDraft('');
      setMessages((prev) => [...created, ...prev]);
    } catch (error: any) {
      console.error(error);
      alert('送信失敗: ' + (error?.message || 'メッセージの送信に失敗しました'));
    }
  }, [currentUser, messageDraft, selectedStudentIds, supabase]);

  const markMessageAsRead = useCallback(async (message: StudentMessage) => {
    if (message.read_at) return;
    const readAt = new Date().toISOString();
    setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, read_at: readAt } : item)));
    const { error } = await supabase.from('teacher_messages').update({ is_read: true }).eq('id', message.id).eq('student_id', message.user_id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      const loadedMessages = await fetchStudentMessages();
      if (loadedMessages) setMessages(loadedMessages);
    }
  }, [supabase, fetchStudentMessages]);

  const markMyTeacherMessagesRead = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'student') return;
    const studentId = currentUser.id.trim();
    const readAt = new Date().toISOString();
    setMessages((prev) => prev.map((item) => (
      item.user_id.trim().toLowerCase() === studentId.toLowerCase() && !item.read_at
        ? { ...item, read_at: readAt }
        : item
    )));
    const { error } = await supabase.from('teacher_messages').update({ is_read: true }).eq('student_id', studentId).eq('is_read', false);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      const loadedMessages = await fetchStudentMessages();
      if (loadedMessages) setMessages(loadedMessages);
    }
  }, [currentUser, supabase, fetchStudentMessages]);

  const hideTeacherMessage = useCallback(async (message: StudentMessage) => {
    setMessages((prev) => prev.filter((item) => item.id !== message.id));
    setActiveNotice((current) => (current?.id === message.id ? null : current));
    const { error } = await supabase.from('teacher_messages').delete().eq('id', message.id).eq('student_id', message.user_id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      const loadedMessages = await fetchStudentMessages();
      if (loadedMessages) setMessages(loadedMessages);
    }
  }, [supabase, fetchStudentMessages]);

  const openNoticeDetail = useCallback((message: StudentMessage) => {
    setActiveNotice({ ...message, read_at: message.read_at || new Date().toISOString() });
    void markMessageAsRead(message);
  }, [markMessageAsRead]);

  const rememberSignedIn = (signedIn: User) => {
    clearExplicitLogout();
    writeAppSession(signedIn);
    setCurrentUser(signedIn);
  };

  // 独自IDによるログイン実行処理
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const inputIdClean = toHalfWidthAscii(loginInputId).trim();
    const inputPassword = toHalfWidthAscii(loginPassword).trim();
    if (!inputIdClean || !inputPassword) {
      setLoginError('独自IDとパスワードを入力してください。');
      return;
    }
    if (!supabaseEnvConfigured() && !isBuiltinAdminLogin(inputIdClean, inputPassword)) {
      setLoginError('通信エラーが発生しました');
      return;
    }

    if (isBuiltinAdminLogin(inputIdClean, inputPassword)) {
      const signedIn: User = {
        id: BUILTIN_ADMIN_ID,
        name: '管理者',
        role: 'admin',
        classroom: '本川越校',
        password: BUILTIN_ADMIN_PASSWORD,
        email: BUILTIN_ADMIN_ID,
        ...emptyStudentProfile(),
      };
      rememberUserRole(BUILTIN_ADMIN_ID, 'admin');
      rememberSignedIn(signedIn);
      setActiveTab('dashboard');
      setStudyComposer(null);
      setEditingLog(null);
      setOpenHinaSlot(null);
      setWeekPickerStart(null);
      setCrownBurst(null);
      addNotification('success', '管理者としてログインいたしました。');
      return;
    }

    if (supabaseEnvConfigured() && inputIdClean.includes('@')) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: inputIdClean,
          password: inputPassword,
        });
        if (error) {
          const detail = `${error.name || ''} ${error.message || ''}`.toLowerCase();
          if (detail.includes('fetch') || detail.includes('network') || detail.includes('failed to fetch')) {
            setLoginError('通信エラーが発生しました');
            return;
          }
        } else if (data.session?.user?.email) {
          const email = data.session.user.email;
          const authMatch = users.find((user) => user.id.toLowerCase() === email.toLowerCase() || (user.email || '').toLowerCase() === email.toLowerCase());
          if (authMatch) {
            const role = resolveAppRole(authMatch.role, authMatch.id, authMatch.email || email);
            const signedIn = { ...authMatch, role, password: '' };
            rememberUserRole(authMatch.id, role);
            rememberSignedIn(signedIn);
            setActiveTab(role === 'student' ? 'schedule_planner' : 'dashboard');
            setStudyComposer(null);
            setEditingLog(null);
            setOpenHinaSlot(null);
            setWeekPickerStart(null);
            setCrownBurst(null);
            addNotification('success', `${authMatch.name} さん（${role}）としてログインいたしました。`);
            return;
          }
          const signedIn: User = {
            id: email,
            name: String(data.session.user.user_metadata?.name || email),
            role: 'student',
            classroom: '本川越校',
            password: '',
            email,
            ...emptyStudentProfile(),
          };
          rememberSignedIn(signedIn);
          setActiveTab('schedule_planner');
          setStudyComposer(null);
          setEditingLog(null);
          setOpenHinaSlot(null);
          setWeekPickerStart(null);
          setCrownBurst(null);
          addNotification('success', `${signedIn.name} さん（student）としてログインいたしました。`);
          return;
        }
      } catch {
        setLoginError('通信エラーが発生しました');
        return;
      }
    }

    const inputKey = inputIdClean.toLowerCase();
    const matched = users.find((u) => u.id.toLowerCase() === inputKey || (u.email || '').toLowerCase() === inputKey);
    if (matched) {
      if (!acceptsLoginPassword(matched.id, matched.password || '', inputPassword)) {
        setLoginError('IDまたはパスワードが違います');
        return;
      }
      const role = resolveAppRole(matched.role, matched.id, matched.email || inputIdClean);
      const signedIn = {
        ...matched,
        role,
        password: matched.password?.trim() ? matched.password : inputPassword,
      };
      rememberUserRole(matched.id, role);
      if (!matched.password?.trim()) {
        saveLocalPassword(matched.id, inputPassword);
        setUsers((prev) => prev.map((user) => (user.id === matched.id ? signedIn : user)));
        void saveUserWithProfile(signedIn);
      }
      rememberSignedIn(signedIn);
      setActiveTab(role === 'student' ? 'schedule_planner' : 'dashboard');
      setStudyComposer(null);
      setEditingLog(null);
      setOpenHinaSlot(null);
      setWeekPickerStart(null);
      setCrownBurst(null);
      addNotification('success', `${matched.name} さん（${role}）としてログインいたしました。`);
      return;
    }

    if (!usersReady) {
      setLoginError(connectionError || '通信エラーが発生しました');
      return;
    }
    if (inputPassword !== inputIdClean && inputPassword !== DEFAULT_LOGIN_PASSWORD) {
      setLoginError('IDまたはパスワードが違います');
      return;
    }
    const privilegedAdmin = isKnownAdminIdentity(inputIdClean);
    const newSessionUser: User = {
      id: inputIdClean,
      name: privilegedAdmin ? '管理者' : `ユーザー_${inputIdClean}`,
      role: privilegedAdmin ? 'admin' : 'student',
      classroom: '本川越校',
      password: inputPassword,
      email: privilegedAdmin ? inputIdClean : undefined,
      ...emptyStudentProfile(),
    };
    if (privilegedAdmin) rememberUserRole(inputIdClean, 'admin');
    rememberSignedIn(newSessionUser);
    setActiveTab(privilegedAdmin ? 'dashboard' : 'schedule_planner');
    if (privilegedAdmin) {
      setStudyComposer(null);
      setEditingLog(null);
      setOpenHinaSlot(null);
      setWeekPickerStart(null);
      setCrownBurst(null);
    }
    addNotification(privilegedAdmin ? 'success' : 'info', privilegedAdmin ? '管理者としてログインいたしました。' : `独自ID [${inputIdClean}] でログインいたしました。`);
  };

  const handleLogout = () => {
    clearAppSession();
    setCurrentUser(null);
    setWeekPlans({});
    setWeekCramMinutes({});
    setWeekPlansResolved(false);
    loadedWeekPlanUser.current = '';
    setLoginInputId('');
    setLoginPassword('');
    setLoginPasswordVisible(false);
    void supabase.auth.signOut();
    addNotification('info', 'ログアウトいたしました。');
  };

  const handleStudentLogout = async () => {
    if (!window.confirm('ログアウトしますか？')) return;
    try {
      writeExplicitLogout();
      clearStoredLoginSession();
      clearActiveStudyClock();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      console.error(error);
      alert('ログアウトに失敗しました: ' + (error?.message || String(error)));
    } finally {
      setCurrentUser(null);
      setWeekPlans({});
      setWeekCramMinutes({});
      setWeekPlansResolved(false);
      loadedWeekPlanUser.current = '';
      setLoginInputId('');
      setLoginPassword('');
      setLoginPasswordVisible(false);
      setLoginError(null);
    }
  };

  const weekPlanSaveChain = useRef(Promise.resolve());
  const weekPlanWriteVersion = useRef<Record<string, number>>({});
  const weekPlanPending = useRef<Record<string, { version: number; plans: Record<string, WeekPlanRecord> }>>({});
  const loadedWeekPlanUser = useRef('');
  const viewedWeekPlanUser = useRef('');

  const persistWeekPlans = useCallback((userId: string, plans: Record<string, WeekPlanRecord>) => {
    const version = (weekPlanWriteVersion.current[userId] || 0) + 1;
    weekPlanWriteVersion.current[userId] = version;
    weekPlanPending.current[userId] = { version, plans };
    setWeekPlans(plans);
    setWeekCramMinutes(Object.fromEntries(Object.entries(plans).map(([weekStart, plan]) => [weekStart, weekCramSchoolMinutes(plan, weekStart)])));
    setWeekPlansResolved(true);
    weekPlanSaveChain.current = weekPlanSaveChain.current
      .then(async () => {
        const saved = await saveWeeklySchedules(supabase, userId, plans);
        const pending = weekPlanPending.current[userId];
        if (saved && pending?.version === version) delete weekPlanPending.current[userId];
      })
      .catch((error) => alertScheduleError(error));
  }, [supabase]);

  const refreshWeekPlans = useCallback(async (userId: string, applyToScreen: boolean) => {
    try {
      const seenVersion = weekPlanWriteVersion.current[userId] || 0;
      const remote = await fetchWeeklySchedules(supabase, userId);
      if ((weekPlanWriteVersion.current[userId] || 0) !== seenVersion) return;
      const pending = weekPlanPending.current[userId]?.plans;
      const plans = pending ?? remote?.plans;
      if (!plans) return;
      if (applyToScreen) {
        setWeekPlans(plans);
        setWeekCramMinutes(pending
          ? Object.fromEntries(Object.entries(pending).map(([weekStart, plan]) => [weekStart, weekCramSchoolMinutes(plan, weekStart)]))
          : (remote?.cramMinutes || {}));
        setWeekPlansResolved(true);
        return;
      }
      if (viewedWeekPlanUser.current !== userId) return;
      setViewedWeekPlans(plans);
    } catch (error: any) {
      alertScheduleError(error);
    }
  }, [supabase]);

  const persistMySchedules = (userId: string, items: MyScheduleFolderItem[]) => {
    setMySchedules(items);
    void saveStudentScheduleTemplates(supabase, userId, items);
  };

  const handleSelectStaffTemplate = (templateId: StaffScheduleTemplateId) => {
    setSelectedStaffTemplateId(templateId);
    setScheduleSlots(cloneScheduleSlots(slotsForHinaBase(templateId, staffTemplates)));
  };

  const handleSaveStaffTemplate = () => {
    const next = {
      ...staffTemplates,
      [selectedStaffTemplateId]: cloneScheduleSlots(scheduleSlots),
    };
    setStaffTemplates(next);
    const savedSlots = next[selectedStaffTemplateId];
    const name = STAFF_SCHEDULE_TEMPLATES.find((item) => item.id === selectedStaffTemplateId)?.name || 'ひな形';
    void saveGlobalScheduleTemplate(supabase, selectedStaffTemplateId, savedSlots).then((saved) => {
      if (saved) addNotification('success', `全体ひな形「${name}」を保存しました。`);
    });
  };

  const handleLoadTemplateForStudent = (templateId: StaffScheduleTemplateId) => {
    setSelectedMyScheduleId(null);
    setScheduleSlots(copyScheduleSlotsWithNewIds(slotsForHinaBase(templateId, staffTemplates)));
    const name = STAFF_SCHEDULE_TEMPLATES.find((item) => item.id === templateId)?.name || 'ひな形';
    addNotification('info', `「${name}」を読み込みました。`);
  };

  const handleApplyHinaBase = (templateId: StaffScheduleTemplateId) => {
    setHinaBaseId(templateId);
    setHinaApplySerial((value) => value + 1);
    setHinaDraftSlots(copyScheduleSlotsWithNewIds(slotsForHinaBase(templateId, staffTemplates)));
  };

  const handleOpenMySchedule = (item: MyScheduleFolderItem) => {
    setSelectedMyScheduleId(item.id);
    setScheduleSlots(cloneScheduleSlots(item.slots));
  };

  const handleSaveNewMySchedule = () => {
    if (!currentUser) return;
    const used = mySchedules.map((item) => {
      const matched = item.name.match(/^Myスケジュール(\d+)$/);
      return matched ? Number(matched[1]) : 0;
    });
    const nextNumber = Math.max(0, ...used) + 1;
    const created: MyScheduleFolderItem = {
      id: `my_${Date.now()}`,
      name: `Myスケジュール${nextNumber}`,
      slots: cloneScheduleSlots(scheduleSlots),
    };
    persistMySchedules(currentUser.id, [...mySchedules, created]);
    setSelectedMyScheduleId(created.id);
    addNotification('success', `「${created.name}」を保存しました。`);
  };

  const handleOverwriteMySchedule = () => {
    if (!currentUser || !selectedMyScheduleId) return;
    const next = mySchedules.map((item) => (
      item.id === selectedMyScheduleId ? { ...item, slots: cloneScheduleSlots(scheduleSlots) } : item
    ));
    persistMySchedules(currentUser.id, next);
    const name = next.find((item) => item.id === selectedMyScheduleId)?.name || 'Myスケジュール';
    addNotification('success', `「${name}」を上書き保存しました。`);
  };

  const handleSaveMyScheduleSlot = (slotNumber: number) => {
    if (!currentUser) return;
    const name = `Myスケジュール${slotNumber}`;
    const existing = mySchedules.find((item) => item.name === name);
    if (existing) {
      const next = mySchedules.map((item) => (
        item.id === existing.id ? { ...item, slots: cloneScheduleSlots(scheduleSlots) } : item
      ));
      persistMySchedules(currentUser.id, next);
      setSelectedMyScheduleId(existing.id);
      addNotification('success', `「${name}」を保存しました。`);
      return;
    }
    const created: MyScheduleFolderItem = {
      id: `my_${slotNumber}_${Date.now()}`,
      name,
      slots: cloneScheduleSlots(scheduleSlots),
    };
    persistMySchedules(currentUser.id, [...mySchedules, created]);
    setSelectedMyScheduleId(created.id);
    addNotification('success', `「${name}」を保存しました。`);
  };

  const saveMyHina = (slotNumber: number, slots: ScheduleSlot[], title: string) => {
    if (!currentUser) return;
    const existing = findMyHina(mySchedules, slotNumber);
    const name = title.trim() || `Myひな型${slotNumber}`;
    const savedSlots = cloneScheduleSlots(slots);
    const id = existing?.id || `my_hina_${slotNumber}_${Date.now()}`;
    const saved: MyScheduleFolderItem = { id, name, hinaSlot: slotNumber, slots: savedSlots };
    const previousNames = hinaMatchNames(existing, slotNumber);
    if (existing) {
      persistMySchedules(currentUser.id, mySchedules.map((item) => (item.id === existing.id ? saved : item)));
    } else {
      persistMySchedules(currentUser.id, [...mySchedules, saved]);
    }
    const nextPlans: Record<string, WeekPlanRecord> = { ...weekPlans };
    let keptCustomWeeks = 0;
    Object.entries(weekPlans).forEach(([weekStart, plan]) => {
      const linked = plan.templateId === id || previousNames.includes(plan.templateName);
      if (!linked) return;
      if (plan.is_customized) {
        keptCustomWeeks += 1;
        return;
      }
      nextPlans[weekStart] = writeWeekFromTemplate(plan, weekStart, id, name, savedSlots, true);
    });
    persistWeekPlans(currentUser.id, nextPlans);
    addNotification(
      'success',
      keptCustomWeeks > 0
        ? `「${name}」を登録しました。個別設定済みの週はそのまま残し、それ以外の今日以降へ反映しました。`
        : `「${name}」を登録し、今日以降の予定へ反映しました。`,
    );
    setOpenHinaSlot(null);
  };

  const applyHinaToWeek = (weekStart: string, item: MyScheduleFolderItem) => {
    if (!currentUser) return;
    const slotNumber = item.hinaSlot || Number(item.name.replace(/\D/g, '')) || 1;
    const templateName = hinaDisplayName(item, slotNumber);
    const existing = weekPlans[weekStart];
    const weekEnd = shiftDateKey(weekStart, 6);
    if (existing && weekEnd < todayDateKey()) {
      setWeekPickerStart(null);
      addNotification('success', `${formatWeekRange(weekStart)} の予定はそのまま残しています。`);
      return;
    }
    const record = writeWeekFromTemplate(existing, weekStart, item.id, templateName, item.slots, Boolean(existing));
    const next = { ...weekPlans, [weekStart]: record };
    persistWeekPlans(currentUser.id, next);
    setWeekPickerStart(null);
    addNotification('success', `${formatWeekRange(weekStart)} に「${templateName}」を登録しました。`);
  };

  const openWeekEditor = (weekStart: string) => {
    const plan = weekPlans[weekStart];
    setWeekPickerStart(weekStart);
    setWeekDraftSlots(cloneScheduleSlots(plan?.slots || []));
    setWeekDraftTemplateId(plan?.templateId);
    setWeekDraftTemplateName(plan?.templateName || '');
  };

  const loadHinaIntoWeekDraft = (item: MyScheduleFolderItem) => {
    const slotNumber = item.hinaSlot || Number(item.name.replace(/\D/g, '')) || 1;
    setWeekDraftSlots(copyScheduleSlotsWithNewIds(item.slots));
    setWeekDraftTemplateId(item.id);
    setWeekDraftTemplateName(hinaDisplayName(item, slotNumber));
  };

  const saveWeekEditor = () => {
    if (!currentUser || !weekPickerStart) return;
    const weekStart = weekPickerStart;
    const existing = weekPlans[weekStart];
    const weekEnd = shiftDateKey(weekStart, 6);
    if (existing && weekEnd < todayDateKey()) {
      setWeekPickerStart(null);
      addNotification('success', `${formatWeekRange(weekStart)} の予定はそのまま残しています。`);
      return;
    }
    const baseItem = weekDraftTemplateId
      ? mySchedules.find((item) => item.id === weekDraftTemplateId)
      : undefined;
    const followsTemplate = Boolean(baseItem && scheduleSlotsMatch(weekDraftSlots, baseItem.slots));
    if (followsTemplate && baseItem) {
      applyHinaToWeek(weekStart, baseItem);
      return;
    }
    const templateName = weekDraftTemplateName || (baseItem ? hinaDisplayName(baseItem, baseItem.hinaSlot || 1) : '');
    const record = writeCustomizedWeek(existing, weekStart, weekDraftTemplateId, templateName, weekDraftSlots);
    const next = { ...weekPlans, [weekStart]: record };
    persistWeekPlans(currentUser.id, next);
    setWeekPickerStart(null);
    addNotification(
      'success',
      record.is_customized
        ? `${formatWeekRange(weekStart)} を個別に保存しました。ひな型の一括反映では上書きしません。`
        : `${formatWeekRange(weekStart)} に「${templateName || 'ひな型'}」を登録しました。`,
    );
  };

  const openSlotDraft = (day: WeekdayId, startHour: number) => {
    setSlotDraft({
      id: null,
      day,
      startHour,
      startMinute: 0,
      endHour: Math.min(startHour + 1, 24),
      endMinute: 0,
      category: 'school',
      title: '',
    });
  };

  const openSlotEditor = (slot: ScheduleSlot) => {
    setSlotDraft({
      id: slot.id,
      day: slot.day,
      startHour: slot.startHour,
      startMinute: slot.startMinute || 0,
      endHour: slot.endHour,
      endMinute: slot.endMinute || 0,
      category: slot.category,
      title: slot.title,
    });
  };

  const handleSaveSlotDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!slotDraft) return;
    const start = slotDraft.startHour * 60 + (slotDraft.startMinute || 0);
    const end = slotDraft.endHour * 60 + (slotDraft.endHour === 24 ? 0 : (slotDraft.endMinute || 0));
    if (end <= start) {
      addNotification('warning', '終了時刻は開始時刻より後にしてください。');
      return;
    }
    const nextSlot = {
      day: slotDraft.day,
      startHour: slotDraft.startHour,
      startMinute: slotDraft.startMinute || 0,
      endHour: slotDraft.endHour,
      endMinute: slotDraft.endHour === 24 ? 0 : (slotDraft.endMinute || 0),
      category: slotDraft.category,
      title: slotDraft.title.trim(),
    };
    if (slotDraft.id) {
      const editingId = slotDraft.id;
      setScheduleSlots((prev) => prev.map((slot) => (slot.id === editingId ? { ...slot, ...nextSlot } : slot)));
    } else {
      setScheduleSlots((prev) => [
        ...prev,
        { id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...nextSlot },
      ]);
    }
    setSlotDraft(null);
  };

  const handleDeleteSlotDraft = () => {
    if (!slotDraft?.id) return;
    const editingId = slotDraft.id;
    setScheduleSlots((prev) => prev.filter((slot) => slot.id !== editingId));
    setSlotDraft(null);
  };

  // ---------------------------------------------------------------------------
  // データフィルタリング ＆ 生徒用成長分析ロジック
  // ---------------------------------------------------------------------------

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesClassroom = selectedClassroom === 'ALL' || u.classroom === selectedClassroom;
      const matchesSearch = searchQuery === '' || u.name.includes(searchQuery) || u.id.includes(searchQuery);
      return matchesClassroom && matchesSearch;
    });
  }, [users, selectedClassroom, searchQuery]);

  const teachersAndAdmins = useMemo(() => {
    return filteredUsers.filter((u) => u.role === 'teacher' || u.role === 'admin');
  }, [filteredUsers]);

  const students = useMemo(() => {
    return filteredUsers.filter((u) => u.role === 'student' && u.isPendingDelete !== true);
  }, [filteredUsers]);

  const pendingDeleteStudents = useMemo(() => {
    return filteredUsers.filter((u) => u.role === 'student' && u.isPendingDelete === true);
  }, [filteredUsers]);

  const meetingRoster = useMemo(() => {
    const query = meetingStudentQuery.trim().toLowerCase();
    return users
      .filter((user) => user.role === 'student')
      .filter((user) => selectedClassroom === 'ALL' || user.classroom === selectedClassroom)
      .filter((user) => {
        if (!query) return true;
        return user.name.toLowerCase().includes(query) || user.id.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [users, selectedClassroom, meetingStudentQuery]);

  const meetingBoard = useMemo(() => {
    const studentLogs = meetingStudentId ? logs.filter((log) => log.user_id === meetingStudentId) : [];
    const weekEnd = shiftDateKey(meetingWeekStart, 6);
    const monthAnchor = shiftDateKey(meetingWeekStart, 3);
    const [year, month] = monthAnchor.split('-').map(Number);
    const monthStart = `${year}-${String(month || 1).padStart(2, '0')}-01`;
    const monthLast = new Date(year || 1970, month || 1, 0).getDate();
    const monthEnd = `${year}-${String(month || 1).padStart(2, '0')}-${String(monthLast).padStart(2, '0')}`;
    const inRange = (log: StudyLog, start: string, end: string) => {
      const placed = studyPlacement(log, logSlots);
      return Boolean(placed && placed.date >= start && placed.date <= end);
    };
    const weekLogs = studentLogs.filter((log) => inRange(log, meetingWeekStart, weekEnd));
    const monthLogs = studentLogs.filter((log) => inRange(log, monthStart, monthEnd));
    const describe = (log: StudyLog) => meetingMaterialInfo(log.material_id, meetingStudentId, materials);
    return {
      studentLogs,
      plans: meetingStudentId ? viewedWeekPlans : {},
      weekLogs,
      week: buildStudyStacks(weekLogs, describe),
      month: buildStudyStacks(monthLogs, describe),
      monthLabel: `${year}年${month}月`,
      weekLabel: formatWeekRange(meetingWeekStart),
    };
  }, [logs, meetingStudentId, meetingWeekStart, logSlots, materials, viewedWeekPlans]);

  const progressBoard = useMemo(() => {
    const viewerRole = currentUser ? resolveAppRole(currentUser.role, currentUser.id, currentUser.email) : 'student';
    const lockedClassroom = viewerRole === 'teacher' ? (currentUser?.classroom || '') : null;
    const classroom = lockedClassroom ?? progressClassroom;
    const today = todayDateKey();
    const weekStart = weekStartKey(today);
    const weekEnd = shiftDateKey(weekStart, 6);
    const [yearText, monthText] = today.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const monthStart = `${yearText}-${monthText}-01`;
    const monthLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${yearText}-${monthText}-${String(monthLast).padStart(2, '0')}`;
    const cappedMonthEnd = monthEnd < weekEnd ? monthEnd : weekEnd;
    const known = ['本川越校', '川越校', 'ＥＸ校'];
    const discovered = users
      .filter((user) => resolveAppRole(user.role, user.id, user.email) === 'student' && user.classroom)
      .map((user) => user.classroom);
    const classrooms = Array.from(new Set([...known, ...discovered]));
    const rows = users
      .filter((user) => resolveAppRole(user.role, user.id, user.email) === 'student')
      .filter((user) => !classroom || classroom === 'ALL' || user.classroom === classroom)
      .map((student) => {
        const ownLogs = logs.filter((log) => log.user_id === student.id);
        const inRange = (log: StudyLog, start: string, end: string) => {
          const placed = studyPlacement(log, logSlots);
          return Boolean(placed && placed.date >= start && placed.date <= end);
        };
        const weekLogs = ownLogs.filter((log) => inRange(log, weekStart, weekEnd));
        const monthLogs = ownLogs.filter((log) => inRange(log, monthStart, cappedMonthEnd));
        return {
          student,
          weekMinutes: weekLogs.reduce((sum, log) => sum + (log.time_spent_minutes || 0), 0),
          monthMinutes: monthLogs.reduce((sum, log) => sum + (log.time_spent_minutes || 0), 0),
          weekCrowns: weekLogs.filter((log) => log.is_mission_completed).length,
        };
      })
      .sort((a, b) => {
        const left = progressSortKey === 'week' ? a.weekMinutes : a.monthMinutes;
        const right = progressSortKey === 'week' ? b.weekMinutes : b.monthMinutes;
        const diff = progressSortDir === 'asc' ? left - right : right - left;
        return diff || a.student.name.localeCompare(b.student.name, 'ja');
      });
    return {
      viewerRole,
      classroom,
      classrooms,
      weekLabel: formatWeekRange(weekStart),
      monthLabel: `${year}年${month}月`,
      rows,
    };
  }, [users, logs, logSlots, currentUser, progressClassroom, progressSortKey, progressSortDir]);

  const visibleStudents = useMemo(() => {
    return students.filter((student) =>
      STUDENT_LIST_COLUMNS.every((column) => {
        const selected = studentFieldFilters[column.key];
        return !selected || selected === 'ALL' || String(student[column.key] || '') === selected;
      })
    );
  }, [students, studentFieldFilters]);

  const myMessages = useMemo(() => {
    if (!currentUser || currentUser.role !== 'student') return [];
    return messages
      .filter((message) => message.user_id.trim().toLowerCase() === currentUser.id.trim().toLowerCase())
      .map((message) => {
        const teacher = users.find((user) => user.id === message.sender_id);
        return teacher?.name ? { ...message, sender_name: teacher.name } : message;
      })
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  }, [messages, currentUser, users]);

  const unreadNoticeCount = myMessages.filter((message) => !message.read_at).length;

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return users.find((u) => u.id === selectedStudentId) || null;
  }, [users, selectedStudentId]);

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudentId) return [];
    return logs.filter((l) => l.user_id === selectedStudentId);
  }, [logs, selectedStudentId]);

  // 生徒一人ひとりの科目別成長集計演算
  const selectedStudentSubjectStats = useMemo(() => {
    if (!selectedStudentId) return [];
    const studentLogs = logs.filter((l) => l.user_id === selectedStudentId);
    
    const stats = Object.fromEntries(
      SUBJECT_NAMES.map((subj) => [subj, { totalScore: 0, totalMinutes: 0, count: 0, crownCount: 0 }])
    ) as Record<SubjectType, { totalScore: number; totalMinutes: number; count: number; crownCount: number }>;

    studentLogs.forEach((log) => {
      const mat = materials.find((m) => m.id === log.material_id);
      const subj = mat ? subjectFromInput(mat.subject) : null;
      if (subj && stats[subj]) {
        stats[subj].totalScore += log.score;
        stats[subj].totalMinutes += log.time_spent_minutes || 0;
        stats[subj].count += 1;
        if (log.is_mission_completed) stats[subj].crownCount += 1;
      }
    });

    return SUBJECT_NAMES.map((subj) => {
      const item = stats[subj];
      return {
        subject: subj,
        avgScore: item.count > 0 ? Math.round(item.totalScore / item.count) : 0,
        totalHours: Math.round((item.totalMinutes / 60) * 10) / 10,
        count: item.count,
        crownCount: item.crownCount,
      };
    });
  }, [logs, materials, selectedStudentId]);

  const filteredMaterials = useMemo(() => {
    const matched = materials.filter((m) => {
      const filterCode = subjectCodeFromInput(subjectFilter);
      const matchesSubject = !subjectFilter || subjectFilter === 'ALL' || (
        filterCode
          ? (m.subject_code ? m.subject_code === filterCode : m.subject === SUBJECT_CODE_TONE[filterCode])
          : m.subject === subjectFilter
      );
      const matchesSearch = searchQuery === '' || m.title.includes(searchQuery) || m.id.includes(searchQuery);
      return matchesSubject && matchesSearch;
    });
    return bySubjectThenOrder(matched);
  }, [materials, subjectFilter, searchQuery]);

  const logMaterialChoices = useMemo(() => {
    const code = subjectCodeFromInput(newLogForm.subject);
    if (!code) return [];
    const tone = SUBJECT_CODE_TONE[code];
    return byDisplayOrder(materials.filter((item) => (item.subject_code ? item.subject_code === code : item.subject === tone)));
  }, [materials, newLogForm.subject]);

  // 全体メトリクス演算
  const globalSummaryStats = useMemo(() => {
    const totalUsers = users.length;
    const totalStudents = users.filter((u) => u.role === 'student').length;
    const totalTeachers = users.filter((u) => u.role === 'teacher' || u.role === 'admin').length;
    const totalMaterials = materials.length;
    const totalLogs = logs.length;
    
    const overallAvgScore = logs.length > 0
      ? Math.round(logs.reduce((acc, cur) => acc + cur.score, 0) / logs.length)
      : 0;

    return {
      totalUsers,
      totalStudents,
      totalTeachers,
      totalMaterials,
      totalLogs,
      overallAvgScore,
    };
  }, [users, materials, logs]);

  const myStudyLogs = useMemo(() => {
    if (!currentUser || currentUser.role !== 'student') return [];
    return [...logs.filter((log) => log.user_id === currentUser.id)]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [logs, currentUser]);

  const periodStudy = useMemo(() => {
    const periodLogs = myStudyLogs.filter((log) => studyLogInPeriod(log, logSummaryPeriod, new Date(), logSlots));
    const subjectMap = new Map<SubjectType, Map<string, { id: string; title: string; minutes: number }>>();
    periodLogs.forEach((log) => {
      const master = materials.find((item) => item.id === log.material_id);
      const mine = myMaterials.find((item) => item.id === log.material_id);
      const subject = subjectFromInput(master?.subject || mine?.subject) || 'その他';
      const title = master?.title || mine?.title || '教材';
      const key = log.material_id || title;
      const bucket = subjectMap.get(subject) || new Map();
      const current = bucket.get(key) || { id: key, title, minutes: 0 };
      current.minutes += log.time_spent_minutes || 0;
      bucket.set(key, current);
      subjectMap.set(subject, bucket);
    });
    const subjects = SUBJECT_NAMES.flatMap((subject) => {
      const bucket = subjectMap.get(subject);
      if (!bucket) return [];
      const items = Array.from(bucket.values()).filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
      const minutes = items.reduce((sum, item) => sum + item.minutes, 0);
      if (minutes <= 0) return [];
      const color = subjectSetting(subject).color;
      return [{
        subject,
        minutes,
        materials: items.map((item, index) => ({
          ...item,
          color: index === 0 ? color : MATERIAL_BAR_COLORS[(index - 1) % MATERIAL_BAR_COLORS.length],
        })),
      }];
    });
    const studyMinutes = periodLogs.reduce((sum, log) => sum + (log.time_spent_minutes || 0), 0);
    const totalMinutes = studyMinutes + cramMinutesInSummaryPeriod(logSummaryPeriod, weekCramMinutes, weekPlans);
    return { logs: periodLogs, totalMinutes, subjects };
  }, [myStudyLogs, materials, myMaterials, logSummaryPeriod, logSlots, weekCramMinutes, weekPlans]);

  const previousWeekRank = useMemo(() => {
    const thisWeek = weekStartKey(todayDateKey());
    const prevStart = shiftDateKey(thisWeek, -7);
    const prevEnd = shiftDateKey(prevStart, 6);
    const studyMinutes = myStudyLogs.reduce((sum, log) => {
      const placed = studyPlacement(log, logSlots);
      if (!placed || placed.date < prevStart || placed.date > prevEnd) return sum;
      return sum + (log.time_spent_minutes || 0);
    }, 0);
    const jukuMinutes = weekJukuMinutes(weekPlans[prevStart], prevStart);
    const totalMinutes = rankTotalMinutes(studyMinutes, jukuMinutes);
    return { totalMinutes, rank: rankFromMinutes(totalMinutes) };
  }, [myStudyLogs, logSlots, weekPlans]);

  const pastWeekReviews = useMemo(() => {
    const thisWeek = weekStartKey(todayDateKey());
    const thisWeekEnd = shiftDateKey(thisWeek, 6);
    const grouped = new Map<string, StudyLog[]>();
    myStudyLogs.forEach((log) => {
      const placed = studyPlacement(log, logSlots);
      if (!placed || placed.date > thisWeekEnd) return;
      const start = weekStartKey(placed.date);
      if (start > thisWeek) return;
      const bucket = grouped.get(start) || [];
      bucket.push(log);
      grouped.set(start, bucket);
    });
    Object.keys(weekPlans).forEach((rawStart) => {
      const start = weekStartKey(rawStart);
      if (start > thisWeek || grouped.has(start)) return;
      if (weekJukuMinutes(weekPlans[rawStart], start) > 0) grouped.set(start, []);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([start, rows]) => {
        const stack = buildStudyStacks(rows, (log) => {
          const master = materials.find((item) => item.id === log.material_id);
          const mine = myMaterials.find((item) => item.id === log.material_id);
          return {
            title: master?.title || mine?.title || '教材',
            subject: subjectFromInput(master?.subject || mine?.subject) || 'その他',
          };
        });
        const jukuMinutes = weekJukuMinutes(weekPlans[start], start);
        return {
          start,
          label: `${start === thisWeek ? '今週 ' : ''}${formatWeekRange(start)}`,
          stack,
          jukuMinutes,
          rankMinutes: rankTotalMinutes(stack.totalMinutes, jukuMinutes),
        };
      });
  }, [myStudyLogs, logSlots, materials, myMaterials, weekPlans]);

  const studyStreakDays = useMemo(() => {
    const dayKeys = new Set<string>();
    myStudyLogs.forEach((log) => {
      const date = new Date(log.created_at || 0);
      if (Number.isNaN(date.getTime())) return;
      dayKeys.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    });
    const keyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!dayKeys.has(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dayKeys.has(keyOf(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [myStudyLogs]);

  useEffect(() => {
    if (!crownBurst) return;
    const timer = window.setTimeout(() => setCrownBurst(null), 2800);
    return () => window.clearTimeout(timer);
  }, [crownBurst]);

  useEffect(() => {
    if (!showMissionEffect) return;
    const timer = window.setTimeout(() => setShowMissionEffect(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showMissionEffect, missionEffectToken]);

  useEffect(() => {
    const signedIn = currentUser;
    if (!signedIn || isStaffRole(signedIn.role, signedIn.id, signedIn.email) || resolveAppRole(signedIn.role, signedIn.id, signedIn.email) !== 'student') return;
    setActiveTab('schedule_planner');
    setLogSlots(readLogSlots());
    setWeekPlans({});
    setWeekCramMinutes({});
    setWeekPlansResolved(false);
    loadedWeekPlanUser.current = signedIn.id;
    setNewLogForm((prev) => (prev.user_id === signedIn.id ? prev : { ...prev, user_id: signedIn.id }));
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser || resolveAppRole(currentUser.role, currentUser.id, currentUser.email) !== 'student') return;
    setMyMaterials(materials.flatMap((item) => {
      if (item.is_custom !== true || item.owner_student_id !== currentUser.id || !isSubjectType(item.subject)) return [];
      return [{ id: item.id, title: item.title, subject: item.subject, subject_code: item.subject_code, addedAt: '' }];
    }));
  }, [materials, currentUser?.id, currentUser?.role, currentUser?.email]);

  useEffect(() => {
    const signedIn = currentUser;
    if (!signedIn || isStaffRole(signedIn.role, signedIn.id, signedIn.email) || resolveAppRole(signedIn.role, signedIn.id, signedIn.email) !== 'student') return;
    const userChanged = loadedWeekPlanUser.current !== signedIn.id;
    if (userChanged) {
      loadedWeekPlanUser.current = signedIn.id;
      setWeekPlans({});
      setWeekCramMinutes({});
      setWeekPlansResolved(false);
    }
    void refreshWeekPlans(signedIn.id, true);
  }, [activeTab, currentUser?.id, currentUser?.role, refreshWeekPlans]);

  useEffect(() => {
    if (!currentUser || !isStaffRole(currentUser.role, currentUser.id, currentUser.email) || !meetingStudentId) return;
    viewedWeekPlanUser.current = meetingStudentId;
    setViewedWeekPlans({});
    void refreshWeekPlans(meetingStudentId, false);
  }, [meetingStudentId, currentUser?.id, currentUser?.role, refreshWeekPlans]);

  useEffect(() => {
    if (!currentUser || !isStaffRole(currentUser.role, currentUser.id, currentUser.email)) return;
    setLogSlots(readLogSlots());
    setStudyComposer(null);
    setEditingLog(null);
    setOpenHinaSlot(null);
    setWeekPickerStart(null);
    setCrownBurst(null);
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    const canonical = users.find((user) => {
      const id = user.id.toLowerCase();
      const email = (user.email || '').toLowerCase();
      const currentId = currentUser.id.toLowerCase();
      const currentEmail = (currentUser.email || '').toLowerCase();
      return id === currentId || (email !== '' && email === currentId) || (currentEmail !== '' && (id === currentEmail || email === currentEmail));
    });
    const directoryRole = canonical ? resolveAppRole(canonical.role, canonical.id, canonical.email) : null;
    const nextRole = directoryRole === 'admin' || directoryRole === 'teacher'
      ? directoryRole
      : resolveAppRole(currentUser.role, currentUser.id, currentUser.email);
    if (nextRole !== 'admin' && nextRole !== 'teacher') return;
    const nextId = canonical?.id || currentUser.id;
    const nextEmail = currentUser.email || canonical?.email;
    if (currentUser.role === nextRole && currentUser.id === nextId && (currentUser.email || '') === (nextEmail || '')) return;
    rememberUserRole(nextId, nextRole);
    setCurrentUser({
      ...(canonical || currentUser),
      id: nextId,
      role: nextRole,
      password: currentUser.password || canonical?.password || '',
      email: nextEmail,
    });
    if (currentUser.role !== nextRole) setActiveTab('dashboard');
  }, [users, currentUser]);

  useEffect(() => {
    if (!currentUser || isStaffRole(currentUser.role, currentUser.id, currentUser.email) || resolveAppRole(currentUser.role, currentUser.id, currentUser.email) !== 'student') return;
    if (activeTab === 'teachers' || activeTab === 'students' || activeTab === 'student_detail') {
      setActiveTab('schedule_planner');
    }
  }, [currentUser?.id, currentUser?.role, activeTab]);

  const releaseWakeLock = useCallback(async () => {
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!current) return;
    try {
      await current.release();
    } catch {
      // すでに解除済み、または未対応ブラウザ
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) return;
      const sentinel = await requestScreenWakeLock();
      if (!sentinel) return;
      wakeLockRef.current = sentinel;
      sentinel.addEventListener?.('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch {
      // 権限拒否・未対応ブラウザでは計測自体は継続する
    }
  }, []);

  const dismissStudyClock = useCallback(() => {
    clearActiveStudyClock();
    setTimerRunning(false);
    setCountdownRunning(false);
    setCountdownFinished(false);
    void releaseWakeLock();
  }, [releaseWakeLock]);

  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => setTimerElapsedSec(elapsedSecondsSince(timerStartedAt));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [timerRunning, timerStartedAt]);

  useEffect(() => {
    if (!countdownRunning || !countdownStartedAt) return;
    const tick = () => {
      const remaining = Math.max(0, countdownTargetMin * 60 - elapsedSecondsSince(countdownStartedAt));
      setCountdownRemainingSec(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [countdownRunning, countdownStartedAt, countdownTargetMin]);

  useEffect(() => {
    if (timerRunning || countdownRunning) {
      void acquireWakeLock();
      return;
    }
    void releaseWakeLock();
  }, [timerRunning, countdownRunning, acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    if (!currentUser || isStaffRole(currentUser.role, currentUser.id, currentUser.email)) return;
    if (!studyComposer || (!timerRunning && !countdownRunning && !countdownFinished)) return;
    const startedAt = timerRunning ? timerStartedAt : countdownStartedAt;
    if (!startedAt) return;
    writeActiveStudyClock({
      userId: currentUser.id,
      mode: timerRunning ? 'timer' : 'countdown',
      running: timerRunning || countdownRunning,
      startedAt,
      targetSec: countdownTargetMin * 60,
      finished: countdownFinished,
      subject: String(newLogForm.subject || ''),
      materialId: newLogForm.material_id,
      comment: newLogForm.comment,
      mission: composerMission,
      date: composerDateKey,
      composer: studyComposer,
    });
  }, [
    currentUser,
    studyComposer,
    timerRunning,
    countdownRunning,
    countdownFinished,
    timerStartedAt,
    countdownStartedAt,
    countdownTargetMin,
    newLogForm.subject,
    newLogForm.material_id,
    newLogForm.comment,
    composerMission,
    composerDateKey,
  ]);

  useEffect(() => {
    const syncVisibleClock = () => {
      if (document.visibilityState === 'hidden') return;
      const saved = readActiveStudyClock();
      if (!saved || !currentUser || saved.userId !== currentUser.id || isStaffRole(currentUser.role, currentUser.id, currentUser.email)) return;
      if (saved.mode === 'timer') {
        if (!saved.running) return;
        setTimerStartedAt(saved.startedAt);
        setTimerElapsedSec(elapsedSecondsSince(saved.startedAt));
        setTimerRunning(true);
        void acquireWakeLock();
        return;
      }
      const targetSec = Math.max(1, saved.targetSec || countdownTargetMin * 60);
      const remaining = Math.max(0, targetSec - elapsedSecondsSince(saved.startedAt));
      setCountdownStartedAt(saved.startedAt);
      setCountdownTargetMin(Math.max(1, Math.round(targetSec / 60)));
      setCountdownRemainingSec(remaining);
      if (remaining <= 0) {
        setCountdownRunning(false);
        setCountdownFinished(true);
        writeActiveStudyClock({ ...saved, running: false, finished: true, targetSec });
        if (timeAttackFinishedRef.current !== saved.startedAt) {
          timeAttackFinishedRef.current = saved.startedAt;
          playTimeAttackChime();
          addNotification('success', 'タイムアタック終了！');
        }
        void releaseWakeLock();
        return;
      }
      if (saved.running) {
        setCountdownFinished(false);
        setCountdownRunning(true);
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', syncVisibleClock);
    window.addEventListener('focus', syncVisibleClock);
    window.addEventListener('pageshow', syncVisibleClock);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibleClock);
      window.removeEventListener('focus', syncVisibleClock);
      window.removeEventListener('pageshow', syncVisibleClock);
    };
  }, [currentUser, countdownTargetMin, acquireWakeLock, releaseWakeLock, addNotification]);

  useEffect(() => {
    if (!currentUser || isStaffRole(currentUser.role, currentUser.id, currentUser.email) || resolveAppRole(currentUser.role, currentUser.id, currentUser.email) !== 'student') return;
    if (clockRestoreUserRef.current === currentUser.id) return;
    clockRestoreUserRef.current = currentUser.id;
    const saved = readActiveStudyClock();
    if (!saved || saved.userId !== currentUser.id) return;
    const subject = subjectFromInput(saved.subject) || '';
    setRecordMode(saved.mode);
    setComposerDateKey(saved.date);
    setStudyComposer(saved.composer);
    setComposerMission(Boolean(saved.mission));
    setNewLogForm((prev) => ({
      ...prev,
      user_id: currentUser.id,
      subject,
      material_id: saved.materialId || '',
      comment: saved.comment || '',
    }));
    if (saved.mode === 'timer' && saved.running) {
      setTimerStartedAt(saved.startedAt);
      setTimerElapsedSec(elapsedSecondsSince(saved.startedAt));
      setTimerRunning(true);
      setCountdownRunning(false);
      setCountdownFinished(false);
      return;
    }
    const targetSec = Math.max(1, saved.targetSec || 1);
    const remaining = Math.max(0, targetSec - elapsedSecondsSince(saved.startedAt));
    setCountdownTargetMin(Math.max(1, Math.round(targetSec / 60)));
    setCountdownStartedAt(saved.startedAt);
    setCountdownRemainingSec(remaining);
    setTimerRunning(false);
    if (remaining <= 0) {
      setCountdownRunning(false);
      setCountdownFinished(true);
      writeActiveStudyClock({ ...saved, running: false, finished: true, targetSec });
      if (timeAttackFinishedRef.current !== saved.startedAt) {
        timeAttackFinishedRef.current = saved.startedAt;
        playTimeAttackChime();
        addNotification('success', 'タイムアタック終了！');
      }
      return;
    }
    setCountdownFinished(Boolean(saved.finished));
    setCountdownRunning(saved.running && !saved.finished);
  }, [currentUser, addNotification]);

  // ---------------------------------------------------------------------------
  // CSV一括取り込み ＆ 手動追加ロジック
  // ---------------------------------------------------------------------------

  const downloadStudentCsvTemplate = useCallback(() => {
    const csvBody = [
      'id,name,high_school,grade,branch_id,password,math,english,modern_jp,classic_jp,physics,chemistry,biology,jp_history,world_history,individual',
      'ext001,川越 太郎,川越高校,高2,本川越校,ext001,標準,選抜,標準,,基礎,標準,基礎,日本史A,,個別A',
      'ext002,山手 花子,山手高校,高1,本川越校,1234,選抜,標準,標準,,,生物A,,世界史B,個別B',
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student_import_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const downloadTeacherCsvTemplate = useCallback(() => {
    const csvBody = [
      'id,name,branch_id,role,password',
      'teacher01,佐藤 講師,本川越校,teacher,teacher01',
      'teacher02,鈴木 講師,川越校,teacher,1234',
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'teacher_import_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const csvCell = (row: any, key: string) => (row?.[key] == null ? '' : String(row[key]).trim());

  const handleCsvFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setCsvStatusMessage({ type: null, text: '' });
    setCsvValidationErrors([]);
    setCsvParsedPreview([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            throw new Error('CSVファイル内に有効なデータ行が存在しません。');
          }

          const parsedRows: User[] = [];
          const errors: CsvRowError[] = [];

          results.data.forEach((row: any, index: number) => {
            const rowNum = index + 2;
            const rawId = csvCell(row, 'id');
            const rawPassword = csvCell(row, 'password');
            const rawName = csvCell(row, 'name');
            const rawRole = csvCell(row, 'role').toLowerCase();
            const rawClassroom = csvCell(row, 'branch_id') || csvCell(row, 'classroom');

            if (!rawId) errors.push({ rowNumber: rowNum, field: 'id', message: '独自ID (id) が指定されていません。' });
            if (!rawName) errors.push({ rowNumber: rowNum, field: 'name', message: '氏名 (name) が空欄です。' });

            const existingUser = users.find((u) => u.id.toLowerCase() === rawId.toLowerCase());
            if (csvImportKind === 'student') {
              if (rawRole && rawRole !== 'student') {
                errors.push({ rowNumber: rowNum, field: 'role', message: '生徒専用CSVの role は student のみです。' });
              }
              if (rawId && rawName && (!rawRole || rawRole === 'student')) {
                parsedRows.push({
                  ...blankUserForm('student'),
                  id: rawId,
                  name: rawName,
                  role: 'student',
                  classroom: rawClassroom,
                  password: rawPassword || existingUser?.password || '',
                  grade: csvCell(row, 'grade'),
                  highSchool: csvCell(row, 'high_school'),
                  english: csvCell(row, 'english'),
                  math: csvCell(row, 'math'),
                  japanese: csvCell(row, 'modern_jp') || csvCell(row, 'japanese'),
                  classicJp: csvCell(row, 'classic_jp'),
                  physics: csvCell(row, 'physics'),
                  chemistry: csvCell(row, 'chemistry'),
                  biology: csvCell(row, 'biology'),
                  japaneseHistory: csvCell(row, 'jp_history') || csvCell(row, 'japanese_history'),
                  worldHistory: csvCell(row, 'world_history'),
                  individual: csvCell(row, 'individual'),
                });
              }
              return;
            }

            const teacherRole = rawRole || 'teacher';
            const adminWriteForbidden = currentUser?.role !== 'admin' && (teacherRole === 'admin' || existingUser?.role === 'admin');
            if (teacherRole !== 'teacher' && !(teacherRole === 'admin' && currentUser?.role === 'admin')) {
              errors.push({ rowNumber: rowNum, field: 'role', message: '教師専用CSVの role は teacher のみです。' });
            }
            if (adminWriteForbidden) {
              errors.push({ rowNumber: rowNum, field: 'role', message: '管理者以外は admin 権限のユーザーを作成・更新できません。' });
            }
            if (rawId && rawName && !adminWriteForbidden && (teacherRole === 'teacher' || teacherRole === 'admin')) {
              parsedRows.push({
                ...blankUserForm(teacherRole as UserRole),
                id: rawId,
                name: rawName,
                role: teacherRole as UserRole,
                classroom: rawClassroom,
                password: rawPassword || existingUser?.password || '',
              });
            }
          });

          if (errors.length > 0) {
            setCsvValidationErrors(errors);
            setCsvStatusMessage({ type: 'error', text: `${errors.length} 件のデータ不備が検出されました。` });
          } else {
            setCsvParsedPreview(parsedRows);
            setCsvStatusMessage({ type: 'success', text: `${parsedRows.length} 件のデータを登録可能です。` });
          }
        } catch (err: any) {
          setCsvStatusMessage({ type: 'error', text: err.message || 'CSV解析エラー' });
        } finally {
          setCsvUploading(false);
          event.target.value = '';
        }
      },
      error: (err) => {
        setCsvStatusMessage({ type: 'error', text: `CSVエラー: ${err.message}` });
        setCsvUploading(false);
        event.target.value = '';
      },
    });
  }, [currentUser, users, csvImportKind]);

  const executeCsvImport = useCallback(async () => {
    if (csvParsedPreview.length === 0) return;
    if (csvImportKind === 'teacher' && currentUser?.role !== 'admin') {
      const hasForbiddenAdminWrite = csvParsedPreview.some((row) => row.role === 'admin' || users.some((user) => user.id.toLowerCase() === row.id.toLowerCase() && user.role === 'admin'));
      if (hasForbiddenAdminWrite) {
        setCsvStatusMessage({ type: 'error', text: '管理者以外は admin 権限のユーザーを作成・更新できません。' });
        return;
      }
    }

    setCsvUploading(true);
    try {
      let dbError: string | null = null;
      for (const row of csvParsedPreview) {
        const result = await saveUserWithProfile(row);
        if (result) dbError = result;
      }
      if (dbError) {
        console.error(dbError);
        alert('通信エラー: ' + dbError);
        setCsvStatusMessage({ type: 'error', text: dbError });
        return;
      }
      setCsvStatusMessage({ type: 'success', text: '登録が完了いたしました！' });
      addNotification('success', `${csvParsedPreview.length} 名の${csvImportKind === 'student' ? '生徒' : '教師'}データを登録いたしました。`);
      await fetchAllData({ silent: true });
      setTimeout(() => {
        setIsStudentCsvModalOpen(false);
        setIsTeacherCsvModalOpen(false);
        setCsvParsedPreview([]);
        setCsvStatusMessage({ type: null, text: '' });
      }, 1200);
    } catch (err: any) {
      setCsvStatusMessage({ type: 'error', text: err.message });
    } finally {
      setCsvUploading(false);
    }
  }, [csvParsedPreview, csvImportKind, currentUser, users, saveUserWithProfile, fetchAllData, addNotification]);

  const resetMaterialForm = useCallback(() => {
    setEditingMaterialId(null);
    setNewMaterialForm({
      id: '',
      title: '',
      subject: '',
      difficulty: 'standard',
      description: '',
      created_by: currentUser?.id || '',
    });
  }, [currentUser]);

  const openCreateMaterialModal = useCallback(() => {
    resetMaterialForm();
    setIsMaterialModalOpen(true);
  }, [resetMaterialForm]);

  const openEditMaterialModal = useCallback((material: Material) => {
    setEditingMaterialId(material.id);
    setNewMaterialForm({
      id: material.id,
      title: material.title,
      subject: subjectCodeFromInput(material.subject_code || material.subject) || '',
      difficulty: material.difficulty || 'standard',
      description: material.description || '',
      created_by: material.created_by,
    });
    setIsMaterialModalOpen(true);
  }, []);

  const handleCreateMaterial = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialForm.title.trim()) {
      alert('教材タイトルは必須項目です。');
      return;
    }
    const code = subjectCodeFromInput(newMaterialForm.subject);
    if (!code) {
      alert('教科を選択してください。');
      return;
    }
    const subject = SUBJECT_CODE_TONE[code];
    const creatorId = (editingMaterialId ? newMaterialForm.created_by : currentUser?.id) || currentUser?.id || '';
    if (!creatorId) {
      alert('ログイン中のユーザーIDを取得できません。');
      return;
    }

    const explicit = editingMaterialId ? materials.find((item) => item.id === editingMaterialId) : undefined;
    const existing = explicit || findMaterialByTitle(materials, newMaterialForm.title);
    const overwriteBlanks = Boolean(explicit);
    const allocateDisplayOrder = createDisplayOrderAllocator(materials);
    const saved = mergeMaterialRecord(existing, {
      id: explicit?.id || `mat_${Date.now()}`,
      title: newMaterialForm.title.trim(),
      subject,
      description: newMaterialForm.description,
      difficulty: newMaterialForm.difficulty,
      created_by: creatorId,
      overwriteBlanks,
      display_order: allocateDisplayOrder(subject, existing),
    });
    saved.subject_code = code;

    try {
      const failure = await writeMaterialRow(
        supabase,
        saved.id,
        materialWritePayload(saved, {
          includeImage: false,
          includeDescription: overwriteBlanks || Boolean(newMaterialForm.description.trim()),
        }),
      );
      if (failure) throw new Error(failure);
      await reloadMaterials();
      addNotification(
        'success',
        existing
          ? `教材「${saved.title}」を更新いたしました！`
          : `新規教材「${saved.title}」を登録いたしました！`
      );
      setIsMaterialModalOpen(false);
      resetMaterialForm();
    } catch (error) {
      reportMaterialError(error, '教材の保存に失敗しました');
    }
  }, [newMaterialForm, editingMaterialId, currentUser, materials, supabase, reloadMaterials, addNotification, resetMaterialForm]);

  const handleDeleteMaterial = useCallback(async (material: Material) => {
    if (!window.confirm('この教材を削除しますか？')) return;
    try {
      const { error } = await supabase.from('materials').delete().eq('id', material.id);
      if (error) throw error;
      await reloadMaterials();
      addNotification('success', `教材「${material.title}」を削除しました。`);
    } catch (error) {
      reportMaterialError(error, '教材の削除に失敗しました');
    }
  }, [supabase, addNotification, reloadMaterials]);

  const handleDisplayOrderCommit = useCallback(async (material: Material, raw: string) => {
    const order = Number(raw);
    if (!Number.isFinite(order) || order === material.display_order) return;
    try {
      const failure = await updateMaterialOrder(supabase, material.id, order);
      if (failure) throw new Error(failure);
      await reloadMaterials();
    } catch (error) {
      reportMaterialError(error, '表示順の保存に失敗しました');
    }
  }, [supabase, reloadMaterials]);

  const handleMoveMaterialOrder = useCallback(async (material: Material, direction: -1 | 1) => {
    const ordered = materialsForSubject(materials, material.subject);
    const index = ordered.findIndex((item) => item.id === material.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    let movingOrder = ordered[index].display_order;
    let otherOrder = ordered[target].display_order;
    if (movingOrder == null || otherOrder == null || movingOrder === otherOrder) {
      const base = Math.min(index, target) + 1;
      if (direction < 0) {
        movingOrder = base;
        otherOrder = base + 1;
      } else {
        otherOrder = base;
        movingOrder = base + 1;
      }
    } else {
      const swap = movingOrder;
      movingOrder = otherOrder;
      otherOrder = swap;
    }
    const updates = [
      { id: ordered[index].id, order: movingOrder },
      { id: ordered[target].id, order: otherOrder },
    ];
    try {
      for (const update of updates) {
        const failure = await updateMaterialOrder(supabase, update.id, update.order);
        if (failure) throw new Error(failure);
      }
      await reloadMaterials();
    } catch (error) {
      reportMaterialError(error, '表示順の保存に失敗しました');
    }
  }, [materials, supabase, reloadMaterials]);

  const downloadMaterialCsvTemplate = useCallback(() => {
    const csvBody = [
      `# subject: ${SUBJECT_CODES.join(', ')}`,
      'id,title,subject,description,order_index,is_custom,owner_student_id',
      ',英語長文マスター,english,長文読解の基礎から演習まで,1,false,',
      ',チャート式数学,math_prep,計算問題と標準問題の演習,1,false,',
      ',学校配布プリントまとめ,hs_prep,授業で配られたプリントの保管,1,false,',
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'material_import_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleMaterialCsvFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMaterialCsvUploading(true);
    setMaterialCsvStatusMessage({ type: null, text: '' });
    setMaterialCsvParsedPreview([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      comments: '#',
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            throw new Error('CSVファイル内に有効なデータ行が存在しません。');
          }

          const parsedRows: Material[] = [];
          const errors: CsvRowError[] = [];
          const subjectNotes: string[] = [];
          const createdBy = currentUser?.id || '';
          if (!createdBy) {
            throw new Error('ログイン中のユーザーIDを取得できません。');
          }
          const batchStamp = Date.now();

          results.data.forEach((row: any, index: number) => {
            const rowNum = index + 2;
            const title = row.title ? String(row.title).trim() : '';
            const subjectRaw = row.subject ? String(row.subject).trim().replace(/（/g, '(').replace(/）/g, ')') : '';
            const description = row.description ? String(row.description).trim() : '';
            const rawId = row.id ? String(row.id).trim() : '';
            const order = readDisplayOrder(row.order_index);
            const custom = String(row.is_custom ?? '').trim().toLowerCase() === 'true';
            const ownerId = row.owner_student_id ? String(row.owner_student_id).trim() : '';

            if (!title) {
              errors.push({ rowNumber: rowNum, field: 'title', message: '教材タイトル (title) が空欄です。' });
            }
            const code = subjectCodeFromInput(subjectRaw);
            if (!code) {
              subjectNotes.push(`${rowNum}行目の科目「${subjectRaw || '未入力'}」は登録できないため除外しました。`);
            } else if (code !== subjectRaw) {
              subjectNotes.push(`${rowNum}行目の科目を補正しました: ${subjectRaw} -> ${code}`);
            }

            if (title && code) {
              const tone = SUBJECT_CODE_TONE[code];
              parsedRows.push({
                id: rawId || `mat_${batchStamp + index}`,
                title,
                subject: tone,
                subject_code: code,
                description: description || undefined,
                color: subjectSetting(code).color,
                created_by: createdBy,
                difficulty: 'standard',
                display_order: order,
                is_custom: custom,
                owner_student_id: ownerId || null,
              });
            }
          });

          if (subjectNotes.length > 0) {
            alert(subjectNotes.join('\n'));
          }

          if (errors.length > 0) {
            setMaterialCsvStatusMessage({ type: 'error', text: `${errors.length} 件のデータ不備が検出されました。` });
          } else if (parsedRows.length === 0) {
            setMaterialCsvParsedPreview([]);
            setMaterialCsvStatusMessage({ type: 'error', text: '登録できる教材がありません。' });
          } else {
            setMaterialCsvParsedPreview(parsedRows);
            setMaterialCsvStatusMessage({ type: 'success', text: `${parsedRows.length} 件の教材を登録可能です。` });
          }
        } catch (err: any) {
          setMaterialCsvStatusMessage({ type: 'error', text: err.message || 'CSV解析エラー' });
        } finally {
          setMaterialCsvUploading(false);
          event.target.value = '';
        }
      },
      error: (err) => {
        setMaterialCsvStatusMessage({ type: 'error', text: `CSVエラー: ${err.message}` });
        setMaterialCsvUploading(false);
        event.target.value = '';
      },
    });
  }, [currentUser]);

  const executeMaterialCsvImport = useCallback(async () => {
    if (materialCsvParsedPreview.length === 0) return;

    const hasInvalidSubject = materialCsvParsedPreview.some((row) => !subjectCodeFromInput(row.subject_code));
    if (hasInvalidSubject) {
      setMaterialCsvStatusMessage({ type: 'error', text: '登録できない科目が含まれているため、取り込みを中止しました。' });
      return;
    }

    setMaterialCsvUploading(true);
    let announced = false;
    try {
      let next = [...materials];
      const applied: Array<{ material: Material; includeDescription: boolean }> = [];
      const allocateDisplayOrder = createDisplayOrderAllocator(materials);
      materialCsvParsedPreview.forEach((row) => {
        const code = subjectCodeFromInput(row.subject_code);
        const subject = code ? SUBJECT_CODE_TONE[code] : null;
        if (!code || !subject) return;
        const existing = findMaterialByTitle(next, row.title);
        const saved = {
          ...mergeMaterialRecord(existing, {
            id: existing?.id || row.id,
            title: row.title,
            subject,
            description: row.description,
            image_url: null,
            difficulty: row.difficulty || existing?.difficulty || 'standard',
            created_by: row.created_by || currentUser?.id || existing?.created_by || '',
            display_order: row.display_order ?? allocateDisplayOrder(subject, existing),
            overwriteBlanks: false,
          }),
          subject_code: code,
          is_custom: row.is_custom === true,
          owner_student_id: row.owner_student_id ?? null,
        };
        next = upsertMaterialList(next, saved);
        applied.push({ material: saved, includeDescription: Boolean(row.description?.trim()) });
      });

      for (const item of applied) {
        const failure = await writeMaterialRow(
          supabase,
          item.material.id,
          materialWritePayload(item.material, {
            includeImage: false,
            includeDescription: item.includeDescription,
          }),
        );
        if (failure) throw new Error(failure);
      }
      await reloadMaterials();
      const doneText = `${applied.length}件の教材を登録・更新しました`;
      setMaterialCsvStatusMessage({ type: 'success', text: doneText });
      addNotification('success', doneText);
      announced = true;

      setTimeout(() => {
        setIsMaterialCsvModalOpen(false);
        setMaterialCsvParsedPreview([]);
        setMaterialCsvStatusMessage({ type: null, text: '' });
      }, 1200);
    } catch (err: any) {
      reportMaterialError(err, '教材CSVの登録に失敗しました');
      if (!announced) setMaterialCsvStatusMessage({ type: 'error', text: err.message });
    } finally {
      setMaterialCsvUploading(false);
    }
  }, [materialCsvParsedPreview, materials, currentUser, supabase, reloadMaterials, addNotification]);

  const handleCreateLog = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = newLogForm.user_id.trim();
    if (!userId || !newLogForm.material_id) {
      alert('対象生徒とテキストを指定してください。');
      return;
    }

    const payload: StudyLog = {
      id: `log_${Date.now()}`,
      user_id: userId,
      material_id: newLogForm.material_id.trim(),
      score: Number(newLogForm.score),
      max_score: Number(newLogForm.max_score),
      time_spent_minutes: Number(newLogForm.time_spent_minutes),
      is_mission_completed: newLogForm.is_mission_completed,
      comment: newLogForm.comment.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    try {
      const subject = materials.find((item) => item.id === payload.material_id)?.subject || newLogForm.subject || '';
      const { error } = await supabase.from('study_logs').insert([studyLogRemoteRow(payload, subject)]);
      if (error) throw error;
      setLogs((prev) => [payload, ...prev.filter((log) => log.id !== payload.id)]);
      addNotification('success', newLogForm.is_mission_completed ? '👑 ミッション完了！学習ログを記録いたしました！' : '学習ログを記録いたしました！');
      setIsLogModalOpen(false);
      setNewLogForm({ user_id: '', subject: '', material_id: '', score: 0, max_score: 100, time_spent_minutes: 0, is_mission_completed: false, comment: '' });
    } catch (err: any) {
      console.error(err);
      alert('通信エラー: ' + (err?.message || '学習ログの保存に失敗しました'));
    }
  }, [newLogForm, materials, supabase, addNotification]);

  const saveStudentMinutes = useCallback(async (
    minutes: number,
    materialId: string,
    comment: string,
    slot?: (StudyClockRange & { date: string; mission: boolean }) | null,
  ) => {
    if (!currentUser || currentUser.role !== 'student') return false;
    if (!materialId) {
      alert('テキストを選択してください。');
      return false;
    }
    const mission = Boolean(slot?.mission);
    const range = slot ? clampStudyRange(slot) : null;
    if (slot?.date && range) {
      const studentLogIds = new Set(logs.filter((log) => log.user_id === currentUser.id).map((log) => log.id));
      try {
        const overlap = await findOverlappingStudyLog(supabase, currentUser.id, slot.date.slice(0, 10), range, undefined, studentLogIds);
        if (overlap) {
          alert(studyLogOverlapMessage(overlap.start, overlap.end));
          return false;
        }
      } catch (error: any) {
        console.error(error);
        alert('通信エラー: ' + (error?.message || '学習記録の確認に失敗しました'));
        return false;
      }
    }
    const created = new Date();
    if (slot?.date && range) {
      const [year, month, day] = slot.date.split('-').map(Number);
      const hour = range.startHour;
      if (hour >= 24) {
        created.setFullYear(year, (month || 1) - 1, (day || 1) + 1);
        created.setHours(hour - 24, range.startMinute, 0, 0);
      } else {
        created.setFullYear(year, (month || 1) - 1, day || 1);
        created.setHours(hour, range.startMinute, 0, 0);
      }
    }
    const payload: StudyLog = {
      id: `log_${Date.now()}`,
      user_id: currentUser.id,
      material_id: materialId,
      score: 0,
      max_score: 100,
      time_spent_minutes: range ? studyDurationMinutes(range) : Math.max(0, Math.round(minutes)),
      is_mission_completed: mission,
      comment: comment.trim() || undefined,
      created_at: created.toISOString(),
    };
    const title = materials.find((item) => item.id === materialId)?.title || 'テキスト';
    if (slot && range) {
      writeLogSlot(payload.id, { date: slot.date, ...range });
      setLogSlots(readLogSlots());
    }
    const materialRow = materials.find((item) => item.id === materialId);
    const subjectName = subjectCodeFromInput(newLogForm.subject) || subjectCodeFromInput(materialRow?.subject_code) || subjectCodeFromInput(materialRow?.subject) || '';
    const remoteLog = studyLogRemoteRow(payload, subjectName);
    if (slot?.date && range) {
      remoteLog.study_date = slot.date.slice(0, 10);
      Object.assign(remoteLog, studyLogClockFields(range));
    }
    const { error: logError } = await supabase.from('study_logs').insert([remoteLog]);
    if (logError) {
      console.error(logError);
      alert('通信エラー: ' + logError.message);
      return false;
    }
    setLogs((prev) => [payload, ...prev.filter((log) => log.id !== payload.id)]);
    if (payload.is_mission_completed === true) {
      setMissionEffectToken((token) => token + 1);
      setShowMissionEffect(true);
      addNotification('success', `${title}のミッション完了！ 👑`);
    } else {
      addNotification('success', `${title}の学習を記録しました。`);
    }
    clearActiveStudyClock();
    setStudyComposer(null);
    setTimerRunning(false);
    setCountdownRunning(false);
    setCountdownFinished(false);
    setNewLogForm((prev) => ({ ...prev, comment: '' }));
    return true;
  }, [currentUser, logs, materials, newLogForm.subject, supabase, addNotification]);

  useEffect(() => {
    if (!countdownRunning || countdownRemainingSec !== 0 || !countdownStartedAt) return;
    setCountdownRunning(false);
    setCountdownFinished(true);
    const saved = readActiveStudyClock();
    if (saved) writeActiveStudyClock({ ...saved, running: false, finished: true });
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (timeAttackFinishedRef.current === countdownStartedAt) return;
    timeAttackFinishedRef.current = countdownStartedAt;
    playTimeAttackChime();
    addNotification('success', 'タイムアタック終了！');
  }, [countdownRunning, countdownRemainingSec, countdownStartedAt, addNotification]);

  const appendMyMaterial = async (title: string, subject: SubjectType | SubjectCode) => {
    if (!currentUser || currentUser.role !== 'student') return;
    const trimmed = title.trim();
    if (!trimmed) {
      addNotification('warning', '教材名を入力してください。');
      return;
    }
    let code: SubjectCode | null = null;
    let tone: SubjectType;
    if (isSubjectCode(subject)) {
      code = subject;
      tone = SUBJECT_CODE_TONE[subject];
    } else {
      tone = subject;
    }
    const exists = materials.some((item) => item.is_custom === true && item.owner_student_id === currentUser.id && materialTitleKey(item.title) === materialTitleKey(trimmed) && item.subject === tone);
    if (exists) {
      addNotification('info', `「${trimmed}」はすでにマイ教材にあります。`);
      return;
    }
    const saved: Material = {
      id: `mym_${Date.now()}`,
      title: trimmed,
      subject: tone,
      created_by: currentUser.id,
      color: subjectSetting(code || tone).color,
      display_order: null,
      is_custom: true,
      owner_student_id: currentUser.id,
    };
    if (code) saved.subject_code = code;
    try {
      const failure = await writeMaterialRow(supabase, saved.id, materialWritePayload(saved));
      if (failure) throw new Error(failure);
      await reloadMaterials();
      addNotification('success', `「${trimmed}」をマイ教材に追加しました。`);
    } catch (error) {
      reportMaterialError(error, 'マイ教材の保存に失敗しました');
    }
  };

  const handleManualMyMaterial = (event: React.FormEvent) => {
    event.preventDefault();
    appendMyMaterial(myMaterialTitle, myMaterialSubject);
    setMyMaterialTitle('');
  };

  const handleQrMaterial = (raw: string) => {
    setQrScanOpen(false);
    const parsed = parseScannedMaterial(raw, materials);
    if (!parsed) {
      addNotification('warning', 'QRコードから教材を読み取れませんでした。');
      return;
    }
    appendMyMaterial(parsed.title, parsed.subject);
  };

  const removeMyMaterial = async (id: string) => {
    if (!currentUser || currentUser.role !== 'student') return;
    const { error } = await supabase.from('materials').delete().eq('id', id).eq('owner_student_id', currentUser.id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    await reloadMaterials();
  };

  const toggleFavoriteMaterial = async (materialId: string) => {
    if (!currentUser || currentUser.role !== 'student') return;
    const next = !favoriteMaterialIds.includes(materialId);
    try {
      await saveStudentFavorite(supabase, currentUser.id, materialId, next);
      await reloadMaterials();
    } catch (error) {
      reportMaterialError(error, 'お気に入りの保存に失敗しました');
    }
  };

  const openStudentLogEditor = (log: StudyLog) => {
    const material = materials.find((item) => item.id === log.material_id);
    setEditingLog(log);
    setEditSubject(material && isSubjectType(material.subject) ? material.subject : '');
    setEditMaterialId(log.material_id);
    const placed = studyPlacement(log, readLogSlots());
    const recordedMinutes = Math.max(0, Math.round(log.time_spent_minutes || 0));
    const stamp = new Date(log.created_at || 0);
    const stampClock = Number.isNaN(stamp.getTime()) ? { hour: 6, minute: 0 } : jstClock(stamp);
    const recordedStart = placed
      ? clockMinutes(placed.startHour, placed.startMinute || 0)
      : clockMinutes(stampClock.hour, stampClock.minute);
    const recordedEnd = recordedStart + (placed ? studyDurationMinutes(studyRangeFromSlot(placed)) : recordedMinutes);
    setEditRange(clampStudyRange({
      startHour: Math.floor(recordedStart / 60),
      startMinute: recordedStart % 60,
      endHour: Math.floor(recordedEnd / 60),
      endMinute: recordedEnd % 60,
    }));
    setEditComment(log.comment || '');
    setEditMission(Boolean(log.is_mission_completed));
  };

  const saveStudentLogEdit = useCallback(async () => {
    if (!editingLog || !editMaterialId) {
      alert('テキストを選択してください。');
      return;
    }
    const range = clampStudyRange(editRange);
    const placed = studyPlacement(editingLog, readLogSlots());
    if (placed?.date) {
      const studentLogIds = new Set(logs.filter((log) => log.user_id === editingLog.user_id).map((log) => log.id));
      try {
        const overlap = await findOverlappingStudyLog(supabase, editingLog.user_id, placed.date.slice(0, 10), range, editingLog.id, studentLogIds);
        if (overlap) {
          alert(studyLogOverlapMessage(overlap.start, overlap.end));
          return;
        }
      } catch (error: any) {
        console.error(error);
        alert('通信エラー: ' + (error?.message || '学習記録の確認に失敗しました'));
        return;
      }
    }
    const next: StudyLog = {
      ...editingLog,
      material_id: editMaterialId,
      time_spent_minutes: studyDurationMinutes(range),
      comment: editComment.trim() || undefined,
      is_mission_completed: editMission,
    };
    if (placed?.date) {
      const created = new Date(editingLog.created_at || Date.now());
      const [year, month, day] = placed.date.split('-').map(Number);
      if (range.startHour >= 24) {
        created.setFullYear(year, (month || 1) - 1, (day || 1) + 1);
        created.setHours(range.startHour - 24, range.startMinute, 0, 0);
      } else {
        created.setFullYear(year, (month || 1) - 1, day || 1);
        created.setHours(range.startHour, range.startMinute, 0, 0);
      }
      next.created_at = created.toISOString();
      writeLogSlot(editingLog.id, { date: placed.date, ...range });
      setLogSlots(readLogSlots());
    }
    setLogs((prev) => prev.map((log) => (log.id === next.id ? next : log)));
    const pending = readPendingStudyLogs();
    if (pending.some((log) => log.id === next.id)) {
      writePendingStudyLogs(pending.map((log) => (log.id === next.id ? next : log)));
    }
    const overrides = readStudyLogOverrides();
    overrides[next.id] = next;
    writeStudyLogOverrides(overrides);
    setEditingLog(null);
    try {
      const subjectName = materials.find((item) => item.id === next.material_id)?.subject || '';
      const remote = studyLogRemoteRow(next, subjectName);
      if (placed?.date) {
        remote.study_date = placed.date.slice(0, 10);
        Object.assign(remote, studyLogClockFields(range));
      }
      delete remote.id;
      const { error } = await supabase.from('study_logs').update(remote).eq('id', next.id);
      if (error) {
        console.error(error);
        alert('通信エラー: ' + error.message);
      } else {
        if (next.is_mission_completed === true) {
          setMissionEffectToken((token) => token + 1);
          setShowMissionEffect(true);
        }
        addNotification('success', '学習記録を更新しました。');
      }
    } catch (err: any) {
      console.error(err);
      alert('通信エラー: ' + (err?.message || '学習記録の更新に失敗しました'));
    }
  }, [editingLog, editMaterialId, editRange, editComment, editMission, logs, materials, supabase, addNotification]);

  const deleteStudentLog = useCallback(async (log: StudyLog) => {
    const title = materials.find((item) => item.id === log.material_id)?.title || 'この記録';
    if (!window.confirm(`「${title}」の記録を削除しますか？`)) return;
    setLogs((prev) => prev.filter((item) => item.id !== log.id));
    removeLogSlot(log.id);
    setLogSlots(readLogSlots());
    writePendingStudyLogs(readPendingStudyLogs().filter((item) => item.id !== log.id));
    const overrides = readStudyLogOverrides();
    delete overrides[log.id];
    writeStudyLogOverrides(overrides);
    const deleted = readDeletedStudyLogIds();
    if (!deleted.includes(log.id)) writeDeletedStudyLogIds([...deleted, log.id]);
    setEditingLog(null);
    const { error } = await supabase.from('study_logs').delete().eq('id', log.id);
    if (error) {
      console.error(error);
      alert('通信エラー: ' + error.message);
      return;
    }
    writeDeletedStudyLogIds(readDeletedStudyLogIds().filter((id) => id !== log.id));
    addNotification('success', '学習記録を削除しました。');
  }, [materials, supabase, addNotification]);

  // ---------------------------------------------------------------------------
  // 未ログイン時：独立 ログイン画面コンポーネント (Y Log タイトル ＆ ロゴ画像 /logo.png 固定表示)
  // ---------------------------------------------------------------------------
  if (!currentUser && !sessionChecked) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-sky-500 selection:text-white font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-300">
          <div className="text-center space-y-3">
            {/* ロゴ画像(/logo.png): 幅120px・中央配置・巨大化防止 */}
            <div
              className="mx-auto flex items-center justify-center overflow-hidden rounded-2xl bg-slate-50 border border-slate-200 p-3 shadow-inner"
              style={{ width: 140, height: 140 }}
            >
              <img
                src="/logo.png"
                alt="Y Log Logo"
                className="ylog-login-logo"
                width={120}
                height={120}
                style={{ width: 120, maxWidth: 120, height: 'auto', display: 'block', margin: '0 auto', objectFit: 'contain' }}
              />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Y Log</h1>
          </div>

          {(loginError || connectionError) && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 font-bold text-xs rounded-2xl text-center">
              ⚠️ {loginError || connectionError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-bold">
            <div>
              <label className="block text-slate-600 mb-1.5">独自ID (id) <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={loginInputId}
                onChange={(e) => setLoginInputId(toHalfWidthAscii(e.target.value))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                autoComplete="username"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-2xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder=""
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1.5">パスワード <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input
                  type={loginPasswordVisible ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(toHalfWidthAscii(e.target.value))}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  autoComplete="current-password"
                  className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-2xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder=""
                />
                <button
                  type="button"
                  onClick={() => setLoginPasswordVisible((visible) => !visible)}
                  className="px-3 rounded-2xl border border-slate-200 bg-white text-[11px] font-extrabold text-slate-600 cursor-pointer"
                >
                  {loginPasswordVisible ? '隠す' : '表示'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-sky-600/30 transition-all mt-2 cursor-pointer"
            >
              ログイン ➔
            </button>
            {!usersReady && (
              <p className="text-[11px] font-bold text-slate-400 text-center">ユーザー一覧を確認しています。確認後にログインできます。</p>
            )}
          </form>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center leading-relaxed">
            独自IDをお忘れの場合は管理者の講師までお尋ねください。
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 5. アプリケーション全体UI描画 (1,858行高密度コンポーネント)
  // ---------------------------------------------------------------------------

  if (studyComposer) {
    composerContext.current = {
      date: composerDateKey,
      startHour: studyComposer.startHour,
      startMinute: studyComposer.startMinute,
      endHour: studyComposer.endHour,
      endMinute: studyComposer.endMinute,
      mission: composerMission,
    };
  }
  const studentNav: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'schedule_planner', label: '今日のスケジュール', icon: '📅' },
    { id: 'dashboard', label: 'ログ・集計', icon: '📊' },
    { id: 'materials', label: 'マイ教材', icon: '📚' },
    { id: 'logs', label: '週スケジュール登録', icon: '🗓️' },
  ];

  function renderAdminScreen(currentUser: User) {
  return (
    <div className={`bg-slate-100 font-sans text-slate-800 antialiased selection:bg-sky-500 selection:text-white min-h-screen flex`}>
      
      {/* Toast通知 */}
      <div className="fixed top-5 right-5 z-50 space-y-2 pointer-events-none max-w-sm w-full">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-start justify-between gap-3 animate-in slide-in-from-top duration-300 ${
              n.type === 'success'
                ? 'bg-emerald-900/90 text-white border-emerald-500/50'
                : n.type === 'error'
                ? 'bg-red-900/90 text-white border-red-500/50'
                : 'bg-slate-900/90 text-white border-slate-700/50'
            }`}
          >
            <div className="space-y-0.5">
              <div className="text-[10px] opacity-60 font-mono">{n.timestamp}</div>
              <p className="text-xs font-bold leading-relaxed">{n.message}</p>
            </div>
            <button onClick={() => removeNotification(n.id)} className="text-white/60 hover:text-white font-bold text-xs cursor-pointer">✕</button>
          </div>
        ))}
      </div>

      {/* 統合サイドバー（生徒画面では描画しない） */}
      
      <aside className="w-64 bg-slate-950 text-white flex flex-col h-screen sticky top-0 self-start shrink-0 shadow-2xl border-r border-slate-800 overflow-hidden">
        <div className="shrink-0 p-5 pb-4">
          <div className="flex items-center gap-3 px-2 py-1 border-b border-slate-800 pb-4">
            {/* ロゴ画像(/logo.png)を表示 */}
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 p-1 flex items-center justify-center shrink-0">
              <img
                src="/logo.png"
                alt="Y Log Logo"
                width={32}
                height={32}
                style={{ width: 32, height: 32, objectFit: 'contain' }}
              />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight text-slate-100 leading-tight">
                Y Log
              </h1>
              <span className="text-[10px] font-mono text-sky-400 block mt-0.5 tracking-tight">
                STUDENT-FIRST ENGINE
              </span>
            </div>
          </div>
        </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-1.5">
            {[
              { id: 'dashboard', label: 'ダッシュボード', icon: '📊' },
              { id: 'schedule_planner', label: 'スケジュール', icon: '📅' },
              { id: 'students', label: '所属生徒一覧', icon: '🎓' },
              ...(currentUser.role === 'admin' ? [{ id: 'pending_delete', label: 'データを消す生徒', icon: '🗑️' }] : []),
              { id: 'teachers', label: '所属教師・管理者一覧', icon: '👨‍🏫' },
              { id: 'materials', label: '教材マスタ', icon: '📚' },
              { id: 'progress', label: '教室別・生徒学習進捗', icon: '🏫' },
              { id: 'logs', label: '生徒別 学習ログ詳細', icon: '📊' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as ActiveTab);
                  if (item.id !== 'student_detail') setSelectedStudentId(null);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30 translate-x-1'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

        <div className="shrink-0 space-y-3 border-t border-slate-800 p-5">
          {/* ログインユーザープロフ ＆ ログアウトボタン */}
          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="truncate">
              <div className="font-extrabold text-xs text-white truncate">{currentUser.name}</div>
              <div className="text-[10px] font-mono text-sky-400 font-bold">ID: {currentUser.id} ({currentUser.role})</div>
            </div>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl text-[10px] font-extrabold transition-all cursor-pointer"
            >
              切替
            </button>
          </div>

          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-2">
            <div className="text-[10px] font-black text-slate-300">ユーザー切替</div>
            <div className="grid grid-cols-3 gap-1">
              {(['student', 'teacher', 'admin'] as const).map((role) => {
                const sample = users.find((user) => user.role === role);
                const label = role === 'student' ? '生徒' : role === 'teacher' ? '講師' : '管理者';
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={!sample}
                    onClick={() => {
                      if (!sample) return;
                      setCurrentUser(sample);
                      setActiveTab(role === 'student' ? 'schedule_planner' : 'dashboard');
                    }}
                    className="py-2 rounded-xl bg-slate-800 text-[10px] font-black text-white cursor-pointer disabled:opacity-40"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => setIsUserModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold rounded-2xl transition-all shadow-lg shadow-sky-600/20 active:scale-95 cursor-pointer"
          >
            <span>👤</span> ＋ 新規ユーザー個別登録
          </button>
          <button
            onClick={() => { setCsvImportKind('student'); setCsvParsedPreview([]); setCsvValidationErrors([]); setCsvStatusMessage({ type: null, text: '' }); setIsStudentCsvModalOpen(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <span>🎓</span> 生徒専用CSV一括登録
          </button>
          <button
            onClick={() => { setCsvImportKind('teacher'); setCsvParsedPreview([]); setCsvValidationErrors([]); setCsvStatusMessage({ type: null, text: '' }); setIsTeacherCsvModalOpen(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-700 hover:bg-sky-600 text-white text-xs font-extrabold rounded-2xl transition-all shadow-lg shadow-sky-700/20 active:scale-95 cursor-pointer"
          >
            <span>👨‍🏫</span> 教師専用CSV一括登録
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">

<div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'dashboard' && 'Y Log 統合ダッシュボード'}
              {activeTab === 'schedule_planner' && 'スケジュール'}
              {activeTab === 'teachers' && '所属教師・管理者管理一覧'}
              {activeTab === 'students' && '所属生徒データ一覧'}
              {activeTab === 'pending_delete' && 'データを消す生徒'}
              {activeTab === 'student_detail' && `生徒個人カルテ & 科目別成長チャート (${selectedStudent?.name || '未選択'})`}
              {activeTab === 'materials' && '教材マスタ'}
              {activeTab === 'progress' && '教室別・生徒学習進捗'}
              {activeTab === 'logs' && '生徒別 学習ログ詳細'}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-1">
              メールアドレス不使用・独自文字列IDによる生徒第一の統合アプリ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            
            <div className="relative">
              <input
                type="text"
                placeholder="氏名・教材名・ID検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-2xl px-3.5 py-2.5 pl-9 focus:outline-none focus:ring-2 focus:ring-sky-500 w-52"
              />
              <span className="absolute left-3 top-3 text-xs text-slate-400">🔍</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 p-2 px-3 rounded-2xl border border-slate-200">
              <span className="text-xs font-extrabold text-slate-500">校舎:</span>
              <select
                value={selectedClassroom}
                onChange={(e) => setSelectedClassroom(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">全校舎表示</option>
                <option value="本川越校">本川越校</option>
                <option value="川越校">川越校</option>
                <option value="ＥＸ校">ＥＸ校</option>
              </select>
            </div>
          </div>
        </header>
        

        {globalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-3xl text-xs font-bold text-red-700 flex justify-between items-center">
            <span>⚠️ {globalError}</span>
            <button onClick={() => { void fetchAllData(); }} className="px-3 py-1 bg-red-600 text-white rounded-xl text-xs hover:bg-red-700 font-bold cursor-pointer">
              再同期実行
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-white p-20 rounded-3xl border border-slate-200 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 mx-auto animate-bounce">
              <img src="/logo.png" alt="Loading Logo" className="w-full h-full object-contain" />
            </div>
            <div className="text-slate-400 text-xs font-bold animate-pulse">Y Log データベースと同期中...</div>
          </div>
        ) : (
          <div className='space-y-6'>

            

            {activeTab === 'dashboard' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
                    <div className="text-xs text-slate-400 font-bold">総生徒数</div>
                    <div className="text-3xl font-black text-emerald-600">{globalSummaryStats.totalStudents} <span className="text-xs font-bold text-slate-400">名</span></div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
                    <div className="text-xs text-slate-400 font-bold">教員・管理者</div>
                    <div className="text-3xl font-black text-sky-950">{globalSummaryStats.totalTeachers} <span className="text-xs font-bold text-slate-400">名</span></div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
                    <div className="text-xs text-slate-400 font-bold">登録教材数</div>
                    <div className="text-3xl font-black text-purple-600">{globalSummaryStats.totalMaterials} <span className="text-xs font-bold text-slate-400">件</span></div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
                    <div className="text-xs text-slate-400 font-bold">全体の平均得点</div>
                    <div className="text-3xl font-black text-amber-600">{globalSummaryStats.overallAvgScore} <span className="text-xs font-bold text-slate-400">点</span></div>
                  </div>
                </div>

                

                {/* 正しい各教科の指定テーマカラーリファレンス表示 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">教科テーマカラー ＆ 正しい修正科目定義</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {(Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
                      const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
                      return (
                        <div key={subjectKey} className="p-3 rounded-2xl border space-y-1" style={{ backgroundColor: setting.bgColor, color: setting.color, borderColor: setting.color }}>
                          <div className="font-black text-xs">{setting.label}</div>
                          <div className="text-[9px] font-mono text-slate-500">HEX: {setting.color}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 生徒サマリー */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-extrabold text-emerald-950 flex items-center gap-2">
                        <span>🎓</span> 所属生徒 ({students.length}名)
                      </h3>
                      <button onClick={() => setActiveTab('students')} className="text-xs text-emerald-600 font-bold hover:underline cursor-pointer">
                        すべて表示 ➔
                      </button>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-emerald-50 text-emerald-900 border-b border-emerald-100">
                          <th className="p-3 font-black">氏名</th>
                          <th className="p-3 font-black">校舎</th>
                          <th className="p-3 font-black">独自ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {students.slice(0, 5).map((s) => (
                          <tr key={s.id} className="hover:bg-emerald-50/30">
                            <td className="p-3 font-bold text-slate-900">{s.name}</td>
                            <td className="p-3 text-slate-600">{s.classroom}</td>
                            <td className="p-3 font-mono font-bold text-slate-700">{s.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 最新学習評価ログ */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <span>📝</span> 直近の学習記録 (👑ミッション完了)
                      </h3>
                      <button onClick={() => setActiveTab('logs')} className="text-xs text-slate-600 font-bold hover:underline cursor-pointer">
                        全ログを見る ➔
                      </button>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 border-b border-slate-200">
                          <th className="p-3 font-bold">生徒ID</th>
                          <th className="p-3 font-bold">得点</th>
                          <th className="p-3 font-bold">状態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.slice(0, 5).map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-sky-800 font-bold">{log.user_id}</td>
                            <td className="p-3 font-black text-sky-600">{log.score} 点</td>
                            <td className="p-3 font-bold">
                              {log.is_mission_completed ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-black inline-flex items-center gap-1">
                                  <span>👑</span> ミッション完了
                                </span>
                              ) : (
                                <span className="text-slate-400">通常記録</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2. スケジュール */}
            

            

            

            {activeTab === 'schedule_planner' && (
              <div className="space-y-4">
                
                  <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                    <h3 className="text-sm font-extrabold text-slate-900">全体ひな形</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {STAFF_SCHEDULE_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleSelectStaffTemplate(template.id)}
                          className={`p-4 rounded-2xl border text-left text-xs font-extrabold cursor-pointer ${
                            selectedStaffTemplateId === template.id
                              ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-500/20'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={handleSaveStaffTemplate}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-extrabold cursor-pointer"
                      >
                        このひな形を保存
                      </button>
                    </div>
                  </div>
                

                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-extrabold text-slate-900">週間タイムテーブル</h3>
                    <button
                      type="button"
                      onClick={() => openSlotDraft(scheduleFocusDay, 8)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold cursor-pointer"
                    >
                      ＋ コマを追加
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(SCHEDULE_CATEGORY_MAP) as ScheduleCategoryId[]).map((categoryId) => {
                      const setting = SCHEDULE_CATEGORY_MAP[categoryId] ?? SCHEDULE_CATEGORY_MAP.other;
                      return (
                        <span
                          key={categoryId}
                          className="px-2 py-1 rounded-lg border text-[10px] font-bold"
                          style={{ backgroundColor: setting.bgColor, borderColor: setting.color, color: setting.color }}
                        >
                          {setting.label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="md:hidden grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => setScheduleFocusDay(day.id)}
                        className={`py-3 rounded-xl text-sm font-black cursor-pointer ${
                          scheduleFocusDay === day.id ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <div className="md:hidden">
                    <DayTimetable day={scheduleFocusDay} slots={scheduleSlots} onAddAt={openSlotDraft} onEdit={openSlotEditor} />
                  </div>
                  <div className="hidden md:block">
                    <WeeklyTimetable slots={scheduleSlots} onAddAt={openSlotDraft} onEdit={openSlotEditor} />
                  </div>
                </div>

                {slotDraft && (
                  <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <form onSubmit={handleSaveSlotDraft} className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-sm text-slate-900">{slotDraft.id ? 'コマを修正' : 'コマを追加'}</h4>
                        <button type="button" onClick={() => setSlotDraft(null)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold cursor-pointer">✕</button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
                        <label className="space-y-1">
                          <span className="text-slate-500">曜日</span>
                          <select
                            value={slotDraft.day}
                            onChange={(e) => setSlotDraft({ ...slotDraft, day: e.target.value as WeekdayId })}
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                          >
                            {WEEKDAYS.map((day) => (
                              <option key={day.id} value={day.id}>{day.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">カテゴリ</span>
                          <select
                            value={slotDraft.category}
                            onChange={(e) => setSlotDraft({ ...slotDraft, category: e.target.value as ScheduleCategoryId })}
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                          >
                            {(Object.keys(SCHEDULE_CATEGORY_MAP) as ScheduleCategoryId[]).map((categoryId) => {
                              const setting = SCHEDULE_CATEGORY_MAP[categoryId] ?? SCHEDULE_CATEGORY_MAP.other;
                              return <option key={categoryId} value={categoryId}>{setting.label}</option>;
                            })}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">開始</span>
                          <span className="flex gap-1">
                            <select
                              value={slotDraft.startHour}
                              onChange={(e) => setSlotDraft({ ...slotDraft, startHour: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                            >
                              {SCHEDULE_HOURS.map((hour) => (
                                <option key={hour} value={hour}>{String(hour).padStart(2, '0')}時</option>
                              ))}
                            </select>
                            <select
                              value={slotDraft.startMinute}
                              onChange={(e) => setSlotDraft({ ...slotDraft, startMinute: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                            >
                              {SCHEDULE_MINUTE_OPTIONS.map((minute) => (
                                <option key={minute} value={minute}>{String(minute).padStart(2, '0')}分</option>
                              ))}
                            </select>
                          </span>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">終了</span>
                          <span className="flex gap-1">
                            <select
                              value={slotDraft.endHour}
                              onChange={(e) => {
                                const endHour = Number(e.target.value);
                                setSlotDraft({ ...slotDraft, endHour, endMinute: endHour === 24 ? 0 : slotDraft.endMinute });
                              }}
                              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                            >
                              {Array.from({ length: 25 }, (_, hour) => hour).map((hour) => (
                                <option key={hour} value={hour}>{String(hour).padStart(2, '0')}時</option>
                              ))}
                            </select>
                            <select
                              value={slotDraft.endHour === 24 ? 0 : slotDraft.endMinute}
                              onChange={(e) => setSlotDraft({ ...slotDraft, endMinute: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                            >
                              {(slotDraft.endHour === 24 ? [0] : SCHEDULE_MINUTE_OPTIONS).map((minute) => (
                                <option key={minute} value={minute}>{String(minute).padStart(2, '0')}分</option>
                              ))}
                            </select>
                          </span>
                        </label>
                        <label className="space-y-1 sm:col-span-2">
                          <span className="text-slate-500">内容</span>
                          <input
                            type="text"
                            value={slotDraft.title}
                            onChange={(e) => setSlotDraft({ ...slotDraft, title: e.target.value })}
                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl"
                          />
                        </label>
                      </div>
                      <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-black text-sky-800">
                        合計 {Math.max(0, (slotDraft.endHour * 60 + (slotDraft.endHour === 24 ? 0 : slotDraft.endMinute)) - (slotDraft.startHour * 60 + slotDraft.startMinute))}分
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        {slotDraft.id ? (
                          <button type="button" onClick={handleDeleteSlotDraft} className="px-4 py-2 bg-white border border-red-200 text-red-700 rounded-xl text-xs font-extrabold cursor-pointer">
                            削除
                          </button>
                        ) : <span />}
                        <button type="submit" className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-extrabold cursor-pointer">
                          保存
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3. 生徒一覧 */}
            {activeTab === 'students' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                  <h3 className="text-base font-extrabold text-emerald-950">🎓 所属生徒管理一覧 ({visibleStudents.length}名)</h3>
                  <button onClick={() => { setNewUserForm(blankUserForm('student')); setIsUserModalOpen(true); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-md cursor-pointer">
                    ＋ 新規生徒を個別登録
                  </button>
                </div>

                <form className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-3 shadow-md" onSubmit={(e) => e.preventDefault()}>
                    <div className="text-sm font-extrabold text-amber-950">📢 チェックした生徒へお知らせ・コメント送信</div>
                    <textarea
                      value={messageDraft}
                      onChange={(e) => setMessageDraft(e.target.value)}
                      rows={4}
                      placeholder="生徒へ送るお知らせ・コメントを入力..."
                      className="w-full bg-white border border-amber-300 p-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold text-amber-800">選択中 {selectedStudentIds.length} 名。送信日時は自動で記録されます。</p>
                      <button
                        type="button"
                        disabled={false}
                        onClick={handleSendStudentMessages}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-extrabold shadow-md cursor-pointer"
                      >
                        選択中の生徒へ送信
                      </button>
                    </div>
                  </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-medium">
                    <thead>
                      <tr className="bg-emerald-50 text-emerald-900 border-b border-emerald-100">
                        <th className="p-2 align-bottom whitespace-nowrap">
                          <div className="font-black mb-1">選択</div>
                          <input
                            type="checkbox"
                            aria-label="表示中の生徒をすべて選択"
                            checked={visibleStudents.length > 0 && visibleStudents.every((student) => selectedStudentIds.includes(student.id))}
                            onChange={(e) => {
                              const visibleIds = visibleStudents.map((student) => student.id);
                              if (e.target.checked) {
                                setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                              } else {
                                setSelectedStudentIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                              }
                            }}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        </th>
                        <th className="p-2 align-bottom font-black whitespace-nowrap">操作</th>
                        {STUDENT_LIST_COLUMNS.map((column) => {
                          if (column.key === 'password') {
                            return (
                              <th key={column.key} className="p-2 align-bottom whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <span className="font-black">パスワード</span>
                                  <button
                                    type="button"
                                    onClick={() => setStudentPasswordsVisible((visible) => !visible)}
                                    className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded-md text-[10px] font-extrabold text-slate-700 cursor-pointer"
                                  >
                                    {studentPasswordsVisible ? '隠す' : '表示'}
                                  </button>
                                </div>
                              </th>
                            );
                          }
                          const options = Array.from(new Set(students.map((student) => String(student[column.key] || '')).filter(Boolean))).sort();
                          return (
                            <th key={column.key} className="p-2 align-bottom whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span className="font-black">{column.label}</span>
                                <select
                                  aria-label={`${column.label}で絞り込み`}
                                  value={studentFieldFilters[column.key]}
                                  onChange={(e) => setStudentFieldFilters((prev) => ({ ...prev, [column.key]: e.target.value }))}
                                  className="max-w-[76px] bg-white border border-emerald-200 text-[10px] font-bold text-slate-700 rounded-md px-1 py-0.5 cursor-pointer"
                                >
                                  <option value="ALL">すべて</option>
                                  {options.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleStudents.map((student) => (
                        <tr key={student.id} className="hover:bg-emerald-50/40">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`${student.name}を選択`}
                              checked={selectedStudentIds.includes(student.id)}
                              onChange={(e) => {
                                setSelectedStudentIds((prev) => (
                                  e.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id)
                                ));
                              }}
                              className="w-4 h-4 accent-emerald-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openStudentEditModal(student)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-extrabold border border-slate-200 cursor-pointer whitespace-nowrap"
                              >
                                ✏️ 編集
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStudent(student)}
                                className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 rounded-xl text-xs font-extrabold border border-red-200 cursor-pointer whitespace-nowrap"
                              >
                                🗑️ 削除
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedStudentId(student.id);
                                  setActiveTab('student_detail');
                                }}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                              >
                                個人成長カルテを開く ➔
                              </button>
                            </div>
                          </td>
                          {STUDENT_LIST_COLUMNS.map((column) => (
                            <td key={column.key} className={`p-2 ${column.key === 'name' ? 'font-bold text-slate-900' : column.key === 'id' || column.key === 'password' ? 'font-mono font-bold text-slate-700' : 'text-slate-600'}`}>
                              {column.key === 'role' ? (
                                <span className="px-2.5 py-1 text-[10px] rounded-md font-extrabold bg-emerald-100 text-emerald-700">{student.role}</span>
                              ) : column.key === 'password' ? (
                                student.password ? (studentPasswordsVisible ? student.password : '••••') : '未設定'
                              ) : (
                                student[column.key] || '-'
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'pending_delete' && currentUser.role === 'admin' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                  <h3 className="text-base font-extrabold text-rose-950">データを消す生徒 ({pendingDeleteStudents.length}名)</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { void handleRestorePendingStudents(); }}
                      className="px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-extrabold border border-emerald-200 cursor-pointer"
                    >
                      この生徒はデータを消す生徒ではありません
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handlePurgePendingStudents(); }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-extrabold shadow-md cursor-pointer"
                    >
                      データを完全に消去します
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-medium">
                    <thead>
                      <tr className="bg-rose-50 text-rose-900 border-b border-rose-100">
                        <th className="p-2 align-bottom whitespace-nowrap">
                          <div className="font-black mb-1">選択</div>
                          <input
                            type="checkbox"
                            aria-label="表示中の削除待ち生徒をすべて選択"
                            checked={pendingDeleteStudents.length > 0 && pendingDeleteStudents.every((student) => pendingDeleteSelectedIds.includes(student.id))}
                            onChange={(e) => {
                              const visibleIds = pendingDeleteStudents.map((student) => student.id);
                              if (e.target.checked) {
                                setPendingDeleteSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                              } else {
                                setPendingDeleteSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                              }
                            }}
                            className="w-4 h-4 accent-rose-600 cursor-pointer"
                          />
                        </th>
                        <th className="p-2 font-black whitespace-nowrap">氏名</th>
                        <th className="p-2 font-black whitespace-nowrap">学年</th>
                        <th className="p-2 font-black whitespace-nowrap">所属校舎</th>
                        <th className="p-2 font-black whitespace-nowrap">独自ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingDeleteStudents.map((student) => (
                        <tr key={student.id} className="hover:bg-rose-50/40">
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`${student.name}を選択`}
                              checked={pendingDeleteSelectedIds.includes(student.id)}
                              onChange={(e) => {
                                setPendingDeleteSelectedIds((prev) => (
                                  e.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id)
                                ));
                              }}
                              className="w-4 h-4 accent-rose-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-bold text-slate-900">{student.name}</td>
                          <td className="p-2 text-slate-600">{student.grade || '-'}</td>
                          <td className="p-2 text-slate-600">{student.classroom || '-'}</td>
                          <td className="p-2 font-mono font-bold text-slate-700">{student.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pendingDeleteStudents.length === 0 && (
                    <p className="p-6 text-center text-xs font-bold text-slate-400">削除待ちの生徒はいません。</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4. 生徒個人成長カルテ (修正教科別の個人成長チャート) */}
            {activeTab === 'student_detail' && selectedStudent && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <span className="text-xs text-slate-400 font-bold font-mono">独自生徒ID: {selectedStudent.id}</span>
                    <h3 className="text-2xl font-black text-slate-900 mt-0.5">{selectedStudent.name} さんの個人成長カルテ</h3>
                    <p className="text-xs text-slate-500 mt-0.5">所属校舎: {selectedStudent.classroom}</p>
                  </div>
                  <button onClick={() => setActiveTab('students')} className="px-4 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer">
                    ⬅ 生徒一覧に戻る
                  </button>
                </div>

                {/* 生徒一人ひとりの修正教科別成長グラフ・インセンティブカード */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <h4 className="text-sm font-extrabold text-slate-900">📊 修正教科別成長スコア ＆ 👑ミッション達成数</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {selectedStudentSubjectStats.map((st) => {
                      const setting = subjectSetting(st.subject);
                      return (
                        <div key={st.subject} className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: setting.bgColor, color: setting.color, borderColor: setting.color }}>
                          <div className="font-black text-xs">{st.subject}</div>
                          <div className="text-2xl font-black text-slate-900">{st.avgScore} <span className="text-[10px] font-bold text-slate-400">点</span></div>
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 pt-1 border-t border-slate-200/60">
                            <span>学習: {st.totalHours}h</span>
                            <span className="text-amber-700 font-black">👑 x{st.crownCount}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ログ履歴 */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <h4 className="text-sm font-extrabold text-slate-900">積算学習ログ履歴 ({selectedStudentLogs.length}件)</h4>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-200">
                        <th className="p-3 font-bold">ログID</th>
                        <th className="p-3 font-bold">教材ID</th>
                        <th className="p-3 font-bold">得点</th>
                        <th className="p-3 font-bold">時間</th>
                        <th className="p-3 font-bold">ミッション状態</th>
                        <th className="p-3 font-bold">メモ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedStudentLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-slate-500">{log.id}</td>
                          <td className="p-3 font-mono font-bold text-slate-700">{log.material_id}</td>
                          <td className="p-3 font-black text-sky-600">{log.score} 点</td>
                          <td className="p-3 text-slate-600">{log.time_spent_minutes} 分</td>
                          <td className="p-3">
                            {log.is_mission_completed ? (
                              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-md font-black text-[10px] inline-flex items-center gap-1">
                                <span>👑</span> ミッション完了
                              </span>
                            ) : (
                              <span className="text-slate-400">通常</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600">{log.comment || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5. 教材マスタ (各教科テーマカラー対応) */}
            

            {activeTab === 'materials' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <h3 className="text-base font-extrabold text-purple-950">📚 教材マスタ ({filteredMaterials.length}件)</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={openCreateMaterialModal} className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold rounded-2xl shadow-md cursor-pointer">
                      ＋ 新規教材登録
                    </button>
                    <button onClick={() => { setMaterialCsvParsedPreview([]); setMaterialCsvStatusMessage({ type: null, text: '' }); setIsMaterialCsvModalOpen(true); }} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-2xl shadow-md cursor-pointer">
                      📁 教材CSV一括登録
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-extrabold text-slate-600">教科別並び替え</label>
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    className="bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
                    style={subjectFilter ? { color: subjectSetting(subjectFilter).color, backgroundColor: subjectSetting(subjectFilter).bgColor, borderColor: subjectSetting(subjectFilter).color } : undefined}
                  >
                    <option value="">全教科（教科ごと）</option>
                    {(Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
                      const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
                      return <option key={subjectKey} value={subjectKey}>{setting.label}</option>;
                    })}
                  </select>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs font-medium">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-200">
                        <th className="p-3 font-black w-40">表示順序</th>
                        <th className="p-3 font-black w-36">教科</th>
                        <th className="p-3 font-black">教材タイトル</th>
                        <th className="p-3 font-black">説明</th>
                        <th className="p-3 font-black w-44">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMaterials.map((m) => {
                        const siblings = materialsForSubject(materials, m.subject);
                        const siblingIndex = siblings.findIndex((item) => item.id === m.id);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50 align-middle">
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveMaterialOrder(m, -1)}
                                  disabled={siblingIndex <= 0}
                                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-black disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                                  aria-label="上へ"
                                >
                                  ↑
                                </button>
                                <input
                                  type="number"
                                  key={`${m.id}-${m.display_order}`}
                                  defaultValue={m.display_order ?? ''}
                                  onBlur={(e) => handleDisplayOrderCommit(m, e.target.value)}
                                  className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-center font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleMoveMaterialOrder(m, 1)}
                                  disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1}
                                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-700 font-black disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                                  aria-label="下へ"
                                >
                                  ↓
                                </button>
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-extrabold border"
                                style={{ color: subjectSetting(m.subject_code || m.subject).color, backgroundColor: subjectSetting(m.subject_code || m.subject).bgColor, borderColor: subjectSetting(m.subject_code || m.subject).color }}
                              >
                                {subjectLabel(m.subject_code || m.subject)}
                              </span>
                            </td>
                            <td className="p-3 font-extrabold text-slate-900">{m.title}</td>
                            <td className="p-3 text-slate-600">{m.description || ''}</td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <button onClick={() => openEditMaterialModal(m)} className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer">
                                  ✏️ 編集
                                </button>
                                <button onClick={() => handleDeleteMaterial(m)} className="px-3 py-2 bg-white hover:bg-red-50 text-red-700 font-bold text-xs rounded-xl border border-red-200 cursor-pointer">
                                  🗑️ 削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 6. 教師・管理者一覧 */}
            {activeTab === 'teachers' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-sky-950">👨‍🏫 所属教師・管理者管理一覧 ({teachersAndAdmins.length}名)</h3>
                  <button onClick={() => { setNewUserForm(blankUserForm('teacher')); setIsUserModalOpen(true); }} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-extrabold shadow-md cursor-pointer">
                    ＋ 新規教師・管理者を個別登録
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-medium">
                    <thead>
                      <tr className="bg-sky-50 text-sky-900 border-b border-sky-100">
                        <th className="p-3.5 font-black">操作</th>
                        <th className="p-3.5 font-black">氏名</th>
                        <th className="p-3.5 font-black">担当校舎</th>
                        <th className="p-3.5 font-black">区分</th>
                        <th className="p-3.5 font-black">独自ID</th>
                        <th className="p-3.5 font-black">
                          <div className="flex items-center gap-1">
                            <span>パスワード</span>
                            <button
                              type="button"
                              onClick={() => setTeacherPasswordsVisible((visible) => !visible)}
                              className="px-1.5 py-0.5 bg-white border border-sky-200 rounded-md text-[10px] font-extrabold text-slate-700 cursor-pointer"
                            >
                              {teacherPasswordsVisible ? '隠す' : '表示'}
                            </button>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teachersAndAdmins.map((teacher) => (
                        <tr key={teacher.id} className="hover:bg-sky-50/40">
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openTeacherEditModal(teacher)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-extrabold border border-slate-200 cursor-pointer whitespace-nowrap"
                              >
                                ✏️ 編集
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTeacher(teacher)}
                                className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 rounded-xl text-xs font-extrabold border border-red-200 cursor-pointer whitespace-nowrap"
                              >
                                🗑️ 削除
                              </button>
                            </div>
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">{teacher.name}</td>
                          <td className="p-3.5 text-slate-600">{teacher.classroom}</td>
                          <td className="p-3.5">
                            <span className={`px-2.5 py-1 text-[10px] rounded-md font-extrabold ${teacher.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                              {teacher.role}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-700 font-bold">{teacher.id}</td>
                          <td className="p-3.5 font-mono text-slate-700 font-bold">
                            {teacher.password ? (teacherPasswordsVisible ? teacher.password : '••••') : '未設定'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'progress' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500">校舎・教室選択</label>
                    <select
                      value={progressBoard.classroom}
                      disabled={progressBoard.viewerRole === 'teacher'}
                      onChange={(event) => setProgressClassroom(event.target.value)}
                      className="bg-white border border-slate-200 text-sm font-black text-slate-900 rounded-2xl px-4 py-3 cursor-pointer disabled:bg-slate-100 disabled:cursor-default"
                    >
                      {progressBoard.viewerRole !== 'teacher' && <option value="ALL">全校舎・全教室</option>}
                      {(progressBoard.viewerRole === 'teacher' ? [progressBoard.classroom].filter(Boolean) : progressBoard.classrooms).map((room) => (
                        <option key={room} value={room}>{room}</option>
                      ))}
                    </select>
                    {progressBoard.viewerRole === 'teacher' && (
                      <p className="text-[11px] font-bold text-slate-400">所属校舎の生徒だけを表示しています。</p>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-400">
                    今週 {progressBoard.weekLabel} / 今月 {progressBoard.monthLabel}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900 border-b border-slate-200">
                        <th className="p-3.5 font-black">生徒氏名</th>
                        <th className="p-3.5 font-black">
                          <button type="button" onClick={() => {
                            if (progressSortKey === 'week') setProgressSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
                            else { setProgressSortKey('week'); setProgressSortDir('desc'); }
                          }} className="font-black cursor-pointer">
                            今週の総学習時間 {progressSortKey === 'week' ? (progressSortDir === 'desc' ? '↓' : '↑') : ''}
                          </button>
                        </th>
                        <th className="p-3.5 font-black">
                          <button type="button" onClick={() => {
                            if (progressSortKey === 'month') setProgressSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
                            else { setProgressSortKey('month'); setProgressSortDir('desc'); }
                          }} className="font-black cursor-pointer">
                            今月の総学習時間 {progressSortKey === 'month' ? (progressSortDir === 'desc' ? '↓' : '↑') : ''}
                          </button>
                        </th>
                        <th className="p-3.5 font-black">今週のミッション達成数</th>
                        <th className="p-3.5 font-black">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {progressBoard.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-sm font-bold text-slate-400">この教室の生徒はまだいません。</td>
                        </tr>
                      ) : progressBoard.rows.map((row) => (
                        <tr key={row.student.id} className="hover:bg-slate-50">
                          <td className="p-3.5">
                            <div className="font-black text-slate-900">{row.student.name}</div>
                            <div className="text-[11px] font-bold text-slate-400 mt-0.5">{row.student.id} / {row.student.grade || '学年未設定'}</div>
                          </td>
                          <td className="p-3.5 font-black text-slate-800">{formatStudyDuration(row.weekMinutes)}</td>
                          <td className="p-3.5 font-black text-slate-800">{formatStudyDuration(row.monthMinutes)}</td>
                          <td className="p-3.5 font-black text-amber-700">👑 {row.weekCrowns}</td>
                          <td className="p-3.5">
                            <button
                              type="button"
                              onClick={() => {
                                setMeetingStudentId(row.student.id);
                                setMeetingWeekStart(weekStartKey(todayDateKey()));
                                setActiveTab('logs');
                              }}
                              className="px-3 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-black cursor-pointer"
                            >
                              個別に詳細を見る
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <label className="block text-xs font-black text-slate-500">対象生徒の選択</label>
                      <input
                        type="text"
                        value={meetingStudentQuery}
                        onChange={(event) => setMeetingStudentQuery(event.target.value)}
                        placeholder="氏名・IDで絞り込み（例: 山田太郎 / exs001）"
                        className="w-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-900 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <select
                        value={meetingStudentId}
                        onChange={(event) => {
                          setMeetingStudentId(event.target.value);
                          setMeetingWeekStart(weekStartKey(todayDateKey()));
                        }}
                        className="w-full bg-white border border-slate-200 text-sm font-black text-slate-900 rounded-2xl px-4 py-3 cursor-pointer"
                      >
                        <option value="">生徒を選択</option>
                        {meetingRoster.map((student) => (
                          <option key={student.id} value={student.id}>{student.name} / {student.id}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => setIsLogModalOpen(true)} className="px-4 py-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold rounded-2xl shadow-md cursor-pointer shrink-0">
                      ＋ 学習記録を追加
                    </button>
                  </div>
                </div>
                {!meetingStudentId ? (
                  <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm text-sm font-bold text-slate-400">
                    生徒を選ぶと、その週のトップ画面（月〜日）と学習時間の積み上げが表示されます。
                  </div>
                ) : (
                  <>
                    <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
                      <button type="button" onClick={() => setMeetingWeekStart((key) => shiftDateKey(key, -7))} className="w-10 h-10 rounded-2xl bg-slate-100 text-lg font-black cursor-pointer">◀</button>
                      <div className="text-center">
                        <div className="text-sm font-black text-slate-900">{meetingBoard.weekLabel}</div>
                        <div className="text-[11px] font-bold text-slate-400">{users.find((user) => user.id === meetingStudentId)?.name || '生徒'} / {meetingStudentId}</div>
                      </div>
                      <button type="button" onClick={() => setMeetingWeekStart((key) => {
                        const next = shiftDateKey(key, 7);
                        return next > weekStartKey(todayDateKey()) ? key : next;
                      })} className="w-10 h-10 rounded-2xl bg-slate-100 text-lg font-black cursor-pointer">▶</button>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <StudyMaterialStack
                        heading="週の総学習時間"
                        rangeLabel={meetingBoard.weekLabel}
                        totalMinutes={meetingBoard.week.totalMinutes}
                        subjects={meetingBoard.week.subjects}
                      />
                      <StudyMaterialStack
                        heading="月の総学習時間"
                        rangeLabel={meetingBoard.monthLabel}
                        totalMinutes={meetingBoard.month.totalMinutes}
                        subjects={meetingBoard.month.subjects}
                      />
                    </div>
                    <MeetingWeekBoard
                      weekStart={meetingWeekStart}
                      plans={meetingBoard.plans}
                      studentLogs={meetingBoard.studentLogs}
                      slots={logSlots}
                      catalog={materials}
                      userId={meetingStudentId}
                      useStoredClock
                    />
                    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                      <h3 className="text-sm font-black text-slate-900">この週の学習ログ</h3>
                      {meetingBoard.weekLogs.length === 0 ? (
                        <p className="text-xs font-bold text-slate-400">この週の学習ログはありません。</p>
                      ) : [...meetingBoard.weekLogs].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map((log) => {
                        const student = users.find((user) => user.id === log.user_id);
                        return (
                          <article key={log.id} className="rounded-2xl border border-slate-200 p-4 space-y-2">
                            <div className="text-[11px] font-bold text-slate-400">学習日時</div>
                            <div className="text-base font-black text-slate-900">{formatMeetingWhen(log, logSlots[log.id])}</div>
                            <div className="text-sm font-black text-slate-800">{student?.name || '氏名未登録'} / {log.user_id}</div>
                            <div className="text-sm font-bold text-slate-900 truncate">{meetingMaterialTitle(log.material_id, log.user_id, materials)}</div>
                            {teacherSubjectLabel(log.subject) ? (
                              <div className="text-xs font-black truncate" style={{ color: subjectSetting(log.subject).color }}>{teacherSubjectLabel(log.subject)}</div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-black text-slate-700">{log.time_spent_minutes}分</span>
                              {log.is_mission_completed ? (
                                <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-black">👑 ミッション完了</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-black">通常学習</span>
                              )}
                            </div>
                            {log.comment ? (
                              <p className="text-sm font-bold text-slate-700">自己評価・メモ: {log.comment}</p>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        )}
      </main>

      {/* モーダル群 */}
      {/* モーダル: 教師・生徒個別手動登録モーダル */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-sky-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm flex items-center gap-2">👤 新規ユーザー (教師/生徒/管理者) 個別登録</h4>
              <button onClick={() => setIsUserModalOpen(false)} className="text-sky-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-600 mb-1">独自ID (id) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newUserForm.id}
                  onChange={(e) => setNewUserForm({ ...newUserForm, id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="例: ext005, teacher03"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">パスワード</label>
                <input
                  type="text"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder=""
                />
                <p className="mt-1 text-[10px] font-bold text-slate-400">未入力の場合は、独自IDまたは1234でログインできます。</p>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="例: 山手 太郎"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">区分 (権限)</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none cursor-pointer"
                >
                  <option value="student">生徒 (student)</option>
                  <option value="teacher">講師 (teacher)</option>
                  {currentUser.role === 'admin' && (
                    <option value="admin">管理者 (admin)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">所属校舎</label>
                <select
                  value={newUserForm.classroom}
                  onChange={(e) => setNewUserForm({ ...newUserForm, classroom: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none cursor-pointer"
                >
                  <option value="本川越校">本川越校</option>
                  <option value="川越校">川越校</option>
                  <option value="ＥＸ校">ＥＸ校</option>
                </select>
              </div>

              {newUserForm.role === 'student' && (
                <StudentProfileFields
                  value={newUserForm}
                  onChange={(key, next) => setNewUserForm((prev) => ({ ...prev, [key]: next }))}
                />
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsUserModalOpen(false)} 
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-sky-600 text-white rounded-xl shadow-md font-bold cursor-pointer"
                >
                  登録実行
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isStudentEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-emerald-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">生徒情報編集</h4>
              <button type="button" onClick={() => setIsStudentEditModalOpen(false)} className="text-emerald-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSaveStudentEdit} className="p-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-600 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={studentEditForm.name}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">学年</label>
                  <input
                    type="text"
                    value={studentEditForm.grade}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, grade: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">高校</label>
                  <input
                    type="text"
                    value={studentEditForm.highSchool}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, highSchool: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">所属校舎</label>
                <select
                  value={studentEditForm.classroom}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, classroom: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                >
                  <option value="本川越校">本川越校</option>
                  <option value="川越校">川越校</option>
                  <option value="ＥＸ校">ＥＸ校</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">区分</label>
                  <select
                    value={studentEditForm.role}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, role: e.target.value as UserRole })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                  >
                    <option value="student">生徒 (student)</option>
                    <option value="teacher">講師 (teacher)</option>
                    <option value="admin">管理者 (admin)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">独自ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={studentEditForm.id}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, id: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">パスワード</label>
                <input
                  type="text"
                  value={studentEditForm.password}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder=""
                />
                <p className="mt-1 text-[10px] font-bold text-slate-400">空欄のまま保存すると、独自IDまたは1234でログインできます。</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {STUDENT_PROFILE_FIELDS.filter((field) => field.key !== 'grade' && field.key !== 'highSchool').map((field) => (
                  <div key={field.key}>
                    <label className="block text-slate-600 mb-1">{field.key === 'biology' ? '生徒(生物)' : field.label}</label>
                    <input
                      type="text"
                      value={studentEditForm[field.key]}
                      onChange={(e) => setStudentEditForm({ ...studentEditForm, [field.key]: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsStudentEditModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer">キャンセル</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-xl shadow-md cursor-pointer">保存する</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTeacherEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-sky-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">教師・管理者情報編集</h4>
              <button type="button" onClick={() => setIsTeacherEditModalOpen(false)} className="text-sky-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSaveTeacherEdit} className="p-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-600 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={studentEditForm.name}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">担当校舎</label>
                <select
                  value={studentEditForm.classroom}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, classroom: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                >
                  <option value="本川越校">本川越校</option>
                  <option value="川越校">川越校</option>
                  <option value="ＥＸ校">ＥＸ校</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">区分</label>
                  <select
                    value={studentEditForm.role}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, role: e.target.value as UserRole })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl cursor-pointer"
                  >
                    <option value="teacher">講師 (teacher)</option>
                    <option value="admin">管理者 (admin)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">独自ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={studentEditForm.id}
                    onChange={(e) => setStudentEditForm({ ...studentEditForm, id: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">パスワード</label>
                <input
                  type="text"
                  value={studentEditForm.password}
                  onChange={(e) => setStudentEditForm({ ...studentEditForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder=""
                />
                <p className="mt-1 text-[10px] font-bold text-slate-400">空欄のまま保存すると、独自IDまたは1234でログインできます。</p>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsTeacherEditModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer">キャンセル</button>
                <button type="submit" className="px-5 py-2 bg-sky-600 text-white rounded-xl shadow-md cursor-pointer">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      

      {activeNotice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">お知らせ閲覧</h4>
              <button type="button" onClick={() => setActiveNotice(null)} className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="font-bold text-slate-500">送信日時: {formatSentAt(activeNotice.sent_at)}</p>
              <p className="font-bold text-slate-500">送信者: {activeNotice.sender_name}</p>
              <p className="whitespace-pre-wrap text-sm font-bold text-slate-900 leading-relaxed">{activeNotice.body}</p>
              <div className="text-right">
                <button type="button" onClick={() => setActiveNotice(null)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer">閉じる</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* サクサク学習記録モーダル (👑ミッション完了選択可能) */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-sky-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm flex items-center gap-2">📝 学習記録の追加</h4>
              <button onClick={() => setIsLogModalOpen(false)} className="text-sky-300 font-bold text-lg cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleCreateLog} className="p-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-600 mb-1">生徒ID (例: ext002)</label>
                <input type="text" required value={newLogForm.user_id} onChange={(e) => setNewLogForm({ ...newLogForm, user_id: e.target.value })} className="w-full bg-slate-50 border p-2.5 rounded-xl font-mono" />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">教科</label>
                <select
                  required
                  value={newLogForm.subject}
                  onChange={(e) => setNewLogForm({ ...newLogForm, subject: e.target.value as SubjectType | '', material_id: '' })}
                  className="w-full bg-slate-50 border p-2.5 rounded-xl cursor-pointer"
                >
                  <option value="">教科を選択</option>
                  {(Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
                    const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
                    return <option key={subjectKey} value={subjectKey}>{setting.label}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-slate-600 mb-1">テキスト</label>
                <select
                  required
                  value={newLogForm.material_id}
                  onChange={(e) => setNewLogForm({ ...newLogForm, material_id: e.target.value })}
                  className="w-full bg-slate-50 border p-2.5 rounded-xl cursor-pointer"
                >
                  <option value="">テキストを選択</option>
                  {logMaterialChoices.map((material) => (
                    <option key={material.id} value={material.id}>{material.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 mb-1">得点</label>
                  <input type="number" required value={newLogForm.score} onChange={(e) => setNewLogForm({ ...newLogForm, score: Number(e.target.value) })} className="w-full bg-slate-50 border p-2.5 rounded-xl" />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">勉強時間(分)</label>
                  <StudyMinuteChips
                    value={newLogForm.time_spent_minutes}
                    onChange={(minutes) => setNewLogForm({ ...newLogForm, time_spent_minutes: minutes })}
                  />
                  <input type="number" required value={newLogForm.time_spent_minutes} onChange={(e) => setNewLogForm({ ...newLogForm, time_spent_minutes: Number(e.target.value) })} className="w-full bg-slate-50 border p-2.5 rounded-xl mt-2" />
                </div>
              </div>

              {/* 👑ミッション完了選択トグル */}
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-amber-900 text-xs">👑 ミッション完了判定</div>
                  <div className="text-[10px] text-amber-700">オンにすると学習ログに黄金の王冠マークが付きます！</div>
                </div>
                <input
                  type="checkbox"
                  checked={newLogForm.is_mission_completed}
                  onChange={(e) => setNewLogForm({ ...newLogForm, is_mission_completed: e.target.checked })}
                  className="w-5 h-5 accent-amber-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">感想・メモ</label>
                <textarea value={newLogForm.comment} onChange={(e) => setNewLogForm({ ...newLogForm, comment: e.target.value })} className="w-full bg-slate-50 border p-2.5 rounded-xl" rows={2} />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsLogModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer">キャンセル</button>
                <button type="submit" className="px-5 py-2 bg-sky-600 text-white rounded-xl shadow-md cursor-pointer">記録を保存 👑</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isStudentCsvModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-emerald-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">🎓 生徒専用CSV一括登録</h4>
              <button onClick={() => setIsStudentCsvModalOpen(false)} className="text-emerald-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs text-emerald-950 space-y-2">
                <p className="font-extrabold break-all">📄 CSVヘッダー仕様: id,name,high_school,grade,branch_id,password,math,english,modern_jp,classic_jp,physics,chemistry,biology,jp_history,world_history,individual</p>
                <button
                  type="button"
                  onClick={downloadStudentCsvTemplate}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-sm cursor-pointer"
                >
                  📥 生徒用雛形CSVをダウンロード(BOM付きUTF-8)
                </button>
                <p>※ role は student です。password が空欄の既存データは維持され、未設定の場合は独自IDまたは1234でログインできます。</p>
              </div>
              <div className="border-2 border-dashed border-slate-300 p-6 rounded-2xl text-center bg-slate-50">
                <input type="file" accept=".csv" onChange={handleCsvFileSelect} disabled={csvUploading} className="block w-full text-xs text-slate-500" />
              </div>
              {csvStatusMessage.text && (
                <p className={`text-xs font-bold ${csvStatusMessage.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{csvStatusMessage.text}</p>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsStudentCsvModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">閉じる</button>
              {csvParsedPreview.length > 0 && csvImportKind === 'student' && (
                <button onClick={executeCsvImport} disabled={csvUploading} className="px-5 py-2 bg-emerald-600 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer">
                  登録実行
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isTeacherCsvModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-sky-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">👨‍🏫 教師専用CSV一括登録</h4>
              <button onClick={() => setIsTeacherCsvModalOpen(false)} className="text-sky-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-sky-50 border border-sky-200 p-4 rounded-2xl text-xs text-sky-950 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold">📄 CSVヘッダー仕様: id,password,name,role,classroom</p>
                  <button
                    type="button"
                    onClick={downloadTeacherCsvTemplate}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold rounded-xl shadow-sm cursor-pointer"
                  >
                    📥 雛形CSVをダウンロード
                  </button>
                </div>
                <p>※ role は teacher のみです。管理者以外は admin を登録できません。password が空欄のときは、既存のパスワードを維持します。</p>
              </div>
              <div className="border-2 border-dashed border-slate-300 p-6 rounded-2xl text-center bg-slate-50">
                <input type="file" accept=".csv" onChange={handleCsvFileSelect} disabled={csvUploading} className="block w-full text-xs text-slate-500" />
              </div>
              {csvStatusMessage.text && (
                <p className={`text-xs font-bold ${csvStatusMessage.type === 'error' ? 'text-red-600' : 'text-sky-700'}`}>{csvStatusMessage.text}</p>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsTeacherCsvModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">閉じる</button>
              {csvParsedPreview.length > 0 && csvImportKind === 'teacher' && (
                <button onClick={executeCsvImport} disabled={csvUploading} className="px-5 py-2 bg-sky-600 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer">
                  登録実行
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isMaterialCsvModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-emerald-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">📁 教材CSV一括インポート</h4>
              <button onClick={() => setIsMaterialCsvModalOpen(false)} className="text-emerald-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs text-emerald-950 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold">📄 CSVヘッダー仕様: title,subject,description</p>
                  <button
                    type="button"
                    onClick={downloadMaterialCsvTemplate}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-sm cursor-pointer"
                  >
                    📥 教材用雛形CSVをダウンロード (BOM付きUTF-8)
                  </button>
                </div>
                <p>id・作成者・教科カラーは取り込み時に自動で付きます。subject には次の英語キーを入れてください: {SUBJECT_CODES.join(', ')}</p>
              </div>
              <div className="border-2 border-dashed border-slate-300 p-6 rounded-2xl text-center bg-slate-50">
                <input type="file" accept=".csv" onChange={handleMaterialCsvFileSelect} disabled={materialCsvUploading} className="block w-full text-xs text-slate-500" />
              </div>
              {materialCsvStatusMessage.text && (
                <p className={`text-xs font-bold ${materialCsvStatusMessage.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {materialCsvStatusMessage.text}
                </p>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsMaterialCsvModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">閉じる</button>
              {materialCsvParsedPreview.length > 0 && (
                <button onClick={executeMaterialCsvImport} disabled={materialCsvUploading} className="px-5 py-2 bg-emerald-600 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer">
                  登録実行
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* モーダル: 教材の新規登録・編集 */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-purple-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm flex items-center gap-2">
                {editingMaterialId ? '📚 教材マスタ編集' : '📚 新規教材登録'}
              </h4>
              <button onClick={() => { setIsMaterialModalOpen(false); resetMaterialForm(); }} className="text-purple-300 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleCreateMaterial} className="p-6 space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-600 mb-1">教材タイトル</label>
                <input
                  type="text"
                  required
                  value={newMaterialForm.title}
                  onChange={(e) => setNewMaterialForm({ ...newMaterialForm, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder=""
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">教科</label>
                <select
                  value={newMaterialForm.subject}
                  onChange={(e) => setNewMaterialForm({ ...newMaterialForm, subject: e.target.value as SubjectCode | '' })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none cursor-pointer"
                >
                  <option value=""></option>
                  {(Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
                    const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
                    return <option key={subjectKey} value={subjectKey}>{setting.label}</option>;
                  })}
                </select>
                {newMaterialForm.subject !== '' && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full border border-slate-200"
                      style={{ backgroundColor: subjectSetting(newMaterialForm.subject).color }}
                    />
                    <span className="text-[11px] font-bold text-slate-500">
                      教科カラー自動設定: {subjectSetting(newMaterialForm.subject).color}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 mb-1">教材説明</label>
                <textarea
                  value={newMaterialForm.description}
                  onChange={(e) => setNewMaterialForm({ ...newMaterialForm, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={2}
                  placeholder=""
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => { setIsMaterialModalOpen(false); resetMaterialForm(); }} 
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl shadow-md font-bold cursor-pointer"
                >
                  {editingMaterialId ? '更新保存' : '登録実行'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      


      

      

      

    </div>
  
  );
  }

  function renderStudentScreen(currentUser: User) {
  return (
    <div className={`bg-slate-100 font-sans text-slate-800 antialiased selection:bg-sky-500 selection:text-white ${activeTab === 'schedule_planner' ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
      
      {/* Toast通知 */}
      <div className="fixed top-5 right-5 z-50 space-y-2 pointer-events-none max-w-sm w-full">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-start justify-between gap-3 animate-in slide-in-from-top duration-300 ${
              n.type === 'success'
                ? 'bg-emerald-900/90 text-white border-emerald-500/50'
                : n.type === 'error'
                ? 'bg-red-900/90 text-white border-red-500/50'
                : 'bg-slate-900/90 text-white border-slate-700/50'
            }`}
          >
            <div className="space-y-0.5">
              <div className="text-[10px] opacity-60 font-mono">{n.timestamp}</div>
              <p className="text-xs font-bold leading-relaxed">{n.message}</p>
            </div>
            <button onClick={() => removeNotification(n.id)} className="text-white/60 hover:text-white font-bold text-xs cursor-pointer">✕</button>
          </div>
        ))}
      </div>

      {/* 統合サイドバー（生徒画面では描画しない） */}
      

      {/* メインエリア */}
      <main className={activeTab === 'schedule_planner' ? 'h-dvh max-h-dvh overflow-hidden flex flex-col p-2 pb-[4.6rem] gap-1.5' : 'min-h-screen min-w-0 overflow-y-auto p-4 pb-28 md:p-8 md:pb-8'}>
        
          <header className={activeTab === 'schedule_planner' ? 'shrink-0 space-y-1' : 'mb-4 space-y-3'}>
            <div className={`flex items-center gap-2 ${activeTab === 'schedule_planner' ? 'px-0.5' : 'px-1'}`}>
              <img src="/logo.png" alt="Y Log" className={`object-contain ${activeTab === 'schedule_planner' ? 'w-7 h-7' : 'w-11 h-11'}`} />
              <p className={`font-black tracking-tight text-slate-900 ${activeTab === 'schedule_planner' ? 'text-sm leading-none' : 'text-xl leading-none'}`}>Y Log</p>
              <button
                type="button"
                onClick={() => { void handleStudentLogout(); }}
                className="ml-auto shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-black text-slate-600 cursor-pointer"
              >
                ログアウト
              </button>
            </div>
            <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setIsNoticeListOpen(true);
                  void markMyTeacherMessagesRead();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer"
              >
                <span className="relative text-base leading-none">
                  🔔
                  {unreadNoticeCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-black text-amber-950">教師からのメッセージ・新着コメント</span>
                  <span className="block text-[11px] font-bold text-amber-800 mt-0.5">
                    {unreadNoticeCount > 0 ? `未読 ${unreadNoticeCount}件` : '未読のお知らせはありません'}
                  </span>
                </span>
                {unreadNoticeCount > 0 && (
                  <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center">
                    {unreadNoticeCount}
                  </span>
                )}
              </button>
              {noticesExpanded && activeTab !== 'schedule_planner' && (
                <div className="border-t border-amber-100 p-3 space-y-2">
                  {myMessages.length === 0 ? (
                    <p className="text-xs font-bold text-slate-500 text-center py-4">お知らせはまだありません。</p>
                  ) : myMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => openNoticeDetail(message)}
                      className={`w-full text-left p-3 rounded-2xl border cursor-pointer ${message.read_at ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-300'}`}
                    >
                      <div className="flex justify-between text-[10px] font-bold text-slate-500">
                        <span>{formatSentAt(message.sent_at)}</span>
                        <span className={message.read_at ? '' : 'text-red-600'}>{message.read_at ? '既読' : '未読'}</span>
                      </div>
                      <p className="mt-1 text-sm font-extrabold text-slate-900 whitespace-pre-wrap">{message.body}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{message.sender_name}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <div className={`bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex items-center gap-3 ${activeTab === 'schedule_planner' ? 'hidden' : ''}`}>
              <img src="/logo.png" alt="Y Log" className="w-10 h-10 object-contain" />
              <div className="min-w-0 flex-1">
                <div className="font-black text-slate-900 truncate">{currentUser.name}</div>
                <div className="text-[11px] font-bold text-slate-400">連続 {studyStreakDays} 日</div>
              </div>
            </div>
            <nav className="hidden md:grid grid-cols-4 gap-2">
              {studentNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-3 rounded-2xl text-xs font-black cursor-pointer ${
                    activeTab === item.id ? 'bg-sky-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </header>
        
        

        {globalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-3xl text-xs font-bold text-red-700 flex justify-between items-center">
            <span>⚠️ {globalError}</span>
            <button onClick={() => { void fetchAllData(); }} className="px-3 py-1 bg-red-600 text-white rounded-xl text-xs hover:bg-red-700 font-bold cursor-pointer">
              再同期実行
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-white p-20 rounded-3xl border border-slate-200 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 mx-auto animate-bounce">
              <img src="/logo.png" alt="Loading Logo" className="w-full h-full object-contain" />
            </div>
            <div className="text-slate-400 text-xs font-bold animate-pulse">Y Log データベースと同期中...</div>
          </div>
        ) : (
          <div className={activeTab === 'schedule_planner' ? 'flex-1 min-h-0 flex flex-col' : 'space-y-6'}>

            {activeTab === 'dashboard' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/80 p-1">
                  {LOG_SUMMARY_PERIODS.map((period) => (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => setLogSummaryPeriod(period.id)}
                      className={`py-2 rounded-xl text-[11px] font-black cursor-pointer ${logSummaryPeriod === period.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
                <PreviousWeekRankBadge rank={previousWeekRank.rank} totalMinutes={previousWeekRank.totalMinutes} />
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                  <div className="text-[11px] font-bold text-slate-400">合計の学習時間</div>
                  <div className="text-3xl font-black text-slate-900 mt-1">{formatStudyDuration(periodStudy.totalMinutes)}</div>
                </section>
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-4">
                  <h3 className="text-sm font-black text-slate-900">科目別学習時間</h3>
                  {periodStudy.subjects.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">この期間の記録はまだありません。</p>
                  ) : periodStudy.subjects.map((item) => {
                    const max = Math.max(...periodStudy.subjects.map((stat) => stat.minutes), 1);
                    const setting = subjectSetting(item.subject);
                    return (
                      <div key={item.subject} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-black">
                          <span style={{ color: setting.color }}>{item.subject}</span>
                          <span className="text-slate-500">{formatStudyDuration(item.minutes)}</span>
                        </div>
                        <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
                          {item.materials.map((material) => (
                            <div
                              key={material.id}
                              title={`${material.title} ${formatStudyDuration(material.minutes)}`}
                              style={{ width: `${(material.minutes / max) * 100}%`, backgroundColor: material.color }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {item.materials.map((material) => (
                            <span key={`${item.subject}-${material.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: material.color }} />
                              <span className="truncate max-w-[9rem]">{material.title}</span>
                              <span>{material.minutes}分</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-black text-slate-900">ログの振り返り</h3>
                  {periodStudy.logs.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">この期間の記録はまだありません。</p>
                  ) : periodStudy.logs.map((log) => {
                    const material = materials.find((item) => item.id === log.material_id) || myMaterials.find((item) => item.id === log.material_id);
                    return (
                      <div key={log.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 truncate flex items-center gap-1">
                            {log.is_mission_completed && <span className="text-base"><MissionCrown /></span>}
                            <span className="truncate">{material?.title || '教材'}</span>
                          </div>
                          <div className="text-[11px] font-bold text-slate-400">
                            {formatLogStamp(log.created_at)} · <span style={{ color: subjectSetting(material?.subject_code || material?.subject).color }}>{subjectLabel(material?.subject_code || material?.subject)}</span> · {log.time_spent_minutes}分
                            {log.comment ? ` · ${log.comment}` : ''}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={() => openStudentLogEditor(log)} className="px-3 py-2 rounded-xl bg-slate-100 text-[11px] font-black cursor-pointer">修正</button>
                          <button type="button" onClick={() => { void deleteStudentLog(log); }} className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-[11px] font-black cursor-pointer">削除</button>
                        </div>
                      </div>
                    );
                  })}
                </section>
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-black text-slate-900">📅 過去の学習記録（全週分）を振り返る</h3>
                  {pastWeekReviews.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">まだ振り返れる週の記録がありません。</p>
                  ) : pastWeekReviews.map((week, index) => {
                    const opened = pastWeekStart === week.start;
                    const weekNumber = pastWeekReviews.length - index;
                    const rank = rankFromMinutes(week.rankMinutes);
                    const rankNote = `勉強時間 ${formatHourAndMinute(week.stack.totalMinutes)}＋塾の時間 ${formatHourAndMinute(week.jukuMinutes)}`;
                    return (
                      <div key={week.start} className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="w-full px-3 py-3 flex items-center justify-between gap-2 bg-slate-50">
                          <button
                            type="button"
                            onClick={() => setPastWeekStart(opened ? null : week.start)}
                            className="min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <span className="text-sm font-black text-slate-900">{week.label}</span>
                          </button>
                          <WeekRankThumb
                            rank={rank}
                            onOpen={() => setWeekRankPreview({ weekNumber, totalMinutes: week.rankMinutes, rank, note: rankNote })}
                          />
                          <button
                            type="button"
                            onClick={() => setPastWeekStart(opened ? null : week.start)}
                            className="text-[11px] font-black text-slate-500 shrink-0 cursor-pointer"
                          >
                            {week.rankMinutes > 0 ? formatStudyDuration(week.rankMinutes) : '0時間0分'} {opened ? '閉じる' : '開く'}
                          </button>
                        </div>
                        {opened && (
                          <div className="p-3 space-y-3 bg-slate-50">
                            {week.jukuMinutes > 0 && (
                              <p className="text-[11px] font-bold text-slate-500">塾の予定 {formatHourAndMinute(week.jukuMinutes)} をランクに含めています。</p>
                            )}
                            <StudyMaterialStack
                              heading="この週の総学習時間"
                              rangeLabel={formatWeekRange(week.start)}
                              totalMinutes={week.stack.totalMinutes}
                              subjects={week.stack.subjects}
                            />
                            <MeetingWeekBoard
                              compact
                              weekStart={week.start}
                              plans={weekPlans}
                              studentLogs={myStudyLogs}
                              slots={logSlots}
                              catalog={materials}
                              userId={currentUser.id}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {weekRankPreview && (
                    <WeekRankPreviewModal
                      weekNumber={weekRankPreview.weekNumber}
                      rank={weekRankPreview.rank}
                      totalMinutes={weekRankPreview.totalMinutes}
                      note={weekRankPreview.note}
                      onClose={() => setWeekRankPreview(null)}
                    />
                  )}
                </section>
                <LearningTrailAlbum
                  supabase={supabase}
                  studentId={currentUser.id}
                  studyLogs={myStudyLogs}
                  cramMinutesByWeek={weekCramMinutes}
                />
              </div>
            )}

            

            {/* TAB 2. スケジュール */}
            {activeTab === 'schedule_planner' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="shrink-0 flex items-center justify-between gap-2 px-1">
                  <button type="button" onClick={() => setFocusDateKey((key) => shiftDateKey(key, -1))} className="w-9 h-7 rounded-xl bg-white border border-slate-200 text-sm font-black cursor-pointer">◀</button>
                  <div className="text-[11px] font-black text-slate-900 text-center leading-tight">
                    {formatFocusDate(focusDateKey)}
                    <span className="text-slate-300"> ｜ </span>
                    {formatFocusDate(shiftDateKey(focusDateKey, 1))}
                  </div>
                  <button type="button" onClick={() => setFocusDateKey((key) => shiftDateKey(key, 1))} className="w-9 h-7 rounded-xl bg-white border border-slate-200 text-sm font-black cursor-pointer">▶</button>
                </div>
                {weekPlansResolved && Object.keys(weekPlans).length === 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('logs')}
                    className="shrink-0 w-full py-1.5 rounded-2xl bg-amber-400 text-amber-950 text-xs font-black cursor-pointer shadow-sm"
                  >
                    まずは週の予定を教えてね 📅
                  </button>
                )}
                <div className="flex-1 min-h-0 grid grid-cols-2 gap-1">
                  {[focusDateKey, shiftDateKey(focusDateKey, 1)].map((dateKey, columnIndex) => {
                    const planSlots = planSlotsForDate(weekPlans[weekStartKey(dateKey)], dateKey);
                    const weekday = weekdayIdFromDateKey(dateKey);
                    return (
                      <div key={dateKey} className="min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <div className="flex-1 min-h-0 flex flex-col">
                          {DAY_VIEW_HOURS.map((hour) => {
                            const studies = myStudyLogs.flatMap((log) => {
                              const placed = studyPlacement(log, logSlots);
                              if (!placed || placed.date !== dateKey) return [];
                              const slice = sliceInHour(hour, placed);
                              if (!slice) return [];
                              const material = materials.find((item) => item.id === log.material_id)
                                || myMaterials.find((item) => item.id === log.material_id);
                              const setting = subjectSetting(material?.subject_code || material?.subject);
                              return [{
                                key: `${log.id}-${hour}`,
                                color: setting.color,
                                bgColor: setting.bgColor,
                                title: material?.title || '学習',
                                crown: Boolean(log.is_mission_completed),
                                slice,
                                onClick: () => openStudentLogEditor(log),
                              }];
                            });
                            return (
                              <DayHourLane
                                key={hour}
                                hour={hour}
                                showHourLabel={columnIndex === 0}
                                planBands={studies.length === 0 ? planBandsForHour(planSlots, weekday, hour) : undefined}
                                studies={studies}
                                onDeleteSlot={(slotId) => {
                                  if (!currentUser) return;
                                  const weekStart = weekStartKey(dateKey);
                                  const plan = weekPlans[weekStart];
                                  if (!plan) return;
                                  if (!window.confirm('この予定を削除しますか？')) return;
                                  const slots = (plan.slots || []).filter((slot) => slot.id !== slotId);
                                  const snapshots = plan.dateSnapshots
                                    ? Object.fromEntries(Object.entries(plan.dateSnapshots).map(([key, list]) => [key, list.filter((slot) => slot.id !== slotId)]))
                                    : undefined;
                                  const next = { ...weekPlans };
                                  const snapshotLists = snapshots ? Object.values(snapshots) : [];
                                  if (slots.length === 0 && snapshotLists.every((list) => list.length === 0)) {
                                    delete next[weekStart];
                                  } else {
                                    next[weekStart] = { ...plan, slots, dateSnapshots: snapshots, is_customized: true };
                                  }
                                  persistWeekPlans(currentUser.id, next);
                                }}
                                onEmpty={() => {
                                  const endHour = Math.min(hour + 1, 25);
                                  setComposerDateKey(dateKey);
                                  setComposerMission(false);
                                  setRecordMode('timer');
                                  setTimerRunning(false);
                                  setCountdownRunning(false);
                                  setTimerElapsedSec(0);
                                  setNewLogForm((prev) => ({ ...prev, subject: '', material_id: '' }));
                                  setStudyComposer(clampStudyRange({ startHour: hour, startMinute: 0, endHour, endMinute: 0 }));
                                }}
                              />
                            );
                          })}
                        </div>
                        <div className="shrink-0 h-3 text-[8px] font-mono font-bold text-slate-400 pl-1 leading-none">25:00</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-4">
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <h2 className="text-base font-black text-slate-900">１. Myひな型を登録しよう</h2>
                  {[1, 2, 3].map((slotNumber) => {
                    const saved = findMyHina(mySchedules, slotNumber);
                    const opened = openHinaSlot === slotNumber;
                    return (
                      <div key={slotNumber} className="rounded-2xl border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            if (opened) {
                              setOpenHinaSlot(null);
                              return;
                            }
                            setOpenHinaSlot(slotNumber);
                            setHinaBaseId(null);
                            setHinaDraftSlots(cloneScheduleSlots(saved?.slots || []));
                            setHinaDraftTitle(saved ? hinaDisplayName(saved, slotNumber) : `Myひな型${slotNumber}`);
                          }}
                          className="w-full px-3 py-3 flex items-center justify-between text-left cursor-pointer bg-slate-50"
                        >
                          <span className="font-black text-sm truncate">{saved ? hinaDisplayName(saved, slotNumber) : `Myひな型${slotNumber}`}</span>
                          {saved && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">登録済み</span>}
                        </button>
                        {opened && (
                          <div className="fixed inset-x-0 top-0 bottom-[4.6rem] z-40 bg-white flex flex-col p-3 gap-2">
                            <div className="shrink-0 flex items-center justify-between gap-2">
                              <p className="font-black text-sm truncate">{hinaDraftTitle.trim() || `Myひな型${slotNumber}`}</p>
                              <button type="button" onClick={() => setOpenHinaSlot(null)} className="text-xs font-black text-slate-400 cursor-pointer shrink-0">閉じる</button>
                            </div>
                            <label className="shrink-0 block">
                              <span className="text-xs font-black text-slate-700">ひな型の名前</span>
                              <input
                                value={hinaDraftTitle}
                                onChange={(event) => setHinaDraftTitle(event.target.value)}
                                placeholder="例：通常時、定期テスト前、夏休み用"
                                maxLength={24}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-900"
                              />
                            </label>
                            <div className="shrink-0">
                              <p className="text-xs font-black text-slate-700 mb-1.5">① もとになるひな型を選んでね</p>
                              <div className="grid grid-cols-3 gap-1.5">
                                {HINA_BASES.map((base) => (
                                  <button
                                    key={base.id}
                                    type="button"
                                    onClick={() => handleApplyHinaBase(base.id)}
                                    className={`py-2 rounded-xl border text-[11px] font-black cursor-pointer ${
                                      hinaBaseId === base.id
                                        ? 'bg-sky-600 text-white border-sky-600'
                                        : 'border-slate-200 bg-slate-50 text-slate-800'
                                    }`}
                                  >
                                    {base.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex-1 min-h-0 flex flex-col">
                              <p className="shrink-0 text-xs font-black text-slate-700">② ひな型をカスタマイズしてね</p>
                              <p className="shrink-0 text-[10px] font-bold text-slate-400 mb-1">マスをタップすると 高校 → 部活 → 活動 → 塾 → 他 → なし。時刻表示をタップすると開始・終了を5分単位で変更できます。</p>
                              <HourCategoryGrid
                                key={`hina-${slotNumber}-${hinaApplySerial}`}
                                slots={hinaDraftSlots}
                                onPaint={(day, hour, category) => setHinaDraftSlots((prev) => paintHourCategory(prev, day, hour, category))}
                                onCommit={setHinaDraftSlots}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => saveMyHina(slotNumber, hinaDraftSlots, hinaDraftTitle)}
                              className="shrink-0 w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-black cursor-pointer shadow-md"
                            >
                              Myひな型に登録
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-2">
                  <h2 className="text-base font-black text-slate-900">２. 週スケジュールを登録してね</h2>
                  <p className="text-[11px] font-bold text-slate-400">週をタップして、ひな型を当てるか、その週だけ時間を編集できます。</p>
                  {upcomingWeekStarts(3).map((weekStart) => {
                    const plan = weekPlans[weekStart];
                    return (
                      <button
                        key={weekStart}
                        type="button"
                        onClick={() => openWeekEditor(weekStart)}
                        className={`w-full px-3 py-3 rounded-2xl border text-left flex items-center justify-between gap-2 cursor-pointer ${plan?.is_customized ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-slate-900">{formatWeekRange(weekStart)}</span>
                          {plan?.is_customized && plan.templateName ? (
                            <span className="block text-[10px] font-bold text-slate-400 truncate">もと: {plan.templateName}</span>
                          ) : null}
                        </span>
                        {plan?.is_customized ? (
                          <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">個別設定済み</span>
                        ) : plan ? (
                          <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{plan.templateName}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              </div>
            )}

            {weekPickerStart && activeTab === 'logs' && (
              <div className="fixed inset-x-0 top-0 bottom-[4.6rem] z-50 bg-white flex flex-col p-3 gap-2">
                <div className="shrink-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate">この週のスケジュール</p>
                    <p className="text-[11px] font-bold text-slate-400 truncate">{formatWeekRange(weekPickerStart)}</p>
                  </div>
                  <button type="button" onClick={() => setWeekPickerStart(null)} className="text-xs font-black text-slate-400 cursor-pointer shrink-0">閉じる</button>
                </div>
                <div className="shrink-0">
                  <p className="text-xs font-black text-slate-700 mb-1.5">ひな型から始める</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((slotNumber) => {
                      const item = findMyHina(mySchedules, slotNumber);
                      const selected = Boolean(item && weekDraftTemplateId === item.id);
                      return (
                        <button
                          key={slotNumber}
                          type="button"
                          disabled={!item}
                          onClick={() => { if (item) loadHinaIntoWeekDraft(item); }}
                          className={`py-2 px-1 rounded-xl border text-[11px] font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed truncate ${selected ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-800 border-slate-200'}`}
                        >
                          {hinaDisplayName(item, slotNumber)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <p className="shrink-0 text-xs font-black text-slate-700">この週の時間を編集</p>
                  <p className="shrink-0 text-[10px] font-bold text-slate-400 mb-1">マスをタップすると 高校 → 部活 → 活動 → 塾 → 他 → なし。時刻表示をタップすると開始・終了を5分単位で変更できます。</p>
                  <HourCategoryGrid
                    slots={weekDraftSlots}
                    onPaint={(day, hour, category) => setWeekDraftSlots((prev) => paintHourCategory(prev, day, hour, category))}
                    onCommit={setWeekDraftSlots}
                  />
                </div>
                <p className="shrink-0 text-[10px] font-bold text-slate-400">
                  {(() => {
                    const baseItem = weekDraftTemplateId ? mySchedules.find((item) => item.id === weekDraftTemplateId) : undefined;
                    const follows = Boolean(baseItem && scheduleSlotsMatch(weekDraftSlots, baseItem.slots));
                    return follows
                      ? 'ひな型と同じ内容です。保存すると、あとからひな型を変えたときにこの週も更新されます。'
                      : '時間を変えて保存すると「個別設定済み」になり、ひな型の一括反映では上書きされません。';
                  })()}
                </p>
                <button
                  type="button"
                  onClick={saveWeekEditor}
                  className="shrink-0 w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-black cursor-pointer shadow-md"
                >
                  この週の予定を保存
                </button>
              </div>
            )}

            

            {/* TAB 3. 生徒一覧 */}
            

            {/* TAB 4. 生徒個人成長カルテ (修正教科別の個人成長チャート) */}
            

            {/* TAB 5. 教材マスタ (各教科テーマカラー対応) */}
            {activeTab === 'materials' && (
              <div className="space-y-4">
                <h3 className="text-base font-black text-slate-900">📚 マイ教材</h3>
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setQrScanOpen(true)}
                    className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-black cursor-pointer"
                  >
                    QRコードを読み取る
                  </button>
                  <form onSubmit={handleManualMyMaterial} className="space-y-2">
                    <p className="text-xs font-black text-slate-700">リストに載っていない教材の追加</p>
                    <label className="block">
                      <span className="text-[11px] font-black text-slate-500">教材名</span>
                      <input
                        value={myMaterialTitle}
                        onChange={(event) => setMyMaterialTitle(event.target.value)}
                        placeholder="例：学校の英語プリント"
                        maxLength={40}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-900"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-black text-slate-500">科目</span>
                      <select
                        value={myMaterialSubject}
                        onChange={(event) => {
                          if (isSubjectCode(event.target.value)) setMyMaterialSubject(event.target.value);
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-900 bg-white"
                      >
                        {(Object.keys(SUBJECT_CONFIG) as SubjectCode[]).map((subjectKey) => {
                          const setting = SUBJECT_CONFIG[subjectKey] ?? SUBJECT_CONFIG.other;
                          return <option key={subjectKey} value={subjectKey}>{setting.label}</option>;
                        })}
                      </select>
                    </label>
                    <button type="submit" className="w-full py-3 rounded-2xl bg-sky-600 text-white text-sm font-black cursor-pointer">
                      マイ教材に追加
                    </button>
                  </form>
                </section>
                <section className="space-y-2">
                  <h4 className="text-sm font-black text-slate-900">追加した教材</h4>
                  {myMaterials.length === 0 ? (
                    <p className="bg-white rounded-3xl border border-slate-200 p-6 text-sm font-bold text-slate-400">追加した教材はまだありません。</p>
                  ) : myMaterials.map((item) => {
                    const setting = subjectSetting(item.subject_code || item.subject);
                    return (
                      <article key={item.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full border" style={{ color: setting.color, backgroundColor: setting.bgColor, borderColor: setting.color }}>{subjectLabel(item.subject_code || item.subject)}</span>
                          <div className="font-black text-slate-900 mt-1 truncate">{item.title}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMyMaterial(item.id)}
                          className="shrink-0 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-[11px] font-black cursor-pointer"
                        >
                          削除
                        </button>
                      </article>
                    );
                  })}
                </section>
              </div>
            )}
            {qrScanOpen && activeTab === 'materials' && (
              <QrMaterialScanner onResult={handleQrMaterial} onClose={() => setQrScanOpen(false)} />
            )}

            

            {/* TAB 6. 教師・管理者一覧 */}
            

            {/* TAB 7. サクサク学習評価記録 (👑ミッション完了機能) */}
                        

          </div>
        )}
      </main>

      {/* モーダル群 */}
      {/* モーダル: 教師・生徒個別手動登録モーダル */}
      

      

      

      {isNoticeListOpen && currentUser.role === 'student' && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 bg-amber-600 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">🔔 お知らせ一覧</h4>
              <button type="button" onClick={() => setIsNoticeListOpen(false)} className="text-amber-100 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              {myMessages.length === 0 ? (
                <p className="text-xs text-slate-500 font-bold p-4 text-center">お知らせはまだありません。</p>
              ) : myMessages.map((message) => (
                <article
                  key={message.id}
                  className={`p-4 rounded-2xl border ${message.read_at ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}
                >
                  <button
                    type="button"
                    onClick={() => openNoticeDetail(message)}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="flex justify-between gap-3 text-[10px] font-bold text-slate-500">
                      <span>{formatSentAt(message.sent_at)}</span>
                      <span>{message.read_at ? '既読' : '未読'}</span>
                    </div>
                    <p className="mt-1 text-xs font-extrabold text-slate-900 line-clamp-2">{message.body}</p>
                    <p className="mt-1 text-[10px] text-slate-500">送信者: {message.sender_name}</p>
                  </button>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => { void hideTeacherMessage(message); }}
                      className="text-[11px] font-black text-slate-500 underline cursor-pointer"
                    >
                      もう表示しない
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeNotice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-950 text-white flex justify-between items-center">
              <h4 className="font-extrabold text-sm">お知らせ閲覧</h4>
              <button type="button" onClick={() => setActiveNotice(null)} className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="font-bold text-slate-500">送信日時: {formatSentAt(activeNotice.sent_at)}</p>
              <p className="font-bold text-slate-500">送信者: {activeNotice.sender_name}</p>
              <p className="whitespace-pre-wrap text-sm font-bold text-slate-900 leading-relaxed">{activeNotice.body}</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { void hideTeacherMessage(activeNotice); }} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer">もう表示しない</button>
                <button type="button" onClick={() => setActiveNotice(null)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer">閉じる</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* サクサク学習記録モーダル (👑ミッション完了選択可能) */}
      

      

      

      

      {/* モーダル: 教材の新規登録・編集 */}
      

      {studyComposer && (
        <div className="fixed inset-0 z-[70] bg-slate-950/60 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 pt-2 pb-1 flex items-start justify-between gap-2 border-b border-slate-100">
              <div className="min-w-0">
                <h4 className="font-black text-sm leading-tight">学習の記録方法を選んでね</h4>
                <p className="text-[10px] font-bold text-slate-400">{formatFocusDate(composerDateKey)} {formatMeetingClock(studyComposer.startHour, studyComposer.startMinute)}–{formatMeetingClock(studyComposer.endHour, studyComposer.endMinute)}（{studyDurationMinutes(clampStudyRange(studyComposer))}分）</p>
              </div>
              <button type="button" onClick={() => { dismissStudyClock(); setStudyComposer(null); }} className="w-8 h-8 shrink-0 rounded-full bg-slate-100 font-bold cursor-pointer">✕</button>
            </div>
            <div className="shrink-0 px-3 py-1.5 space-y-1">
              {([
                ['timer', '⏱️ ①開始と終了を自分でタップ！'],
                ['countdown', '⚡ ②時間を決めてタイムアタック！'],
                ['manual', '📝 ③学習時間を直接記録'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { dismissStudyClock(); setRecordMode(id); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-[12px] font-black cursor-pointer border ${recordMode === id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1">
              <SubjectTextPicker
                compact
                fromConfig
                subject={newLogForm.subject}
                materialId={newLogForm.material_id}
                materials={materials}
                myMaterials={myMaterials}
                favoriteIds={favoriteMaterialIds}
                onSubject={(subject) => setNewLogForm((prev) => ({ ...prev, subject, material_id: '' }))}
                onMaterial={(materialId) => setNewLogForm((prev) => ({ ...prev, material_id: materialId }))}
                onToggleFavorite={toggleFavoriteMaterial}
              />
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] space-y-2">
              <StudyTimeRangeFields value={studyComposer} onChange={setStudyComposer} />
              <MissionToggle checked={composerMission} onChange={setComposerMission} />
              {recordMode === 'timer' && (
                <div className="flex items-center gap-2">
                  <div className="w-20 text-center text-2xl font-black font-mono">{formatClock(timerElapsedSec)}</div>
                  {!timerRunning ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!newLogForm.material_id) { alert('テキストを選択してください。'); return; }
                        const startedAt = Date.now();
                        setCountdownRunning(false);
                        setCountdownFinished(false);
                        setTimerStartedAt(startedAt);
                        setTimerElapsedSec(0);
                        setTimerRunning(true);
                        if (studyComposer) {
                          writeActiveStudyClock({
                            userId: currentUser.id,
                            mode: 'timer',
                            running: true,
                            startedAt,
                            targetSec: 0,
                            finished: false,
                            subject: String(newLogForm.subject || ''),
                            materialId: newLogForm.material_id,
                            comment: newLogForm.comment,
                            mission: composerMission,
                            date: composerDateKey,
                            composer: studyComposer,
                          });
                        }
                      }}
                      className="flex-1 py-3 rounded-2xl bg-sky-600 text-white font-black cursor-pointer"
                    >
                      スタート
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        clearActiveStudyClock();
                        const seconds = elapsedSecondsSince(timerStartedAt);
                        void saveStudentMinutes(Math.max(0, Math.round(seconds / 60)), newLogForm.material_id, newLogForm.comment, composerContext.current);
                      }}
                      className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-black cursor-pointer"
                    >
                      ストップ＆保存
                    </button>
                  )}
                </div>
              )}
              {recordMode === 'countdown' && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-black text-slate-600">
                    学習の予定時間(分)
                    <input
                      type="number"
                      min={1}
                      value={countdownTargetMin}
                      disabled={countdownRunning || countdownFinished}
                      onChange={(event) => {
                        const next = Math.max(1, Number(event.target.value) || 1);
                        setCountdownTargetMin(next);
                        if (!countdownRunning && !countdownFinished) setCountdownRemainingSec(next * 60);
                      }}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-base font-black"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-20 text-center text-2xl font-black font-mono">{formatClock(countdownRemainingSec)}</div>
                    {!countdownRunning && !countdownFinished ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!newLogForm.material_id) { alert('テキストを選択してください。'); return; }
                          const startedAt = Date.now();
                          const targetSec = countdownTargetMin * 60;
                          countdownSaveLock.current = false;
                          timeAttackFinishedRef.current = 0;
                          setTimerRunning(false);
                          setCountdownFinished(false);
                          setCountdownStartedAt(startedAt);
                          setCountdownRemainingSec(targetSec);
                          setCountdownRunning(true);
                          if (studyComposer) {
                            writeActiveStudyClock({
                              userId: currentUser.id,
                              mode: 'countdown',
                              running: true,
                              startedAt,
                              targetSec,
                              finished: false,
                              subject: String(newLogForm.subject || ''),
                              materialId: newLogForm.material_id,
                              comment: newLogForm.comment,
                              mission: composerMission,
                              date: composerDateKey,
                              composer: studyComposer,
                            });
                          }
                        }}
                        className="flex-1 py-3 rounded-2xl bg-sky-600 text-white font-black cursor-pointer"
                      >
                        スタート
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (countdownSaveLock.current) return;
                          countdownSaveLock.current = true;
                          const targetSec = countdownTargetMin * 60;
                          const elapsedSec = countdownFinished
                            ? targetSec
                            : Math.min(targetSec, countdownStartedAt ? elapsedSecondsSince(countdownStartedAt) : Math.max(0, targetSec - countdownRemainingSec));
                          setCountdownRunning(false);
                          setCountdownFinished(false);
                          clearActiveStudyClock();
                          void saveStudentMinutes(Math.max(0, Math.round(elapsedSec / 60)), newLogForm.material_id, newLogForm.comment, composerContext.current).finally(() => {
                            countdownSaveLock.current = false;
                          });
                        }}
                        className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-black cursor-pointer"
                      >
                        {countdownFinished ? '記録する' : '途中停止して記録'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {recordMode === 'manual' && (
                <button
                  type="button"
                  onClick={() => {
                    const span = composerContext.current ? studyDurationMinutes(clampStudyRange(composerContext.current)) : 0;
                    void saveStudentMinutes(span, newLogForm.material_id, newLogForm.comment, composerContext.current);
                  }}
                  className="w-full py-3 rounded-2xl bg-sky-600 text-white font-black cursor-pointer"
                >
                  記録保存
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {editingLog && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-[70]">
          <div className="bg-white w-full max-w-lg rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm">記録を修正</h4>
              <button type="button" onClick={() => setEditingLog(null)} className="w-8 h-8 rounded-full bg-slate-100 font-bold cursor-pointer">✕</button>
            </div>
            <SubjectTextPicker
              subject={editSubject}
              materialId={editMaterialId}
              materials={materials}
              myMaterials={myMaterials}
              favoriteIds={favoriteMaterialIds}
              onSubject={(subject) => {
                if (!isSubjectType(subject)) return;
                setEditSubject(subject);
                setEditMaterialId('');
              }}
              onMaterial={setEditMaterialId}
              onToggleFavorite={toggleFavoriteMaterial}
            />
            <StudyTimeRangeFields value={editRange} onChange={setEditRange} />
            <textarea
              value={editComment}
              onChange={(event) => setEditComment(event.target.value)}
              rows={3}
              placeholder="ページ・メモ"
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-2xl text-sm font-bold"
            />
            <MissionToggle checked={editMission} onChange={setEditMission} />
            <div className="flex gap-2">
              <button type="button" onClick={() => { void deleteStudentLog(editingLog); }} className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm font-black cursor-pointer">削除</button>
              <button type="button" onClick={() => { void saveStudentLogEdit(); }} className="flex-1 py-3 rounded-2xl bg-sky-600 text-white text-sm font-black cursor-pointer">保存</button>
            </div>
          </div>
        </div>
      )}

      
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] grid grid-cols-4">
          {studentNav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative py-2 px-0.5 rounded-2xl text-[9px] leading-tight font-black cursor-pointer ${
                activeTab === item.id ? 'text-sky-700' : 'text-slate-400'
              }`}
            >
              <span className="block text-lg leading-none">{item.icon}</span>
              <span className="block mt-1">{item.label}</span>
            </button>
          ))}
        </nav>
      

      {activeTab === 'schedule_planner' && !studyComposer && showMissionEffect && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 pointer-events-none">
          <div
            key={missionEffectToken}
            className="ylog-mission-card pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[2rem] border-2 border-amber-300 bg-amber-50 px-6 py-8 text-center shadow-2xl"
          >
            <span className="ylog-crown-glow absolute left-1/2 top-8 h-36 w-36 -translate-x-1/2 rounded-full bg-amber-300" />
            <span className="ylog-sparkle absolute left-6 top-7 text-4xl">✨</span>
            <span className="ylog-sparkle absolute right-6 top-9 text-3xl" style={{ animationDelay: '0.12s' }}>✨</span>
            <span className="ylog-sparkle absolute left-14 top-16 text-2xl" style={{ animationDelay: '0.24s' }}>✨</span>
            <span className="ylog-sparkle absolute right-14 top-20 text-3xl" style={{ animationDelay: '0.36s' }}>✨</span>
            <span className="ylog-sparkle absolute left-1/2 top-4 -translate-x-1/2 text-2xl" style={{ animationDelay: '0.2s' }}>✨</span>
            <span className="ylog-crown-pop relative block text-8xl leading-none">👑</span>
            <p className="relative mt-3 text-2xl font-black text-amber-950">ミッション完了！</p>
            <p className="relative mt-2 text-base font-black leading-relaxed text-amber-800">ナイスチャレンジ！</p>
            <p className="relative mt-1 text-sm font-black text-slate-600">この調子で頑張ろう！</p>
            <button
              type="button"
              onClick={() => setShowMissionEffect(false)}
              className="relative mt-5 px-6 py-2.5 rounded-2xl bg-amber-500 text-white text-sm font-black cursor-pointer shadow-md"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

    </div>
  );
  }

  const role = currentUser.role;
  const isKnownAdmin = isKnownAdminIdentity(currentUser.id, currentUser.email);
  const isTeacherOrAdmin =
    role === 'admin' ||
    role === 'teacher' ||
    isKnownAdmin ||
    isStaffRole(role, currentUser.id, currentUser.email);
  const screens = {
    admin: renderAdminScreen,
    student: renderStudentScreen,
  };

  if (isTeacherOrAdmin) {
    const staffRole: UserRole = role === 'teacher' && !isKnownAdmin ? 'teacher' : resolveAppRole(role, currentUser.id, currentUser.email);
    const staffUser = staffRole === 'student' ? { ...currentUser, role: 'admin' as const } : (currentUser.role === staffRole ? currentUser : { ...currentUser, role: staffRole });
    return (
      <RoleScreenContext.Provider value={screens}>
        <AdminView currentUser={staffUser} />
      </RoleScreenContext.Provider>
    );
  }

  return (
    <RoleScreenContext.Provider value={screens}>
      <StudentView currentUser={currentUser} />
    </RoleScreenContext.Provider>
  );
}
