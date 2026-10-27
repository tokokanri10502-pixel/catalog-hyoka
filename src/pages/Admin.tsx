import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, resetDemo } from '../api'
import { fmtDate, periodState, TYPE_LABEL } from '../types'
import type { AdminData, CompanyInput, EventRow, Settings } from '../types'
import { DemoBanner } from './Home'
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

  const reload = useCallback(async (p = pw) => {
    const d = await api.adminLoad(p)
    setData(d)
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

  const props = { pw, data, reload: () => reload() }
  return (
    <div className="app admin">
      <DemoBanner />
      <header className="admin-head no-print">
        <div className="admin-title">
          <span className="hero-mark sm">評</span>
          <div>
            <p className="hero-kicker">ADMIN</p>
            <h1>{data.settings.title}</h1>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'is-on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="main wide">
        {tab === 'analysis' && <Analysis data={data} onReload={() => reload()} />}
        {tab === 'events' && <EventsTab {...props} />}
        {tab === 'settings' && <SettingsTab {...props} />}
        {tab === 'qr' && <QrTab data={data} />}
        {tab === 'responses' && <ResponsesTab {...props} />}
      </main>
    </div>
  )
}

type P = { pw: string; data: AdminData; reload: () => Promise<AdminData> }

// ---------------- 催事・社 ----------------
function EventsTab({ pw, data, reload }: P) {
  const [msg, setMsg] = useState('')
  const addEvent = async () => {
    const name = prompt('催事名を入力してください')?.trim()
    if (!name) return
    await api.adminSaveEvent(pw, { id: null, name, sort: (Math.max(0, ...data.events.map((e) => e.sort)) || 0) + 1, active: true })
    await reload()
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <h2 className="h2">催事と評価対象の社</h2>
        <button className="btn btn-primary" onClick={addEvent}>＋ 催事を追加</button>
      </div>
      <p className="muted small">催事ごとに社の数・顔ぶれを変えられます。回答画面には「記号＋社名」で表示されます。実物のカタログにも同じ記号のシールを貼ってください。</p>
      {msg && <p className="ok">{msg}</p>}
      {data.events.map((e) => (
        <EventEditor key={e.id} pw={pw} data={data} event={e} reload={reload} onMsg={setMsg} />
      ))}
    </div>
  )
}

function EventEditor({ pw, data, event, reload, onMsg }: P & { event: EventRow; onMsg: (s: string) => void }) {
  const saved = data.companies.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort)
  const nResp = data.responses.filter((r) => r.event_id === event.id).length
  const [name, setName] = useState(event.name)
  const [sort, setSort] = useState(event.sort)
  const [active, setActive] = useState(event.active)
  const [rows, setRows] = useState<CompanyInput[]>(saved.map((c) => ({ id: c.id, label: c.label, name: c.name, is_self: c.is_self, sort: c.sort })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const nextLabel = () => String.fromCharCode(65 + rows.length)
  const set = (i: number, patch: Partial<CompanyInput>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : patch.is_self ? { ...r, is_self: false } : r)))
  const copyFrom = (srcId: string) => {
    const src = data.companies.filter((c) => c.event_id === srcId).sort((a, b) => a.sort - b.sort)
    setRows(src.map((c, i) => ({ id: null, label: c.label, name: c.name, is_self: c.is_self, sort: i })))
  }

  const save = async () => {
    setErr('')
    const cleaned = rows.map((r, i) => ({ ...r, label: r.label.trim(), name: r.name.trim(), sort: i })).filter((r) => r.name)
    if (new Set(cleaned.map((r) => r.label)).size !== cleaned.length) return setErr('記号が重複しています')
    const removed = saved.filter((c) => !cleaned.some((r) => r.id === c.id))
    if (nResp && removed.length && !confirm(`回答が${nResp}件あります。削除した社（${removed.map((c) => c.name).join('、')}）は過去の回答からも集計対象外になります。保存しますか？`)) return
    setBusy(true)
    try {
      await api.adminSaveEvent(pw, { id: event.id, name: name.trim() || event.name, sort, active })
      await api.adminSaveCompanies(pw, event.id, cleaned)
      const d = await reload()
      const fresh = d.companies.filter((c) => c.event_id === event.id).sort((a, b) => a.sort - b.sort)
      setRows(fresh.map((c) => ({ id: c.id, label: c.label, name: c.name, is_self: c.is_self, sort: c.sort })))
      onMsg(`「${name}」を保存しました`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`「${event.name}」を削除します。この催事の回答（${nResp}件）もすべて消えます。よろしいですか？`)) return
    await api.adminDeleteEvent(pw, event.id)
    await reload()
  }

  return (
    <section className="card event-editor">
      <div className="ee-head">
        <input className="input input-title" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="field-inline">表示順 <input className="input input-num" type="number" value={sort} onChange={(e) => setSort(Number(e.target.value))} /></label>
        <label className="field-inline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 受付する</label>
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
        {rows.length === 0 && data.events.length > 1 && (
          <select className="input select" defaultValue="" onChange={(e) => e.target.value && copyFrom(e.target.value)}>
            <option value="">他の催事から社をコピー…</option>
            {data.events.filter((e) => e.id !== event.id && data.companies.some((c) => c.event_id === e.id)).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button className="link danger" onClick={remove}>催事を削除</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
      </div>
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
    { key: 'top', title: data.settings.title, sub: '全催事の回答入口', url: `${base}#/` },
    ...data.events.filter((e) => e.active).map((e) => ({ key: e.id, title: e.name, sub: 'この催事の回答ページ', url: `${base}#/e/${e.id}` })),
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
function ResponsesTab({ pw, data, reload }: P) {
  const [ev, setEv] = useState(data.events[0]?.id ?? '')
  const list = data.responses.filter((r) => r.event_id === ev).slice().reverse()
  const byId = new Map(data.companies.map((c) => [c.id, c]))
  const del = async (id: string) => {
    if (!confirm('この回答を削除しますか？（元に戻せません）')) return
    await api.adminDeleteResponse(pw, id)
    await reload()
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <h2 className="h2">回答データ</h2>
        <button className="btn btn-primary" onClick={() => exportExcel(data)}>Excelに出力</button>
      </div>
      <section className="card">
        <table className="table counts">
          <thead><tr><th>催事</th><th>社内</th><th>社外</th><th>合計</th></tr></thead>
          <tbody>
            {data.events.map((e) => {
              const rs = data.responses.filter((r) => r.event_id === e.id)
              const i = rs.filter((r) => r.respondent_type === 'internal').length
              return <tr key={e.id}><td>{e.name}</td><td>{i}</td><td>{rs.length - i}</td><td><b>{rs.length}</b></td></tr>
            })}
          </tbody>
        </table>
      </section>
      <div className="row">
        <select className="input select" value={ev} onChange={(e) => setEv(e.target.value)}>
          {data.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="muted small">{list.length}件（テスト回答・誤回答はここで削除できます）</span>
      </div>
      <section className="card">
        <table className="table resp">
          <thead><tr><th>日時</th><th>区分</th><th>総合順位</th><th>ひとこと</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
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
