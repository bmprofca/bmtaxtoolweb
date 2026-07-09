function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '')
}

function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  )
}

function resolveBaseApiUrl() {
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return '/api'
  }

  if (import.meta.env.DEV) {
    return '/api'
  }

  const envUrl = import.meta.env.BASE_API_URL?.trim()
  if (envUrl) {
    return `${normalizeBaseUrl(envUrl)}/api`
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location

    if (
      hostname === 'tool.bmtaxopc.com' ||
      hostname === 'www.tool.bmtaxopc.com' ||
      hostname === 'tools.bmtaxopc.com' ||
      hostname === 'www.tools.bmtaxopc.com'
    ) {
      return 'https://toolserver.bmtaxopc.com/api'
    }
  }

  return '/api'
}

export const API_BASE = resolveBaseApiUrl()

export function formatApiFetchError(error: unknown, action = 'reach the API server') {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase()
    if (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    ) {
      const onLocalHost =
        typeof window !== 'undefined' && isLocalHostname(window.location.hostname)

      if (onLocalHost || import.meta.env.DEV) {
        return `Could not ${action}. Start the API with \`npm run dev\` from the project root and open http://localhost:5173 (local API: http://localhost:3001).`
      }

      const apiHint = API_BASE.startsWith('http')
        ? API_BASE.replace(/\/api$/, '')
        : 'the API server'
      return `Could not ${action}. Check that ${apiHint} is online and that DNS is configured for toolserver.bmtaxopc.com.`
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed'
}
