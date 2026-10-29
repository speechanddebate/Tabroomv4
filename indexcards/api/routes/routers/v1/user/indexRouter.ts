import { Router } from 'express';
import inboxRouter from './inboxRouter.js';
import pushRouter from './pushRouter.js';
import tournsRouter from './tournsRouter.js';
import sessionsRouter from './sessionsRouter.js';
import judgesRouter from './judges/judgesRouter.js';
import studentsRouter from './studentsRouter.js';
import chaptersRouter from './chaptersRouter.js';
import sectionsRouter from './sectionsRouter.js';

const router = Router();

router.use('/tourns', tournsRouter);
router.use('/inbox', inboxRouter);
router.use('/push', pushRouter);
// /session and /sessions
router.use(sessionsRouter);
router.use('/judges', judgesRouter);
router.use('/students', studentsRouter);
router.use('/chapters', chaptersRouter);
router.use('/sections', sectionsRouter);

export default router;
