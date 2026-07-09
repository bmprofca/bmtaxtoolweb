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

const PRODUCTION_HOSTNAMES = new Set([
  'tool.bmtaxopc.com',
  'www.tool.bmtaxopc.com',
  'tools.bmtaxopc.com',
  'www.tools.bmtaxopc.com',
])

function isProductionHostname(hostname: string) {
  return PRODUCTION_HOSTNAMES.has(hostname)
}

function resolveBaseApiUrl() {
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return '/api'
  }

  if (import.meta.env.DEV) {
    return '/api'
  }

  // Same-origin /api is proxied to the Node backend via public/.htaccess on Hostinger.
  // This is more reliable than cross-origin calls to toolserver.bmtaxopc.com.
  if (typeof window !== 'undefined' && isProductionHostname(window.location.hostname)) {
    return '/api'
  }

  const envUrl = import.meta.env.BASE_API_URL?.trim()
  if (envUrl) {
    return `${normalizeBaseUrl(envUrl)}/api`
  }

  return '/api'
}

export const REMOTE_API_BASE = 'https://toolserver.bmtaxopc.com/api'

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

      const apiHint =
        typeof window !== 'undefined' && isProductionHostname(window.location.hostname)
          ? window.location.origin
          : API_BASE.startsWith('http')
            ? API_BASE.replace(/\/api$/, '')
            : 'the API server'
      return `Could not ${action}. Check that ${apiHint} is online and try again in a few seconds.`
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed'
}
