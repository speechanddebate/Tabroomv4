import { Router } from 'express';
import ballotsRouter from './ballotsRouter.js';
import { requireRoundOutToJudges } from '../../../../../../policy/judgePolicy.js';

// /v1/rest/judges/:judgeId/panels
const router = Router({ mergeParams: true });

router.use('/:panelId', requireRoundOutToJudges);

router.use('/:panelId/ballots', ballotsRouter);

export default router;
