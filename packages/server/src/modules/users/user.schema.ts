import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { userRoleEnum, usersTable } from "@/db/schema";

export const POSTUserSchema = createInsertSchema(usersTable);
export const PUTUserSchema = createUpdateSchema(usersTable);

export const PUTUserStoresSchema = z.object({
  store_ids: z.array(z.coerce.number().int().positive()),
});

export const GETUsersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    is_active: z.coerce.boolean().optional(),
    role: z.enum(userRoleEnum.enumValues).optional(),
  })
  .optional();

export type GetUsersQuery = z.infer<typeof GETUsersQuerySchema>;
