import { AppRole, AuthWorkspace } from "./auth";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        sub: string;
        role: AppRole;
        workspace: AuthWorkspace;
        centerId?: string;
        doctorProfileId?: string;
        patientProfileId?: string;
        username?: string;
      };
    }
  }
}

export {};
