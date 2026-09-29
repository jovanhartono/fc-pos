export interface ReworkGroup<T> {
	// Absent when the original is not in the list: on the queue a picked-up
	// original is off the rack, so only its name heads the group.
	original: T | undefined;
	originalId: number;
	reworks: T[];
}

// Each Rework sits under the line it redoes, so staff read "Deep Clean, and
// its re-clean" rather than two unrelated Deep Clean jobs.
export const groupReworksUnderOriginals = <T extends { id: number }>(
	lines: readonly T[],
	originalIdOf: (line: T) => number | null,
): ReworkGroup<T>[] => {
	const originals: T[] = [];
	const reworksByOriginal = new Map<number, T[]>();
	for (const line of lines) {
		const originalId = originalIdOf(line);
		if (originalId === null) {
			originals.push(line);
		} else {
			const reworks = reworksByOriginal.get(originalId) ?? [];
			reworks.push(line);
			reworksByOriginal.set(originalId, reworks);
		}
	}

	const groups: ReworkGroup<T>[] = originals.map((original) => {
		const reworks = reworksByOriginal.get(original.id) ?? [];
		reworksByOriginal.delete(original.id);
		return { original, originalId: original.id, reworks };
	});
	for (const [originalId, reworks] of reworksByOriginal) {
		groups.push({ original: undefined, originalId, reworks });
	}
	return groups;
};
