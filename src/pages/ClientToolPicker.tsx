import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { APP_NAME } from '../config/app'
import { TOOLS } from '../config/tools'
import { useClient } from '../hooks/useClient'
import {
  CONSOLIDATED_BUSINESS_ID,
  CONSOLIDATED_BUSINESS_LABEL,
  getDefaultFyForConsolidated,
} from '../utils/consolidatedFs'
import { formatFyDisplay, getDefaultFyForBusiness, sortFinancialYears } from '../utils/financialYear'
import { buildClientHubRoute, buildToolWorkspaceRoute } from '../utils/toolRoutes'
import './ClientToolPicker.css'

function ClientToolPicker() {
  const { clientId, businessId } = useParams<{
    clientId: string
    businessId: string
  }>()
  const navigate = useNavigate()
  const { client, loading, error } = useClient(clientId)
  const [selectedFyId, setSelectedFyId] = useState('')

  const isConsolidated = businessId === CONSOLIDATED_BUSINESS_ID
  const business = isConsolidated
    ? { id: CONSOLIDATED_BUSINESS_ID, name: CONSOLIDATED_BUSINESS_LABEL }
    : client?.businesses.find((item) => item.id === businessId)

  const sortedYears = useMemo(
    () => sortFinancialYears(client?.financialYears || []),
    [client?.financialYears],
  )

  const defaultFy = useMemo(() => {
    if (!client) {
      return null
    }

    if (isConsolidated) {
      return getDefaultFyForConsolidated(client.businesses, sortedYears)
    }

    const matchedBusiness = client.businesses.find((item) => item.id === businessId)
    return matchedBusiness ? getDefaultFyForBusiness(matchedBusiness, sortedYears) : null
  }, [businessId, client, isConsolidated, sortedYears])

  useEffect(() => {
    if (!defaultFy) {
      setSelectedFyId('')
      return
    }

    setSelectedFyId((current) => {
      if (current && sortedYears.some((fy) => fy.id === current)) {
        return current
      }
      return defaultFy.id
    })
  }, [defaultFy, sortedYears])

  if (loading) {
    return <p className="empty-state">Loading tools...</p>
  }

  if (!client || !clientId || !businessId) {
    return (
      <div>
        <p className="empty-state">Workspace not found.</p>
        <button type="button" className="back-link" onClick={() => navigate('/clients')}>
          Back to Clients
        </button>
      </div>
    )
  }

  if (!business) {
    return (
      <div>
        <p className="empty-state">Business not found.</p>
        <button type="button" className="back-link" onClick={() => navigate(buildClientHubRoute(clientId))}>
          Back to Client Workspace
        </button>
      </div>
    )
  }

  const currentFy = sortedYears.find((fy) => fy.id === selectedFyId) ?? defaultFy

  return (
    <div className="client-tool-picker">
      <button type="button" className="back-link" onClick={() => navigate(buildClientHubRoute(clientId))}>
        ← Back to {client.name}
      </button>

      <header className="client-tool-picker-header">
        <div>
          <p className="client-tool-picker-eyebrow">{APP_NAME}</p>
          <h1>Choose a tool</h1>
          <p className="client-tool-picker-subtitle">
            <strong>{client.name}</strong> · {business.name}
          </p>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      {sortedYears.length === 0 ? (
        <p className="empty-state">
          No financial years configured. Add them in <Link to="/settings">Settings</Link> before opening
          tools.
        </p>
      ) : (
        <>
          <div className="client-tool-picker-fy-bar">
            <label className="client-tool-picker-fy-field">
              <span>Financial Year</span>
              <select
                value={currentFy?.id || ''}
                onChange={(event) => setSelectedFyId(event.target.value)}
                title="Select financial year"
              >
                {sortedYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.label} ({fy.startYear}–{fy.endYear})
                  </option>
                ))}
              </select>
            </label>
            {currentFy ? (
              <p className="client-tool-picker-fy-note">{formatFyDisplay(currentFy)}</p>
            ) : null}
          </div>

          <section className="client-tool-picker-grid">
            {TOOLS.map((tool) => {
              const workspaceRoute =
                currentFy && clientId
                  ? buildToolWorkspaceRoute(clientId, tool.id, currentFy.id, businessId)
                  : '#'
              const consolidatedBlocked = isConsolidated && !tool.supportsConsolidated
              const disabled = !tool.available || consolidatedBlocked || !currentFy

              return (
                <article
                  key={tool.id}
                  className={`client-tool-card client-tool-card--${tool.accent}${disabled ? ' is-disabled' : ''}`}
                >
                  <div className="client-tool-card-top">
                    <span className="client-tool-card-badge">{tool.shortName}</span>
                    {!tool.available && <span className="client-tool-card-status">Coming soon</span>}
                    {consolidatedBlocked && tool.available && (
                      <span className="client-tool-card-status">Single business only</span>
                    )}
                  </div>
                  <h2>{tool.name}</h2>
                  <p>{tool.description}</p>
                  {disabled ? (
                    <button type="button" className="secondary-btn" disabled>
                      {!currentFy
                        ? 'No active year'
                        : tool.available
                          ? 'Not for consolidated'
                          : 'Coming soon'}
                    </button>
                  ) : (
                    <Link to={workspaceRoute} className="primary-btn client-tool-card-link">
                      Open {tool.shortName}
                    </Link>
                  )}
                </article>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}

export default ClientToolPicker
