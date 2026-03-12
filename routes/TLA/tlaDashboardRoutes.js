import express from "express";
import { requireLogin, getDashboard } from "../../controllers/tlaController.js";

const dashboardRoutes = express.Router();

// /tla  →  redirect to the dashboard
dashboardRoutes.get("/", requireLogin, getDashboard);

export default dashboardRoutes;