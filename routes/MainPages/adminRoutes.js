import express from "express";
import { mainDB, backup1, backup2 } from "../../database/mongo-dbconnect.js";
import userSchema from "../../models/user.js";
import Announcement from "../../models/MainPages/announcement.js";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";
import { renderDashboard } from "../../controllers/ataController.js";
import { requireLogin, requireApprovalRole, getAdminTLA } from "../../controllers/tlaController.js";

const adminRoutes = express.Router();
const MainUser    = mainDB.model("User", userSchema);
const Backup1User = backup1.model("User", userSchema);
const Backup2User = backup2.model("User", userSchema);

// ==========================================
// GET /admin/institution
// ==========================================

adminRoutes.get(
    "/institution",
    isAuthenticated,
    authorizeRoles("Admin", "HR"),
    async (req, res) => {
        try {
            const announcements = await Announcement.find().sort({ createdAt: -1 }).lean();
            res.render("MainPages/admin/adminDashboard", {
                currentPageCategory: "institution",
                announcements,
                user: req.session.user
            });
        } catch (error) {
            console.error("Error fetching announcements:", error);
            res.render("MainPages/admin/adminDashboard", {
                currentPageCategory: "institution",
                announcements: [],
                user: req.session.user
            });
        }
    }
);

// ==========================================
// GET /admin/tws  →  redirect to TWS archive
// ==========================================

adminRoutes.get(
    "/tws",
    isAuthenticated,
    authorizeRoles("Admin", "HR", "Super-Admin"),
    (req, res) => {
        return res.redirect("/tws/hr-archive");
    }
);

// ==========================================
// GET /admin/config/users  —  user list page
// ==========================================

adminRoutes.get(
    "/config/users",
    isAuthenticated,
    authorizeRoles("Admin", "HR"),
    async (req, res) => {
        try {
            const users = await MainUser.find().sort({ createdAt: -1 }).lean();
            res.render("MainPages/admin/adminConfigUsers", {
                users,
                currentPageCategory: "users",
                user: req.session.user
            });
        } catch (error) {
            console.error("Error fetching users from mainDB:", error);
            res.render("MainPages/admin/adminConfigUsers", {
                users: [],
                currentPageCategory: "users",
                user: req.session.user
            });
        }
    }
);

// ==========================================
// POST /admin/users/delete/:id  —  form-based delete
// (HTML forms can't send DELETE natively)
// ==========================================

adminRoutes.post(
    "/users/delete/:id",
    isAuthenticated,
    authorizeRoles("Admin", "HR"),
    async (req, res) => {
        try {
            await Promise.all([
                MainUser.findByIdAndDelete(req.params.id),
                Backup1User.findByIdAndDelete(req.params.id),
                Backup2User.findByIdAndDelete(req.params.id)
            ]);
            res.redirect("/admin/config/users");
        } catch (error) {
            console.error("Delete error:", error);
            res.redirect("/admin/config/users");
        }
    }
);

// ==========================================
// GET /admin/ata
// ==========================================

adminRoutes.get(
    "/ata",
    isAuthenticated,
    authorizeRoles("Admin", "Super-Admin", "VPAA", "HR", "HRMO"),
    renderDashboard
);

// ==========================================
// GET /admin/tla  —  TLA review queue + archive
// Accessible to: Program-Chair, Dean, HR, HRMO, VPAA, Technical,
// Practicum-Coordinator, Admin, Super-Admin
// ==========================================

adminRoutes.get(
    "/tla",
    requireLogin,
    requireApprovalRole,
    getAdminTLA
);

// ==========================================
// GET /admin/syllabus  →  redirect to HR syllabus overview
// ==========================================

adminRoutes.get(
    "/syllabus",
    isAuthenticated,
    authorizeRoles("Admin", "HR", "Super-Admin"),
    (req, res) => {
        return res.redirect("/syllabus/hr");
    }
);

export default adminRoutes;