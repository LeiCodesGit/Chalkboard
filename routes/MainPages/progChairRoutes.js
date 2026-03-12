import express from "express";
import { mainDB } from "../../database/mongo-dbconnect.js"; 
import userSchema from "../../models/user.js";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";

const progChairRoutes = express.Router();

const MainUser = mainDB.model("User", userSchema);

progChairRoutes.get("/institution", isAuthenticated, authorizeRoles("Program-Chair"), async (req, res) => {
    res.render("MainPages/progChair/progChairDashboard", {
        currentPageCategory: "institution",
        announcements: [],
        user: req.session.user
    });
});


export default progChairRoutes;