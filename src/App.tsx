import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Answer } from './pages/Answer'
import { Admin } from './pages/Admin'
import { applyKioskParam, IDLE_MS, isKiosk, nextPerson } from './kiosk'

applyKioskParam()

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const f = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return hash
}

/** 共用タブレット：しばらく操作がなければ次の方向けに初期化 */
function useKioskIdleReset() {
  useEffect(() => {
    if (!isKiosk()) return
    let last = Date.now()
    const touch = () => { last = Date.now() }
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = window.setInterval(() => {
      const started = (() => { try { return !!localStorage.getItem('ck_type') } catch { return false } })()
      if (started && !window.location.hash.startsWith('#/admin') && Date.now() - last > IDLE_MS) nextPerson()
    }, 20_000)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [])
}

export function App() {
  const hash = useHash()
  useKioskIdleReset()
  if (hash.startsWith('#/admin')) return <Admin />
  const m = hash.match(/^#\/e\/([^/?]+)/)
  if (m) return <Answer key={m[1]} eventId={decodeURIComponent(m[1])} />
  return <Home />
}
