import { Router } from 'express';
import emailRouter from './emailRouter.js';

// Notification endpoints that work without a session: actions taken from a link in an
// email, where the token in the link is the credential. The per-login side (push
// subscriptions) lives under /user/notify

const router = Router();

router.use('/email', emailRouter);

export default router;
