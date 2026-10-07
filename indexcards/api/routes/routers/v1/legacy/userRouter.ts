import { Router } from 'express';
import getProfile from '../../../../controllers/user/person/getProfile.js';
import updateLastAccess from '../../../../controllers/user/person/access.js';
import updateLearnCourses from '../../../../controllers/user/person/learnCourse.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.route('/profile').get(getProfile).openapi = {
	path: '/user/profile',
	summary: 'Load the profile data of the logged in user',
	tags: ['legacy', 'User Profile'],
	responses: { 200: { description: 'User profile' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/profile/:personId').get(ValidateRequest, getProfile).openapi = {
	path: '/user/profile/{personId}',
	summary: 'Load the profile data of another user',
	tags: ['legacy', 'User Profile'],
	requestParams: {
		path: z.object({
			personId: z.coerce.number().int().positive().meta({
				description: 'ID of user whose profile you wish to access. Site admins only',
			}),
		}),
	},
	responses: { 200: { description: 'User profile' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/updateLastAccess').get(updateLastAccess).openapi = {
	path: '/user/updateLastAccess',
	tags: ['legacy', 'User'],
	responses: { 200: { description: 'Access updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/updateLearn').post(updateLearnCourses).openapi = {
	path: '/user/updateLearn',
	tags: ['legacy', 'Learn'],
	responses: { 200: { description: 'Learn courses updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/updateLearn/:personId').post(ValidateRequest, updateLearnCourses).openapi = {
	path: '/user/updateLearn/{personId}',
	tags: ['legacy', 'Learn'],
	requestParams: {
		path: z.object({
			personId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Learn courses updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
