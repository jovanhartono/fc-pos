import { zValidator as zv } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import type { ValidationTargets } from "hono/types";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import type { $ZodType } from "zod/v4/core";

export const zodValidator = <
  T extends $ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T
) =>
  zv(target, schema, (result) => {
    if (!result.success) {
      throw new HTTPException(StatusCodes.UNPROCESSABLE_ENTITY, {
        cause: z.flattenError(result.error),
        message: z.prettifyError(result.error),
      });
    }
  });
