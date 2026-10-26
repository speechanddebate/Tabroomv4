import { showDateTime, showDateRange, getWeek } from '$lib/helpers/dt';

describe('showDateRange', () => {
	const short = (startISO: string, endISO: string, tz?: string) =>
		showDateRange({ startISO, endISO, tz, mode: 'date', format: 'short' }).dateOutput?.trim();

	it('shows one date when the range is within a day', () => {
		expect(short('2025-03-13T14:00:00Z', '2025-03-13T22:00:00Z')).toBe('3/13');
	});

	it('repeats only the day when the range stays in one month', () => {
		expect(short('2025-03-13T14:00:00Z', '2025-03-15T22:00:00Z')).toBe('3/13 - 15');
	});

	it('shows both month and day when the range crosses a month', () => {
		expect(short('2025-01-30T14:00:00Z', '2025-02-01T22:00:00Z')).toBe('1/30 - 2/1');
	});

	it('shows both dates when the range crosses a year', () => {
		expect(short('2024-12-30T14:00:00Z', '2025-01-02T22:00:00Z')).toBe('12/30 - 1/2');
	});

	it('formats in the given time zone, not UTC', () => {
		// 04:00Z on 3/14 is still 3/13 in Chicago
		expect(short('2025-03-14T04:00:00Z', '2025-03-16T04:00:00Z', 'America/Chicago')).toBe('3/13 - 15');
		expect(short('2025-03-14T04:00:00Z', '2025-03-16T04:00:00Z')).toBe('3/14 - 16');
	});

	it('includes the year outside the short format', () => {
		expect(showDateRange({
			startISO: '2025-03-13T14:00:00Z',
			endISO: '2025-03-15T22:00:00Z',
			mode: 'date',
		}).dateOutput?.trim()).toBe('Mar 13 - 15, 2025');
		expect(showDateRange({
			startISO: '2025-01-30T14:00:00Z',
			endISO: '2025-02-01T22:00:00Z',
			mode: 'date',
		}).dateOutput?.trim()).toBe('Jan 30 - Feb 1, 2025');
	});

	it('gives each date its own year when the range crosses a year', () => {
		const range = (format?: string) => showDateRange({
			startISO: '2024-12-30T14:00:00Z',
			endISO: '2025-01-02T22:00:00Z',
			mode: 'date',
			format,
		}).dateOutput?.trim();
		expect(range()).toBe('Dec 30, 2024 - Jan 2, 2025');
		expect(range('long')).toBe('December 30, 2024 - January 2, 2025');
	});

	it('lists the weekdays start first in the full format', () => {
		expect(showDateRange({
			startISO: '2025-01-30T14:00:00Z',
			endISO: '2025-02-01T22:00:00Z',
			mode: 'date',
			format: 'full',
		}).dateOutput?.trim()).toBe('January 30 - February 1, 2025 (Thu — Sat)');
	});
});

describe('showDateTime', () => {
	it('does not throw on undefined input', () => {
		expect(() => showDateTime({ dt: undefined })).not.toThrow();
	});
});
describe('getWeek', () => {
	it('calculates the correct ISO week number', () => {
		expect(getWeek(new Date('2024-01-01'))).toBe(1); // Monday in ISO week 1
		expect(getWeek(new Date('2024-01-07'))).toBe(1); // Sunday in ISO week 1
		expect(getWeek(new Date('2024-01-10'))).toBe(2); // Wednesday in ISO week 2
		expect(getWeek(new Date('2021-01-01'))).toBe(53); // Belongs to ISO week 53 of 2020
		expect(getWeek(new Date('2024-12-31'))).toBe(1); // Belongs to ISO week 1 of 2025
	});
});
