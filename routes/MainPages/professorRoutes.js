import express from "express";
import { isAuthenticated, authorizeRoles } from "../../middleware/authMiddleware.js";
import Announcement from '../../models/MainPages/announcement.js';

const professorRoutes = express.Router();

// GET login page
professorRoutes.get('/', isAuthenticated, async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ createdAt: -1 })
            .lean();
        res.render('MainPages/institution', {
            announcements,
            user: req.session.user,
            currentPageCategory: 'institution'
        });
    } catch (error) {
        res.render('MainPages/institution', {
            announcements: [],
            user: req.session.user,
            currentPageCategory: 'institution'
        });
    }
});

professorRoutes.get("/syllabus", isAuthenticated, authorizeRoles("Professor"), async(req, res) => {
    res.redirect("/faculty");
});

export default professorRoutes;