import { createContext, type ReactNode, use, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

// Reading localStorage throws outright, not returns null, when the browser is
// set to block all cookies. A counter tablet locked down that way still boots —
// it just forgets the theme between reloads.
const readStoredTheme = (storageKey: string): Theme | null => {
	try {
		return localStorage.getItem(storageKey) as Theme | null;
	} catch {
		return null;
	}
};

const writeStoredTheme = (storageKey: string, theme: Theme) => {
	try {
		localStorage.setItem(storageKey, theme);
	} catch {
		// nothing to recover; the in-memory theme still applies
	}
};

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "vite-ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(
		() => readStoredTheme(storageKey) || defaultTheme,
	);

	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const applyTheme = () =>
			document.documentElement.classList.toggle(
				"dark",
				theme === "dark" || (theme === "system" && query.matches),
			);

		applyTheme();
		if (theme !== "system") {
			return;
		}
		// An iPhone on automatic Appearance turns dark at sunset while the app
		// stays open on the counter all day.
		query.addEventListener("change", applyTheme);
		return () => query.removeEventListener("change", applyTheme);
	}, [theme]);

	const value = {
		theme,
		setTheme: (nextTheme: Theme) => {
			writeStoredTheme(storageKey, nextTheme);
			setTheme(nextTheme);
		},
	};

	return (
		<ThemeProviderContext {...props} value={value}>
			{children}
		</ThemeProviderContext>
	);
}

export const useTheme = () => {
	const context = use(ThemeProviderContext);

	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
};
