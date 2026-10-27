import { useEffect, useState } from 'react'
import { Home } from './pages/Home'
import { Answer } from './pages/Answer'
import { Admin } from './pages/Admin'

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

export function App() {
  const hash = useHash()
  if (hash.startsWith('#/admin')) return <Admin />
  const m = hash.match(/^#\/e\/([^/?]+)/)
  if (m) return <Answer key={m[1]} eventId={decodeURIComponent(m[1])} />
  return <Home />
}
