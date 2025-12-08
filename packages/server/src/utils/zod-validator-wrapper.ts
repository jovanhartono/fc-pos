import { zValidator as zv } from "@hono/zod-validator";
import type { ValidationTargets } from "hono/types";
import { z } from "zod";
import type { $ZodType } from "zod/v4/core";
import { BadRequestException } from "@/errors";

export const zodValidator = <
  T extends $ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T
) =>
  zv(target, schema, (result) => {
    if (!result.success) {
      throw new BadRequestException(z.prettifyError(result.error));
    }
  });
