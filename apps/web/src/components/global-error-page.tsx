import {
	AlertCircleIcon,
	Home03Icon,
	ReloadIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

// A plain reload keeps the old service worker, so a page broken by its saved
// files stays broken; let a waiting update take over first, as "Update ready" does.
const handleRetry = async () => {
	const registration = await navigator.serviceWorker?.getRegistration();
	if (!registration?.waiting) {
		window.location.reload();
		return;
	}
	navigator.serviceWorker.addEventListener(
		"controllerchange",
		() => window.location.reload(),
		{ once: true },
	);
	registration.waiting.postMessage({ type: "SKIP_WAITING" });
};

const ErrorCard = ({ error }: ErrorComponentProps) => {
	const message = getErrorMessage(error);
	return (
		<div className="grid w-full max-w-md justify-items-center gap-3 text-center">
			<HugeiconsIcon
				icon={AlertCircleIcon}
				className="size-10 text-destructive"
			/>
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
				<Button
					onClick={() => void handleRetry()}
					icon={<HugeiconsIcon icon={ReloadIcon} />}
				>
					Retry
				</Button>
				<Button
					variant="outline"
					nativeButton={false}
					render={<Link to="/" />}
					icon={<HugeiconsIcon icon={Home03Icon} />}
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
