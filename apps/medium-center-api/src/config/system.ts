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
  kind: "medium_center",
  key: "medium-center-system",
  displayName: "نظام المركز الصحي المتوسط",
  workspace: "center",
  allowCentralRoutes: false,
  allowCenterRoutes: true,
  allowNetworkRoutes: true,
  allowedCenterCode: "M002",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي المتوسط."
};

export function isWorkspaceAllowed(workspace: "central" | "center", centerCode?: string | null) {
  if (workspace !== systemConfig.workspace) {
    return false;
  }

  if (systemConfig.allowedCenterCode) {
    return centerCode === systemConfig.allowedCenterCode;
  }

  return true;
}
