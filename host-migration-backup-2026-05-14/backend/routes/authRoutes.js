import { Router } from "express";
import { signup, login, logout, getCurrentUser, updatePassword } from "../controllers/authController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authRequired, getCurrentUser);
router.put("/password", authRequired, updatePassword);
router.put("/change-password", authRequired, updatePassword);

export default router;
