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
  kind: "central",
  key: "central-system",
  displayName: "النظام المركزي",
  workspace: "central",
  allowCentralRoutes: true,
  allowCenterRoutes: false,
  allowNetworkRoutes: true,
  accessDeniedMessage: "هذا الحساب غير مصرح له في النظام المركزي."
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
