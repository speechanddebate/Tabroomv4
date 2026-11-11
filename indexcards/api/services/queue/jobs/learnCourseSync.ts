import config from '../../../config.js';
import { defineQueue, type QueueScheduler } from '../define.js';

/**
 * Stand-in for the NSDA Learn course sync while its logic is settled. It reads and writes
 * nothing, so its runs only prove the schedule, the worker, and the monitoring
 */
export async function syncLearnCourses() {
	await new Promise((resolve) => { setTimeout(resolve, 200); });
	return { courses: 0, failed: 0 };
}

export const learnCourseSyncSchedule: QueueScheduler<Record<string, never>> = {
	id: 'learn-course-sync',
	description: 'Pulls NSDA Learn course completions into judge quizzes',
	repeat: { every: 30 * 60 * 1000 }, // every 30 minutes
	job: { name: 'learn-course-sync', data: {} },
	enabled: () => config.jobs.learnCourseSync.enabled,
};

export const learnCourseSyncQueue = defineQueue({
	name: 'learn-course-sync',
	processor: syncLearnCourses,
	globalConcurrency: 1,
	removeOnComplete: { count: 100 },
	removeOnFail: { count: 100 },
	schedulers: [learnCourseSyncSchedule],
});
