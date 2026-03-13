import express from "express";

const dashboardRoutes = express.Router();

// /tla  →  redirect to the overview page
dashboardRoutes.get("/", (req, res) => {
    res.redirect("/tla/overview");
});

export default dashboardRoutes;