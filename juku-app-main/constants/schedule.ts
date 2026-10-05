export interface ScheduleCategorySetting {
  label: string;
  color: string;
  bgColor: string;
}

export const SCHEDULE_CATEGORY_MAP = {
  school:      { label: '高校',                            color: '#0284c7', bgColor: 'rgba(2, 132, 199, 0.1)' },
  club:        { label: '部活',                            color: '#ea580c', bgColor: 'rgba(234, 88, 12, 0.1)' },
  activity:    { label: '活動(生徒会・実行委員・習い事)',  color: '#9333ea', bgColor: 'rgba(147, 51, 234, 0.1)' },
  cram_school: { label: '塾・予備校',                      color: '#059669', bgColor: 'rgba(5, 150, 105, 0.1)' },
  other:       { label: '他',                              color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.1)' },
} as const;

export type ScheduleCategoryId = keyof typeof SCHEDULE_CATEGORY_MAP;

const LEGACY_SCHEDULE_CATEGORIES: Record<string, ScheduleCategoryId> = {
  high_school: 'school',
  juku: 'cram_school',
  '高校': 'school',
  '部活': 'club',
  '活動': 'activity',
  '活動(生徒会・実行委員・習い事など)': 'activity',
  '活動(生徒会・実行委員・習い事)': 'activity',
  '塾': 'cram_school',
  '塾・予備校': 'cram_school',
  '他': 'other',
};

function normalizeScheduleCategoryText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/（/g, '(').replace(/）/g, ')') : '';
}

export function scheduleCategoryFromInput(value: unknown): ScheduleCategoryId | null {
  const raw = normalizeScheduleCategoryText(value);
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(SCHEDULE_CATEGORY_MAP, raw)) return raw as ScheduleCategoryId;
  return LEGACY_SCHEDULE_CATEGORIES[raw] ?? null;
}

export function scheduleCategorySetting(value: unknown): ScheduleCategorySetting {
  const code = scheduleCategoryFromInput(value) || 'other';
  return SCHEDULE_CATEGORY_MAP[code];
}
