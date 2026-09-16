import { BadRequestException } from "@/http-exceptions";
import {
  findPostalCodeByCode,
  listPostalCodes,
} from "@/modules/postal-codes/postal-code.repository";
import type { GetPostalCodesQuery } from "@/modules/postal-codes/postal-code.schema";

const LIMIT = 20;

export function getPostalCodes(query: GetPostalCodesQuery) {
  return listPostalCodes({ limit: LIMIT, search: query.search });
}

export async function assertPostalCodeExists(code: string) {
  const postalCode = await findPostalCodeByCode(code);
  if (!postalCode) {
    throw new BadRequestException(`Unknown postal code ${code}`);
  }
}
