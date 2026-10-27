import { useEffect, useState } from 'react'
import { api, deviceId } from '../api'
import { fmtDate, periodState, TYPE_LABEL } from '../types'
import type { PublicData, RespondentType } from '../types'

export const TYPE_KEY = 'ck_type'

export function getType(): RespondentType | null {
  try {
    const v = localStorage.getItem(TYPE_KEY)
    return v === 'internal' || v === 'external' ? v : null
  } catch {
    return null
  }
}

export function DemoBanner() {
  if (api.mode !== 'demo') return null
  return <div className="demo-banner">デモモード：データはこの端末のブラウザ内だけに保存されます</div>
}

export function Home() {
  const [data, setData] = useState<PublicData | null>(null)
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [type, setType] = useState<RespondentType | null>(getType())
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getPublic(), api.getAnswered(deviceId())])
      .then(([d, a]) => {
        setData(d)
        setAnswered(new Set(a))
      })
      .catch((e) => setError(e.message))
  }, [])

  const choose = (t: RespondentType) => {
    try { localStorage.setItem(TYPE_KEY, t) } catch { /* ignore */ }
    setType(t)
  }

  if (error) return <Shell><p className="error">読み込みに失敗しました：{error}</p></Shell>
  if (!data) return <Shell><p className="muted center">読み込み中…</p></Shell>

  const state = periodState(data.settings)
  const done = data.events.filter((e) => answered.has(e.id)).length

  return (
    <Shell title={data.settings.title}>
      <p className="period">
        受付期間：{fmtDate(data.settings.start_at)} 〜 {fmtDate(data.settings.end_at)}
        {state !== 'open' && <span className="pill pill-warn">{state === 'before' ? '受付前' : '受付終了'}</span>}
      </p>

      {!type ? (
        <section className="card">
          <h2 className="h2">はじめに</h2>
          <p>あなたの区分を選んでください（回答は匿名です）。</p>
          <div className="type-choice">
            <button className="btn btn-big" onClick={() => choose('internal')}>社内</button>
            <button className="btn btn-big" onClick={() => choose('external')}>社外</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card how">
            <h2 className="h2">回答のしかた</h2>
            <ol>
              <li>実物のカタログを見比べてください</li>
              <li>催事を選び、<b>良いと思う順に社名をタップ</b>します</li>
              <li>総合 → 6項目 → ひとこと の順に進みます（約3分）</li>
            </ol>
            {type === 'external' && <p className="note">ご覧になった催事だけのご回答で構いません。</p>}
          </section>

          <div className="list-head">
            <h2 className="h2">催事を選ぶ</h2>
            <span className="muted">{done}/{data.events.length} 回答済み</span>
          </div>
          <ul className="event-list">
            {data.events.map((e) => {
              const n = data.companies.filter((c) => c.event_id === e.id).length
              const isDone = answered.has(e.id)
              return (
                <li key={e.id}>
                  <a className={`event-item ${isDone ? 'is-done' : ''}`} href={isDone || n < 2 ? undefined : `#/e/${e.id}`}>
                    <span className="event-name">{e.name}</span>
                    <span className="event-meta">{n < 2 ? '準備中' : `${n}社`}</span>
                    <span className="event-status">{isDone ? '✓ 回答済み' : n < 2 ? '' : '回答する →'}</span>
                  </a>
                </li>
              )
            })}
          </ul>

          <p className="muted small center">
            回答者区分：{TYPE_LABEL[type]}
            {answered.size === 0 && (
              <button className="link" onClick={() => setType(null)}>変更</button>
            )}
          </p>
        </>
      )}
    </Shell>
  )
}

export function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <DemoBanner />
      <header className="hero">
        <div className="hero-mark">評</div>
        <div>
          <p className="hero-kicker">CATALOG REVIEW</p>
          <h1 className="hero-title">{title ?? '予約カタログ評価'}</h1>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
