function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '')
}

const baseApiUrl = import.meta.env.BASE_API_URL || ''

export const API_BASE = baseApiUrl
  ? `${normalizeBaseUrl(baseApiUrl)}/api`
  : '/api'
