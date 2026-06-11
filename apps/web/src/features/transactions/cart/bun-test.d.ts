// Minimal typings for bun:test. The full @types/bun package redefines global
// fetch and conflicts with the DOM lib this app compiles against.
declare module "bun:test" {
	type TestFn = (name: string, fn: () => void | Promise<void>) => void;

	export const describe: (name: string, fn: () => void) => void;
	export const test: TestFn;
	export const it: TestFn;
	export const expect: (value: unknown) => {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toHaveLength(expected: number): void;
	};
}
