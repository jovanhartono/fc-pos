import { db } from "@/db";
import { BadRequestException, NotFoundException } from "@/errors";
import {
  countReworkLinesForOrder,
  findComplaintById,
  findComplaintDetailById,
  findComplaintForService,
  findComplaintSubjectService,
  findComplaints,
  insertComplaint,
  insertReworkLine,
} from "@/modules/complaints/complaint.repository";
import {
  type GetComplaintsQuery,
  normalizeComplaintListQuery,
  type PostComplaintInput,
} from "@/modules/complaints/complaint.schema";
import {
  type DbExecutor,
  recomputeOrderRollup,
} from "@/modules/orders/order-status-machine";
import type { JWTPayload } from "@/types";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { buildPaginationMeta } from "@/utils/pagination";

type SubjectService = NonNullable<
  Awaited<ReturnType<typeof findComplaintSubjectService>>
>;

// A rework is a free OrderService line on the same order (ADR-0013); adding it
// flips the order rollup back to processing.
async function createReworkLine(
  tx: DbExecutor,
  {
    complaintId,
    subject,
    userId,
  }: {
    complaintId: number;
    subject: SubjectService;
    userId: number;
  }
) {
  const order = subject.order;
  if (!order) {
    throw new BadRequestException("Order service is not attached to an order");
  }

  const seq = (await countReworkLinesForOrder(tx, order.id)) + 1;
  const item_code = `${order.code}-RW${String(seq).padStart(3, "0")}`;

  const line = await insertReworkLine(tx, {
    order_id: order.id,
    service_id: subject.service_id,
    brand: subject.brand,
    color: subject.color,
    model: subject.model,
    size: subject.size,
    price: "0",
    cogs_snapshot: "0",
    is_priority: true,
    status: "queued",
    complaint_id: complaintId,
    item_code,
    notes: `Rework for complaint #${complaintId}`,
  });

  await recomputeOrderRollup(tx, order.id, userId);

  return line;
}

async function loadComplaintSubject(user: JWTPayload, complaintId: number) {
  const complaint = await findComplaintById(complaintId);
  if (!complaint) {
    throw new NotFoundException("Complaint not found");
  }

  const subject = await findComplaintSubjectService(complaint.order_service_id);
  if (!subject?.order) {
    throw new NotFoundException("Complaint subject line not found");
  }

  await assertStoreAccess(user, subject.order.store_id);

  // Refund is the terminal rung of the ladder (ADR-0013) — no rework once the
  // original line has left picked_up.
  if (subject.status !== "picked_up") {
    throw new BadRequestException(
      "Cannot add a rework once the original line is no longer picked up"
    );
  }

  return { complaint, subject };
}

export async function openComplaint({
  user,
  body,
}: {
  user: JWTPayload;
  body: PostComplaintInput;
}) {
  const subject = await findComplaintSubjectService(body.order_service_id);
  if (!subject?.order) {
    throw new NotFoundException("Order service not found");
  }

  await assertStoreAccess(user, subject.order.store_id);

  if (subject.status !== "picked_up") {
    throw new BadRequestException(
      "Complaints can only be opened on picked-up items"
    );
  }

  // A rework line is itself an OrderService; complaints attach only to real
  // lines (ADR-0013) so the one-per-line rule and the rate denominator hold.
  if (subject.complaint_id !== null) {
    throw new BadRequestException("Cannot open a complaint on a rework line");
  }

  const existing = await findComplaintForService(subject.id);
  if (existing) {
    throw new BadRequestException("A complaint already exists for this item");
  }

  return db.transaction(async (tx) => {
    const complaint = await insertComplaint(tx, {
      order_service_id: subject.id,
      reason: body.reason,
      opened_by: user.id,
    });

    const rework = body.start_rework
      ? await createReworkLine(tx, {
          complaintId: complaint.id,
          subject,
          userId: user.id,
        })
      : null;

    return { complaint, rework };
  });
}

export async function addRework({
  user,
  complaintId,
}: {
  user: JWTPayload;
  complaintId: number;
}) {
  const { complaint, subject } = await loadComplaintSubject(user, complaintId);

  return db.transaction((tx) =>
    createReworkLine(tx, {
      complaintId: complaint.id,
      subject,
      userId: user.id,
    })
  );
}

export async function getComplaintDetail(user: JWTPayload, id: number) {
  const detail = await findComplaintDetailById(id);
  if (!detail?.orderService?.order) {
    return null;
  }

  await assertStoreAccess(user, detail.orderService.order.store_id);

  return detail;
}

export async function listComplaints(
  user: JWTPayload,
  query?: GetComplaintsQuery
) {
  const normalized = normalizeComplaintListQuery(query);
  let scopedStoreIds: number[] | undefined;

  if (user.role !== "admin") {
    if (normalized.store_id === undefined) {
      scopedStoreIds = await getUserStoreIds(user.id);
    } else {
      await assertStoreAccess(user, normalized.store_id);
    }
  }

  const { items, total } = await findComplaints(normalized, scopedStoreIds);

  return {
    items,
    meta: buildPaginationMeta(total, normalized),
  };
}
