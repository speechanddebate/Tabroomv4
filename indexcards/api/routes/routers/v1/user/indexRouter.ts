import { Router } from 'express';
import inboxRouter from './inboxRouter.js';
import tournsRouter from './tournsRouter.js';
import sessionRouter from './sessionRouter.js';
import judgesRouter from './judges/judgesRouter.js';
import studentsRouter from './studentsRouter.js';
import chaptersRouter from './chaptersRouter.js';
import sectionsRouter from './sectionsRouter.js';

const router = Router();

router.use('/tourns', tournsRouter);
router.use('/inbox', inboxRouter);
//sessions
router.use('/session', sessionRouter);
router.use('/judges', judgesRouter);
router.use('/students', studentsRouter);
router.use('/chapters', chaptersRouter);
router.use('/sections', sectionsRouter);

export default router;
