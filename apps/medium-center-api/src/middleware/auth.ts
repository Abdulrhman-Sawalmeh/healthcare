import { NextFunction, Request, Response } from "express";

import { verifyAuthToken } from "../lib/jwt";
import { systemConfig } from "../config/system";
import { AppRole, AuthWorkspace } from "../types/auth";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ message: "رمز التحقق مطلوب للوصول إلى هذا المورد." });
  }

  const token = authorization.replace("Bearer ", "").trim();

  try {
    req.auth = verifyAuthToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "رمز التحقق غير صالح أو منتهي الصلاحية." });
  }
}

export function authorize(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: "يجب تسجيل الدخول أولًا." });
    }

    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "ليس لديك صلاحية للوصول إلى هذا المورد." });
    }

    return next();
  };
}

export function authorizeWorkspace(...workspaces: AuthWorkspace[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: "يجب تسجيل الدخول أولًا." });
    }

    if (!workspaces.includes(req.auth.workspace)) {
      return res.status(403).json({ message: systemConfig.accessDeniedMessage });
    }

    return next();
  };
}
