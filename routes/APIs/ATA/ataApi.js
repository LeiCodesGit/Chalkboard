import express from "express";
import ATAForm from "../../../models/ATA/ATAForm.js";
import Course from "../../../models/ATA/Course.js";

const router = express.Router();

// ========================
// DASHBOARD DATA
// ========================
router.get("/dashboard", (req, res) => {
    res.json({
        userName: "John Doe",
        pendingSubmissions: 0,
        approvedSubmissions: 0
    });
});

// ========================
// ADD COURSE
// ========================
router.post("/admin/add-course", async (req, res) => {
    try {
        const newCourse = new Course({
            courseCode: req.body.courseCode,
            units: req.body.units,
            courseTitle: req.body.description
        });

        await newCourse.save();
        res.json({ success: true });

    } catch (error) {
        if (error.code === 11000) {
            return res.json({ success: false, error: "Course code already exists!" });
        }
        res.json({ success: false, error: error.message });
    }
});

// ========================
// SEARCH COURSES
// ========================
router.get("/courses/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);

        const courses = await Course.find({
            courseCode: { $regex: "^" + query, $options: "i" }
        }).limit(10);

        res.json(courses);

    } catch (error) {
        res.status(500).json({ error: "Search failed" });
    }
});

// ========================
// SUBMIT ATA FORM
// ========================
router.post("/submit", async (req, res) => {
    try {

        const newATA = new ATAForm({
            userID: "TEST_USER_001",
            term: req.body.term || "2nd Term 2025-2026",
            status: "DRAFT",

            courseAssignments: req.body.sectionB
                ? req.body.sectionB.map(course => ({
                    courseCode: course.courseCode,
                    section: course.section,
                    units: Number(course.units),
                    effectiveUnits: Number(course.units)
                }))
                : [],

            administrativeRoles: req.body.sectionA
                ? req.body.sectionA.map(role => ({
                    roleName: role.roleName,
                    deloadingUnits: Number(role.units)
                }))
                : []
        });

        const savedForm = await newATA.save();

        res.status(201).json({
            success: true,
            message: "ATA Form Saved Successfully!",
            id: savedForm._id
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error saving form: " + error.message
        });
    }
});

export default router;