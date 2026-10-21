import {
	ArrowClockwiseIcon,
	HouseIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error, null, 2);
	} catch {
		return "Unknown error";
	}
};

const ErrorCard = ({ error, reset }: ErrorComponentProps) => {
	const message = getErrorMessage(error);
	return (
		<div className="grid w-full max-w-md justify-items-center gap-3 text-center">
			<WarningCircleIcon className="size-10 text-destructive" />
			<h1 className="font-bold text-title-2">Application error</h1>
			<p className="text-headline">
				Something broke on this screen. Retry, or go home.
			</p>
			{message ? (
				<pre className="max-h-56 w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-2 text-left font-sans text-subhead tabular-nums">
					{message}
				</pre>
			) : null}
			<div className="mt-1 flex flex-wrap justify-center gap-2">
				<Button onClick={reset} icon={<ArrowClockwiseIcon />}>
					Retry
				</Button>
				<Button
					variant="outline"
					nativeButton={false}
					render={<Link to="/" />}
					icon={<HouseIcon />}
				>
					Home
				</Button>
			</div>
		</div>
	);
};

const GlobalErrorPage = (props: ErrorComponentProps) => {
	useEffect(() => {
		document.title = "Application Error | Fresclean POS";
	}, []);

	return (
		<div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
			<ErrorCard {...props} />
		</div>
	);
};

export { ErrorCard, GlobalErrorPage };
