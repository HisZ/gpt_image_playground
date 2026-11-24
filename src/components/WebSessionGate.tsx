import { lazy, Suspense, useEffect, useState } from 'react'

const App = lazy(() => import('../App'))

export default function WebSessionGate() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let checking = false

    async function check() {
      if (checking) return
      checking = true
      window.clearTimeout(timer)
      try {
        const response = await fetch('/api/web-session', { cache: 'no-store', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          setStatus('checking')
          const next = window.location.pathname + window.location.search + window.location.hash
          window.location.replace(`/login?${new URLSearchParams({ next })}`)
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const session = await response.json()
        if (controller.signal.aborted) return
        if (!Number.isFinite(session?.expiresInMs) || session.expiresInMs < 0) throw new Error('无效的会话期限')
        setStatus('ready')
        timer = window.setTimeout(check, session.expiresInMs)
      } catch (err) {
        if (controller.signal.aborted) return
        console.warn('检查登录状态失败：', err)
        setStatus('error')
      } finally {
        checking = false
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (status === 'ready') {
    return <Suspense fallback={null}><App /></Suspense>
  }

  return (
    <main className="grid min-h-svh place-content-center gap-3 px-6 text-center text-sm">
      <p role="status">{status === 'error' ? '暂时无法验证登录状态' : '正在验证登录状态'}</p>
      {status === 'error' && (
        <button type="button" className="rounded-lg border border-gray-400 px-4 py-2" onClick={() => window.location.reload()}>
          重试
        </button>
      )}
    </main>
  )
}
