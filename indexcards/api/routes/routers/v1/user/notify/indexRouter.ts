import { Router } from 'express';
import pushRouter from './pushRouter.js';

// The current login's notification channels. The public, no-session side of
// notifications (unsubscribe links) lives under /rest/notify

const router = Router();

router.use('/push', pushRouter);

export default router;
