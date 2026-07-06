import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import {
  DATABASE_UNAVAILABLE_MESSAGE,
  getSafeErrorMessage,
  isDatabaseUnavailableError,
  redactSensitive
} from "../lib/database-diagnostics";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  return res.status(404).json({ message: "المسار المطلوب غير موجود." });
}

function logSafeApiError(req: Request, statusCode: number, error: unknown) {
  const payload: Record<string, unknown> = {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: getSafeErrorMessage(error)
  };

  if (process.env.NODE_ENV === "development" && error instanceof Error && error.stack) {
    payload.stack = redactSensitive(error.stack);
  }

  console.error("[api:error]", payload);
}

function mapPrismaError(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return {
      statusCode: 503,
      message: DATABASE_UNAVAILABLE_MESSAGE
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        statusCode: 409,
        message: "توجد بيانات مسجلة مسبقا بنفس القيمة."
      };
    }

    if (error.code === "P2025") {
      return {
        statusCode: 404,
        message: "السجل المطلوب غير موجود."
      };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: "البيانات المرسلة غير صالحة."
    };
  }

  return null;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "فشل التحقق من صحة البيانات المدخلة.",
      issues: error.flatten()
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logSafeApiError(req, error.statusCode, error);
    }

    const details =
      error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : error.details !== undefined
          ? { details: error.details }
          : {};

    return res.status(error.statusCode).json({ message: error.message, ...details });
  }

  const prismaError = mapPrismaError(error);

  if (prismaError) {
    logSafeApiError(req, prismaError.statusCode, error);
    return res.status(prismaError.statusCode).json({ message: prismaError.message });
  }

  logSafeApiError(req, 500, error);
  return res.status(500).json({ message: "حدث خطأ داخلي في الخادم." });
}
