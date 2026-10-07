import { Router } from 'express';
import tabRouter from './tab/indexRouter.js';
import legacyCoachRouter from './legacy/coachRouter.js';
import adminRouter from './admin/adminRouter.js';
import { requireSiteAdmin } from '../../../middleware/auth/authorization.js';

import authRouter from './authRouter.js';
import pagesRouter from './pages/pagesRouter.js';
import restRouter from './rest/restRouter.js';
import { apiReference } from '@scalar/express-api-reference';

// needed for monitoring and testing
import statusRouter from './statusRouter.js';

import userRouter from './user/indexRouter.js';
import legacyUserRouter from './legacy/userRouter.js';
import legacyPublicRouter from './legacy/public/indexRouter.js';
import { requirePerson } from '../../../middleware/auth/authorization.js';
import config from '../../../config.js';
import { createOpenApiSpec } from '../../openapi/createOpenApiSpec.js';

const router = Router({ mergeParams: true });

if(!config.features.HIDE_DEV_ENDPOINTS) {
	router.use('/coach' , legacyCoachRouter);
	router.use('/tab'   , tabRouter);
	router.use('/admin' , requireSiteAdmin, adminRouter);
	router.use('/public' , legacyPublicRouter);
	router.use('/user', requirePerson, legacyUserRouter);
}

router.use('/pages'  , pagesRouter);
router.use('/rest'   , restRouter);
router.use('/status' , statusRouter);
router.use('/auth'   , authRouter);
router.use('/user'   , requirePerson, userRouter);

router.get('/', (req, res) => {
	res.json(openApiSpec);
});

router.use(
	'/reference',
	apiReference({
		url: '/v1',
		orderSchemaPropertiesBy: 'preserve',
		persistAuth: true,
		showOperationId: true,
		metaData: {
			title: 'Tabroom.com API Reference',
		},
	}),
);

// Built from the mounted routes at startup so the served spec always matches this app's config
export const openApiSpec = createOpenApiSpec(router);

export default router;
