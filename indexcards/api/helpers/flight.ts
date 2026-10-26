/** When a flight starts: the round's start plus flightOffset minutes for each flight after the first */
export function flightStart(start: Date, flight: string | number | null, flightOffset: unknown): Date {
	const offset = (Number(flightOffset) || 0) * Math.max(Number(flight) - 1, 0);
	return new Date(start.getTime() + offset * 60_000);
}
