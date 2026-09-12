import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";

// The photo gate's one rule (ADR-0019). Any live photo on the Item unlocks
// work on it — unless the line is a Rework, in which case the photo has to
// postdate the Complaint: the object came back over the counter, and the first
// visit's photos say nothing about the condition it came back in.
export function hasStartPhoto(
  photos: ReadonlyArray<{ created_at: Date }>,
  reworkOpenedAt: Date | null
): boolean {
  return photos.some(
    (photo) => reworkOpenedAt === null || photo.created_at > reworkOpenedAt
  );
}

// Reads the Item's photos and, for a Rework, the Complaint they must postdate,
// then applies hasStartPhoto. Takes its executor as a parameter and touches no
// module-level `db`, so the status machine can import this without pulling in
// a database connection at load time.
export async function assertStartPhoto(
  executor: DbExecutor,
  line: { item_id: number; complaint_id: number | null }
) {
  const [photos, complaint] = await Promise.all([
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
  ]);
  if (!hasStartPhoto(photos, complaint?.created_at ?? null)) {
    throw new BadRequestException(
      complaint
        ? "Add a photo of the returned item before starting the rework"
        : "Add an item photo before starting work"
    );
  }
}
