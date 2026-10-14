import { zValidator as zv } from "@hono/zod-validator";
import type { ValidationTargets } from "hono/types";
import type { $ZodType } from "zod/v4/core";
import { BadRequestException } from "@/http-exceptions";

export const zodValidator = <
  T extends $ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T
) =>
  zv(target, schema, (result) => {
    if (!result.success) {
      // Staff read this in a toast, so only the sentences, no bullets or field names.
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message).join("; ")
      );
    }
  });
