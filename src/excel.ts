import * as XLSX from 'xlsx'
import { analyzeEvent, grade } from './analysis'
import type { Filter } from './analysis'
import { CRITERIA, RANK_KEYS, TYPE_LABEL, eventLabel } from './types'
import type { AdminData } from './types'

const IN = TYPE_LABEL.internal
const EX = TYPE_LABEL.external

const r2 = (v: number | null) => (v == null ? '' : Math.round(v * 100) / 100)

export function exportExcel(data: AdminData) {
  const wb = XLSX.utils.book_new()
  const byId = new Map(data.companies.map((c) => [c.id, c]))
  const evById = new Map(data.events.map((e) => [e.id, e]))
  const filters: Filter[] = ['all', 'internal', 'external']
  const fLabel = { all: '全体', internal: IN, external: EX }

  const rank: unknown[][] = [['年', '催事', '区分', '順位', '記号', '社名', '自社', '平均順位', 'ポイント', '1位票', '評価', ...CRITERIA.map((c) => `${c.short}_平均順位`)]]
  const corr: unknown[][] = [['年', '催事', '区分', '回答数', ...CRITERIA.map((c) => `${c.short}_ρ`), ...CRITERIA.map((c) => `${c.short}_1位一致率`), ...CRITERIA.map((c) => `${c.short}_最下位一致率`)]]
  const prio: unknown[][] = [['年', '催事', '優先度', '項目', '影響度ρ', '自社平均順位', '比較相手平均順位', '差']]
  const gaps: unknown[][] = [['年', '催事', '記号', '社名', '項目', `${IN}平均順位`, `${EX}平均順位`, `差（＋は${EX}が低評価）`]]
  const insights: unknown[][] = [['年', '催事', '所見']]

  ;[...data.events].sort((a, b) => b.year - a.year || a.sort - b.sort).forEach((e) => {
    const cs = data.companies.filter((c) => c.event_id === e.id).sort((a, b) => a.sort - b.sort)
    const rs = data.responses.filter((r) => r.event_id === e.id)
    filters.forEach((f) => {
      const a = analyzeEvent(cs, rs, f)
      a.core.stats.forEach((s, i) =>
        rank.push([e.year, eventLabel(e), fLabel[f], i + 1, s.company.label, s.company.name, s.company.is_self ? '○' : '', r2(s.avg.overall), r2(s.points), s.firstCount, grade(s.avg.overall, cs.length), ...CRITERIA.map((c) => r2(s.avg[c.key]))]),
      )
      corr.push([e.year, eventLabel(e), fLabel[f], a.core.n, ...CRITERIA.map((c) => r2(a.core.rho[c.key])), ...CRITERIA.map((c) => r2(a.core.firstMatch[c.key])), ...CRITERIA.map((c) => r2(a.core.lastMatch[c.key]))])
      if (f === 'all') {
        if (a.self) a.priorities.forEach((p, i) => prio.push([e.year, eventLabel(e), i + 1, CRITERIA.find((c) => c.key === p.key)!.label, r2(p.rho), r2(p.selfAvg), r2(p.topAvg), r2(p.gap)]))
        a.gaps.forEach((g) => gaps.push([e.year, eventLabel(e), g.company.label, g.company.name, CRITERIA.find((c) => c.key === g.key)!.label, r2(g.internal), r2(g.external), r2(g.diff)]))
        a.insights.forEach((t) => insights.push([e.year, eventLabel(e), t]))
      }
    })
  })

  const raw: unknown[][] = [['回答ID', '日時', '年', '催事', '区分', ...RANK_KEYS.map((k) => (k === 'overall' ? '総合' : CRITERIA.find((c) => c.key === k)!.short) + '（1位→）'), 'ひとこと']]
  data.responses.forEach((r) =>
    raw.push([
      r.id,
      new Date(r.created_at).toLocaleString('ja-JP'),
      evById.get(r.event_id)?.year ?? '',
      (() => { const e = evById.get(r.event_id); return e ? eventLabel(e) : '' })(),
      TYPE_LABEL[r.respondent_type],
      ...RANK_KEYS.map((k) => (r.ranks[k] ?? []).map((id) => byId.get(id)?.label ?? '?').join('>')),
      r.comment,
    ]),
  )

  const add = (name: string, rows: unknown[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  add('所見', insights, [8, 16, 110])
  add('総合順位', rank, [8, 16, 6, 5, 5, 18, 5, 9, 9, 7, 5])
  add('相関', corr, [8, 16, 6, 7])
  add('自社の改善ポイント', prio, [8, 16, 7, 30, 9, 12, 14, 7])
  add('評価のズレ', gaps, [8, 16, 5, 18, 30, 12, 12, 18])
  add('生データ', raw, [38, 18, 8, 16, 6, 14, 14, 14, 14, 14, 14, 14, 50])

  const d = new Date()
  XLSX.writeFile(wb, `カタログ評価_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`)
}
