import { z } from "zod";

export const GETPostalCodesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  search: z.string().trim().min(1, "Search is required!"),
});

export type GetPostalCodesQuery = z.infer<typeof GETPostalCodesQuerySchema>;
