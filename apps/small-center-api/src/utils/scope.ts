import { Request } from "express";

import { AppError } from "../middleware/error";

export function resolveCenterScope(req: Request, requestedCenterId?: string) {
  if (!req.auth) {
    throw new AppError("Authentication is required.", 401);
  }

  if (req.auth.role === "ADMIN") {
    return requestedCenterId ?? req.auth.centerId;
  }

  if (requestedCenterId && req.auth.centerId && requestedCenterId !== req.auth.centerId) {
    throw new AppError("You cannot access records for another center.", 403);
  }

  return req.auth.centerId;
}

export function requireProfileId(profileId: string | undefined, message: string) {
  if (!profileId) {
    throw new AppError(message, 400);
  }

  return profileId;
}
