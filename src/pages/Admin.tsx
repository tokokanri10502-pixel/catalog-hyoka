import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, resetDemo } from '../api'
import { eventLabel, fmtDate, periodState, TYPE_LABEL } from '../types'
import type { AdminData, CompanyInput, EventRow, Settings } from '../types'
import { BookletMark, DemoBanner } from './Home'
import { Analysis } from './Analysis'
import { exportExcel } from '../excel'

const PW_KEY = 'ck_admin_pw'
type Tab = 'analysis' | 'events' | 'settings' | 'qr' | 'responses'
const TABS: { key: Tab; label: string }[] = [
  { key: 'analysis', label: '分析' },
  { key: 'events', label: '催事・社' },
  { key: 'settings', label: '期間・設定' },
  { key: 'qr', label: 'QRコード' },
  { key: 'responses', label: '回答データ' },
]

export function Admin() {
  const [pw, setPw] = useState(() => sessionStorage.getItem(PW_KEY) ?? '')
  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('analysis')
  const [year, setYear] = useState<number | null>(null)

  const reload = useCallback(async (p = pw) => {
    const d = await api.adminLoad(p)
    setData(d)
    setYear((y) => y ?? d.settings.current_year)
    return d
  }, [pw])

  const login = async (p: string) => {
    setError('')
    try {
      await reload(p)
      sessionStorage.setItem(PW_KEY, p)
      setAuthed(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    if (pw) login(pw)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!authed || !data) {
    return (
      <div className="app admin">
        <DemoBanner />
        <main className="main narrow">
          <form className="card login" onSubmit={(e) => { e.preventDefault(); login(pw) }}>
            <h1 className="h2">管理画面</h1>
            <input className="input" type="password" placeholder="パスワード" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            {api.mode === 'demo' && <p className="muted small">デモのパスワード：demo</p>}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">ログイン</button>
          </form>
        </main>
      </div>
    )
  }

  const viewYear = year ?? data.settings.current_year
  const years = [...new Set([data.settings.current_year, ...data.events.map((e) => e.year)])].sort((a, b) => b - a)
  // 表示中の年の催事だけに絞ったデータ（社・回答は催事にぶら下がっているのでそのまま）
  const yearData: AdminData = { ...data, events: data.events.filter((e) => e.year === viewYear) }
  const props = { pw, data: yearData, all: data, year: viewYear, setYear, reload: () => reload() }
  return (
    <div className="app admin">
      <DemoBanner />
      <header className="admin-head no-print">
        <div className="admin-title">
          <BookletMark small />
          <div>
            <p className="hero-kicker">ADMIN</p>
            <h1>{data.settings.title}</h1>
          </div>
          <label className="year-select">
            <select className="input select" value={viewYear} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}年{y === data.settings.current_year ? '（受付中）' : ''}</option>)}
            </select>
          </label>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'is-on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="main wide">
        {tab === 'analysis' && <Analysis data={yearData} all={data} year={viewYear} onReload={() => reload()} />}
        {tab === 'events' && <EventsTab {...props} />}
        {tab === 'settings' && <SettingsTab {...props} />}
        {tab === 'qr' && <QrTab data={data} />}
        {tab === 'responses' && <ResponsesTab {...props} />}
      </main>
    </div>
  )
}

type P = { pw: string; data: AdminData; all: AdminData; year: number; setYear: (y: number) => void; reload: () => Promise<AdminData> }

// ---------------- 催事・社 ----------------
function EventsTab(props: P) {
  const { pw, data, all, year, setYear, reload } = props
  const [msg, setMsg] = useState('')
  const [ver, setVer] = useState(0)
  const [err, setErr] = useState('')
  const pastYears = [...new Set(all.events.map((e) => e.year))].filter((y) => y !== year).sort((a, b) => b - a)
  const addEvent = async () => {
    const name = prompt('催事名を入力してください')?.trim()
    if (!name) return
    await api.adminSaveEvent(pw, { id: null, year, name, sort: (Math.max(0, ...data.events.map((e) => e.sort)) || 0) + 1, active: true, issued: false })
    await reload()
  }
  const copyYear = async (from: number, to: number) => {
    setErr('')
    try {
      await api.adminCopyYear(pw, from, to)
      await reload()
      setYear(to)
      setMsg(`${from}年の催事と社を${to}年にコピーしました`)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const newYear = async () => {
    const latest = Math.max(year, ...all.events.map((e) => e.year))
    const v = Number(prompt('新しく作る年を入力してください', String(latest + 1)))
    if (!v) return
    if (all.events.some((e) => e.year === v)) return setErr(`${v}年はすでにあります`)
    if (all.events.some((e) => e.year === latest)) await copyYear(latest, v)
    else setYear(v)
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <h2 className="h2">{year}年の催事と評価対象の社</h2>
        <div className="row">
          <button className="btn btn-ghost" onClick={newYear}>＋ 次の年を作る</button>
          <button className="btn btn-primary" onClick={addEvent}>＋ 催事を追加</button>
        </div>
      </div>
      {data.events.length === 0 && (
        <section className="card">
          <p>{year}年の催事はまだありません。</p>
          {pastYears.length > 0 && (
            <div className="row">
              {pastYears.slice(0, 3).map((y) => (
                <button key={y} className="btn btn-primary" onClick={() => copyYear(y, year)}>{y}年の催事と社をコピー</button>
              ))}
            </div>
          )}
        </section>
      )}
      {all.settings.current_year !== year && data.events.length > 0 && (
        <p className="warn small">回答画面に出ているのは{all.settings.current_year}年です。この年を受け付けるには「期間・設定」で受付する年を変えてください。</p>
      )}
      {err && <p className="error">{err}</p>}
      <p className="muted small">「未発行」の催事は回答画面に「未発行」と出て、回答できません。カタログが出たら「カタログ発行済み」に切り替えて保存してください。次の年を作ると、すべて「未発行」で作られます。<br />年ごと・催事ごとに社の数・顔ぶれを変えられます。回答画面には「記号＋社名」で表示されます。実物のカタログにも同じ記号のシールを貼ってください。</p>
      {msg && <p className="ok">{msg}</p>}
      {data.events.map((e) => (
        <EventEditor key={`${e.id}-${ver}`} pw={pw} data={data} event={e} reload={reload} onMsg={setMsg} onShared={() => setVer((v) => v + 1)} />
      ))}
    </div>
  )
}

/** 社の並びを別の催事に当てはめる。同じ記号の社はIDを引き継ぐ（＝その催事の過去の回答とのつながりを保つ） */
function mergeByLabel(src: { label: string; name: string; is_self: boolean }[], existing: { id: string | null; label: string }[]): CompanyInput[] {
  return src.map((c, i) => ({ id: existing.find((e) => e.label === c.label)?.id ?? null, label: c.label, name: c.name, is_self: c.is_self, sort: i }))
}

function EventEditor({ pw, data, event, reload, onMsg, onShared }: Pick<P, 'pw' | 'data' | 'reload'> & { event: EventRow; onMsg: (s: string) => void; onShared: () => void }) {
  const saved = data.companies.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort)
  const nResp = data.responses.filter((r) => r.event_id === event.id).length
  const [name, setName] = useState(event.name)
  const [sort, setSort] = useState(event.sort)
  const [active, setActive] = useState(event.active)
  const [issued, setIssued] = useState(event.issued)
  const [rows, setRows] = useState<CompanyInput[]>(saved.map((c) => ({ id: c.id, label: c.label, name: c.name, is_self: c.is_self, sort: c.sort })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const others = data.events.filter((e) => e.id !== event.id)
  const [sharing, setSharing] = useState(false)
  const [targets, setTargets] = useState<Set<string>>(new Set())

  const nextLabel = () => String.fromCharCode(65 + rows.length)
  const set = (i: number, patch: Partial<CompanyInput>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.is_self ? { ...r, is_self: false } : r)))
  const copyFrom = (srcId: string) => {
    const src = data.companies.filter((c) => c.event_id === srcId).sort((a, b) => a.sort - b.sort)
    setRows(mergeByLabel(src, rows))
  }

  const cleanRows = () => rows.map((r, i) => ({ ...r, label: r.label.trim(), name: r.name.trim(), sort: i })).filter((r) => r.name)

  const save = async (): Promise<boolean> => {
    setErr('')
    const cleaned = cleanRows()
    if (new Set(cleaned.map((r) => r.label)).size !== cleaned.length) { setErr('記号が重複しています'); return false }
    const removed = saved.filter((c) => !cleaned.some((r) => r.id === c.id))
    if (nResp && removed.length && !confirm(`回答が${nResp}件あります。削除した社（${removed.map((c) => c.name).join('、')}）は過去の回答からも集計対象外になります。保存しますか？`)) return false
    setBusy(true)
    try {
      await api.adminSaveEvent(pw, { id: event.id, year: event.year, name: name.trim() || event.name, sort, active, issued })
      await api.adminSaveCompanies(pw, event.id, cleaned)
      const d = await reload()
      const fresh = d.companies.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort)
      setRows(fresh.map((c) => ({ id: c.id, label: c.label, name: c.name, is_self: c.is_self, sort: c.sort })))
      onMsg(`「${name} ${event.year}年」を保存しました`)
      return true
    } catch (e) {
      setErr((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // この催事の社名を、選んだほかの催事にも反映する
  const share = async () => {
    if (!targets.size) return
    const src = cleanRows()
    if (!src.length) return setErr('先に社名を入力してください')
    const tgt = others.filter((e) => targets.has(e.id))
    const withResp = tgt.filter((e) => data.responses.some((r) => r.event_id === e.id))
    if (withResp.length && !confirm(`回答がある催事（${withResp.map((e) => e.name).join('、')}）も含まれています。同じ記号の社は名前が置き換わり、この催事にない記号の社は削除されます。反映しますか？`)) return
    if (!(await save())) return
    setBusy(true)
    try {
      for (const e of tgt) {
        const existing = data.companies.filter((c) => c.event_id === e.id)
        await api.adminSaveCompanies(pw, e.id, mergeByLabel(src, existing))
      }
      await reload()
      onShared()
      onMsg(`「${eventLabel(event)}」の社名を ${tgt.map((e) => e.name).join('、')} に反映しました`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`「${eventLabel(event)}」を削除します。この催事の回答（${nResp}件）もすべて消えます。よろしいですか？`)) return
    await api.adminDeleteEvent(pw, event.id)
    await reload()
  }

  return (
    <section className="card event-editor">
      <div className="ee-head">
        <input className="input input-title" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="ee-year">{event.year}年</span>
        <label className="field-inline">表示順 <input className="input input-num" type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} /></label>
        <label className={`status-toggle ${issued ? 'is-on' : 'is-off'}`}>
          <input type="checkbox" checked={issued} onChange={(e) => setIssued(e.target.checked)} />
          {issued ? 'カタログ発行済み（回答できる）' : '未発行（回答できない）'}
        </label>
        <label className="field-inline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 回答画面に表示</label>
        <span className="muted small">回答 {nResp}件</span>
      </div>
      <table className="table">
        <thead>
          <tr><th>記号</th><th>社名</th><th>自社</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `new${i}`}>
              <td><input className="input input-label" value={r.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
              <td><input className="input" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="社名" /></td>
              <td className="center"><input type="radio" name={`self-${event.id}`} checked={r.is_self} onChange={() => set(i, { is_self: true })} /></td>
              <td className="right"><button className="link danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>削除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ee-actions">
        <button className="btn btn-ghost" onClick={() => setRows([...rows, { id: null, label: nextLabel(), name: '', is_self: rows.length === 0, sort: rows.length }])}>＋ 社を追加</button>
        {others.length > 0 && (
          <button className="btn btn-ghost" onClick={() => { setSharing(!sharing); setTargets(new Set(others.filter((e) => !data.companies.some((c) => c.event_id === e.id) || !data.responses.some((r) => r.event_id === e.id)).map((e) => e.id))) }}>
            この社名をほかの催事にも使う
          </button>
        )}
        {others.length > 0 && (
          <select className="input select" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)}>
            <option value="">ほかの催事の社名を読み込む…</option>
            {data.events.filter((e) => e.id !== event.id && data.companies.some((c) => c.event_id === e.id)).map((e) => (
              <option key={e.id} value={e.id}>{eventLabel(e)}</option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button className="link danger" onClick={remove}>催事を削除</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => { save() }}>{busy ? '保存中…' : '保存'}</button>
      </div>
      {sharing && (
        <div className="share-panel">
          <p><b>この催事（{eventLabel(event)}）の社名を、どの催事にも使いますか？</b></p>
          <div className="share-list">
            {others.map((e) => {
              const n = data.responses.filter((r) => r.event_id === e.id).length
              return (
                <label key={e.id} className="field-inline">
                  <input type="checkbox" checked={targets.has(e.id)} onChange={(ev) => {
                    const t = new Set(targets)
                    if (ev.target.checked) t.add(e.id)
                    else t.delete(e.id)
                    setTargets(t)
                  }} />
                  {eventLabel(e)}{n > 0 && <span className="muted small">（回答{n}件）</span>}
                </label>
              )
            })}
          </div>
          <p className="muted small">記号（A〜F）・社名・自社の印をそのまま写します。記号が同じ社は、その催事の過去の回答とのつながりを保ったまま名前だけ置き換わります。</p>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => setTargets(new Set(others.map((e) => e.id)))}>すべて選ぶ</button>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => setSharing(false)}>やめる</button>
            <button className="btn btn-primary" disabled={busy || !targets.size} onClick={share}>保存して{targets.size}件の催事に反映</button>
          </div>
        </div>
      )}
      {!rows.some((r) => r.is_self) && rows.length > 0 && <p className="warn small">自社が選ばれていません（分析の「自社」欄が出ません）</p>}
      {err && <p className="error">{err}</p>}
    </section>
  )
}

// ---------------- 期間・設定 ----------------
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

function SettingsTab({ pw, data, reload }: P) {
  const [s, setS] = useState<Settings>(data.settings)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [npw, setNpw] = useState('')
  const state = periodState(s)

  const save = async () => {
    setErr(''); setMsg('')
    if (s.start_at && s.end_at && new Date(s.start_at) >= new Date(s.end_at)) return setErr('終了日時は開始日時より後にしてください')
    try {
      await api.adminSaveSettings(pw, s)
      await reload()
      setMsg('保存しました')
    } catch (e) { setErr((e as Error).message) }
  }
  const changePw = async () => {
    setErr(''); setMsg('')
    try {
      await api.adminChangePassword(pw, npw)
      sessionStorage.setItem(PW_KEY, npw)
      setMsg('パスワードを変更しました。再読み込み後は新しいパスワードでログインしてください。')
      setNpw('')
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="stack narrow">
      <section className="card">
        <h2 className="h2">タイトルと受付期間</h2>
        <label className="field">タイトル（回答画面の見出し）
          <input className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
        </label>
        <label className="field">受付する年
          <input className="input input-year" type="number" value={s.current_year} onChange={(e) => setS({ ...s, current_year: Number(e.target.value) })} />
          <span className="muted small">回答画面に出るのは、この年の「受付する」催事だけです。翌年に切り替えるときは、先に「催事・社」で新しい年を作ってください。</span>
        </label>
        <div className="grid2">
          <label className="field">受付開始
            <input className="input" type="datetime-local" value={toLocal(s.start_at)} onChange={(e) => setS({ ...s, start_at: fromLocal(e.target.value) })} />
          </label>
          <label className="field">受付終了
            <input className="input" type="datetime-local" value={toLocal(s.end_at)} onChange={(e) => setS({ ...s, end_at: fromLocal(e.target.value) })} />
          </label>
        </div>
        <p className="muted small">空欄にすると制限なし。現在の状態：
          <b>{state === 'open' ? '受付中' : state === 'before' ? '受付前' : '受付終了'}</b>（{fmtDate(s.start_at)} 〜 {fmtDate(s.end_at)}）
        </p>
        <button className="btn btn-primary" onClick={save}>保存</button>
      </section>
      <section className="card">
        <h2 className="h2">管理パスワードの変更</h2>
        <div className="row">
          <input className="input" type="password" placeholder="新しいパスワード（6文字以上）" value={npw} onChange={(e) => setNpw(e.target.value)} />
          <button className="btn btn-ghost" disabled={npw.length < 6} onClick={changePw}>変更</button>
        </div>
      </section>
      {api.mode === 'demo' && (
        <section className="card">
          <h2 className="h2">デモデータ</h2>
          <button className="btn btn-ghost" onClick={() => { resetDemo(); sessionStorage.removeItem(PW_KEY); window.location.reload() }}>デモデータを初期化</button>
        </section>
      )}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

// ---------------- QRコード ----------------
function QrTab({ data }: { data: AdminData }) {
  const base = `${window.location.origin}${window.location.pathname}`
  const items = [
    { key: 'top', title: `${data.settings.title}`, sub: `${data.settings.current_year}年・全催事の回答入口`, url: `${base}#/` },
    ...data.events.filter((e) => e.active && e.year === data.settings.current_year).map((e) => ({ key: e.id, title: eventLabel(e), sub: 'この催事の回答ページ', url: `${base}#/e/${e.id}` })),
  ]
  const local = /localhost|127\.0\.0\.1/.test(window.location.hostname)
  return (
    <div className="stack">
      <div className="toolbar no-print">
        <h2 className="h2">QRコード</h2>
        <button className="btn btn-primary" onClick={() => window.print()}>印刷する</button>
      </div>
      {local && <p className="warn no-print">いまはローカル（この端末専用）のURLです。公開後のURLで開き直すと、スマホで読めるQRになります。</p>}
      <p className="muted small no-print">基本は「全催事の回答入口」を1枚掲示。各催事のカタログ置き場に、その催事専用のQRを貼ることもできます。</p>
      <div className="qr-grid">
        {items.map((it) => <QrCard key={it.key} title={it.title} sub={it.sub} url={it.url} />)}
      </div>

      <section className="card kiosk-setup no-print">
        <h3 className="h3">会場の共用タブレットで回答してもらう場合</h3>
        <ol>
          <li>タブレットのカメラで右のQRを読む（またはURLを開く）と、そのタブレットが「共用タブレット」になります。</li>
          <li>1人が回答を終えたら「回答を終えて、次の方へ」を押すと、次の人が最初から回答できます。</li>
          <li>押し忘れても、操作がないまま5分たつと自動で最初の画面に戻ります（回答途中の内容は消えます）。</li>
          <li>共用をやめるときは、そのタブレットで下の「共用モードを解除」のURLを開きます。</li>
        </ol>
        <div className="kiosk-qr">
          <QrCard title="共用タブレット用" sub="このタブレットを共用モードにする" url={`${base}#/?kiosk=1`} />
          <p className="small">共用モードを解除：<br /><a className="qr-url" href={`${base}#/?kiosk=0`}>{`${base}#/?kiosk=0`}</a></p>
        </div>
        <p className="muted small">※ 共用タブレットでは、同じ人が同じ催事に2回答えることを機械的には防げません。個人のスマホでの回答は、これまでどおり1台につき1催事1回です。</p>
      </section>
    </div>
  )
}

function QrCard({ title, sub, url }: { title: string; sub: string; url: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#1f2328', light: '#ffffff' } }).then(setSrc)
  }, [url])
  return (
    <figure className="card qr-card">
      {src && <img src={src} alt={`${title}のQRコード`} />}
      <figcaption>
        <b>{title}</b>
        <span className="muted small">{sub}</span>
        <a className="qr-url small" href={url} target="_blank" rel="noreferrer">{url}</a>
      </figcaption>
    </figure>
  )
}

// ---------------- 回答データ ----------------
function ResponsesTab({ pw, data, all, year, reload }: P) {
  const [ev, setEv] = useState(data.events[0]?.id ?? '')
  const list = data.responses.filter((r) => r.event_id === ev).slice().reverse()
  const byId = new Map(data.companies.map((c) => [c.id, c]))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const tests = list.filter((r) => r.comment.startsWith('【テスト】'))
  const del = async (id: string) => {
    if (!confirm('この回答を削除しますか？（元に戻せません）')) return
    await api.adminDeleteResponse(pw, id)
    await reload()
  }
  const toggle = (id: string, on: boolean) => {
    const s = new Set(picked)
    if (on) s.add(id)
    else s.delete(id)
    setPicked(s)
  }
  const delPicked = async () => {
    const ids = list.filter((r) => picked.has(r.id)).map((r) => r.id)
    if (!ids.length || !confirm(`選んだ${ids.length}件の回答を削除しますか？（元に戻せません）`)) return
    setBusy(true)
    try {
      for (const id of ids) await api.adminDeleteResponse(pw, id)
    } finally {
      setPicked(new Set())
      setBusy(false)
      await reload()
    }
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <h2 className="h2">{year}年の回答データ</h2>
        <button className="btn btn-primary" onClick={() => exportExcel(all)}>Excelに出力（全年）</button>
      </div>
      <section className="card">
        <table className="table counts">
          <thead><tr><th>催事</th><th>{TYPE_LABEL.internal}</th><th>{TYPE_LABEL.external}</th><th>合計</th></tr></thead>
          <tbody>
            {data.events.map((e) => {
              const rs = data.responses.filter((r) => r.event_id === e.id)
              const i = rs.filter((r) => r.respondent_type === 'internal').length
              return <tr key={e.id}><td>{eventLabel(e)}</td><td>{i}</td><td>{rs.length - i}</td><td><b>{rs.length}</b></td></tr>
            })}
          </tbody>
        </table>
      </section>
      <div className="row">
        <select className="input select" value={ev} onChange={(e) => { setEv(e.target.value); setPicked(new Set()) }}>
          {data.events.map((e) => <option key={e.id} value={e.id}>{eventLabel(e)}</option>)}
        </select>
        <span className="muted small">{list.length}件（テスト回答・誤回答はここで削除できます）</span>
        <span className="spacer" />
        {tests.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setPicked(new Set(tests.map((r) => r.id)))}>「【テスト】」の回答を選ぶ（{tests.length}件）</button>
        )}
        <button className="btn btn-danger" disabled={busy || !picked.size} onClick={delPicked}>
          {busy ? '削除中…' : `選んだ${picked.size}件を削除`}
        </button>
      </div>
      <section className="card">
        <table className="table resp">
          <thead><tr>
            <th><input type="checkbox" aria-label="すべて選ぶ" checked={list.length > 0 && picked.size === list.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(list.map((r) => r.id)) : new Set())} /></th>
            <th>日時</th><th>区分</th><th>総合順位</th><th>ひとこと</th><th />
          </tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" aria-label="選ぶ" checked={picked.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} /></td>
                <td className="nowrap">{fmtDate(r.created_at)}</td>
                <td>{TYPE_LABEL[r.respondent_type]}</td>
                <td className="nowrap">{r.ranks.overall.map((id) => byId.get(id)?.label ?? '?').join(' > ')}</td>
                <td>{r.comment}</td>
                <td><button className="link danger" onClick={() => del(r.id)}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
