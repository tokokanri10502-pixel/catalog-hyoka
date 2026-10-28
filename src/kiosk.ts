// 共用タブレット（会場に置いて複数人が順に回答する）モード
const KIOSK_KEY = 'ck_kiosk'
/** 操作がないまま、この時間がたったら次の方向けに自動で初期化する */
export const IDLE_MS = 5 * 60 * 1000

export function isKiosk(): boolean {
  try {
    return localStorage.getItem(KIOSK_KEY) === '1'
  } catch {
    return false
  }
}

/** URLの #/?kiosk=1 / #/?kiosk=0 でモードを切り替える */
export function applyKioskParam() {
  const m = window.location.hash.match(/kiosk=(0|1)/)
  if (!m) return
  try {
    if (m[1] === '1') localStorage.setItem(KIOSK_KEY, '1')
    else localStorage.removeItem(KIOSK_KEY)
  } catch { /* ignore */ }
  clearPerson()
  window.history.replaceState(null, '', '#/')
}

/** 今の回答者の情報（区分・端末ID・下書き）を消す */
function clearPerson() {
  try {
    Object.keys(localStorage)
      .filter((k) => k === 'ck_type' || k === 'ck_device' || k.startsWith('ck_draft_'))
      .forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }
}

/** 次の方へ：回答者を切り替えて最初の画面に戻す */
export function nextPerson() {
  clearPerson()
  window.location.hash = '#/'
  window.location.reload()
}
