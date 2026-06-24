import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

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
    const details =
      error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : error.details !== undefined
          ? { details: error.details }
          : {};

    return res.status(error.statusCode).json({ message: error.message, ...details });
  }

  console.error(`[api] Unhandled error while handling ${req.method} ${req.originalUrl}`, error);
  return res.status(500).json({ message: "حدث خطأ داخلي في الخادم." });
}
