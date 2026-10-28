import { CRITERIA, RANK_KEYS, TYPE_LABEL } from './types'
import type { Company, CritKey, RankKey, RespondentType, ResponseRow } from './types'

const IN = TYPE_LABEL.internal
const EX = TYPE_LABEL.external

export type Filter = 'all' | RespondentType
export const FILTER_LABEL: Record<Filter, string> = { all: '全体', internal: TYPE_LABEL.internal, external: TYPE_LABEL.external }

/** 東光印刷・取引先いずれかがこの人数未満なら「参考値」扱い */
export const MIN_N = 10

export interface CompanyStat {
  company: Company
  avg: Record<RankKey, number | null> // 平均順位
  points: number | null // 総合の平均ポイント（1位＝社数点 … 最下位＝1点）
  firstCount: number // 総合1位票
  n: number
}

export interface Core {
  n: number
  stats: CompanyStat[] // 総合の平均順位順
  rho: Record<CritKey, number | null> // 総合順位との順位相関（回答者ごとのρの平均）
  firstMatch: Record<CritKey, number | null> // 総合1位＝項目1位 の一致率
  lastMatch: Record<CritKey, number | null> // 総合最下位＝項目最下位 の一致率
  itemCorr: Record<CritKey, Record<CritKey, number | null>>
}

export interface Gap { company: Company; key: CritKey; internal: number; external: number; diff: number }
export interface Priority { key: CritKey; rho: number | null; selfAvg: number | null; topAvg: number | null; gap: number | null; score: number | null }

export interface EventAnalysis {
  nCompanies: number
  counts: Record<Filter, number>
  core: Core
  byType: Record<RespondentType, Core>
  gaps: Gap[]
  self: CompanyStat | null
  selfRank: number | null
  top: CompanyStat | null
  priorities: Priority[]
  insights: string[]
  comments: { type: RespondentType; text: string; created_at: string }[]
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** スピアマンの順位相関。a, b は同じ社集合の並び（1位から順） */
export function spearman(a: string[], b: string[]): number | null {
  const n = a.length
  if (n < 2 || b.length !== n) return null
  const pos = new Map(b.map((id, i) => [id, i]))
  let d2 = 0
  for (let i = 0; i < n; i++) {
    const j = pos.get(a[i])
    if (j === undefined) return null
    d2 += (i - j) ** 2
  }
  return 1 - (6 * d2) / (n * (n * n - 1))
}

export function grade(avg: number | null, n: number): 'S' | 'A' | 'B' | 'C' | '-' {
  if (avg == null || n < 2) return '-'
  const p = (avg - 1) / (n - 1)
  if (p <= 0.2) return 'S'
  if (p <= 0.4) return 'A'
  if (p <= 0.6) return 'B'
  return 'C'
}
export const GRADE_TEXT = { S: 'お手本', A: '強み', B: '標準', C: '課題', '-': '—' } as const

function core(companies: Company[], responses: ResponseRow[], withItemCorr = true): Core {
  const ids = new Set(companies.map((c) => c.id))
  // 回答ごとに、評価対象の社だけに絞った並びを先に作っておく（人数が増えても軽く保つため）
  const orders = responses.map((r) => {
    const o = {} as Record<RankKey, string[]>
    RANK_KEYS.forEach((k) => { o[k] = (r.ranks[k] ?? []).filter((id) => ids.has(id)) })
    return o
  })

  // 社ごとの順位の合計・件数
  const sum = new Map<string, Record<RankKey, { s: number; c: number }>>()
  const pts = new Map<string, number[]>()
  const first = new Map<string, number>()
  companies.forEach((c) => {
    sum.set(c.id, Object.fromEntries(RANK_KEYS.map((k) => [k, { s: 0, c: 0 }])) as Record<RankKey, { s: number; c: number }>)
    pts.set(c.id, [])
    first.set(c.id, 0)
  })
  orders.forEach((o) => {
    RANK_KEYS.forEach((k) => {
      o[k].forEach((id, i) => {
        const a = sum.get(id)![k]
        a.s += i + 1
        a.c++
        if (k === 'overall') {
          pts.get(id)!.push(o[k].length - i)
          if (i === 0) first.set(id, first.get(id)! + 1)
        }
      })
    })
  })
  const stats: CompanyStat[] = companies.map((company) => {
    const sm = sum.get(company.id)!
    const avg = Object.fromEntries(RANK_KEYS.map((k) => [k, sm[k].c ? sm[k].s / sm[k].c : null])) as Record<RankKey, number | null>
    const p = pts.get(company.id)!
    return { company, avg, points: mean(p), firstCount: first.get(company.id)!, n: p.length }
  })
  stats.sort((a, b) => (a.avg.overall ?? 99) - (b.avg.overall ?? 99) || b.firstCount - a.firstCount)

  // 各並びの「社→位置」を1回だけ作る
  const pos = orders.map((o) => Object.fromEntries(RANK_KEYS.map((k) => [k, new Map(o[k].map((id, i) => [id, i]))])) as Record<RankKey, Map<string, number>>)
  const corr = (k1: RankKey, k2: RankKey) => {
    let t = 0
    let c = 0
    orders.forEach((o, ri) => {
      const a = o[k1]
      const b = pos[ri][k2]
      const n = a.length
      if (n < 2 || o[k2].length !== n) return
      let d2 = 0
      for (let i = 0; i < n; i++) {
        const j = b.get(a[i])
        if (j === undefined) return
        d2 += (i - j) ** 2
      }
      t += 1 - (6 * d2) / (n * (n * n - 1))
      c++
    })
    return c ? t / c : null
  }

  const rho = {} as Core['rho']
  const firstMatch = {} as Core['firstMatch']
  const lastMatch = {} as Core['lastMatch']
  const itemCorr = {} as Core['itemCorr']
  CRITERIA.forEach(({ key }) => {
    rho[key] = corr('overall', key)
    const both = orders.filter((o) => o.overall.length && o[key].length)
    firstMatch[key] = mean(both.map((o) => (o.overall[0] === o[key][0] ? 1 : 0)))
    lastMatch[key] = mean(both.map((o) => (o.overall[o.overall.length - 1] === o[key][o[key].length - 1] ? 1 : 0)))
    itemCorr[key] = {} as Record<CritKey, number | null>
  })
  CRITERIA.forEach(({ key: k1 }, i) => {
    CRITERIA.forEach(({ key: k2 }, j) => {
      if (j < i || !withItemCorr) return
      const v = i === j ? 1 : corr(k1, k2)
      itemCorr[k1][k2] = v
      itemCorr[k2][k1] = v
    })
  })

  return { n: responses.length, stats, rho, firstMatch, lastMatch, itemCorr }
}

const f1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null) => (v == null ? '—' : v.toFixed(2))

export function analyzeEvent(companies: Company[], allResponses: ResponseRow[], filter: Filter): EventAnalysis {
  const internal = allResponses.filter((r) => r.respondent_type === 'internal')
  const external = allResponses.filter((r) => r.respondent_type === 'external')
  const target = filter === 'all' ? allResponses : filter === 'internal' ? internal : external
  const c = core(companies, target)
  const byType = { internal: core(companies, internal, false), external: core(companies, external, false) }
  const n = companies.length

  // 東光印刷と取引先・一般の評価のズレ（平均順位の差）
  const gaps: Gap[] = []
  if (internal.length && external.length) {
    companies.forEach((co) => {
      const si = byType.internal.stats.find((s) => s.company.id === co.id)!
      const se = byType.external.stats.find((s) => s.company.id === co.id)!
      CRITERIA.forEach(({ key }) => {
        const a = si.avg[key]
        const b = se.avg[key]
        if (a != null && b != null) gaps.push({ company: co, key, internal: a, external: b, diff: b - a })
      })
    })
    gaps.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
  }

  const self = c.stats.find((s) => s.company.is_self) ?? null
  const selfRank = self ? c.stats.indexOf(self) + 1 : null
  const top = c.stats[0] && c.stats[0].n ? c.stats[0] : null
  // 比較相手：自社が1位なら2位の社
  const rival = self && top && self.company.id === top.company.id ? c.stats[1] ?? null : top

  const priorities: Priority[] = CRITERIA.map(({ key }) => {
    const rho = c.rho[key]
    const selfAvg = self?.avg[key] ?? null
    const topAvg = rival?.avg[key] ?? null
    const gap = selfAvg != null && topAvg != null ? selfAvg - topAvg : null
    // 影響度が大きく、自社が弱い（＝平均順位が大きい）ほど優先
    const score = rho != null && selfAvg != null ? Math.max(rho, 0) * ((selfAvg - 1) / Math.max(n - 1, 1)) : null
    return { key, rho, selfAvg, topAvg, gap, score }
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  // 自動コメント
  const insights: string[] = []
  const label = (k: CritKey) => CRITERIA.find((x) => x.key === k)!.label
  if (c.n === 0) {
    insights.push('まだ回答がありません。')
  } else {
    if (top) insights.push(`総合1位は「${top.company.name}」（平均${f1(top.avg.overall)}位、1位票 ${top.firstCount}/${c.n}）。`)
    const byRho = CRITERIA.map((x) => x.key).filter((k) => c.rho[k] != null).sort((a, b) => c.rho[b]! - c.rho[a]!)
    if (byRho.length) {
      const hi = byRho[0]
      const lo = byRho[byRho.length - 1]
      insights.push(`総合順位に最も連動したのは「${label(hi)}」（ρ=${f2(c.rho[hi])}）。最も連動しなかったのは「${label(lo)}」（ρ=${f2(c.rho[lo])}）。`)
    }
    if (self && selfRank) {
      const items = CRITERIA.map((x) => x.key).filter((k) => self.avg[k] != null).sort((a, b) => self.avg[a]! - self.avg[b]!)
      const best = items[0]
      const worst = items[items.length - 1]
      insights.push(
        `自社は総合${selfRank}位（平均${f1(self.avg.overall)}位）。強みは「${label(best)}」（平均${f1(self.avg[best])}位）、弱みは「${label(worst)}」（平均${f1(self.avg[worst])}位）。`,
      )
      const p = priorities[0]
      if (p && p.score != null && rival && rival.company.id !== self.company.id) {
        insights.push(
          `次回の重点課題：「${label(p.key)}」。総合への影響が大きく（ρ=${f2(p.rho)}）、「${rival.company.name}」との差は${p.gap != null ? p.gap.toFixed(1) : '—'}位。`,
        )
      }
      const sg = gaps.filter((g) => g.company.is_self)[0]
      if (sg && Math.abs(sg.diff) >= 0.8) {
        insights.push(
          `自社の「${label(sg.key)}」は${IN}では${f1(sg.internal)}位／${EX}では${f1(sg.external)}位で、${EX}の評価のほうが${sg.diff > 0 ? '低い' : '高い'}。`,
        )
      }
    }
    if (internal.length < MIN_N || external.length < MIN_N) {
      insights.push(`※ ${IN}${internal.length}人・${EX}${external.length}人。${MIN_N}人未満の区分は参考値として見てください。`)
    }
  }

  const comments = target
    .filter((r) => r.comment.trim())
    .map((r) => ({ type: r.respondent_type, text: r.comment.trim(), created_at: r.created_at }))

  return {
    nCompanies: n,
    counts: { all: allResponses.length, internal: internal.length, external: external.length },
    core: c,
    byType,
    gaps,
    self,
    selfRank,
    top,
    priorities,
    insights,
    comments,
  }
}

export { TYPE_LABEL }
