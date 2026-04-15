import {
	ArrowClockwiseIcon,
	HouseIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

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
	return (
		<Card className="w-full max-w-xl">
			<CardHeader className="border-b pb-4">
				<CardTitle className="flex items-center gap-2 text-sm">
					<WarningCircleIcon className="size-4 text-destructive" />
					Application error
				</CardTitle>
				<CardDescription>
					Something broke while rendering this screen. Retry or return to the
					dashboard.
				</CardDescription>
			</CardHeader>

			<CardContent className="grid gap-3">
				<div className="grid gap-1">
					<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						Details
					</div>
					<pre className="max-h-56 overflow-auto border bg-muted/50 px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap break-words">
						{getErrorMessage(error)}
					</pre>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button size="sm" onClick={reset} icon={<ArrowClockwiseIcon />}>
						Retry
					</Button>
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={<Link to="/" />}
						icon={<HouseIcon />}
					>
						Dashboard
					</Button>
				</div>
			</CardContent>
		</Card>
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
