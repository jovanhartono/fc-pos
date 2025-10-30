import { zodValidator } from "@/utils/zod-validator-wrapper";
import { z } from "zod";

export const idParamSchema = zodValidator(
  "param",
  z.object({
    id: z.coerce.number({ message: "invalid number" }).int().positive(),
  })
);
