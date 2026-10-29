import { describe, it, expect } from 'vitest';
import { MAX_RETRY_AFTER, RETRY_DELAY, RetryAfterError, retryAfterBackoff } from './backoff.js';

describe('retryAfterBackoff', () => {
	it.each([
		[1, RETRY_DELAY],
		[2, RETRY_DELAY * 2],
		[3, RETRY_DELAY * 4],
	])('doubles the delay from attempt %i', (attemptsMade, delay) => {
		expect(retryAfterBackoff(attemptsMade, 'custom', new RetryAfterError('try again'))).toBe(delay);
	});

	it('waits out a Retry-After longer than the backoff', () => {
		expect(retryAfterBackoff(1, 'custom', new RetryAfterError('busy', 90))).toBe(90 * 1000);
	});

	it('keeps the backoff when Retry-After is shorter', () => {
		expect(retryAfterBackoff(2, 'custom', new RetryAfterError('busy', 5))).toBe(RETRY_DELAY * 2);
	});

	it('caps a Retry-After that asks for too long', () => {
		expect(retryAfterBackoff(1, 'custom', new RetryAfterError('busy', MAX_RETRY_AFTER * 24))).toBe(MAX_RETRY_AFTER * 1000);
	});

	it('uses the backoff for any other error', () => {
		expect(retryAfterBackoff(2, 'custom', new Error('Connection lost'))).toBe(RETRY_DELAY * 2);
		expect(retryAfterBackoff(2)).toBe(RETRY_DELAY * 2);
	});
});
