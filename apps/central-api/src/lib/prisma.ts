import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __healthcarePrisma: PrismaClient | undefined;
}

export const prisma =
  global.__healthcarePrisma ??
  new PrismaClient({
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__healthcarePrisma = prisma;
}
