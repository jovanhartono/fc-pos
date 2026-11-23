import { cn } from "@/shared/utils";

interface NotifiedLabelProps {
  className?: string;
}

export const NotifiedLabel = ({ className }: NotifiedLabelProps) => (
  <span
    className={cn(
      "text-footnote whitespace-nowrap text-tone-good-foreground",
      className
    )}
  >
    NOTIFIED
  </span>
);
