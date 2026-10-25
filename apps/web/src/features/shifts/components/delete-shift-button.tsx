import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { deleteShift, type Shift, shiftsKeys } from "@/features/shifts/api";
import { clockRange } from "@/features/shifts/lib/shift-times";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { useDialog } from "@/stores/dialog-store";

interface DeleteShiftButtonProps {
	shift: Shift;
}

export const DeleteShiftButton = ({ shift }: DeleteShiftButtonProps) => {
	const openDialog = useDialog((s) => s.openDialog);

	const handleClick = () =>
		openDialog({
			title: "Delete shift?",
			description: `${shift.user?.name ?? `User #${shift.user_id}`} · ${dayjs(shift.clock_in_at).tz(JAKARTA_TZ).format("D MMM")} · ${clockRange(shift)}. Its hours leave payroll for good.`,
			footer: () => <DeleteShiftActions shiftId={shift.id} />,
		});

	return (
		<Button
			variant="outline"
			size="icon-sm"
			aria-label="Delete"
			title="Delete"
			onClick={handleClick}
			icon={<HugeiconsIcon icon={Delete02Icon} className="size-4" />}
		/>
	);
};

interface DeleteShiftActionsProps {
	shiftId: number;
}

const DeleteShiftActions = ({ shiftId }: DeleteShiftActionsProps) => {
	const closeDialog = useDialog((s) => s.closeDialog);
	const queryClient = useQueryClient();
	const deleteMutation = useMutation({
		mutationKey: ["delete-shift"],
		mutationFn: () => deleteShift(shiftId),
		onSettled: (_data, error) => {
			if (!error) {
				closeDialog();
			}
			return queryClient.invalidateQueries({ queryKey: shiftsKeys.all });
		},
	});

	return (
		<>
			<Button
				variant="outline"
				onClick={closeDialog}
				disabled={deleteMutation.isPending}
			>
				Cancel
			</Button>
			<Button
				variant="destructive"
				loading={deleteMutation.isPending}
				onClick={() => deleteMutation.mutate()}
			>
				Delete
			</Button>
		</>
	);
};
