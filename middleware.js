import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { next, rewrite } from '@vercel/functions/middleware'
import { loginPage } from './deploy/loginPage.js'
import { proxyDefaultProvider } from './deploy/defaultProvider.js'

export const config = { runtime: 'nodejs' }

const COOKIE = '__Host-playground_session'
const SESSION_SECONDS = 8 * 60 * 60
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Lax'
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

function hash(value) {
  return createHash('sha256').update(value).digest()
}

function returnAddress(value, origin) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || url.pathname.startsWith('//') || ['/login', '/logout', '/api/web-session', '/sw.js'].includes(url.pathname)) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const path = url.pathname
  const headers = new Headers(PRIVATE_HEADERS)
  const respond = (status, body = null) => new Response(body, { status, headers })
  const redirect = (location) => {
    headers.set('Location', location)
    return respond(303)
  }

  // 已安装的 Worker 需要在登录前收到更新，才能删除旧版离线页面和应用资源。
  if (path === '/sw.js' && ['GET', 'HEAD'].includes(request.method)) {
    headers.set('Content-Type', 'application/javascript; charset=utf-8')
    return respond(200, request.method === 'HEAD' ? null : `
      self.addEventListener('install', () => self.skipWaiting())
      self.addEventListener('activate', (event) => {
        event.waitUntil((async () => {
          const keys = await caches.keys()
          await Promise.all(keys.filter((key) => key.startsWith('gpt-image-playground-')).map((key) => caches.delete(key)))
          await self.clients.claim()
          await self.registration.unregister()
        })())
      })
    `)
  }

  const username = process.env.WEB_AUTH_USERNAME
  const password = process.env.WEB_AUTH_PASSWORD
  const secret = process.env.WEB_AUTH_SESSION_SECRET
  if (!username || !password || !secret || Buffer.byteLength(secret) < 32) {
    return respond(503, '登录暂不可用，请联系部署者')
  }

  const sign = (expiry) => createHmac('sha256', secret)
    .update(JSON.stringify([Number(expiry), username, password]))
    .digest('base64url')
  const session = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-playground_session=(\d{13})\.([\w-]{43})(?=;|$)/)
  const expiry = session && Number(session[1]) > Date.now()
    && timingSafeEqual(Buffer.from(session[2]), Buffer.from(sign(session[1])))
    ? Number(session[1]) : 0

  if (path === '/api/web-session') {
    if (request.method !== 'GET') return respond(405)
    if (!expiry) return respond(401)
    headers.set('Content-Type', 'application/json')
    return respond(200, JSON.stringify({ expiresInMs: Math.max(0, expiry - Date.now()) }))
  }

  if (path === '/logout') {
    if (request.method !== 'POST') return respond(405)
    if (request.headers.get('origin') !== url.origin) return respond(403)
    headers.set('Set-Cookie', `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`)
    return redirect('/login')
  }

  if (path === '/login') {
    const destination = returnAddress(url.searchParams.get('next'), url.origin)
    const render = (status, error = '') => {
      const nonce = randomBytes(16).toString('base64')
      headers.set('Content-Type', 'text/html; charset=utf-8')
      headers.set('Referrer-Policy', 'same-origin')
      headers.set('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`)
      return respond(status, request.method === 'HEAD' ? null : loginPage(nonce, destination, error))
    }

    if (['GET', 'HEAD'].includes(request.method)) return expiry ? redirect(destination) : render(200)
    if (request.method !== 'POST') return respond(405)
    if (request.headers.get('origin') !== url.origin) return respond(403)
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return respond(415)
    if (Number(request.headers.get('content-length')) > 32_768) return respond(413)
    const body = await request.text()
    if (body.length > 32_768) return respond(413)

    const form = new URLSearchParams(body)
    const validUsername = timingSafeEqual(hash(form.get('username') ?? ''), hash(username))
    const validPassword = timingSafeEqual(hash(form.get('password') ?? ''), hash(password))
    if (!validUsername || !validPassword) return render(401, '账号或密码错误')

    const expiresAt = Date.now() + SESSION_SECONDS * 1000
    headers.set('Set-Cookie', `${COOKIE}=${expiresAt}.${sign(expiresAt)}; Max-Age=${SESSION_SECONDS}; ${COOKIE_ATTRIBUTES}`)
    return redirect(destination)
  }

  const documentRequest = ['GET', 'HEAD'].includes(request.method)
    && (path === '/' || request.headers.get('sec-fetch-mode') === 'navigate' || request.headers.get('accept')?.includes('text/html'))
  const appPage = !/^\/(?:api|api-proxy|assets)(?:\/|$)/i.test(path) && !/\.[^/]+$/.test(path)
  if (!expiry) {
    if (documentRequest && (appPage || path === '/index.html')) {
      return redirect(`/login?${new URLSearchParams({ next: path + url.search })}`)
    }
    return respond(401)
  }

  if (path.startsWith('/api/default-provider/')) {
    return proxyDefaultProvider(request, url, headers)
  }

  if (documentRequest && appPage && path !== '/') {
    return rewrite(new URL('/index.html', url), { headers })
  }
  return next({ headers })
}
