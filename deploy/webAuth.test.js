import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import middleware from '../middleware.js'

const ORIGIN = 'https://playground.example'

function request(path, options) {
  return middleware(new Request(ORIGIN + path, options))
}

function login(next = '/', password = 'test-password', origin = ORIGIN) {
  return request('/login?' + new URLSearchParams({ next }), {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams({ username: 'tester', password }),
  })
}

describe('Vercel 网页登录', () => {
  beforeEach(() => {
    vi.stubEnv('WEB_AUTH_USERNAME', 'tester')
    vi.stubEnv('WEB_AUTH_PASSWORD', 'test-password')
    vi.stubEnv('WEB_AUTH_SESSION_SECRET', '0123456789abcdef0123456789abcdef')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('在登录前拦截应用页面、资源和同源接口', async () => {
    const page = await request('/gallery?settings=test', { headers: { accept: 'text/html' } })
    expect(page.status).toBe(303)
    expect(page.headers.get('location')).toBe('/login?next=%2Fgallery%3Fsettings%3Dtest')
    for (const path of ['/assets/app.js', '/api/web-session', '/api-proxy/tasks/1']) {
      expect((await request(path)).status).toBe(401)
    }
  })

  it('校验账号、签发会话并保留站内回跳参数', async () => {
    const wrong = await login('/', 'wrong')
    expect(wrong.status).toBe(401)
    expect(wrong.headers.has('set-cookie')).toBe(false)
    expect(await wrong.text()).toContain('账号或密码错误')

    const response = await login('/gallery?settings=test#recent')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/gallery?settings=test#recent')
    const cookie = response.headers.get('set-cookie')
    expect(cookie).toContain('Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax')
    const headers = { cookie: cookie.split(';')[0], accept: 'text/html' }
    const session = await request('/api/web-session', { headers })
    expect(session.status).toBe(200)
    expect((await session.json()).expiresInMs).toBeGreaterThan(0)
    expect((await request('/gallery?settings=test', { headers })).headers.get('x-middleware-rewrite')).toBe(ORIGIN + '/index.html')
    const asset = await request('/assets/app.js', { headers })
    expect(asset.headers.get('x-middleware-next')).toBe('1')
    expect(asset.headers.get('cache-control')).toBe('private, no-store')

    const logout = await request('/logout', { method: 'POST', headers: { ...headers, origin: ORIGIN } })
    expect(logout.headers.get('location')).toBe('/login')
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 60 * 60 * 1000)
    expect((await request('/api/web-session', { headers })).status).toBe(401)
  })

  it('拒绝跨站提交、站外回跳和无效签名', async () => {
    expect((await login('/', 'test-password', 'https://external.example')).status).toBe(403)
    expect((await request('/logout', { method: 'POST' })).status).toBe(403)
    for (const target of ['//external.example', '/a/..//external.example', '/login']) {
      expect((await login(target)).headers.get('location')).toBe('/')
    }
    const valid = (await login()).headers.get('set-cookie').split(';')[0]
    const tampered = valid.slice(0, -1) + (valid.endsWith('a') ? 'b' : 'a')
    expect((await request('/api/web-session', { headers: { cookie: tampered } })).status).toBe(401)
    vi.stubEnv('WEB_AUTH_PASSWORD', 'new-password')
    expect((await request('/api/web-session', { headers: { cookie: valid } })).status).toBe(401)
  })

  it('缺少登录配置时关闭应用访问，并允许更新旧离线缓存', async () => {
    vi.stubEnv('WEB_AUTH_SESSION_SECRET', '')
    expect((await request('/')).status).toBe(503)
    const worker = await request('/sw.js')
    expect(worker.status).toBe(200)
    expect(worker.headers.get('cache-control')).toContain('no-store')
    expect(await worker.text()).toContain('self.registration.unregister()')
  })
})
