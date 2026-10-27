export type RespondentType = 'internal' | 'external'

export const TYPE_LABEL: Record<RespondentType, string> = { internal: '社内', external: '社外' }

export type CritKey = 'cover' | 'mainpage' | 'product' | 'sizzle' | 'copy' | 'tone'
export type RankKey = 'overall' | CritKey

export interface Criterion { key: CritKey; label: string; short: string; hint: string }

export const CRITERIA: Criterion[] = [
  { key: 'cover', label: '表紙のデザイン性', short: '表紙', hint: '手に取りたくなる表紙か' },
  { key: 'mainpage', label: 'メインページのデザイン性', short: 'メインP', hint: 'メインの見開きのレイアウト・見せ方' },
  { key: 'product', label: 'メイン商品の魅力が伝わっているか', short: '商品魅力', hint: '主力商品の価値・ならではの良さが伝わるか' },
  { key: 'sizzle', label: '写真のシズル感', short: 'シズル', hint: '写真から美味しさ・質感・温度感が伝わるか' },
  { key: 'copy', label: 'コピーの洗練度', short: 'コピー', hint: '言葉選び・見出しの洗練度' },
  { key: 'tone', label: '全体の統一感（トーンマナー）', short: '統一感', hint: '表紙から中面まで世界観がそろっているか' },
]

export const OVERALL = { key: 'overall' as const, label: '総合評価', short: '総合', hint: '「予約したくなる」「売れそう」と感じる順に' }

export const RANK_KEYS: RankKey[] = ['overall', ...CRITERIA.map((c) => c.key)]

export interface Settings { title: string; start_at: string | null; end_at: string | null }
export interface EventRow { id: string; name: string; sort: number; active: boolean }
export interface Company { id: string; event_id: string; label: string; name: string; is_self: boolean; sort: number }
export type Ranks = Record<RankKey, string[]>
export interface ResponseRow {
  id: string
  event_id: string
  respondent_type: RespondentType
  ranks: Ranks
  comment: string
  created_at: string
}

export interface PublicData { settings: Settings; events: EventRow[]; companies: Company[] }
export interface AdminData extends PublicData { responses: ResponseRow[] }

export type CompanyInput = { id: string | null; label: string; name: string; is_self: boolean; sort: number }

export function periodState(s: Settings, now = new Date()): 'before' | 'open' | 'closed' {
  if (s.start_at && now < new Date(s.start_at)) return 'before'
  if (s.end_at && now > new Date(s.end_at)) return 'closed'
  return 'open'
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '指定なし'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
