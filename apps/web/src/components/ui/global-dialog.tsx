import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDialog } from "@/stores/dialog-store";

export const GlobalDialog = () => {
  const { open, title, description, content, footer, size, contentClassName } =
    useDialog((state) => state.dialogState);
  const closeDialog = useDialog((state) => state.closeDialog);
  const isConfirm = !content;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent
        showCloseButton={!isConfirm}
        className={cn(
          isConfirm &&
            "max-w-[320px] gap-4 rounded-2xl p-4 text-center sm:max-w-[320px]",
          !isConfirm && size === "wide" && "sm:max-w-xl",
          contentClassName
        )}
      >
        {title || description ? (
          <DialogHeader className={cn(isConfirm && "text-center text-balance")}>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            <DialogDescription
              className={cn({
                "text-subhead": isConfirm,
                "sr-only": !description,
              })}
            >
              {description || title}
            </DialogDescription>
          </DialogHeader>
        ) : null}
        {content ? <div className="min-w-0">{content()}</div> : null}
        {footer ? (
          <DialogFooter
            className={cn(
              isConfirm && "grid grid-cols-2 gap-2 *:w-full pointer-fine:*:h-10"
            )}
          >
            {footer()}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
