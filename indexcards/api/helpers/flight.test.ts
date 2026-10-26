import { flightStart } from './flight.js';

describe('flightStart', () => {
	const start = new Date('2025-03-08T15:00:00Z');

	it('offsets each flight after the first by flight_offset minutes', () => {
		expect(flightStart(start, '1', '90').getTime()).toBe(start.getTime());
		expect(flightStart(start, 2, 90).getTime()).toBe(start.getTime() + 90 * 60_000);
		expect(flightStart(start, '3', '90').getTime()).toBe(start.getTime() + 180 * 60_000);
	});

	it('uses the start itself without a flight or offset', () => {
		expect(flightStart(start, null, null).getTime()).toBe(start.getTime());
		expect(flightStart(start, 2, undefined).getTime()).toBe(start.getTime());
	});
});
