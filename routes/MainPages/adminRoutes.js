import express from "express";
import mongoose from "mongoose";
import { mainDB } from "../../database/mongo-dbconnect.js"; 
import userSchema from "../../models/user.js";
import Syllabus from "../../models/Syllabus/syllabus.js";
import SyllabusApprovalStatus from "../../models/Syllabus/syllabusApprovalStatus.js";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";

const adminRoutes = express.Router();

const MainUser = mainDB.model("User", userSchema);

adminRoutes.get("/institution", isAuthenticated, authorizeRoles("Admin", "HR"), async (req, res) => {
    res.render("MainPages/admin/adminDashboard", {
        currentPageCategory: "institution",
        announcements: [],
        user: req.session.user
    });
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

/* -----------------------------------------------------------------------
   GET /admin/hr/review/:syllabusId  →  HR Final Review Detail Page
   ----------------------------------------------------------------------- */
adminRoutes.get("/hr/review/:syllabusId", isAuthenticated, authorizeRoles("Admin", "HR"), async (req, res) => {
    const { syllabusId } = req.params;

    try {
        let course = null;
        let approval = null;

        if (mongoose.Types.ObjectId.isValid(syllabusId)) {
            [course, approval] = await Promise.all([
                Syllabus.findById(syllabusId),
                SyllabusApprovalStatus.findOne({ syllabusID: syllabusId })
            ]);
        }

        res.render("Syllabus/syllabusApprovalHR", {
            syllabusId,
            courseName:      course   ? course.courseTitle              : "[COURSE NAME]",
            courseCode:      course   ? course.courseCode               : "[COURSE CODE]",
            courseSection:   course   ? (course.section    || "N/A")   : "[COURSE SECTION]",
            academicYear:    course   ? (course.academicYear || "N/A") : "[ACADEMIC YEAR]",
            fileType:        "Syllabus Form",
            currentStatus:   approval ? approval.status                 : null,
            existingComment: approval ? (approval.remarks  || "")      : "",
            currentPageCategory: "syllabus"
        });

    } catch (err) {
        console.error("HR review render error:", err);
        res.status(500).send("Server Error");
    }
});

export default adminRoutes;