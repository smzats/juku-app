export interface SubjectSetting {
  label: string;
  color: string;
  bgColor: string;
}

export const SUBJECT_CONFIG = {
  english: { label: '英語', color: '#e11d48', bgColor: 'rgba(225, 29, 72, 0.1)' },
  vocab: { label: '英単語', color: '#db2777', bgColor: 'rgba(219, 39, 119, 0.1)' },
  math_school: { label: '数学(学校用)', color: '#0284c7', bgColor: 'rgba(2, 132, 199, 0.1)' },
  math_prep: { label: '数学(問題集)', color: '#2563eb', bgColor: 'rgba(37, 99, 235, 0.1)' },
  modern_jp: { label: '現代文', color: '#059669', bgColor: 'rgba(5, 150, 105, 0.1)' },
  classic_jp: { label: '古文・漢文', color: '#16a34a', bgColor: 'rgba(22, 163, 74, 0.1)' },
  physics: { label: '物理', color: '#9333ea', bgColor: 'rgba(147, 51, 234, 0.1)' },
  chemistry: { label: '化学', color: '#7c3aed', bgColor: 'rgba(124, 58, 237, 0.1)' },
  biology: { label: '生物', color: '#c026d3', bgColor: 'rgba(192, 38, 211, 0.1)' },
  earth_science: { label: '地学', color: '#4f46e5', bgColor: 'rgba(79, 70, 229, 0.1)' },
  jp_history: { label: '日本史', color: '#ea580c', bgColor: 'rgba(234, 88, 12, 0.1)' },
  world_history: { label: '世界史', color: '#c2410c', bgColor: 'rgba(194, 65, 12, 0.1)' },
  geography: { label: '地理', color: '#d97706', bgColor: 'rgba(217, 119, 6, 0.1)' },
  politics_economy: { label: '政治経済', color: '#ca8a04', bgColor: 'rgba(202, 138, 4, 0.1)' },
  ethics: { label: '倫理', color: '#65a30d', bgColor: 'rgba(101, 163, 13, 0.1)' },
  civics: { label: '公共など', color: '#4d7c0f', bgColor: 'rgba(77, 124, 15, 0.1)' },
  info_tech: { label: '情報', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.1)' },
  hs_prep: { label: '高校の予習', color: '#78716c', bgColor: 'rgba(120, 113, 108, 0.1)' },
  other: { label: 'マイ教材', color: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)' },
} as const satisfies Record<string, SubjectSetting>;

export type SubjectCode = keyof typeof SUBJECT_CONFIG;

export const SUBJECT_MAP = {
  english: SUBJECT_CONFIG.english.label,
  vocab: SUBJECT_CONFIG.vocab.label,
  math_school: SUBJECT_CONFIG.math_school.label,
  math_prep: SUBJECT_CONFIG.math_prep.label,
  modern_jp: SUBJECT_CONFIG.modern_jp.label,
  classic_jp: SUBJECT_CONFIG.classic_jp.label,
  physics: SUBJECT_CONFIG.physics.label,
  chemistry: SUBJECT_CONFIG.chemistry.label,
  biology: SUBJECT_CONFIG.biology.label,
  earth_science: SUBJECT_CONFIG.earth_science.label,
  jp_history: SUBJECT_CONFIG.jp_history.label,
  world_history: SUBJECT_CONFIG.world_history.label,
  geography: SUBJECT_CONFIG.geography.label,
  politics_economy: SUBJECT_CONFIG.politics_economy.label,
  ethics: SUBJECT_CONFIG.ethics.label,
  civics: SUBJECT_CONFIG.civics.label,
  info_tech: SUBJECT_CONFIG.info_tech.label,
  hs_prep: SUBJECT_CONFIG.hs_prep.label,
  other: SUBJECT_CONFIG.other.label,
} as const;

export const SUBJECT_CODES = Object.keys(SUBJECT_MAP) as SubjectCode[];

const LEGACY_SUBJECT_CODES: Record<string, SubjectCode> = {
  数学: 'math_prep',
  古典: 'classic_jp',
  漢文: 'classic_jp',
  公共: 'civics',
  物理基礎: 'physics',
  化学基礎: 'chemistry',
  生物基礎: 'biology',
  地学基礎: 'earth_science',
};

function normalizeSubjectText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/（/g, '(').replace(/）/g, ')') : '';
}

export function isSubjectCode(value: unknown): value is SubjectCode {
  const raw = normalizeSubjectText(value);
  return Object.prototype.hasOwnProperty.call(SUBJECT_MAP, raw);
}

export function subjectLabel(value: unknown): string {
  const raw = normalizeSubjectText(value);
  if (!raw) return '';
  if (isSubjectCode(raw)) return SUBJECT_MAP[raw];
  return raw;
}

export function subjectCodeFromInput(value: unknown): SubjectCode | null {
  const raw = normalizeSubjectText(value);
  if (!raw) return null;
  if (isSubjectCode(raw)) return raw;
  if (raw === 'その他') return 'other';
  const matched = SUBJECT_CODES.find((code) => SUBJECT_MAP[code] === raw);
  return matched ?? null;
}

export function subjectSetting(value: unknown): SubjectSetting {
  const raw = normalizeSubjectText(value);
  const code = subjectCodeFromInput(raw) || LEGACY_SUBJECT_CODES[raw] || 'other';
  return SUBJECT_CONFIG[code];
}
