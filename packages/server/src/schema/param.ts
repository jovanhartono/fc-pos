import { z } from "zod";
import { zodValidator } from "@/utils/zod-validator-wrapper";

export const idNumberSchema = z.coerce
  .number({ message: "invalid number" })
  .int()
  .positive();

export const idParamSchema = zodValidator(
  "param",
  z.object({ id: idNumberSchema })
);
