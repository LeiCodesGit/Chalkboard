import express from "express";
import { requireLogin, getOverview } from "../../controllers/tlaController.js";

const overviewRoutes = express.Router();

// GET /tla/overview              — overview with static/default course data
overviewRoutes.get("/", requireLogin, getOverview);

// GET /tla/overview/:syllabusId  — overview scoped to a specific syllabus/course
overviewRoutes.get("/:syllabusId", requireLogin, getOverview);

export default overviewRoutes;