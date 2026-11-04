/*
 * Pins `new Date()` and `Date.now()` to one instant for a story, so pages that
 * read the browser clock render against fixture times. Use as a story or meta
 * beforeEach; Storybook runs the returned function to restore the real clock.
 */
export function freezeTime(iso: string): () => void {
	const RealDate = globalThis.Date;
	const fixed = new RealDate(iso).getTime();

	class FrozenDate extends RealDate {
		constructor(...args: unknown[]) {
			// @ts-expect-error forwards whatever form of the constructor the caller used
			super(...(args.length === 0 ? [fixed] : args));
		}

		static now() {
			return fixed;
		}
	}

	globalThis.Date = FrozenDate as DateConstructor;
	return () => {
		globalThis.Date = RealDate;
	};
}
