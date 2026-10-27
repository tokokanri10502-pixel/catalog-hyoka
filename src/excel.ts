import * as XLSX from 'xlsx'
import { analyzeEvent, grade } from './analysis'
import type { Filter } from './analysis'
import { CRITERIA, RANK_KEYS, TYPE_LABEL } from './types'
import type { AdminData } from './types'

const r2 = (v: number | null) => (v == null ? '' : Math.round(v * 100) / 100)

export function exportExcel(data: AdminData) {
  const wb = XLSX.utils.book_new()
  const byId = new Map(data.companies.map((c) => [c.id, c]))
  const evName = new Map(data.events.map((e) => [e.id, e.name]))
  const filters: Filter[] = ['all', 'internal', 'external']
  const fLabel = { all: '全体', internal: '社内', external: '社外' }

  const rank: unknown[][] = [['催事', '区分', '順位', '記号', '社名', '自社', '平均順位', 'ポイント', '1位票', '評価', ...CRITERIA.map((c) => `${c.short}_平均順位`)]]
  const corr: unknown[][] = [['催事', '区分', '回答数', ...CRITERIA.map((c) => `${c.short}_ρ`), ...CRITERIA.map((c) => `${c.short}_1位一致率`)]]
  const prio: unknown[][] = [['催事', '優先度', '項目', '影響度ρ', '自社平均順位', '比較相手平均順位', '差']]
  const gaps: unknown[][] = [['催事', '記号', '社名', '項目', '社内平均順位', '社外平均順位', '差（＋は社外が低評価）']]
  const insights: unknown[][] = [['催事', '所見']]

  data.events.forEach((e) => {
    const cs = data.companies.filter((c) => c.event_id === e.id).sort((a, b) => a.sort - b.sort)
    const rs = data.responses.filter((r) => r.event_id === e.id)
    filters.forEach((f) => {
      const a = analyzeEvent(cs, rs, f)
      a.core.stats.forEach((s, i) =>
        rank.push([e.name, fLabel[f], i + 1, s.company.label, s.company.name, s.company.is_self ? '○' : '', r2(s.avg.overall), r2(s.points), s.firstCount, grade(s.avg.overall, cs.length), ...CRITERIA.map((c) => r2(s.avg[c.key]))]),
      )
      corr.push([e.name, fLabel[f], a.core.n, ...CRITERIA.map((c) => r2(a.core.rho[c.key])), ...CRITERIA.map((c) => r2(a.core.firstMatch[c.key]))])
      if (f === 'all') {
        if (a.self) a.priorities.forEach((p, i) => prio.push([e.name, i + 1, CRITERIA.find((c) => c.key === p.key)!.label, r2(p.rho), r2(p.selfAvg), r2(p.topAvg), r2(p.gap)]))
        a.gaps.forEach((g) => gaps.push([e.name, g.company.label, g.company.name, CRITERIA.find((c) => c.key === g.key)!.label, r2(g.internal), r2(g.external), r2(g.diff)]))
        a.insights.forEach((t) => insights.push([e.name, t]))
      }
    })
  })

  const raw: unknown[][] = [['回答ID', '日時', '催事', '区分', ...RANK_KEYS.map((k) => (k === 'overall' ? '総合' : CRITERIA.find((c) => c.key === k)!.short) + '（1位→）'), 'ひとこと']]
  data.responses.forEach((r) =>
    raw.push([
      r.id,
      new Date(r.created_at).toLocaleString('ja-JP'),
      evName.get(r.event_id) ?? '',
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
  add('所見', insights, [16, 110])
  add('総合順位', rank, [16, 6, 5, 5, 18, 5, 9, 9, 7, 5])
  add('相関', corr, [16, 6, 7])
  add('自社の改善ポイント', prio, [16, 7, 30, 9, 12, 14, 7])
  add('社内外のズレ', gaps, [16, 5, 18, 30, 12, 12, 18])
  add('生データ', raw, [38, 18, 16, 6, 14, 14, 14, 14, 14, 14, 14, 50])

  const d = new Date()
  XLSX.writeFile(wb, `カタログ評価_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`)
}
