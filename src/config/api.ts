function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '')
}

function resolveBaseApiUrl() {
  const envUrl = import.meta.env.BASE_API_URL?.trim()
  if (envUrl) {
    return `${normalizeBaseUrl(envUrl)}/api`
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location

    // Production frontend on Hostinger calls the API subdomain.
    if (hostname === 'tools.bmtaxopc.com' || hostname === 'www.tools.bmtaxopc.com') {
      return 'https://toolserver.bmtaxopc.com/api'
    }
  }

  // Local dev: Vite proxies /api to the Node server.
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
      const apiHint = API_BASE.startsWith('http')
        ? API_BASE.replace(/\/api$/, '')
        : 'http://localhost:3001'
      return `Could not ${action}. Start the API with \`npm run dev\` from the project root and ensure ${apiHint} is reachable.`
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed'
}
