import { sql } from "drizzle-orm";
import { db } from "@/db";

// The cashier reads a kode pos off a shipping label, or hears a place name over
// WhatsApp and has no idea what the number is. Both have to find the row, so a
// code matches by prefix and a place name anywhere in the string.
export function listPostalCodes({
  limit,
  search,
}: {
  limit: number;
  search: string;
}) {
  const contains = `%${search}%`;
  return db.query.postalCodesTable.findMany({
    limit,
    orderBy: { code: "asc" },
    where: {
      OR: [
        { code: { ilike: `${search}%` } },
        { city: { ilike: contains } },
        { districts: { ilike: contains } },
      ],
    },
  });
}

const findPostalCodePrepared = db.query.postalCodesTable
  .findFirst({
    where: { code: { eq: sql.placeholder("code") } },
  })
  .prepare("find_postal_code_by_code");

export function findPostalCodeByCode(code: string) {
  return findPostalCodePrepared.execute({ code });
}
