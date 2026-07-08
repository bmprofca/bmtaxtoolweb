import { useCallback, useEffect, useState } from 'react'
import { fetchClient } from '../api/client'
import type { Client } from '../types'
import { normalizeClientBusinesses, getNormalizedFinancialYears } from '../utils/businessUtils'

export function useClient(clientId: string | undefined) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (): Promise<Client | null> => {
    if (!clientId) {
      setClient(null)
      setLoading(false)
      return null
    }

    try {
      setError('')
      const data = await fetchClient(clientId)
      const normalized: Client = {
        ...data,
        businesses: normalizeClientBusinesses(data),
        financialYears: getNormalizedFinancialYears({
          ...data,
          businesses: normalizeClientBusinesses(data),
        }),
      }
      setClient(normalized)
      return normalized
    } catch {
      setError('Could not load client details.')
      setClient(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  return { client, loading, error, reload, setClient }
}
