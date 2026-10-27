import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { seedDemo } from './demo'
import type { AdminData, CompanyInput, PublicData, Ranks, RespondentType, Settings } from './types'
import { periodState } from './types'

export interface Api {
  mode: 'supabase' | 'demo'
  getPublic(): Promise<PublicData>
  getAnswered(deviceId: string): Promise<string[]>
  submit(p: { eventId: string; type: RespondentType; deviceId: string; ranks: Ranks; comment: string }): Promise<void>
  adminLoad(pw: string): Promise<AdminData>
  adminSaveSettings(pw: string, s: Settings): Promise<void>
  adminSaveEvent(pw: string, e: { id: string | null; name: string; sort: number; active: boolean }): Promise<string>
  adminDeleteEvent(pw: string, id: string): Promise<void>
  adminSaveCompanies(pw: string, eventId: string, rows: CompanyInput[]): Promise<void>
  adminDeleteResponse(pw: string, id: string): Promise<void>
  adminChangePassword(pw: string, next: string): Promise<void>
}

function supabaseApi(sb: SupabaseClient): Api {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }
  return {
    mode: 'supabase',
    async getPublic() {
      const [s, e, c] = await Promise.all([
        sb.from('settings').select('*').eq('id', 1).single(),
        sb.from('events').select('*').order('sort').order('created_at'),
        sb.from('companies').select('*').order('sort'),
      ])
      const err = s.error || e.error || c.error
      if (err) throw new Error(err.message)
      const events = e.data ?? []
      const ids = new Set(events.map((x) => x.id))
      return { settings: s.data, events, companies: (c.data ?? []).filter((x) => ids.has(x.event_id)) }
    },
    getAnswered: (deviceId) => rpc<string[]>('get_answered', { p_device: deviceId }).then((d) => d ?? []),
    submit: (p) =>
      rpc('submit_response', { p_event: p.eventId, p_type: p.type, p_device: p.deviceId, p_ranks: p.ranks, p_comment: p.comment }),
    adminLoad: (pw) => rpc<AdminData>('admin_load', { p_pw: pw }),
    adminSaveSettings: (pw, s) =>
      rpc('admin_save_settings', { p_pw: pw, p_title: s.title, p_start: s.start_at, p_end: s.end_at }),
    adminSaveEvent: (pw, e) =>
      rpc<string>('admin_save_event', { p_pw: pw, p_id: e.id, p_name: e.name, p_sort: e.sort, p_active: e.active }),
    adminDeleteEvent: (pw, id) => rpc('admin_delete_event', { p_pw: pw, p_id: id }),
    adminSaveCompanies: (pw, eventId, rows) => rpc('admin_save_companies', { p_pw: pw, p_event: eventId, p_rows: rows }),
    adminDeleteResponse: (pw, id) => rpc('admin_delete_response', { p_pw: pw, p_id: id }),
    adminChangePassword: (pw, next) => rpc('admin_change_password', { p_pw: pw, p_new: next }),
  }
}

// ---- デモモード（Supabase未設定時。データはこのブラウザ内だけに保存） ----
const DEMO_KEY = 'ck_demo_v1'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
type DemoStore = AdminData & { pw: string; device: Record<string, string> }

function demoApi(): Api {
  const load = (): DemoStore => {
    try {
      const raw = localStorage.getItem(DEMO_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* fallthrough */ }
    const s = { ...seedDemo(), pw: 'demo', device: {} }
    save(s)
    return s
  }
  const save = (s: DemoStore) => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }
  const auth = (s: DemoStore, pw: string) => {
    if (pw !== s.pw) throw new Error('パスワードが違います')
  }
  return {
    mode: 'demo',
    async getPublic() {
      const s = load()
      const events = s.events.filter((e) => e.active).sort((a, b) => a.sort - b.sort)
      const ids = new Set(events.map((e) => e.id))
      return { settings: s.settings, events, companies: s.companies.filter((c) => ids.has(c.event_id)) }
    },
    async getAnswered(deviceId) {
      const s = load()
      return Object.entries(s.device).filter(([, d]) => d === deviceId).map(([rid]) => s.responses.find((r) => r.id === rid)?.event_id ?? '')
    },
    async submit(p) {
      const s = load()
      if (periodState(s.settings) !== 'open') throw new Error('受付期間外です')
      const answered = Object.entries(s.device).some(([rid, d]) => d === p.deviceId && s.responses.find((r) => r.id === rid)?.event_id === p.eventId)
      if (answered) throw new Error('この催事は回答済みです')
      const id = uid()
      s.responses.push({ id, event_id: p.eventId, respondent_type: p.type, ranks: p.ranks, comment: p.comment.slice(0, 500), created_at: new Date().toISOString() })
      s.device[id] = p.deviceId
      save(s)
    },
    async adminLoad(pw) {
      const s = load()
      auth(s, pw)
      return { settings: s.settings, events: [...s.events].sort((a, b) => a.sort - b.sort), companies: [...s.companies].sort((a, b) => a.sort - b.sort), responses: s.responses }
    },
    async adminSaveSettings(pw, st) {
      const s = load(); auth(s, pw); s.settings = st; save(s)
    },
    async adminSaveEvent(pw, e) {
      const s = load(); auth(s, pw)
      if (!e.id) {
        const id = uid()
        s.events.push({ id, name: e.name, sort: e.sort, active: e.active })
        save(s)
        return id
      }
      s.events = s.events.map((x) => (x.id === e.id ? { ...x, name: e.name, sort: e.sort, active: e.active } : x))
      save(s)
      return e.id
    },
    async adminDeleteEvent(pw, id) {
      const s = load(); auth(s, pw)
      s.events = s.events.filter((e) => e.id !== id)
      s.companies = s.companies.filter((c) => c.event_id !== id)
      s.responses = s.responses.filter((r) => r.event_id !== id)
      save(s)
    },
    async adminSaveCompanies(pw, eventId, rows) {
      const s = load(); auth(s, pw)
      s.companies = s.companies.filter((c) => c.event_id !== eventId)
      rows.forEach((r) => s.companies.push({ id: r.id ?? uid(), event_id: eventId, label: r.label, name: r.name, is_self: r.is_self, sort: r.sort }))
      save(s)
    },
    async adminDeleteResponse(pw, id) {
      const s = load(); auth(s, pw)
      s.responses = s.responses.filter((r) => r.id !== id)
      save(s)
    },
    async adminChangePassword(pw, next) {
      const s = load(); auth(s, pw)
      if (next.length < 6) throw new Error('パスワードは6文字以上にしてください')
      s.pw = next; save(s)
    },
  }
}

export function resetDemo() {
  localStorage.removeItem(DEMO_KEY)
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const api: Api = url && key ? supabaseApi(createClient(url, key)) : demoApi()

export function deviceId(): string {
  const K = 'ck_device'
  try {
    let id = localStorage.getItem(K)
    if (!id) {
      id = uid()
      localStorage.setItem(K, id)
    }
    return id
  } catch {
    return uid()
  }
}
