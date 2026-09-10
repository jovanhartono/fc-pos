import { z } from "zod";

export const GETPostalCodesQuerySchema = z.object({
  search: z.string().trim().min(1, "Search is required!"),
});

export type GetPostalCodesQuery = z.infer<typeof GETPostalCodesQuerySchema>;
