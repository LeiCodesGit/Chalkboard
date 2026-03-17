import express from "express";
import { mainDB } from "../../database/mongo-dbconnect.js"; 
import userSchema from "../../models/user.js";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";

const adminRoutes = express.Router();

const MainUser = mainDB.model("User", userSchema);

adminRoutes.get("/institution", isAuthenticated, authorizeRoles("Admin", "HR", "Super-Admin"), async (req, res) => {
    res.render("MainPages/admin/adminDashboard", {
        currentPageCategory: "institution",
        announcements: [],
        user: req.session.user
    });
});

// Admin sidebar points to /admin/tws; forward it to the TWS HR/Admin view.
adminRoutes.get("/tws", isAuthenticated, authorizeRoles("Admin", "HR", "Super-Admin"), (req, res) => {
    return res.redirect("/tws/hr-archive");
});

adminRoutes.get("/config/users", async (req, res) => {
    try {
        const users = await MainUser.find().sort({ createdAt: -1 }).lean(); 
        
        res.render("MainPages/admin/adminConfigUsers", { 
            users: users,
            currentPageCategory: "users" 
        });
    } catch (error) {
        console.error("Error fetching users from mainDB:", error);
        res.render("MainPages/admin/adminConfigUsers", { 
            users: [], 
            currentPageCategory: "users"
        });
    }
});

export default adminRoutes;