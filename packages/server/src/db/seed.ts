import { db } from "@/db";
import { usersTable } from "@/db/schema";

const adminPassword = "rojpyp-2cuzdo-rozmoP";
const passwordHash = await Bun.password.hash(adminPassword);

await db.insert(usersTable).values({
  name: "admin",
  password: passwordHash,
  role: "admin",
  username: "admin",
});
