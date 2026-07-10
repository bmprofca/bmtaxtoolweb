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

const REMOTE_API_BASE = 'https://toolserver.bmtaxopc.com/api'

function resolveBaseApiUrl() {
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return '/api'
  }

  if (import.meta.env.DEV) {
    return '/api'
  }

  // Browser DNS resolves toolserver reliably; Hostinger PHP proxy DNS was failing.
  if (typeof window !== 'undefined' && isProductionHostname(window.location.hostname)) {
    return REMOTE_API_BASE
  }

  const envUrl = import.meta.env.BASE_API_URL?.trim()
  if (envUrl) {
    return `${normalizeBaseUrl(envUrl)}/api`
  }

  return '/api'
}

export { REMOTE_API_BASE }

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
        return `Could not ${action}. From the Balancesheet folder run \`npm run dev\` (starts API + web), then open http://localhost:5173 (API: http://localhost:3001).`
      }

      const apiHint = API_BASE.startsWith('http')
        ? API_BASE.replace(/\/api$/, '')
        : 'https://toolserver.bmtaxopc.com'
      return `Could not ${action}. Check that ${apiHint} is online and try again in a few seconds.`
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed'
}
