export type BackendSystemKind = "central" | "medium_center" | "small_center";

export interface BackendSystemConfig {
  kind: BackendSystemKind;
  key: string;
  displayName: string;
  workspace: "central" | "center";
  allowCentralRoutes: boolean;
  allowCenterRoutes: boolean;
  allowNetworkRoutes: boolean;
  allowedCenterCode?: string;
  accessDeniedMessage: string;
}

export const systemConfig: BackendSystemConfig = {
  kind: "small_center",
  key: "small-center-system",
  displayName: "نظام المركز الصحي الصغير",
  workspace: "center",
  allowCentralRoutes: false,
  allowCenterRoutes: true,
  allowNetworkRoutes: true,
  allowedCenterCode: "C001",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي الصغير."
};

export function isWorkspaceAllowed(workspace: "central" | "center" | "legacy", centerCode?: string | null) {
  const sameWorkspace = workspace === systemConfig.workspace;
  const isLegacyPortal = workspace === "legacy" && systemConfig.workspace === "center";

  if (!sameWorkspace && !isLegacyPortal) {
    return false;
  }

  if (systemConfig.allowedCenterCode) {
    return centerCode === systemConfig.allowedCenterCode;
  }

  return true;
}
