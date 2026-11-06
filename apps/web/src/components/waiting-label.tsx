interface WaitingLabelProps {
	children: string;
}

// A payment still open: the QRIS at the counter, or a Track checkout.
export const WaitingLabel = ({ children }: WaitingLabelProps) => (
	<span className="flex items-center gap-2">
		<span
			aria-hidden="true"
			className="size-2 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none"
		/>
		{children}
	</span>
);
