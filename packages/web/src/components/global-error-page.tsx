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

function getErrorMessage(error: unknown): string {
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
}

function GlobalErrorPage({ error, reset }: ErrorComponentProps) {
	useEffect(() => {
		document.title = "Application Error | Fresclean POS";
	}, []);

	return (
		<div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-10 text-foreground">
			<div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,transparent_49%,hsl(var(--border)/0.5)_50%,transparent_51%,transparent_100%)] bg-[length:24px_24px] opacity-20" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--destructive)/0.14),transparent_42%),radial-gradient(circle_at_bottom_right,hsl(var(--foreground)/0.08),transparent_30%)]" />

			<div className="relative w-full max-w-3xl">
				<div className="mb-3 inline-flex items-center gap-2 border border-destructive/25 bg-destructive/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-destructive">
					<WarningCircleIcon className="size-3.5" weight="duotone" />
					Global error
				</div>

				<Card className="border-destructive/20 bg-card/95 shadow-[0_0_0_1px_hsl(var(--destructive)/0.12)] backdrop-blur">
					<CardHeader className="gap-2 border-b border-border/70 pb-4">
						<CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">
							Application error
						</CardTitle>
						<CardDescription className="max-w-xl text-sm text-muted-foreground">
							Something unexpected broke while rendering this screen. Retry the
							route or return to the dashboard.
						</CardDescription>
					</CardHeader>

					<CardContent className="space-y-4 pt-4">
						<div className="grid gap-2">
							<div className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
								Details
							</div>
							<pre className="max-h-64 overflow-auto border border-border/70 bg-muted/60 px-4 py-3 text-xs leading-6 whitespace-pre-wrap break-words text-foreground">
								{getErrorMessage(error)}
							</pre>
						</div>

						<div className="flex flex-wrap gap-2">
							<Button onClick={reset}>
								<ArrowClockwiseIcon className="size-4" weight="duotone" />
								Retry
							</Button>

							<Button variant="outline" render={<Link to="/" />}>
								<HouseIcon className="size-4" weight="duotone" />
								Dashboard
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export { GlobalErrorPage };
