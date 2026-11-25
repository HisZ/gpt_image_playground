const OPERATIONS = new Map([
  ['/api/default-provider/images/generations', 'images/generations'],
  ['/api/default-provider/images/edits', 'images/edits'],
  ['/api/default-provider/responses', 'responses'],
])

export async function proxyDefaultProvider(request, url, headers) {
  const endpoint = OPERATIONS.get(url.pathname)
  if (!endpoint) return new Response(null, { status: 404, headers })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers })
  if (request.headers.get('origin') !== url.origin) return new Response(null, { status: 403, headers })

  const key = process.env.WEB_DEFAULT_API_KEY?.trim()
  if (!key) return new Response('默认 API 暂不可用，请填写自己的 API Key', { status: 503, headers })

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^(application\/json|multipart\/form-data)(?:\s*;|$)/i.test(contentType)) {
    return new Response(null, { status: 415, headers })
  }

  try {
    const response = await fetch(`https://www.cctq.ai/v1/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
      body: request.body,
      duplex: 'half',
      redirect: 'error',
      signal: request.signal,
    })
    const responseType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (!['application/json', 'text/event-stream', 'text/plain'].includes(responseType)) {
      await response.body?.cancel()
      return new Response('默认 API 返回了不受支持的响应格式', { status: 502, headers })
    }
    headers.set('Content-Type', responseType)
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: response.status, headers })
  } catch (err) {
    console.warn('默认 API 转发失败：', err instanceof Error ? err.name : 'UnknownError')
    return new Response('默认 API 连接失败，请稍后重试', { status: 502, headers })
  }
}
