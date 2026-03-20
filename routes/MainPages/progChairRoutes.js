import express from "express";
import { mainDB } from "../../database/mongo-dbconnect.js";
import userSchema from "../../models/user.js";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";
import { Schema } from "mongoose";

const progChairRoutes = express.Router();
const MainUser = mainDB.model("User", userSchema);

// Reuse the Announcement model from mainDB if already registered,
// otherwise define it here with the same schema and connection.
const announcementSchema = new Schema(
    {
        department:    { type: String },
        category:      { type: String },
        headline:      { type: String },
        messageDetail: { type: String },
        postedBy: {
            userId:     { type: String },
            firstName:  { type: String },
            lastName:   { type: String },
            role:       { type: String },
            department: { type: String }
        }
    },
    { timestamps: true }
);

const Announcement = mainDB.models['Announcement']
    || mainDB.model('Announcement', announcementSchema);

progChairRoutes.get("/institution", isAuthenticated, authorizeRoles("Program-Chair"), async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ createdAt: -1 })
            .lean();

        console.log("[ProgChair] announcements fetched:", announcements.length);

        res.render("MainPages/progChair/progChairDashboard", {
            currentPageCategory: "institution",
            announcements,
            user: req.session.user
        });
    } catch (error) {
        console.error("[ProgChair] Error fetching announcements:", error);
        res.render("MainPages/progChair/progChairDashboard", {
            currentPageCategory: "institution",
            announcements: [],
            user: req.session.user
        });
    }
});

export default progChairRoutes;