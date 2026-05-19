import { Router } from "express";
import { acceptTeamInvite, getTeamInvite, getTeamMembers, inviteTeamMember, removeTeamMember } from "../controllers/teamController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/invite/:token", getTeamInvite);
router.post("/invite/accept", acceptTeamInvite);
router.get("/", authRequired, getTeamMembers);
router.post("/invite", authRequired, inviteTeamMember);
router.delete("/:id", authRequired, removeTeamMember);

export default router;
