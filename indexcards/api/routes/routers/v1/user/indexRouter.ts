import { Router } from 'express';
import homeRouter from './homeRouter.js';
import inboxRouter from './inboxRouter.js';
import notifyRouter from './notify/indexRouter.js';
import tournsRouter from './tournsRouter.js';
import sessionsRouter from './sessionsRouter.js';
import judgesRouter from './judges/judgesRouter.js';
import studentsRouter from './studentsRouter.js';
import chaptersRouter from './chaptersRouter.js';
import conflictsRouter from './conflictsRouter.js';
import sectionsRouter from './sectionsRouter.js';

const router = Router();

router.use('/home', homeRouter);
router.use('/tourns', tournsRouter);
router.use('/inbox', inboxRouter);
router.use('/notify', notifyRouter);
// /session and /sessions
router.use(sessionsRouter);
router.use('/judges', judgesRouter);
router.use('/students', studentsRouter);
router.use('/chapters', chaptersRouter);
router.use('/conflicts', conflictsRouter);
router.use('/sections', sectionsRouter);

export default router;
