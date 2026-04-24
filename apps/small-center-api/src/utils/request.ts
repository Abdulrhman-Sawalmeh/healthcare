import { AppError } from "../middleware/error";

export function getSingleParam(
  value: string | string[] | undefined,
  label: string
) {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (!normalized) {
    throw new AppError(`${label} is required.`, 400);
  }

  return normalized;
}
