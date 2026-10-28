import { useEffect, useState } from 'react'
import { api, deviceId } from '../api'
import { eventLabel, fmtDate, periodState, TYPE_LONG } from '../types'
import { isKiosk, nextPerson } from '../kiosk'
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
  const issuedCount = data.events.filter((e) => e.issued).length
  const kiosk = isKiosk()

  return (
    <Shell title={data.settings.title}>
      <p className="period">
        受付期間：{fmtDate(data.settings.start_at)} 〜 {fmtDate(data.settings.end_at)}
        {state !== 'open' && <span className="pill pill-warn">{state === 'before' ? '受付前' : '受付終了'}</span>}
      </p>

      {kiosk && (
        <p className="kiosk-bar">
          {type ? 'ご回答が終わったら、いちばん下の「回答を終えて、次の方へ」を押してください。' : 'こちらのタブレットで、どなたでも順番にご回答いただけます。'}
        </p>
      )}

      {!type ? (
        <section className="card">
          <h2 className="h2">はじめに</h2>
          <p>あてはまるほうを選んでください。<br /><span className="muted small">お名前などは伺いません（匿名でのご回答です）。</span></p>
          <div className="type-choice">
            {(['internal', 'external'] as const).map((t) => (
              <button key={t} className="type-btn" onClick={() => choose(t)}>
                <span className="type-title">{TYPE_LONG[t].title}</span>
                <span className="type-sub">{TYPE_LONG[t].sub}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="card how">
            <h2 className="h2">回答のしかた</h2>
            <ol>
              <li>実物のカタログを見比べてください</li>
              <li>催事を選び、<b className="em">良いと思う順に社名をタップ</b>します</li>
              <li>総合 → 6項目 → ひとこと の順に進みます（約3分）</li>
            </ol>
            {type === 'external' && <p className="note">ご覧になった催事だけのご回答で構いません。</p>}
          </section>

          <div className="list-head">
            <h2 className="h2">催事を選ぶ</h2>
            <span className="muted">{done}/{issuedCount} 回答済み</span>
          </div>
          <ul className="event-list">
            {data.events.map((e) => {
              const n = data.companies.filter((c) => c.event_id === e.id).length
              const isDone = answered.has(e.id)
              const open = e.issued && n >= 2 && !isDone
              const cls = isDone ? 'is-done' : !e.issued ? 'is-unissued' : ''
              return (
                <li key={e.id}>
                  <a className={`event-item ${cls}`} href={open ? `#/e/${e.id}` : undefined} aria-disabled={!open}>
                    <span className="event-name">{eventLabel(e)}</span>
                    <span className="event-meta">{!e.issued ? 'カタログ発行後に回答できます' : n < 2 ? '準備中' : `${n}社`}</span>
                    <span className="event-status">{isDone ? '✓ 回答済み' : !e.issued ? '未発行' : n < 2 ? '' : '回答する →'}</span>
                  </a>
                </li>
              )
            })}
          </ul>

          <p className="muted small center">
            回答者：{TYPE_LONG[type].title}
            {answered.size === 0 && (
              <button className="link" onClick={() => setType(null)}>変更</button>
            )}
          </p>

          {kiosk && (
            <button className="btn btn-primary btn-block btn-next" onClick={nextPerson}>
              回答を終えて、次の方へ
            </button>
          )}
        </>
      )}
    </Shell>
  )
}

/** 冊子（見開きのカタログ）のマーク */
export function BookletMark({ small }: { small?: boolean }) {
  return (
    <span className={`hero-mark ${small ? 'sm' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 6.6C10 5.1 7 4.6 3.4 5.1v13.1c3.6-.5 6.6 0 8.6 1.5 2-1.5 5-2 8.6-1.5V5.1C17 4.6 14 5.1 12 6.6z" />
        <path d="M12 6.6v13.1" />
        <path d="M5.9 8.6c1.6-.1 3 .2 4 .7M5.9 11.6c1.6-.1 3 .2 4 .7M5.9 14.6c1.6-.1 3 .2 4 .7" />
        <rect x="14" y="8.3" width="4.1" height="3.6" rx=".4" />
        <path d="M14 14.6c1-.5 2.5-.8 4.1-.7" />
      </svg>
    </span>
  )
}

export function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <DemoBanner />
      <header className="hero">
        <BookletMark />
        <div>
          <p className="hero-kicker">CATALOG REVIEW</p>
          <h1 className="hero-title">{title ?? '予約カタログ評価'}</h1>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  )
}
