import { lineKey } from "@fresclean/api/rules";
import { zodResolver } from "@hookform/resolvers/zod";
import { Fragment } from "react";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { z } from "zod";

import { DialogFormActions } from "@/components/form/dialog-form-actions";
import { SelectField } from "@/components/form/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { OrderDetail } from "@/features/orders/api";
import {
  useCancelOrderMutation,
  useRefundOrderMutation,
} from "@/features/orders/hooks/useOrderMutations";
import type { OrderLine } from "@/features/orders/lib/order-lines";
import {
  buildRefundCaps,
  previewRefund,
} from "@/features/orders/lib/refund-preview";
import {
  findWorkshopRework,
  reworkChoiceCaption,
  type WorkshopRework,
} from "@/features/orders/lib/refund-rework";
import {
  getOrderServiceItemDetails,
  getShortItemTag,
} from "@/lib/order-service-item-details";
import {
  CANCEL_REASONS,
  formatCancelReason,
  formatRefundReason,
  REFUND_REASONS,
} from "@/lib/status";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import { useDialog } from "@/stores/dialog-store";

// Cancellation is the unpaid twin of Refund (ADR-0008), so both share this
// form; Refund also previews the exact amounts the server will book.

// Several OrderServices share one tag (ADR-0017), so the Service name tells
// lines apart; brand and model lead, as the cashier remembers "the white AF1".
interface ReversalServiceOption {
  id: number;
  is_rework?: boolean;
  item_details: string | null;
  item_tag: string;
  service_name: string;
  // Refund only: the Rework round still in the workshop under this line.
  workshopRework?: WorkshopRework;
}

interface ReversalProductOption {
  id: number;
  name: string;
  qty: number;
}

type OrderProduct = OrderDetail["products"][number];

// The pickers name the Item ("Nike · AF1 · White") and the short tag, so the
// cashier needn't flip back to the order to match codes.
const toServiceOption = (orderCode: string, line: OrderLine) => ({
  id: line.id,
  item_details: getOrderServiceItemDetails(line.item),
  item_tag: getShortItemTag({
    order_code: orderCode,
    item_code: line.item.item_code,
  }),
  service_name: line.service?.name ?? "Service",
});

const toProductOption = (product: OrderProduct): ReversalProductOption => ({
  id: product.id,
  name: product.product?.name ?? `Product #${product.product_id}`,
  qty: product.qty,
});

type ReversalSubmitItem<R extends string> = (
  | { order_service_id: number }
  | { order_product_id: number }
) & {
  reason: R;
  note?: string;
  keep_rework?: boolean;
};

const buildReversalSchema = (verb: string, reasons: readonly string[]) =>
  z
    .object({
      items: z.array(
        z.object({
          id: z.number(),
          kind: z.enum(["service", "product"]),
          selected: z.boolean(),
          reason: z.enum(reasons as [string, ...string[]]),
          note: z.string().optional(),
          keep_rework: z.boolean(),
        })
      ),
    })
    .superRefine((data, ctx) => {
      const selectedCount = data.items.filter((item) => item.selected).length;
      if (selectedCount === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: `Select at least one item to ${verb}.`,
        });
      }
      for (const [index, item] of data.items.entries()) {
        if (
          item.selected &&
          item.reason === "other" &&
          !(item.note ?? "").trim()
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "note"],
            message: "Add a note when the reason is Other",
          });
        }
      }
    });

type ReversalSchema = ReturnType<typeof buildReversalSchema>;

type ReversalFormValues = z.infer<ReversalSchema>;

interface Reversal<R extends string> {
  reasons: readonly R[];
  schema: ReversalSchema;
}

const buildReversal = <R extends string>(
  verb: string,
  reasons: readonly R[]
): Reversal<R> => ({ reasons, schema: buildReversalSchema(verb, reasons) });

const REVERSALS = {
  cancel: buildReversal("cancel", CANCEL_REASONS),
  refund: buildReversal("refund", REFUND_REASONS),
};

const kindLabel = (kind: "service" | "product" | undefined) =>
  kind === "product" ? "Products" : "Services";

interface ReversalCopy {
  confirm: string;
  pending: string;
  // Cancel Order would otherwise stack "Cancel Order" over "Cancel".
  keep?: string;
  // Picking some Lines leaves the Order open, so the button can't say "Order".
  confirmSome?: (count: number) => string;
}

interface OrderLineReversalFormProps<R extends string> {
  copy: ReversalCopy;
  defaultReason: R;
  formatReason: (reason: R) => string;
  products: ReversalProductOption[];
  reversal: Reversal<R>;
  services: ReversalServiceOption[];
  submitItems: (items: ReversalSubmitItem<R>[]) => Promise<unknown>;
  // Refund only: what each line can still refund; turns on the amount preview.
  capsByLineKey?: Map<string, number>;
}

const OrderLineReversalForm = <R extends string>({
  copy,
  defaultReason,
  formatReason,
  products,
  reversal,
  services,
  submitItems,
  capsByLineKey,
}: OrderLineReversalFormProps<R>) => {
  const closeDialog = useDialog((s) => s.closeDialog);
  const lines = [
    ...services.map((service) => ({
      kind: "service" as const,
      id: service.id,
      label: service.item_details ?? service.item_tag,
      sublabel: service.item_details
        ? `${service.item_tag} · ${service.service_name}`
        : service.service_name,
      isRework: service.is_rework === true,
      workshopRework: service.workshopRework,
    })),
    ...products.map((product) => ({
      kind: "product" as const,
      id: product.id,
      isRework: false,
      label: `${product.name} × ${product.qty}`,
      sublabel: undefined,
      workshopRework: undefined,
    })),
  ];
  const hasBothKinds = services.length > 0 && products.length > 0;
  const reasonItems = reversal.reasons.map((reason) => ({
    value: reason as string,
    label: formatReason(reason),
  }));
  const form = useForm<ReversalFormValues>({
    resolver: zodResolver(reversal.schema),
    defaultValues: {
      items: lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        selected: false,
        reason: defaultReason,
        note: "",
        keep_rework: false,
      })),
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: "items" });
  // isSubmitting turns on at the tap, before the request starts, so it is what
  // stops a cashier's double tap from submitting twice.
  const pending = form.formState.isSubmitting;
  const watchedItems = useWatch({ control: form.control, name: "items" }) ?? [];
  const pickedItems = watchedItems.filter((item) => item.selected);
  const selectedCount = pickedItems.length;
  const preview = capsByLineKey
    ? previewRefund(capsByLineKey, watchedItems, pickedItems)
    : undefined;
  const totalRefund = preview?.total ?? 0;
  const itemsError = form.formState.errors.items;
  const itemsRootMessage =
    itemsError && !Array.isArray(itemsError)
      ? (itemsError as { message?: string }).message
      : undefined;

  const handleSelectAll = () => {
    for (const index of fields.keys()) {
      form.setValue(`items.${index}.selected`, true, { shouldDirty: true });
    }
    form.clearErrors("items");
  };

  const handleClear = () => {
    for (const index of fields.keys()) {
      form.setValue(`items.${index}.selected`, false, { shouldDirty: true });
    }
  };

  const onSubmit = async (values: ReversalFormValues) => {
    const items = values.items
      .map((item, index) => ({ item, line: lines[index] }))
      .filter(({ item }) => item.selected)
      .map(({ item, line }) => ({
        ...(item.kind === "service"
          ? { order_service_id: item.id }
          : { order_product_id: item.id }),
        reason: item.reason as R,
        note: item.note?.trim() || undefined,
        ...(line?.workshopRework ? { keep_rework: item.keep_rework } : {}),
      }));

    await submitItems(items);
    closeDialog();
  };

  const submitLabel = () => {
    if (pending) {
      return copy.pending;
    }
    if (capsByLineKey && totalRefund > 0) {
      return `Refund ${formatMoney(String(totalRefund))}`;
    }
    if (copy.confirmSome && selectedCount > 0 && selectedCount < lines.length) {
      return copy.confirmSome(selectedCount);
    }
    return copy.confirm;
  };

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-subhead font-medium text-muted-foreground">
            {hasBothKinds ? kindLabel(lines[0]?.kind) : null}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={pending || fields.length === 0}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={pending || fields.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        {itemsRootMessage ? (
          <p className="text-footnote text-destructive">{itemsRootMessage}</p>
        ) : null}

        <div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1">
          {fields.map((field, index) => {
            const line = lines[index];
            // The first kind's label sits beside Select all above the list.
            const showKindHeader =
              hasBothKinds &&
              index > 0 &&
              lines[index - 1]?.kind !== line?.kind;

            return (
              <Fragment key={field.id}>
                {showKindHeader ? (
                  <p className="text-subhead font-medium text-muted-foreground">
                    {kindLabel(line?.kind)}
                  </p>
                ) : null}
                <ReversalItemRow
                  amount={
                    preview && line
                      ? (preview.byLine.get(lineKey(line.kind, line.id)) ?? 0)
                      : undefined
                  }
                  disabled={pending}
                  index={index}
                  isRework={line?.isRework === true}
                  label={line?.label ?? `Item #${index + 1}`}
                  reasonItems={reasonItems}
                  sublabel={line?.sublabel}
                  workshopRework={line?.workshopRework}
                />
              </Fragment>
            );
          })}
        </div>

        {capsByLineKey ? (
          <div className="flex items-center justify-between border-t pt-3 text-body">
            <span className="text-muted-foreground">Refund total</span>
            <span className="font-medium tabular-nums">
              {formatMoney(String(totalRefund))}
            </span>
          </div>
        ) : null}

        <DialogFormActions
          submit={
            <Button type="submit" variant="destructive" disabled={pending}>
              {submitLabel()}
            </Button>
          }
          onCancel={closeDialog}
          cancelLabel={copy.keep}
          isPending={pending}
        />
      </form>
    </FormProvider>
  );
};

interface ReversalItemRowProps {
  amount: number | undefined;
  disabled: boolean;
  index: number;
  isRework: boolean;
  label: string;
  reasonItems: { value: string; label: string }[];
  sublabel: string | undefined;
  workshopRework: WorkshopRework | undefined;
}

const ReversalItemRow = ({
  amount,
  disabled,
  index,
  isRework,
  label,
  reasonItems,
  sublabel,
  workshopRework,
}: ReversalItemRowProps) => {
  const { control, register } = useFormContext<ReversalFormValues>();
  const selected =
    useWatch({ control, name: `items.${index}.selected` }) ?? false;
  // Only one reversal dialog mounts at a time (single GlobalDialog slot), so
  // a static prefix is safe and keeps ids decoupled from display copy.
  const checkboxId = `reversal-item-${index}`;

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <Controller
        control={control}
        name={`items.${index}.selected`}
        render={({ field }) => (
          <Field className="items-start" orientation="horizontal">
            <Checkbox
              id={checkboxId}
              checked={field.value}
              onCheckedChange={(value) => field.onChange(Boolean(value))}
              disabled={disabled}
            />
            <FieldLabel
              className="grid gap-0.5 font-normal"
              htmlFor={checkboxId}
            >
              <span className="text-body font-medium">{label}</span>
              {sublabel ? (
                <span className="text-subhead text-foreground">{sublabel}</span>
              ) : null}
            </FieldLabel>
            {isRework ? <Badge variant="info">Rework</Badge> : null}
            {amount !== undefined ? (
              <span className="ml-auto text-body tabular-nums">
                {formatMoney(String(amount))}
              </span>
            ) : null}
          </Field>
        )}
      />

      {workshopRework && selected ? (
        <ReworkChoice
          disabled={disabled}
          index={index}
          workshopRework={workshopRework}
        />
      ) : null}

      {selected ? (
        <>
          <Controller
            control={control}
            name={`items.${index}.reason`}
            render={({ field }) => (
              <SelectField
                items={reasonItems}
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
                placeholder="Select reason"
                className="w-full"
              />
            )}
          />

          <Controller
            control={control}
            name={`items.${index}.note`}
            render={({ fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <Textarea
                  placeholder="Reason note"
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  {...register(`items.${index}.note`)}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </>
      ) : null}
    </div>
  );
};

const REWORK_CHOICES = [
  { keep: false, label: "Stop" },
  { keep: true, label: "Keep" },
] as const;

interface ReworkChoiceProps {
  disabled: boolean;
  index: number;
  workshopRework: WorkshopRework;
}

const ReworkChoice = ({
  disabled,
  index,
  workshopRework,
}: ReworkChoiceProps) => {
  const { control } = useFormContext<ReversalFormValues>();

  return (
    <Controller
      control={control}
      name={`items.${index}.keep_rework`}
      render={({ field }) => (
        <div className="grid gap-1">
          <fieldset className="grid grid-cols-2 gap-2 border-0 p-0">
            <legend className="sr-only">
              Rework round {workshopRework.round}
            </legend>
            {REWORK_CHOICES.map((choice) => (
              <Button
                aria-pressed={field.value === choice.keep}
                disabled={disabled}
                key={choice.label}
                onClick={() => field.onChange(choice.keep)}
                size="sm"
                type="button"
                variant={field.value === choice.keep ? "default" : "outline"}
              >
                {choice.label}
              </Button>
            ))}
          </fieldset>
          <p className="text-footnote text-muted-foreground">
            {reworkChoiceCaption(workshopRework, field.value)}
          </p>
        </div>
      )}
    />
  );
};

interface CancelOrderFormProps {
  detail: OrderDetail;
  lines: OrderLine[];
  products: OrderProduct[];
}

export const CancelOrderForm = ({
  detail,
  lines,
  products,
}: CancelOrderFormProps) => {
  const cancelOrderMutation = useCancelOrderMutation(detail.id);

  return (
    <OrderLineReversalForm
      copy={{
        confirm: "Cancel Order",
        pending: "Cancelling…",
        keep: "Keep Order",
        confirmSome: (count) => `Cancel ${pluralize(count, "Line")}`,
      }}
      defaultReason="customer_request"
      formatReason={formatCancelReason}
      products={products.map(toProductOption)}
      reversal={REVERSALS.cancel}
      services={lines.map((line) => ({
        ...toServiceOption(detail.code, line),
        is_rework: Boolean(line.reworkOf),
      }))}
      submitItems={(items) => cancelOrderMutation.mutateAsync({ items })}
    />
  );
};

interface RefundOrderFormProps {
  detail: OrderDetail;
  lines: OrderLine[];
  products: OrderProduct[];
}

export const RefundOrderForm = ({
  detail,
  lines,
  products,
}: RefundOrderFormProps) => {
  const refundMutation = useRefundOrderMutation();

  return (
    <OrderLineReversalForm
      capsByLineKey={buildRefundCaps(detail)}
      copy={{ confirm: "Confirm Refund", pending: "Refunding…" }}
      defaultReason="damaged"
      formatReason={formatRefundReason}
      products={products.map(toProductOption)}
      reversal={REVERSALS.refund}
      services={lines.map((line) => ({
        ...toServiceOption(detail.code, line),
        workshopRework: findWorkshopRework(line),
      }))}
      submitItems={(items) =>
        refundMutation.mutateAsync({ orderId: detail.id, payload: { items } })
      }
    />
  );
};
