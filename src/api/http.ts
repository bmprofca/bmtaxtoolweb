import { REMOTE_API_BASE, formatApiFetchError } from '../config/api'

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 4

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof TypeError)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed')
  )
}

function retryDelayMs(attempt: number) {
  return attempt * 600
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
  const urls: string[] = []

  if (url.startsWith('/api')) {
    urls.push(url)
    const remoteUrl = `${REMOTE_API_BASE}${url.slice(4)}`
    if (!urls.includes(remoteUrl)) {
      urls.push(remoteUrl)
    }
    return urls
  }

  if (url.startsWith(REMOTE_API_BASE)) {
    urls.push(url)
    const localUrl = `/api${url.slice(REMOTE_API_BASE.length)}`
    if (!urls.includes(localUrl)) {
      urls.push(localUrl)
    }
    return urls
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

export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const requestUrls = resolveRequestUrls(url)
  let lastError: unknown

  for (const requestUrl of requestUrls) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(requestUrl, {
          ...options,
          headers: buildAuthHeaders(options),
          cache: 'no-store',
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
