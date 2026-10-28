import { CRITERIA, RANK_KEYS } from './types'
import type { AdminData, Company, CritKey, EventRow, Ranks, ResponseRow } from './types'

// デモ用の架空データ。社名・コメントはすべて架空。
const NAMES = ['自社', 'スーパーB', 'スーパーC', 'スーパーD', 'スーパーE', 'スーパーF']
const EVENTS = ['節分', '母の日・父の日', '土用の丑', 'ボジョレーヌーボー', 'クリスマス', 'おせち']

// 催事ごとに「総合を左右する項目」の重みを変えておく
const WEIGHTS: Record<string, Record<CritKey, number>> = {
  'おせち': { cover: 0.8, mainpage: 0.6, product: 1.2, sizzle: 1.6, copy: 0.3, tone: 0.6 },
  'クリスマス': { cover: 1.5, mainpage: 0.8, product: 0.8, sizzle: 1.0, copy: 0.4, tone: 1.0 },
  '節分': { cover: 0.7, mainpage: 1.0, product: 1.4, sizzle: 1.2, copy: 0.6, tone: 0.5 },
  '土用の丑': { cover: 0.5, mainpage: 0.6, product: 1.0, sizzle: 1.8, copy: 0.5, tone: 0.3 },
  '母の日・父の日': { cover: 0.9, mainpage: 0.7, product: 0.9, sizzle: 0.5, copy: 1.4, tone: 1.0 },
  'ボジョレーヌーボー': { cover: 1.0, mainpage: 0.9, product: 1.2, sizzle: 0.6, copy: 0.9, tone: 1.1 },
}

const COMMENTS = [
  '表紙の写真が大きくて一目で何のカタログか分かる',
  '商品数が多く、目当ての商品が探しにくい',
  'シズル感のある写真で食べたくなった',
  'コピーが説明的で、もう少し情緒がほしい',
  '価格の見せ方が分かりやすい',
  '表紙と中面のトーンがバラバラに感じた',
  '高級感があり贈答にも使えそう',
  '早期予約特典がもっと目立つと良い',
  '',
  '',
]

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function seedDemo(): AdminData {
  const data = { events: [] as EventRow[], companies: [] as Company[], responses: [] as ResponseRow[] }
  // 前年は自社のシズル感がもっと弱かった、という設定（年ごとの比較で改善が見える）
  seedYear(2025, 7, -1.5, data)
  seedYear(2026, 42, -0.9, data)
  return { settings: { title: '予約カタログ評価（デモ）', current_year: 2026, start_at: null, end_at: null }, ...data }
}

function seedYear(year: number, seed: number, selfSizzle: number, out: { events: EventRow[]; companies: Company[]; responses: ResponseRow[] }) {
  const r = rng(seed)
  const gauss = () => (r() + r() + r() - 1.5) * 1.15
  const events: EventRow[] = EVENTS.map((name, i) => ({ id: `y${year}-ev${i + 1}`, year, name, sort: i + 1, active: true, issued: !(year === 2026 && name === 'おせち') }))
  const { companies, responses } = out
  out.events.push(...events)

  events.forEach((ev) => {
    const cs = NAMES.map((name, i) => ({
      id: `${ev.id}-c${i + 1}`,
      event_id: ev.id,
      label: String.fromCharCode(65 + i),
      name,
      is_self: i === 0,
      sort: i,
    }))
    companies.push(...cs)
    // 社ごとの実力（項目別）
    const base = cs.map(() => gauss())
    const quality = cs.map((_, ci) => Object.fromEntries(CRITERIA.map((c) => [c.key, base[ci] + gauss() * 0.9])) as Record<CritKey, number>)
    // 自社はコピーが強く、シズルが弱い設定
    quality[0].copy += 0.8
    quality[0].sizzle += selfSizzle

    const w = WEIGHTS[ev.name]
    if (!ev.issued) return // 未発行の催事には回答がない
    for (let p = 0; p < 46; p++) {
      const type = p < 28 ? 'internal' : 'external'
      if (type === 'external' && r() < 0.3) continue // 社外は回答しない催事がある
      const scores = cs.map((_, ci) => {
        const s = Object.fromEntries(
          CRITERIA.map((c) => {
            let v = quality[ci][c.key] + gauss() * 0.8
            if (type === 'internal' && ci === 0 && c.key === 'copy') v += 0.7 // 社内は自社コピーを甘めに見る
            if (type === 'external' && ci === 0 && c.key === 'tone') v -= 0.6
            return [c.key, v]
          }),
        ) as Record<CritKey, number>
        const overall = CRITERIA.reduce((sum, c) => sum + s[c.key] * w[c.key], 0) / 5 + gauss() * 0.5
        return { ...s, overall }
      })
      const ranks = Object.fromEntries(
        RANK_KEYS.map((k) => [k, cs.map((c, ci) => ({ id: c.id, v: scores[ci][k] })).sort((a, b) => b.v - a.v).map((x) => x.id)]),
      ) as Ranks
      const d = new Date(Date.UTC(year, 10, 1) + p * 3600_000)
      responses.push({
        id: `${ev.id}-r${p}`,
        event_id: ev.id,
        respondent_type: type,
        ranks,
        comment: COMMENTS[Math.floor(r() * COMMENTS.length)],
        created_at: d.toISOString(),
      })
    }
  })
}
