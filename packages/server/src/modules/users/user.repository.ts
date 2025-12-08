import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usersTable } from "@/db/schema";

export function findUserById(userId: number) {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
}
