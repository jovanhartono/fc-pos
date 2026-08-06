import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useMemo,
	useState,
} from "react";

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
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";

			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(theme);
	}, [theme]);

	const value = useMemo(
		() => ({
			theme,
			setTheme: (nextTheme: Theme) => {
				writeStoredTheme(storageKey, nextTheme);
				setTheme(nextTheme);
			},
		}),
		[theme, storageKey],
	);

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
