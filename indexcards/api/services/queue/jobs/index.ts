import { learnCourseSyncQueue } from './learnCourseSync.js';

/** The queue of every scheduled job, one file per job in this folder. The registry opens them with the rest */
export const scheduledQueues = [
	learnCourseSyncQueue,
] as const;
