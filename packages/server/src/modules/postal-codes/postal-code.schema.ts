import { z } from "zod";

// No kode pos is 5 digits and no kecamatan name is 64 characters, so anything
// longer is not a cashier typing — and each one costs three ILIKE scans.
export const GETPostalCodesQuerySchema = z.object({
  search: z.string().trim().min(1, "Search is required!").max(64),
});

export type GetPostalCodesQuery = z.infer<typeof GETPostalCodesQuerySchema>;
