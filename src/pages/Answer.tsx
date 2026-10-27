import { useEffect, useState } from 'react'
import { api, deviceId } from '../api'
import { CRITERIA, OVERALL, RANK_KEYS, periodState } from '../types'
import type { Company, PublicData, RankKey, Ranks } from '../types'
import { getType, Shell } from './Home'

type Step = RankKey | 'comment' | 'confirm'
const STEPS: Step[] = [...RANK_KEYS, 'comment', 'confirm']
const META: Record<RankKey, { label: string; hint: string }> = {
  overall: OVERALL,
  ...Object.fromEntries(CRITERIA.map((c) => [c.key, c])),
} as unknown as Record<RankKey, { label: string; hint: string }>

const emptyRanks = (): Ranks => Object.fromEntries(RANK_KEYS.map((k) => [k, []])) as unknown as Ranks

export function Answer({ eventId }: { eventId: string }) {
  const type = getType()
  const draftKey = `ck_draft_${eventId}`
  const [data, setData] = useState<PublicData | null>(null)
  const [already, setAlready] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)
  const [ranks, setRanks] = useState<Ranks>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? 'null')
      if (d?.ranks) return { ...emptyRanks(), ...d.ranks }
    } catch { /* ignore */ }
    return emptyRanks()
  })
  const [comment, setComment] = useState(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null')?.comment ?? '' } catch { return '' }
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!type) {
      window.location.hash = '#/'
      return
    }
    Promise.all([api.getPublic(), api.getAnswered(deviceId())])
      .then(([d, a]) => {
        setData(d)
        setAlready(a.includes(eventId))
      })
      .catch((e) => setError(e.message))
  }, [eventId, type])

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify({ ranks, comment })) } catch { /* ignore */ }
  }, [ranks, comment, draftKey])

  if (error && !data) return <Shell><p className="error">{error}</p></Shell>
  if (!data) return <Shell><p className="muted center">読み込み中…</p></Shell>

  const event = data.events.find((e) => e.id === eventId)
  const companies = data.companies.filter((c) => c.event_id === eventId).sort((a, b) => a.sort - b.sort)
  const back = <a className="btn btn-ghost" href="#/">催事一覧へ戻る</a>

  if (!event || companies.length < 2) return <Shell><p className="card">この催事は現在受付していません。</p>{back}</Shell>
  if (already && !sent) return <Shell title={event.name}><p className="card center">この催事は回答済みです。ありがとうございました。</p>{back}</Shell>
  const ps = periodState(data.settings)
  if (ps !== 'open' && !sent)
    return <Shell title={event.name}><p className="card center">{ps === 'before' ? 'まだ受付開始前です。' : '受付は終了しました。'}</p>{back}</Shell>

  if (sent) {
    return (
      <Shell title={event.name}>
        <section className="card done">
          <div className="done-mark">✓</div>
          <h2 className="h2">送信しました</h2>
          <p>ご回答ありがとうございました。</p>
        </section>
        <a className="btn btn-primary btn-block" href="#/">ほかの催事も回答する</a>
      </Shell>
    )
  }

  const cur = STEPS[step]
  const ids = companies.map((c) => c.id)
  const complete = (k: RankKey) => ranks[k].length === ids.length && ids.every((id) => ranks[k].includes(id))
  const canNext = cur === 'comment' || cur === 'confirm' || complete(cur)
  const byId = new Map(companies.map((c) => [c.id, c]))

  const submit = async () => {
    setSending(true)
    setError('')
    try {
      await api.submit({ eventId, type: type!, deviceId: deviceId(), ranks, comment: comment.trim() })
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setSent(true)
      window.scrollTo(0, 0)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const go = (d: number) => {
    setStep((s) => Math.min(Math.max(s + d, 0), STEPS.length - 1))
    window.scrollTo(0, 0)
  }

  return (
    <Shell title={event.name}>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <p className="step-count">
        {step + 1} / {STEPS.length}
      </p>

      {cur !== 'comment' && cur !== 'confirm' && (
        <section className="card">
          <h2 className="q-title">{META[cur].label}</h2>
          <p className="q-hint">{META[cur].hint}</p>
          <p className="q-how">良いと思う順にタップ（もう一度タップで取り消し）</p>
          <RankPicker companies={companies} order={ranks[cur]} onChange={(o) => setRanks({ ...ranks, [cur]: o })} />
        </section>
      )}

      {cur === 'comment' && (
        <section className="card">
          <h2 className="q-title">ひとこと（任意）</h2>
          <p className="q-hint">参考になった点、気になった点など</p>
          <textarea
            className="textarea"
            rows={5}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="例：B社の表紙は写真が大きく、ひと目で催事が分かる"
          />
        </section>
      )}

      {cur === 'confirm' && (
        <section className="card">
          <h2 className="q-title">回答内容の確認</h2>
          <dl className="confirm">
            {RANK_KEYS.map((k, i) => (
              <div key={k} className="confirm-row">
                <dt>
                  <button className="link" onClick={() => setStep(i)}>{k === 'overall' ? '総合' : CRITERIA.find((c) => c.key === k)!.short}</button>
                </dt>
                <dd>
                  {ranks[k].map((id, j) => (
                    <span key={id} className="chip">
                      <b>{j + 1}</b>
                      {byId.get(id)?.label}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
            {comment.trim() && (
              <div className="confirm-row">
                <dt>ひとこと</dt>
                <dd className="confirm-comment">{comment}</dd>
              </div>
            )}
          </dl>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <div className="nav">
        {step > 0 ? <button className="btn btn-ghost" onClick={() => go(-1)}>戻る</button> : <a className="btn btn-ghost" href="#/">一覧へ</a>}
        {cur === 'confirm' ? (
          <button className="btn btn-primary" disabled={sending} onClick={submit}>{sending ? '送信中…' : '送信する'}</button>
        ) : (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => go(1)}>次へ</button>
        )}
      </div>
    </Shell>
  )
}

function RankPicker({ companies, order, onChange }: { companies: Company[]; order: string[]; onChange: (o: string[]) => void }) {
  const tap = (id: string) => {
    if (order.includes(id)) {
      onChange(order.filter((x) => x !== id))
      return
    }
    const next = [...order, id]
    const rest = companies.filter((c) => !next.includes(c.id))
    // 残り1社は自動で最下位に
    onChange(rest.length === 1 ? [...next, rest[0].id] : next)
  }
  return (
    <>
      <div className="picker">
        {companies.map((c) => {
          const r = order.indexOf(c.id)
          return (
            <button key={c.id} className={`pick ${r >= 0 ? 'is-on' : ''}`} onClick={() => tap(c.id)}>
              <span className="pick-label">{c.label}</span>
              <span className="pick-name">{c.name}</span>
              <span className="pick-rank">{r >= 0 ? `${r + 1}位` : ''}</span>
            </button>
          )
        })}
      </div>
      <div className="order-line">
        {companies.map((_, i) => (
          <span key={i} className={`slot ${order[i] ? 'is-on' : ''}`}>
            <small>{i + 1}位</small>
            {order[i] ? companies.find((c) => c.id === order[i])?.label : '—'}
          </span>
        ))}
        {order.length > 0 && (
          <button className="link small" onClick={() => onChange([])}>やり直す</button>
        )}
      </div>
    </>
  )
}
