import { Router } from 'express';
import { updateContact, deleteContact, userProfile } from '../../../../controllers/coach/contacts.js';
import { loadChapterAuthContext } from '../../../../middleware/auth/authContext.js';
import { requireAccess } from '../../../../middleware/auth/authorization.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.param('chapterId', loadChapterAuthContext);
router.use(requireAccess('chapter','write'));

// /coach/{chapterId}/school/{schoolId}/updateContact
router.route('/:chapterId/school/:schoolId/updateContact').post(ValidateRequest, updateContact).openapi = {
	path: '/coach/{chapterId}/school/{schoolId}/updateContact',
	tags: ['legacy', 'Coach'],
	requestParams: {
		path: z.object({
			chapterId: z.coerce.number().int().positive(),
			schoolId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Contact updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
// /coach/{chapterId}/school/:schoolId/deleteContact
router.route('/:chapterId/school/:schoolId/deleteContact').post(ValidateRequest, deleteContact).openapi = {
	path: '/coach/{chapterId}/school/{schoolId}/deleteContact',
	tags: ['legacy', 'Coach'],
	requestParams: {
		path: z.object({
			chapterId: z.coerce.number().int().positive(),
			schoolId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Contact deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
// /person/{personId}
router.route('/person/:personId').get(ValidateRequest, userProfile).openapi = {
	path: '/coach/person/{personId}',
	tags: ['legacy', 'Coach'],
	requestParams: {
		path: z.object({
			personId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'User profile' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
// /person
router.route('/person').get(userProfile).openapi = {
	path: '/coach/person',
	tags: ['legacy', 'Coach'],
	responses: { 200: { description: 'User profiles' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
