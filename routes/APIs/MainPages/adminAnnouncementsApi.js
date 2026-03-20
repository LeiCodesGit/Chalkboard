import express from "express";
import Announcement from "../../../models/MainPages/announcement.js";

const router = express.Router();

// Helper: format poster label based on role
function formatPosterLabel(postedBy) {
    if (!postedBy) return 'System';
    const { role, department, firstName, lastName } = postedBy;
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    if (role === 'Admin' || role === 'Super-Admin') {
        return `Admin — ${fullName}`;
    }
    // Dean, HR, Program-Chair, VPAA, etc. — show department + role + name
    return `${department || ''} ${role || ''} — ${fullName}`.trim();
}

// ========================
// POST ANNOUNCEMENT
// ========================
router.post("/announcement", async (req, res) => {
    try {
        const user = req.session?.user;

        const announcement = new Announcement({
            department:    req.body.department,
            category:      req.body.category,
            headline:      req.body.headline,
            messageDetail: req.body.messageDetail,
            postedBy: user ? {
                userId:     user._id || user.id,
                firstName:  user.firstName,
                lastName:   user.lastName,
                role:       user.role,
                department: user.department
            } : null
        });

        await announcement.save();
        res.json({ success: true, id: announcement._id });
    } catch (error) {
        if (error.code === 11000) {
            return res.json({ success: false, error: "Duplicate entry." });
        }
        res.json({ success: false, error: error.message });
    }
});

// ========================
// GET ALL ANNOUNCEMENTS
// ========================
router.get("/announcements", async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, announcements });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ========================
// GET SINGLE ANNOUNCEMENT
// ========================
router.get("/announcement/:id", async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id).lean();
        if (!announcement) return res.json({ success: false, error: "Not found." });
        res.json({ success: true, announcement });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ========================
// UPDATE ANNOUNCEMENT
// ========================
router.put("/announcement/:id", async (req, res) => {
    try {
        const updated = await Announcement.findByIdAndUpdate(
            req.params.id,
            {
                department:    req.body.department,
                category:      req.body.category,
                headline:      req.body.headline,
                messageDetail: req.body.messageDetail
            },
            { new: true }
        );
        if (!updated) return res.json({ success: false, error: "Not found." });
        res.json({ success: true, announcement: updated });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ========================
// DELETE ANNOUNCEMENT
// ========================
router.delete("/announcement/:id", async (req, res) => {
    try {
        const deleted = await Announcement.findByIdAndDelete(req.params.id);
        if (!deleted) return res.json({ success: false, error: "Not found." });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

export { formatPosterLabel };
export default router;