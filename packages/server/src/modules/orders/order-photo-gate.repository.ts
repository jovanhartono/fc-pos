import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";

interface PhotoGateLine {
  rework_opened_at: Date | null;
  reworkOf: { created_at: Date } | null;
}

// ADR-0019: any live photo on the Item starts work on it, but a Rework needs
// one taken after its round went on the rack. An undated round uses its Complaint.
export function hasStartPhoto(
  photos: ReadonlyArray<{ created_at: Date }>,
  line: PhotoGateLine
): boolean {
  if (!line.reworkOf) {
    return photos.length > 0;
  }
  const since = line.rework_opened_at ?? line.reworkOf.created_at;
  return photos.some((photo) => photo.created_at > since);
}

// Takes its executor and touches no module-level `db`, so the status machine
// can import it without opening a database connection.
export async function assertStartPhoto(
  executor: DbExecutor,
  line: { id: number; item_id: number; complaint_id: number | null }
) {
  const [photos, complaint, openingLog] = await Promise.all([
    executor.query.itemImagesTable.findMany({
      where: { item_id: line.item_id, deleted_at: { isNull: true } },
      columns: { created_at: true },
    }),
    line.complaint_id
      ? executor.query.complaintsTable.findFirst({
          where: { id: line.complaint_id },
          columns: { created_at: true },
        })
      : undefined,
    line.complaint_id
      ? executor.query.orderServiceStatusLogsTable.findFirst({
          where: { order_service_id: line.id, from_status: { isNull: true } },
          columns: { created_at: true },
        })
      : undefined,
  ]);
  const gateLine = {
    rework_opened_at: openingLog?.created_at ?? null,
    reworkOf: complaint ?? null,
  };
  if (!hasStartPhoto(photos, gateLine)) {
    throw new BadRequestException(
      complaint
        ? "Take a new photo of the item before starting this rework"
        : "Add an item photo before starting work"
    );
  }
}
