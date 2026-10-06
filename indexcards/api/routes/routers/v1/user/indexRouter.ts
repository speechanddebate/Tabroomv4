import { Router } from 'express';
import inboxRouter from '../user/inboxRouter.js';
import tournsRouter from '../user/tournsRouter.js';
import sessionRouter from '../user/sessionRouter.js';
import judgesRouter from '../user/judgesRouter.js';
import studentsRouter from '../user/studentsRouter.js';
import chaptersRouter from '../user/chaptersRouter.js';
import sectionsRouter from '../user/sectionsRouter.js';

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