import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { AppRole, AuthWorkspace } from "../types/auth";

export interface AuthTokenPayload {
  sub: string;
  role: AppRole;
  workspace: AuthWorkspace;
  centerId?: string;
  doctorProfileId?: string;
  patientProfileId?: string;
  username?: string;
}

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "12h"
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
