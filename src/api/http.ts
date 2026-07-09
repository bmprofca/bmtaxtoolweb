import { REMOTE_API_BASE, formatApiFetchError } from '../config/api'

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 5
const REQUEST_TIMEOUT_MS = 90_000

function isRetryableNetworkError(error: unknown) {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    )
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  return false
}

function retryDelayMs(attempt: number) {
  return attempt * 800
}

function buildAuthHeaders(options?: RequestInit) {
  const headers = new Headers(options?.headers)

  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const token = localStorage.getItem('authToken')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

function resolveRequestUrls(url: string): string[] {
  if (url.startsWith(REMOTE_API_BASE)) {
    const localUrl = `/api${url.slice(REMOTE_API_BASE.length)}`
    return [url, localUrl]
  }

  if (url.startsWith('/api')) {
    const remoteUrl = `${REMOTE_API_BASE}${url.slice(4)}`
    return [remoteUrl, url]
  }

  return [url]
}

async function parseErrorResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    return error.error || 'Request failed'
  }

  if (response.status === 404) {
    return 'API route not found. Restart the server with the latest code and try again.'
  }

  const text = await response.text().catch(() => '')
  return text || `Request failed (${response.status})`
}

function isHtmlResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('text/html')
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new TypeError('failed to fetch')
  }

  return response.json()
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const requestUrls = resolveRequestUrls(url)
  let lastError: unknown

  for (const requestUrl of requestUrls) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWithTimeout(requestUrl, {
          ...options,
          headers: buildAuthHeaders(options),
        })

        if (!response.ok) {
          if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(response.status)) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)))
            continue
          }

          throw new Error(await parseErrorResponse(response))
        }

        if (isHtmlResponse(response)) {
          throw new TypeError('failed to fetch')
        }

        return await readJsonResponse<T>(response)
      } catch (error) {
        lastError = error

        if (error instanceof Error && !isRetryableNetworkError(error)) {
          break
        }

        if (attempt < MAX_ATTEMPTS && isRetryableNetworkError(error)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)))
          continue
        }

        break
      }
    }
  }

  throw new Error(formatApiFetchError(lastError))
}
