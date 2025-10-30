import { db } from "@/db";
import { usersTable } from "@/db/schema";
import { eq } from "drizzle-orm";

const adminPassword = "rojpyp-2cuzdo-rozmoP";
const passwordHash = await Bun.password.hash(adminPassword);

await db.update(usersTable).set({
  password: passwordHash
}).where(eq(usersTable.username, 'admin'))

// await db.insert(usersTable).values({
//   name: "superadmin",
//   password: passwordHash,
//   role: "admin",
//   username: "superadmin",
// });
