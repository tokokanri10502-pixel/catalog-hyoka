import { useMemo, useState } from 'react'
import { analyzeEvent, FILTER_LABEL, grade, GRADE_TEXT, MIN_N } from '../analysis'
import type { EventAnalysis, Filter } from '../analysis'
import { CRITERIA, OVERALL, TYPE_LABEL } from '../types'
import type { AdminData, CritKey, RankKey } from '../types'
import { exportExcel } from '../excel'

const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const short = (k: RankKey) => (k === 'overall' ? OVERALL.short : CRITERIA.find((c) => c.key === k)!.short)

/** 平均順位 → 背景色（上位ほど濃い藍） */
function rankStyle(avg: number | null, n: number) {
  if (avg == null) return {}
  const t = 1 - (avg - 1) / Math.max(n - 1, 1)
  const a = 0.06 + t * 0.74
  return { background: `rgba(43, 58, 140, ${a})`, color: a > 0.45 ? '#fff' : undefined }
}
/** 相関 → 背景色（高いほど濃い朱） */
function rhoStyle(r: number | null) {
  if (r == null) return {}
  const a = 0.05 + Math.max(r, 0) * 0.8
  return { background: `rgba(179, 71, 45, ${a})`, color: a > 0.5 ? '#fff' : undefined }
}

export function Analysis({ data, onReload }: { data: AdminData; onReload: () => Promise<unknown> }) {
  const [sel, setSel] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)

  const results = useMemo(
    () =>
      data.events.map((e) => ({
        event: e,
        a: analyzeEvent(
          data.companies.filter((c) => c.event_id === e.id).sort((x, y) => x.sort - y.sort),
          data.responses.filter((r) => r.event_id === e.id),
          filter,
        ),
      })),
    [data, filter],
  )
  const cur = results.find((r) => r.event.id === sel)

  return (
    <div className="stack">
      <div className="toolbar no-print">
        <div className="seg">
          <button className={`seg-btn ${sel === 'all' ? 'is-on' : ''}`} onClick={() => setSel('all')}>全催事まとめ</button>
          {data.events.map((e) => (
            <button key={e.id} className={`seg-btn ${sel === e.id ? 'is-on' : ''}`} onClick={() => setSel(e.id)}>{e.name}</button>
          ))}
        </div>
        <div className="row">
          <div className="seg">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} className={`seg-btn ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
            ))}
          </div>
          <button className="btn btn-ghost" disabled={busy} onClick={async () => { setBusy(true); await onReload(); setBusy(false) }}>{busy ? '更新中…' : '最新に更新'}</button>
          <button className="btn btn-ghost" onClick={() => exportExcel(data)}>Excel</button>
          <button className="btn btn-ghost" onClick={() => window.print()}>印刷/PDF</button>
        </div>
      </div>

      {cur ? <EventView name={cur.event.name} a={cur.a} filter={filter} /> : <CrossView results={results} filter={filter} />}
    </div>
  )
}

function Counts({ a }: { a: EventAnalysis }) {
  return (
    <div className="counts-line">
      <span>回答 <b>{a.counts.all}</b>人</span>
      <span className={a.counts.internal < MIN_N ? 'is-low' : ''}>社内 <b>{a.counts.internal}</b></span>
      <span className={a.counts.external < MIN_N ? 'is-low' : ''}>社外 <b>{a.counts.external}</b></span>
      <span className="muted">評価対象 {a.nCompanies}社</span>
    </div>
  )
}

function Grade({ avg, n }: { avg: number | null; n: number }) {
  const g = grade(avg, n)
  return <span className={`grade g-${g}`} title={GRADE_TEXT[g]}>{g}</span>
}

function EventView({ name, a, filter }: { name: string; a: EventAnalysis; filter: Filter }) {
  const n = a.nCompanies
  const keys: RankKey[] = ['overall', ...CRITERIA.map((c) => c.key)]
  const both = a.counts.internal > 0 && a.counts.external > 0
  return (
    <>
      <div className="report-head">
        <h2 className="h1">{name}<small>（{FILTER_LABEL[filter]}）</small></h2>
        <Counts a={a} />
      </div>

      <section className="card insight">
        <h3 className="h3">所見（自動）</h3>
        <ul>{a.insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>

      <div className="grid2 grid-wide">
        <section className="card">
          <h3 className="h3">① 総合順位</h3>
          <table className="table rank-table">
            <thead><tr><th>順位</th><th>社</th><th>平均順位</th><th>ポイント</th><th>1位票</th><th>評価</th></tr></thead>
            <tbody>
              {a.core.stats.map((s, i) => (
                <tr key={s.company.id} className={s.company.is_self ? 'is-self' : ''}>
                  <td className="rank-no">{i + 1}</td>
                  <td><span className="lab">{s.company.label}</span>{s.company.name}{s.company.is_self && <span className="pill">自社</span>}</td>
                  <td>{f1(s.avg.overall)}</td>
                  <td>{f1(s.points)}</td>
                  <td>{s.firstCount}</td>
                  <td><Grade avg={s.avg.overall} n={n} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">ポイント：1位＝{n}点 … {n}位＝1点の平均。評価：S お手本／A 強み／B 標準／C 課題（平均順位から判定）</p>
        </section>

        <section className="card">
          <h3 className="h3">② 項目別の平均順位</h3>
          <div className="scroll-x">
            <table className="table heat">
              <thead><tr><th>社</th>{keys.map((k) => <th key={k}>{short(k)}</th>)}</tr></thead>
              <tbody>
                {a.core.stats.map((s) => (
                  <tr key={s.company.id} className={s.company.is_self ? 'is-self' : ''}>
                    <td className="nowrap"><span className="lab">{s.company.label}</span>{s.company.name}</td>
                    {keys.map((k) => (
                      <td key={k} className="heat-cell" style={rankStyle(s.avg[k], n)}>
                        {f1(s.avg[k])}<small>{grade(s.avg[k], n)}</small>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">数字は平均順位（小さいほど高評価）。色が濃いほど上位。</p>
        </section>
      </div>

      <div className="grid2 grid-wide">
        <section className="card">
          <h3 className="h3">③ 総合順位を左右した項目（順位相関 ρ）</h3>
          <RhoBars a={a} />
          <p className="muted small">ρ：回答者ごとに「総合順位」と「項目の順位」の一致度（−1〜1）を出して平均。1位一致率：総合1位の社が、その項目でも1位だった割合。</p>
        </section>
        <section className="card">
          <h3 className="h3">④ 重要度 × 自社評価マトリクス</h3>
          {a.self ? <Matrix a={a} /> : <p className="muted">自社が登録されていません（催事・社タブで設定）</p>}
        </section>
      </div>

      {a.self && (
        <section className="card">
          <h3 className="h3">⑤ 自社の改善ポイント（優先度順）</h3>
          <table className="table">
            <thead><tr><th>項目</th><th>総合への影響 ρ</th><th>自社 平均順位</th><th>比較相手 平均順位</th><th>差</th><th>判定</th></tr></thead>
            <tbody>
              {a.priorities.map((p, i) => (
                <tr key={p.key} className={i === 0 ? 'is-top' : ''}>
                  <td>{CRITERIA.find((c) => c.key === p.key)!.label}</td>
                  <td>{f2(p.rho)}</td>
                  <td>{f1(p.selfAvg)} <Grade avg={p.selfAvg} n={n} /></td>
                  <td>{f1(p.topAvg)}</td>
                  <td>{p.gap == null ? '—' : (p.gap > 0 ? '+' : '') + p.gap.toFixed(1)}</td>
                  <td>{i === 0 ? <span className="pill pill-accent">重点課題</span> : (p.selfAvg ?? 99) <= 1 + (n - 1) * 0.4 ? <span className="pill">強み</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">比較相手＝総合1位の社（自社が1位なら2位の社）。優先度＝影響度 ρ × 自社の順位の低さ。</p>
        </section>
      )}

      <div className="grid2 grid-wide">
        <section className="card">
          <h3 className="h3">⑥ 社内と社外の評価のズレ</h3>
          {both ? (
            <>
              <table className="table">
                <thead><tr><th>社</th><th>項目</th><th>社内</th><th>社外</th><th>ズレ</th></tr></thead>
                <tbody>
                  {a.gaps.slice(0, 8).map((g) => (
                    <tr key={g.company.id + g.key} className={g.company.is_self ? 'is-self' : ''}>
                      <td><span className="lab">{g.company.label}</span>{g.company.name}</td>
                      <td>{CRITERIA.find((c) => c.key === g.key)!.short}</td>
                      <td>{f1(g.internal)}</td>
                      <td>{f1(g.external)}</td>
                      <td className={g.diff > 0 ? 'neg' : 'pos'}>{g.diff > 0 ? `社外が${g.diff.toFixed(1)}位低い` : `社外が${(-g.diff).toFixed(1)}位高い`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="h4">評価軸のズレ（ρ：社内 / 社外）</h4>
              <div className="axis-gap">
                {CRITERIA.map((c) => (
                  <div key={c.key} className="axis-row">
                    <span>{c.short}</span>
                    <span>{f2(a.byType.internal.rho[c.key])}</span>
                    <span>{f2(a.byType.external.rho[c.key])}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">社内・社外の両方の回答がそろうと表示されます。</p>
          )}
        </section>

        <section className="card">
          <h3 className="h3">⑦ 項目同士の相関</h3>
          <div className="scroll-x">
            <table className="table heat small-heat">
              <thead><tr><th />{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
              <tbody>
                {CRITERIA.map((r) => (
                  <tr key={r.key}>
                    <th>{r.short}</th>
                    {CRITERIA.map((c) => (
                      <td key={c.key} className="heat-cell" style={r.key === c.key ? { background: '#eee' } : rhoStyle(a.core.itemCorr[r.key][c.key])}>
                        {r.key === c.key ? '' : f2(a.core.itemCorr[r.key][c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">0.8以上の組み合わせは、回答者が区別できていない可能性あり（次回の項目見直しの参考）。</p>
        </section>
      </div>

      <section className="card">
        <h3 className="h3">⑧ ひとことコメント（{a.comments.length}件）</h3>
        {a.comments.length ? (
          <ul className="comments">
            {a.comments.map((c, i) => (
              <li key={i}><span className={`pill t-${c.type}`}>{TYPE_LABEL[c.type]}</span>{c.text}</li>
            ))}
          </ul>
        ) : <p className="muted">コメントはまだありません。</p>}
      </section>
    </>
  )
}

function RhoBars({ a }: { a: EventAnalysis }) {
  const rows = CRITERIA.map((c) => ({ c, r: a.core.rho[c.key], fm: a.core.firstMatch[c.key] })).sort((x, y) => (y.r ?? -2) - (x.r ?? -2))
  return (
    <div className="bars">
      {rows.map(({ c, r, fm }, i) => (
        <div key={c.key} className="bar-row">
          <span className="bar-label">{c.label}</span>
          <span className="bar-track">
            <span className={`bar-fill ${i === 0 ? 'is-top' : ''}`} style={{ width: `${Math.max(r ?? 0, 0) * 100}%` }} />
          </span>
          <span className="bar-val">{f2(r)}</span>
          <span className="bar-sub">1位一致 {pct(fm)}</span>
        </div>
      ))}
    </div>
  )
}

function Matrix({ a }: { a: EventAnalysis }) {
  const n = a.nCompanies
  const W = 520, H = 360, L = 56, R = 20, T = 20, B = 46
  const pts = CRITERIA.map((c) => ({ c, x: a.self!.avg[c.key], y: a.core.rho[c.key] })).filter((p) => p.x != null && p.y != null) as { c: (typeof CRITERIA)[number]; x: number; y: number }[]
  if (!pts.length) return <p className="muted">回答がありません</p>
  const yMin = Math.min(0, ...pts.map((p) => p.y)) - 0.05
  const yMax = 1
  // 左＝自社が下位、右＝自社が上位
  const sx = (avg: number) => L + ((n - avg) / Math.max(n - 1, 1)) * (W - L - R)
  const sy = (r: number) => T + ((yMax - r) / (yMax - yMin)) * (H - T - B)
  const midY = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const midX = (n + 1) / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="matrix" role="img" aria-label="重要度と自社評価のマトリクス">
      <rect x={L} y={T} width={sx(midX) - L} height={sy(midY) - T} className="q-hot" />
      <line x1={sx(midX)} x2={sx(midX)} y1={T} y2={H - B} className="mid" />
      <line x1={L} x2={W - R} y1={sy(midY)} y2={sy(midY)} className="mid" />
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="frame" />
      <text x={L + 8} y={T + 18} className="q-label hot">優先改善</text>
      <text x={W - R - 8} y={T + 18} className="q-label" textAnchor="end">強みを維持</text>
      <text x={L + 8} y={H - B - 8} className="q-label">後回しで可</text>
      <text x={W - R - 8} y={H - B - 8} className="q-label" textAnchor="end">過剰投資？</text>
      <text x={(L + W - R) / 2} y={H - 10} className="axis" textAnchor="middle">← 自社の順位が低い　　自社の順位が高い →</text>
      <text x={16} y={(T + H - B) / 2} className="axis" textAnchor="middle" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>総合への影響度 ρ</text>
      {[n, midX, 1].map((v) => <text key={v} x={sx(v)} y={H - B + 14} className="tick" textAnchor="middle">{Number.isInteger(v) ? `${v}位` : ''}</text>)}
      {pts.map((p) => (
        <g key={p.c.key} transform={`translate(${sx(p.x)},${sy(p.y)})`}>
          <circle r={7} className={p.x > midX && p.y > midY ? 'dot hot' : 'dot'} />
          <text x={10} y={4} className="dot-label">{p.c.short}</text>
        </g>
      ))}
    </svg>
  )
}

function CrossView({ results, filter }: { results: { event: { id: string; name: string }; a: EventAnalysis }[]; filter: Filter }) {
  const total = results.reduce((s, r) => s + r.a.counts.all, 0)
  const label = (k: CritKey) => CRITERIA.find((c) => c.key === k)!.short
  return (
    <>
      <div className="report-head">
        <h2 className="h1">全催事まとめ<small>（{FILTER_LABEL[filter]}）</small></h2>
        <div className="counts-line"><span>回答 延べ <b>{total}</b>件</span><span className="muted">{results.length}催事</span></div>
      </div>

      <section className="card">
        <h3 className="h3">催事ごとの総合1位と自社</h3>
        <table className="table">
          <thead><tr><th>催事</th><th>回答</th><th>総合1位</th><th>自社の総合順位</th><th>重点課題</th></tr></thead>
          <tbody>
            {results.map(({ event, a }) => (
              <tr key={event.id}>
                <td><b>{event.name}</b></td>
                <td>{a.counts.all}<span className="muted small">（内{a.counts.internal}/外{a.counts.external}）</span></td>
                <td>{a.top ? `${a.top.company.label} ${a.top.company.name}` : '—'}</td>
                <td>{a.selfRank ? <>{a.selfRank}位 / {a.nCompanies}社 <Grade avg={a.self!.avg.overall} n={a.nCompanies} /></> : '—'}</td>
                <td>{a.self && a.priorities[0]?.score != null ? <span className="pill pill-accent">{CRITERIA.find((c) => c.key === a.priorities[0].key)!.label}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid2 grid-wide">
        <section className="card">
          <h3 className="h3">催事 × 項目：総合への影響度（ρ）</h3>
          <div className="scroll-x">
            <table className="table heat">
              <thead><tr><th>催事</th>{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
              <tbody>
                {results.map(({ event, a }) => {
                  const max = Math.max(...CRITERIA.map((c) => a.core.rho[c.key] ?? -2))
                  return (
                    <tr key={event.id}>
                      <td className="nowrap">{event.name}</td>
                      {CRITERIA.map((c) => (
                        <td key={c.key} className={`heat-cell ${a.core.rho[c.key] === max ? 'is-max' : ''}`} style={rhoStyle(a.core.rho[c.key])}>{f2(a.core.rho[c.key])}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">枠付き＝その催事で最も総合順位を左右した項目。催事ごとに「勝ち方」が違うかを見ます。</p>
        </section>

        <section className="card">
          <h3 className="h3">自社の項目別平均順位（催事横断）</h3>
          <div className="scroll-x">
            <table className="table heat">
              <thead><tr><th>催事</th><th>総合</th>{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
              <tbody>
                {results.map(({ event, a }) => (
                  <tr key={event.id}>
                    <td className="nowrap">{event.name}</td>
                    {(['overall', ...CRITERIA.map((c) => c.key)] as RankKey[]).map((k) => (
                      <td key={k} className="heat-cell" style={rankStyle(a.self?.avg[k] ?? null, a.nCompanies)}>
                        {f1(a.self?.avg[k])}<small>{a.self ? grade(a.self.avg[k], a.nCompanies) : ''}</small>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CommonTraits results={results} label={label} />
        </section>
      </div>

      <section className="card insight">
        <h3 className="h3">催事ごとの所見（自動）</h3>
        {results.map(({ event, a }) => (
          <div key={event.id} className="insight-block">
            <h4 className="h4">{event.name}</h4>
            <ul>{a.insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ))}
      </section>
    </>
  )
}

/** 全催事を通して自社が強い／弱い項目 */
function CommonTraits({ results, label }: { results: { a: EventAnalysis }[]; label: (k: CritKey) => string }) {
  const rel = CRITERIA.map((c) => {
    const xs = results.map(({ a }) => (a.self?.avg[c.key] != null ? (a.self.avg[c.key]! - 1) / Math.max(a.nCompanies - 1, 1) : null)).filter((x): x is number => x != null)
    return { k: c.key, v: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null }
  }).filter((x) => x.v != null) as { k: CritKey; v: number }[]
  if (!rel.length) return null
  rel.sort((a, b) => a.v - b.v)
  return (
    <p className="small">
      全催事を通した自社の傾向：強み「{label(rel[0].k)}」／弱み「{label(rel[rel.length - 1].k)}」
    </p>
  )
}
