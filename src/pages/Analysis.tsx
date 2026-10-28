import { useMemo, useState } from 'react'
import { analyzeEvent, FILTER_LABEL, grade, GRADE_TEXT, MIN_N } from '../analysis'
import type { EventAnalysis, Filter } from '../analysis'
import { CRITERIA, OVERALL, RANK_KEYS, TYPE_LABEL, eventLabel, rankColor } from '../types'
import type { AdminData, CritKey, EventRow, RankKey } from '../types'
import { exportExcel } from '../excel'

const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const short = (k: RankKey) => (k === 'overall' ? OVERALL.short : CRITERIA.find((c) => c.key === k)!.short)

/** 平均順位 → 背景色（上位ほど濃い藍） */
function rankStyle(avg: number | null, n: number) {
  if (avg == null) return {}
  // t: 1＝最上位 … 0＝最下位。中間をはっきり分けるため、上位側を強めに効かせる
  const t = Math.min(Math.max(1 - (avg - 1) / Math.max(n - 1, 1), 0), 1)
  const k = t ** 1.4
  const light = 97 - k * 61 // 97%（白に近い）→ 36%（濃い青）
  const sat = 30 + k * 52
  return {
    background: `hsl(216, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`,
    color: light < 62 ? '#fff' : light < 85 ? 'var(--indigo)' : 'var(--ink-2)',
  }
}
/** 相関 → 背景色（高いほど濃いブルー） */
function rhoStyle(r: number | null) {
  if (r == null) return {}
  const a = 0.05 + Math.max(r, 0) * 0.8
  return { background: `rgba(29, 95, 184, ${a})`, color: a > 0.5 ? '#fff' : undefined }
}

export function Analysis({ data, all, year, onReload }: { data: AdminData; all: AdminData; year: number; onReload: () => Promise<unknown> }) {
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
  // 全年ぶん（年ごとの比較用）
  const history = useMemo(
    () =>
      all.events.map((e) => ({
        event: e,
        a: analyzeEvent(
          all.companies.filter((c) => c.event_id === e.id).sort((x, y) => x.sort - y.sort),
          all.responses.filter((r) => r.event_id === e.id),
          filter,
        ),
      })),
    [all, filter],
  )

  return (
    <div className="stack">
      <div className="toolbar no-print">
        <div className="seg">
          <button className={`seg-btn ${sel === 'all' ? 'is-on' : ''}`} onClick={() => setSel('all')}>全催事まとめ</button>
          <span className="seg-sep">催事ごと →</span>
          {data.events.map((e) => (
            <button key={e.id} className={`seg-btn ${sel === e.id ? 'is-on' : ''}`} onClick={() => setSel(e.id)}>{eventLabel(e)}</button>
          ))}
        </div>
        <div className="row">
          <div className="seg">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} className={`seg-btn ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
            ))}
          </div>
          <button className="btn btn-ghost" disabled={busy} onClick={async () => { setBusy(true); await onReload(); setBusy(false) }}>{busy ? '更新中…' : '最新に更新'}</button>
          <button className="btn btn-ghost" onClick={() => exportExcel(all)}>Excel（全年）</button>
          <button className="btn btn-ghost" onClick={() => window.print()}>印刷/PDF</button>
        </div>
      </div>

      {cur ? (
        <EventView name={eventLabel(cur.event)} a={cur.a} filter={filter} />
      ) : (
        <>
          <CrossView results={results} filter={filter} year={year} onOpen={(id) => { setSel(id); window.scrollTo(0, 0) }} />
          <YearCompare history={history} year={year} />
        </>
      )}
    </div>
  )
}

function Counts({ a }: { a: EventAnalysis }) {
  return (
    <div className="counts-line">
      <span>回答 <b>{a.counts.all}</b>人</span>
      <span className={a.counts.internal < MIN_N ? 'is-low' : ''}>{TYPE_LABEL.internal} <b>{a.counts.internal}</b></span>
      <span className={a.counts.external < MIN_N ? 'is-low' : ''}>{TYPE_LABEL.external} <b>{a.counts.external}</b></span>
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
        <section className="card span-all">
          <h3 className="h3">③ 総合順位を左右した項目（順位相関 ρ）</h3>
          <RhoGuide a={a} />
          <RhoBars a={a} />
        </section>
        <section className="card span-all">
          <h3 className="h3">④ 重要度 × 自社評価マトリクス（次回どこを直すか）</h3>
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
          <h3 className="h3">⑥ {TYPE_LABEL.internal}と{TYPE_LABEL.external}の評価のズレ</h3>
          {both ? (
            <>
              <table className="table">
                <thead><tr><th>社</th><th>項目</th><th>{TYPE_LABEL.internal}</th><th>{TYPE_LABEL.external}</th><th>ズレ</th></tr></thead>
                <tbody>
                  {a.gaps.slice(0, 8).map((g) => (
                    <tr key={g.company.id + g.key} className={g.company.is_self ? 'is-self' : ''}>
                      <td><span className="lab">{g.company.label}</span>{g.company.name}</td>
                      <td>{CRITERIA.find((c) => c.key === g.key)!.short}</td>
                      <td>{f1(g.internal)}</td>
                      <td>{f1(g.external)}</td>
                      <td className={g.diff > 0 ? 'neg' : 'pos'}>{g.diff > 0 ? `${TYPE_LABEL.external}が${g.diff.toFixed(1)}位低い` : `${TYPE_LABEL.external}が${(-g.diff).toFixed(1)}位高い`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="h4">評価軸のズレ（ρ：{TYPE_LABEL.internal} / {TYPE_LABEL.external}）</h4>
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
            <p className="muted">{TYPE_LABEL.internal}・{TYPE_LABEL.external}の両方の回答がそろうと表示されます。</p>
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

/** ρの強さを言葉にする */
function rhoWord(r: number | null): { word: string; cls: string } {
  if (r == null) return { word: '—', cls: '' }
  if (r >= 0.7) return { word: '強く連動', cls: 'lv-high' }
  if (r >= 0.4) return { word: 'ある程度連動', cls: 'lv-mid' }
  if (r >= 0) return { word: 'あまり関係なし', cls: 'lv-low' }
  return { word: '逆の動き', cls: 'lv-low' }
}

function RhoGuide({ a }: { a: EventAnalysis }) {
  const sorted = CRITERIA.map((c) => ({ c, r: a.core.rho[c.key] })).filter((x) => x.r != null).sort((x, y) => y.r! - x.r!)
  const top = sorted[0]
  const low = sorted[sorted.length - 1]
  const fl = CRITERIA.map((c) => ({ c, f: a.core.firstMatch[c.key], l: a.core.lastMatch[c.key] })).filter((x) => x.f != null && x.l != null) as { c: (typeof CRITERIA)[number]; f: number; l: number }[]
  const winLose = fl.length
    ? { win: [...fl].sort((x, y) => y.f - x.f)[0], lose: [...fl].sort((x, y) => y.l - x.l)[0] }
    : null
  return (
    <div className="matrix-guide">
      <p><b>このグラフの見方</b>　「どの項目で高く評価された社が、総合でも高く評価されたか」を表します。</p>
      <ul>
        <li><b>ρ（ロー）</b>：回答者1人ずつについて、「総合で付けた順位」と「その項目で付けた順位」がどれだけ同じ並びだったかを −1〜1 で表し、全員分を平均した値です。<br />
          1.0＝まったく同じ並び／0＝関係なし／マイナス＝逆の並び。</li>
        <li><b>棒が長い項目ほど</b>、その項目の出来が総合評価に直結しています。上位どうし・下位どうしの一致を同じ重さで数えるので、ρが高い項目は<b>「勝てば総合も上がり、負ければ総合も下がる」</b>項目です。次の制作で<b>力を入れる効果が大きい項目</b>です。</li>
        <li>目安：<span className="lv lv-high">0.7以上 強く連動</span> <span className="lv lv-mid">0.4〜0.7 ある程度連動</span> <span className="lv lv-low">0.4未満 あまり関係なし</span></li>
        <li><b>1位一致</b>：総合で1位にした社を、その項目でも1位にした人の割合。高いほど<b>「1位を決める（勝ちを決める）項目」</b>です。</li>
        <li><b>最下位一致</b>：総合で最下位にした社を、その項目でも最下位にした人の割合。高いほど<b>「最下位を決める（負けを決める）項目」</b>です。自社が下位の催事では、ここが高い項目が足を引っぱっている可能性があります。</li>
      </ul>
      {top && low && top !== low && (
        <p className="rho-read">
          <b>この催事では</b>、「{top.c.label}」（ρ={f2(top.r)}）で上位の社は総合でも上位に、下位の社は総合でも下位になりやすく、
          「{low.c.label}」（ρ={f2(low.r)}）は総合の順位とあまり連動していませんでした。
          {winLose && <><br />勝ちを決めた項目（1位一致が最も高い）は「{winLose.win.c.label}」（{pct(winLose.win.f)}）、負けを決めた項目（最下位一致が最も高い）は「{winLose.lose.c.label}」（{pct(winLose.lose.l)}）です。</>}
        </p>
      )}
      <p className="muted small">※ 総合で気に入った社を各項目でも高く付けがちなため、ρは全体に高めに出ます。数値の大きさより「項目どうしの差」を見てください。</p>
    </div>
  )
}

function RhoBars({ a }: { a: EventAnalysis }) {
  const rows = CRITERIA.map((c) => ({ c, r: a.core.rho[c.key], fm: a.core.firstMatch[c.key], lm: a.core.lastMatch[c.key] })).sort((x, y) => (y.r ?? -2) - (x.r ?? -2))
  const maxF = Math.max(...rows.map((x) => x.fm ?? -1))
  const maxL = Math.max(...rows.map((x) => x.lm ?? -1))
  return (
    <div className="bars">
      <div className="bar-row bar-head">
        <span>項目</span><span>総合との連動（ρ）</span><span /><span />
        <span>1位一致<small>勝ちを決める</small></span>
        <span>最下位一致<small>負けを決める</small></span>
      </div>
      {rows.map(({ c, r, fm, lm }, i) => {
        const w = rhoWord(r)
        return (
          <div key={c.key} className="bar-row" title={`${c.label}：ρ=${f2(r)}（${w.word}）／1位一致 ${pct(fm)}／最下位一致 ${pct(lm)}`}>
            <span className="bar-label">{c.label}</span>
            <span className="bar-track">
              <span className={`bar-fill ${i === 0 ? 'is-top' : ''}`} style={{ width: `${Math.max(r ?? 0, 0) * 100}%` }} />
            </span>
            <span className="bar-val">{f2(r)}</span>
            <span className={`bar-word lv ${w.cls}`}>{w.word}</span>
            <span className={`bar-sub ${fm === maxF ? 'is-max-win' : ''}`}>{pct(fm)}</span>
            <span className={`bar-sub ${lm === maxL ? 'is-max-lose' : ''}`}>{pct(lm)}</span>
          </div>
        )
      })}
    </div>
  )
}

type Quad = 'fix' | 'keep' | 'later' | 'over'
const QUADS: Record<Quad, { title: string; lead: string; desc: string }> = {
  fix: { title: '優先改善', lead: '総合に効く × 自社が弱い', desc: '評価を大きく左右するのに、自社は他社に負けている項目。次回まず手を入れる。' },
  keep: { title: '強みを維持', lead: '総合に効く × 自社が強い', desc: '評価を左右し、自社も上位の項目。今のやり方を続ける。' },
  later: { title: '後回しで可', lead: 'あまり効かない × 自社が弱い', desc: '自社は弱いが、総合評価への影響は小さい項目。優先度は低め。' },
  over: { title: '力の入れ過ぎ？', lead: 'あまり効かない × 自社が強い', desc: '自社は強いが、総合評価にはあまり効いていない項目。手間のかけ方を見直す余地あり。' },
}

function Matrix({ a }: { a: EventAnalysis }) {
  const n = a.nCompanies
  const W = 560, H = 380, L = 64, R = 24, T = 24, B = 56
  const pts = CRITERIA.map((c) => ({ c, x: a.self!.avg[c.key], y: a.core.rho[c.key] })).filter((p) => p.x != null && p.y != null) as { c: (typeof CRITERIA)[number]; x: number; y: number }[]
  if (!pts.length) return <p className="muted">回答がありません</p>
  const yMin = Math.min(0, ...pts.map((p) => p.y)) - 0.05
  const yMax = 1
  // 左＝自社が下位、右＝自社が上位
  const sx = (avg: number) => L + ((n - avg) / Math.max(n - 1, 1)) * (W - L - R)
  const sy = (r: number) => T + ((yMax - r) / (yMax - yMin)) * (H - T - B)
  const midY = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const midX = (n + 1) / 2
  const quadOf = (p: { x: number; y: number }): Quad => (p.y >= midY ? (p.x > midX ? 'fix' : 'keep') : p.x > midX ? 'later' : 'over')

  // ラベルの重なりを避ける（近い点は下にずらす）
  const placed: { x: number; y: number }[] = []
  const labels = [...pts]
    .sort((p, q) => sy(p.y) - sy(q.y))
    .map((p) => {
      const x = sx(p.x)
      let y = sy(p.y) + 4
      while (placed.some((o) => Math.abs(o.y - y) < 14 && Math.abs(o.x - x) < 80)) y += 14
      placed.push({ x, y })
      return { key: p.c.key, dy: y - sy(p.y) }
    })
  const dyOf = (k: CritKey) => labels.find((l) => l.key === k)!.dy

  const byQuad = (q: Quad) => pts.filter((p) => quadOf(p) === q)

  return (
    <div className="matrix-wrap">
      <div className="matrix-guide">
        <p><b>この図の見方</b>　6つの項目を、2つのものさしで並べています。</p>
        <ul>
          <li><b>縦＝総合への影響</b>：その項目の順位が、総合順位とどれだけ連動したか（ρ）。<b>上ほど</b>「この項目で勝つと総合でも勝てる」項目です。</li>
          <li><b>横＝自社の出来</b>：その項目での自社の平均順位。<b>右ほど</b>他社より評価が高い（1位に近い）ことを表します。</li>
        </ul>
        <p className="muted small">点線は、縦＝6項目の影響の平均、横＝順位のまん中（{midX.toFixed(1)}位）です。<b className="hot-text">左上（赤）に入った項目が、次回いちばん直すべきところ</b>です。</p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="matrix" role="img" aria-label="重要度と自社評価のマトリクス">
        <rect x={L} y={T} width={sx(midX) - L} height={sy(midY) - T} className="q-hot" />
        <rect x={sx(midX)} y={T} width={W - R - sx(midX)} height={sy(midY) - T} className="q-keep" />
        <line x1={sx(midX)} x2={sx(midX)} y1={T} y2={H - B} className="mid" />
        <line x1={L} x2={W - R} y1={sy(midY)} y2={sy(midY)} className="mid" />
        <rect x={L} y={T} width={W - L - R} height={H - T - B} className="frame" />
        <text x={L + 8} y={T + 18} className="q-label hot">優先改善</text>
        <text x={L + 8} y={T + 32} className="q-sub">効くのに負けている</text>
        <text x={W - R - 8} y={T + 18} className="q-label keep" textAnchor="end">強みを維持</text>
        <text x={W - R - 8} y={T + 32} className="q-sub" textAnchor="end">効いていて勝っている</text>
        <text x={L + 8} y={H - B - 22} className="q-label">後回しで可</text>
        <text x={L + 8} y={H - B - 8} className="q-sub">効かず、負けている</text>
        <text x={W - R - 8} y={H - B - 22} className="q-label" textAnchor="end">力の入れ過ぎ？</text>
        <text x={W - R - 8} y={H - B - 8} className="q-sub" textAnchor="end">効かないのに勝っている</text>
        <text x={W - R + 2} y={sy(midY) - 4} className="tick" textAnchor="end">平均 {f2(midY)}</text>
        {[n, 1].map((v) => (
          <text key={v} x={sx(v)} y={H - B + 16} className="tick" textAnchor={v === 1 ? 'end' : 'start'}>{v === 1 ? '1位（強い）' : `${v}位（弱い）`}</text>
        ))}
        <text x={sx(midX)} y={H - B + 16} className="tick" textAnchor="middle">{midX.toFixed(1)}位</text>
        <text x={(L + W - R) / 2} y={H - 12} className="axis" textAnchor="middle">横：自社のその項目の平均順位（右ほど他社より上）</text>
        <text x={18} y={(T + H - B) / 2} className="axis" textAnchor="middle" transform={`rotate(-90 18 ${(T + H - B) / 2})`}>縦：総合順位への影響 ρ（上ほど大きい）</text>
        {pts.map((p) => (
          <g key={p.c.key} transform={`translate(${sx(p.x)},${sy(p.y)})`}>
            <title>{`${p.c.label}：総合への影響 ρ=${f2(p.y)}／自社の平均順位 ${f1(p.x)}位`}</title>
            <circle r={7} className={`dot q-${quadOf(p)}`} />
            <text x={11} y={dyOf(p.c.key)} className="dot-label">{p.c.short}</text>
          </g>
        ))}
      </svg>

      <div className="quad-grid">
        {(['fix', 'keep', 'later', 'over'] as Quad[]).map((q) => (
          <div key={q} className={`quad-card q-${q}`}>
            <p className="quad-title">{QUADS[q].title}<span>{QUADS[q].lead}</span></p>
            {byQuad(q).length ? (
              <ul className="quad-items">
                {byQuad(q).sort((x, y) => y.y - x.y).map((p) => (
                  <li key={p.c.key}><b>{p.c.short}</b><span>影響 {f2(p.y)}／自社 {f1(p.x)}位</span></li>
                ))}
              </ul>
            ) : <p className="quad-items none">該当なし</p>}
            <p className="quad-desc">{QUADS[q].desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrossView({ results, filter, year, onOpen }: { results: { event: EventRow; a: EventAnalysis }[]; filter: Filter; year: number; onOpen: (id: string) => void }) {
  const total = results.reduce((s, r) => s + r.a.counts.all, 0)
  const label = (k: CritKey) => CRITERIA.find((c) => c.key === k)!.short
  return (
    <>
      <div className="report-head">
        <h2 className="h1">{year}年 全催事まとめ<small>（{FILTER_LABEL[filter]}）</small></h2>
        <div className="counts-line"><span>回答 延べ <b>{total}</b>件</span><span className="muted">{results.length}催事</span></div>
      </div>

      <section className="card">
        <h3 className="h3">催事ごとの総合1位と自社</h3>
        <table className="table">
          <thead><tr><th>催事</th><th>回答</th><th>総合1位</th><th>自社の総合順位</th><th>重点課題</th></tr></thead>
          <tbody>
            {results.map(({ event, a }) => (
              <tr key={event.id}>
                <td><button className="link strong" onClick={() => onOpen(event.id)}>{eventLabel(event)}</button></td>
                <td>{a.counts.all}<span className="muted small">（東{a.counts.internal}/取{a.counts.external}）</span></td>
                <td>{a.top ? `${a.top.company.label} ${a.top.company.name}` : '—'}</td>
                <td>{a.selfRank ? <>{a.selfRank}位 / {a.nCompanies}社 <Grade avg={a.self!.avg.overall} n={a.nCompanies} /></> : '—'}</td>
                <td>{a.self && a.priorities[0]?.score != null ? <span className="pill pill-accent">{CRITERIA.find((c) => c.key === a.priorities[0].key)!.label}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">催事名を押すと、その催事の詳しい分析に移ります。</p>
      </section>

      <RankByEvent results={results} onOpen={onOpen} />
      <TopByItem results={results} onOpen={onOpen} />

      <div className="grid2 grid-wide">
        <section className="card span-all">
          <h3 className="h3">催事 × 項目：総合への影響度（ρ）</h3>
          <RhoMultiples results={results} />
          <p className="muted small">濃い青＝その催事で最も総合順位を左右した項目（ρが最大）。目盛りは全催事共通（0〜1）なので、催事どうしで「勝ち方」を見比べられます。</p>
          <details className="table-view">
            <summary>数値の表を見る</summary>
          <div className="scroll-x">
              <table className="table heat">
                <thead><tr><th>催事</th>{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
                <tbody>
                  {results.map(({ event, a }) => {
                    const max = Math.max(...CRITERIA.map((c) => a.core.rho[c.key] ?? -2))
                    return (
                      <tr key={event.id}>
                        <td className="nowrap">{eventLabel(event)}</td>
                        {CRITERIA.map((c) => (
                          <td key={c.key} className={`heat-cell ${a.core.rho[c.key] === max ? 'is-max' : ''}`} style={rhoStyle(a.core.rho[c.key])}>{f2(a.core.rho[c.key])}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="card span-all">
          <h3 className="h3">自社の項目別平均順位（催事横断）</h3>
          <div className="scroll-x">
            <table className="table heat">
              <thead><tr><th>催事</th><th>総合</th>{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
              <tbody>
                {results.map(({ event, a }) => (
                  <tr key={event.id}>
                    <td className="nowrap">{eventLabel(event)}</td>
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
            <h4 className="h4">{eventLabel(event)}</h4>
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

type Hist = { event: EventRow; a: EventAnalysis }

/** 年ごとの比較：同じ名前の催事を年ごとに並べる */
function YearCompare({ history, year }: { history: Hist[]; year: number }) {
  const years = [...new Set(history.map((h) => h.event.year))].filter((y) => y <= year).sort((a, b) => a - b)
  const names = history.filter((h) => h.event.year === year).sort((a, b) => a.event.sort - b.event.sort).map((h) => h.event.name)
  const find = (name: string, y: number) => history.find((h) => h.event.year === y && h.event.name === name && h.a.counts.all > 0)
  const prevOf = (name: string) => {
    const ys = years.filter((y) => y < year && find(name, y)).sort((a, b) => b - a)
    return ys.length ? find(name, ys[0])! : null
  }
  if (years.length < 2) {
    return (
      <section className="card">
        <h3 className="h3">年ごとの比較</h3>
        <p className="muted">前の年のデータがそろうと、ここに年ごとの推移と前年比が出ます。</p>
      </section>
    )
  }
  const topRho = (a: EventAnalysis) => {
    const k = CRITERIA.map((c) => c.key).filter((k) => a.core.rho[k] != null).sort((x, y) => a.core.rho[y]! - a.core.rho[x]!)[0]
    return k ? CRITERIA.find((c) => c.key === k)!.short : '—'
  }
  return (
    <>
      <section className="card">
        <h3 className="h3">年ごとの比較：自社の総合順位の推移</h3>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>催事</th>{years.map((y) => <th key={y}>{y}年</th>)}</tr></thead>
            <tbody>
              {names.map((name) => (
                <tr key={name}>
                  <td className="nowrap"><b>{name}</b></td>
                  {years.map((y) => {
                    const h = find(name, y)
                    return (
                      <td key={y} className="nowrap">
                        {h && h.a.selfRank ? (
                          <>
                            {h.a.selfRank}位 / {h.a.nCompanies}社 <Grade avg={h.a.self!.avg.overall} n={h.a.nCompanies} />
                            <span className="muted small">　効いた項目：{topRho(h.a)}</span>
                          </>
                        ) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">「効いた項目」＝その年で総合順位に最も連動した項目（ρが最大）。</p>
      </section>

      <section className="card">
        <h3 className="h3">前年比：自社の項目別平均順位の変化（{year}年）</h3>
        <div className="scroll-x">
          <table className="table heat">
            <thead><tr><th>催事</th><th>比較した年</th><th>総合</th>{CRITERIA.map((c) => <th key={c.key}>{c.short}</th>)}</tr></thead>
            <tbody>
              {names.map((name) => {
                const now = find(name, year)
                const prev = prevOf(name)
                return (
                  <tr key={name}>
                    <td className="nowrap">{name}</td>
                    <td className="nowrap muted">{prev ? `${prev.event.year}→${year}` : '—'}</td>
                    {(['overall', ...CRITERIA.map((c) => c.key)] as RankKey[]).map((k) => {
                      const a = now?.a.self?.avg[k]
                      const b = prev?.a.self?.avg[k]
                      if (a == null || b == null) return <td key={k} className="center muted">—</td>
                      const d = b - a // ＋＝順位が上がった（改善）
                      return (
                        <td key={k} className={`heat-cell delta ${d >= 0.3 ? 'up' : d <= -0.3 ? 'down' : ''}`}>
                          {d >= 0.3 ? '▲' : d <= -0.3 ? '▼' : '→'}{Math.abs(d).toFixed(1)}
                          <small>{f1(b)}→{f1(a)}</small>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">▲＝前年より順位が上がった（改善）、▼＝下がった。数字は平均順位の変化幅。社の顔ぶれが変わった年は参考程度に。</p>
      </section>
    </>
  )
}

/** 催事ごとの小さな横棒グラフ（全パネル共通の0〜1目盛り） */
function RhoMultiples({ results }: { results: { event: EventRow; a: EventAnalysis }[] }) {
  return (
    <div className="multiples">
      {results.map(({ event, a }) => {
        const vals = CRITERIA.map((c) => a.core.rho[c.key])
        const max = Math.max(...vals.map((v) => v ?? -2))
        return (
          <figure key={event.id} className="mini">
            <figcaption>
              <b>{eventLabel(event)}</b>
              <span className="muted small">n={a.counts.all}</span>
            </figcaption>
            {a.counts.all === 0 ? (
              <p className="muted small">回答なし</p>
            ) : (
              <div className="mini-bars">
                {CRITERIA.map((c, i) => {
                  const v = vals[i]
                  const top = v != null && v === max
                  return (
                    <div key={c.key} className="mini-row" title={`${eventLabel(event)}｜${c.label}：ρ=${f2(v)}（1位一致 ${pct(a.core.firstMatch[c.key])}）`}>
                      <span className={`mini-label ${top ? 'is-top' : ''}`}>{c.short}</span>
                      <span className="mini-track">
                        <span className={`mini-fill ${top ? 'is-top' : ''}`} style={{ width: `${Math.max(v ?? 0, 0) * 100}%` }} />
                      </span>
                      <span className={`mini-val ${top ? 'is-top' : ''}`}>{f2(v)}</span>
                    </div>
                  )
                })}
                <div className="mini-axis"><span>0</span><span>0.5</span><span>1</span></div>
              </div>
            )}
          </figure>
        )
      })}
    </div>
  )
}

type Res = { event: EventRow; a: EventAnalysis }

/** 催事ごとの順位：社×催事の表（項目を切り替え可）。社は社名で催事をまたいで対応づける */
function RankByEvent({ results, onOpen }: { results: Res[]; onOpen: (id: string) => void }) {
  const [key, setKey] = useState<RankKey>('overall')
  const withData = results.filter((r) => r.a.counts.all > 0)
  // 催事ごとに、選んだ項目の平均順位で並べた順位
  const ranks = new Map<string, Map<string, { rank: number; avg: number; n: number }>>()
  withData.forEach(({ event, a }) => {
    const m = new Map<string, { rank: number; avg: number; n: number }>()
    a.core.stats
      .filter((s) => s.avg[key] != null)
      .sort((x, y) => x.avg[key]! - y.avg[key]!)
      .forEach((s, i, arr) => m.set(s.company.name, { rank: i + 1, avg: s.avg[key]!, n: arr.length }))
    ranks.set(event.id, m)
  })
  const names = [...new Set(withData.flatMap((r) => r.a.core.stats.map((s) => s.company.name)))]
  const selfNames = new Set(withData.flatMap((r) => r.a.core.stats.filter((s) => s.company.is_self).map((s) => s.company.name)))
  const rows = names
    .map((name) => {
      const rs = withData.map((r) => ranks.get(r.event.id)!.get(name)).filter(Boolean) as { rank: number }[]
      return { name, mean: rs.length ? rs.reduce((t, x) => t + x.rank, 0) / rs.length : 99 }
    })
    .sort((a, b) => a.mean - b.mean)
  const n = Math.max(1, ...withData.map((r) => r.a.nCompanies))
  const keyLabel = (k: RankKey) => (k === 'overall' ? '総合' : CRITERIA.find((c) => c.key === k)!.label)

  return (
    <section className="card">
      <div className="toolbar card-head">
        <h3 className="h3 flat">催事ごとの順位（{keyLabel(key)}）</h3>
        <select className="input select" value={key} onChange={(e) => setKey(e.target.value as RankKey)}>
          {RANK_KEYS.map((k) => <option key={k} value={k}>{keyLabel(k)}</option>)}
        </select>
      </div>
      {withData.length === 0 ? (
        <p className="muted">まだ回答がありません。</p>
      ) : (
        <div className="scroll-x">
          <table className="table rank-matrix">
            <thead>
              <tr>
                <th>通算</th>
                <th>社</th>
                {withData.map(({ event }) => (
                  <th key={event.id}><button className="link" onClick={() => onOpen(event.id)}>{eventLabel(event)}</button></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.name} className={selfNames.has(row.name) ? 'is-self' : ''}>
                  <td className="rank-no">{i + 1}</td>
                  <td className="nowrap">{row.name}{selfNames.has(row.name) && <span className="pill">自社</span>}<span className="muted small">　平均{row.mean.toFixed(1)}位</span></td>
                  {withData.map(({ event }) => {
                    const r = ranks.get(event.id)!.get(row.name)
                    return (
                      <td key={event.id} className="center">
                        {r ? (
                          <span className="rank-badge" style={{ background: rankColor(r.rank - 1, r.n) }} title={`平均${r.avg.toFixed(2)}位`}>{r.rank}位</span>
                        ) : <span className="muted">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">各催事の中で、選んだ項目の平均順位が良い順に1位〜{n}位。「通算」は全催事を通した平均で並べた順位。社名が同じ社を同じ行にまとめています。</p>
    </section>
  )
}

/** 催事ごと・項目ごとの1位の社 */
function TopByItem({ results, onOpen }: { results: Res[]; onOpen: (id: string) => void }) {
  const withData = results.filter((r) => r.a.counts.all > 0)
  if (!withData.length) return null
  return (
    <section className="card">
      <h3 className="h3">催事ごと・項目ごとの1位</h3>
      <div className="scroll-x">
        <table className="table top-items">
          <thead><tr><th>催事</th>{RANK_KEYS.map((k) => <th key={k}>{short(k)}</th>)}</tr></thead>
          <tbody>
            {withData.map(({ event, a }) => (
              <tr key={event.id}>
                <td className="nowrap"><button className="link" onClick={() => onOpen(event.id)}>{eventLabel(event)}</button></td>
                {RANK_KEYS.map((k) => {
                  const best = a.core.stats.filter((s) => s.avg[k] != null).sort((x, y) => x.avg[k]! - y.avg[k]!)[0]
                  return (
                    <td key={k} className={`nowrap ${best?.company.is_self ? 'is-self-cell' : ''}`}>
                      {best ? <><span className="lab">{best.company.label}</span>{best.company.name}</> : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">平均順位がいちばん良かった社。自社が1位の項目は青く塗っています。</p>
    </section>
  )
}
