import type { ToolId } from '../config/tools'

export function buildClientHubRoute(clientId: string) {
  return `/clients/${clientId}/business`
}

export function buildBusinessProfileRoute(clientId: string, businessId: string) {
  return `/clients/${clientId}/business/${businessId}/profile`
}

export function buildToolPickerRoute(clientId: string, businessId: string) {
  return `/clients/${clientId}/tools/business/${businessId}`
}

/** @deprecated Old URLs included fyId in the tool picker path */
export function buildLegacyToolPickerRoute(clientId: string, _fyId: string, businessId: string) {
  return buildToolPickerRoute(clientId, businessId)
}

export function buildToolWorkspaceRoute(
  clientId: string,
  toolId: ToolId | string,
  fyId: string,
  businessId: string,
) {
  return `/clients/${clientId}/tools/${toolId}/${fyId}/business/${businessId}`
}

/** @deprecated Use buildToolWorkspaceRoute with toolId `financial-statement` */
export function buildLegacyFsRoute(clientId: string, fyId: string, businessId: string) {
  return `/clients/${clientId}/fs/${fyId}/business/${businessId}`
}
