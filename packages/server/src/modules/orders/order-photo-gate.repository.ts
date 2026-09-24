import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";

interface PhotoGateLine {
  reworkOf: { created_at: Date } | null;
  statusLogs: ReadonlyArray<{ created_at: Date; from_status: string | null }>;
}

// The photo gate's one rule (ADR-0019): any live photo on the Item unlocks work
// on it. A Rework needs one taken after its own round went on the rack — a
// counter shot or an earlier round's photo says nothing about how the pair came
// back. Rounds from before that rack entry fall back to the Complaint.
export function hasStartPhoto(
  photos: ReadonlyArray<{ created_at: Date }>,
  line: PhotoGateLine
): boolean {
  if (!line.reworkOf) {
    return photos.length > 0;
  }
  const onTheRackAt =
    line.statusLogs.find((log) => log.from_status === null)?.created_at ??
    line.reworkOf.created_at;
  return photos.some((photo) => photo.created_at > onTheRackAt);
}

// Reads the Item's photos and, for a Rework, when its round went on the rack,
// then applies hasStartPhoto. Takes its executor as a parameter and touches no
// module-level `db`, so the status machine can import this without pulling in
// a database connection at load time.
export async function assertStartPhoto(
  executor: DbExecutor,
  line: { id: number; item_id: number; complaint_id: number | null }
) {
  const [photos, complaint, statusLogs] = await Promise.all([
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
      ? executor.query.orderServiceStatusLogsTable.findMany({
          where: { order_service_id: line.id, from_status: { isNull: true } },
          columns: { created_at: true, from_status: true },
        })
      : [],
  ]);
  if (!hasStartPhoto(photos, { reworkOf: complaint ?? null, statusLogs })) {
    throw new BadRequestException(
      complaint
        ? "Add a photo of the returned item before starting the rework"
        : "Add an item photo before starting work"
    );
  }
}
