import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import config from '../../../config.js';
import { learnCourseSyncSchedule } from './learnCourseSync.js';

describe('learn course sync job', () => {
	const jobs = { ...config.jobs.learnCourseSync };

	beforeAll(() => {
		Object.assign(config.jobs.learnCourseSync, { enabled: false });
	});

	afterAll(() => {
		Object.assign(config.jobs.learnCourseSync, jobs);
	});

	it('follows its config flag', () => {
		expect(learnCourseSyncSchedule.enabled()).toBe(false);

		config.jobs.learnCourseSync.enabled = true;
		expect(learnCourseSyncSchedule.enabled()).toBe(true);
		config.jobs.learnCourseSync.enabled = false;
	});
});
