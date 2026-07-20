import type { z } from "zod";
import { ApiError } from "../lib/errors.js";

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw ApiError.validation(
      result.error.issues.map((i) => ({ field: i.path.join(".") || "(root)", issue: i.message }))
    );
  }
  return result.data;
}
