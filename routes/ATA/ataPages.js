import express from "express";
import { requireAuth } from "../../middleware/ata_authMiddleware.js";
import ATAForm from "../../models/ATA/ATAForm.js";

// 👇 FIX: We import mainDB to access the compiled User model to get Coordinator names!
import { mainDB } from '../../database/mongo-dbconnect.js';

const router = express.Router();

const getSafeUser = (reqUser) => {
    let rawProgram = reqUser.program || reqUser.department || reqUser.college || "";
    if (rawProgram === "N/A") rawProgram = "";

    return {
        ...reqUser,
        name: reqUser.name || `${reqUser.firstName || ''} ${reqUser.lastName || ''}`.trim() || "Faculty Member",
        role: reqUser.role || "Professor",
        employmentType: reqUser.employmentType || "Full-Time",
        isPracticumCoordinator: reqUser.isPracticumCoordinator || false,
        program: rawProgram 
    };
};

// ==========================================
// 🏠 MAIN ATA ENTRY POINT
// ==========================================
router.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect("/ata/dashboard/window"); 
    }
    return res.redirect("/login"); 
});

// ==========================================
// 📄 RENDER NEW ATA FORM (SECURED)
// ==========================================
router.get("/new", requireAuth, async (req, res) => {
    try {
        // 👇 SECURITY BLOCK: Kick executives out if they type the URL
        const userRole = req.user.role || "";
        if (['VPAA', 'HR', 'HRMO'].includes(userRole)) {
            return res.redirect('/ata/dashboard/window');
        }

        const safeUser = getSafeUser(req.user);
        const User = mainDB.model('User'); 
        const coordinators = await User.find({ isPracticumCoordinator: true });
        const coordinatorNames = coordinators.map(c => `${c.firstName} ${c.lastName}`.trim());

        res.render("ATA/new-ata", {
            user: safeUser,
            role: safeUser.role,
            employmentType: safeUser.employmentType,
            isPracticumCoordinator: safeUser.isPracticumCoordinator,
            coordinators: coordinatorNames,
            currentPageCategory: 'ata'
        });
    } catch (error) {
        console.error("Error loading new ATA page:", error);
        res.status(500).send("Server Error");
    }
});

// ==========================================
// 📊 DYNAMIC DASHBOARD ROUTE (Live DB Fetch Fix)
// ==========================================
router.get("/dashboard/window", requireAuth, async (req, res) => {
    try {
        let sessionUserID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;
        }

        const User = mainDB.model('User');
        const liveUser = await User.findById(sessionUserID);

        if (!liveUser) {
             return res.status(404).send("User not found.");
        }

        // Extract the exact boolean directly from the database!
        const isPracticumCoordinator = liveUser.isPracticumCoordinator === true;

        // Create the safeUser object using the live data
        const safeUser = {
            ...liveUser._doc, // Spreads the actual MongoDB document data
            name: `${liveUser.firstName || ''} ${liveUser.lastName || ''}`.trim() || "Faculty",
            role: liveUser.role || "Professor",
            program: liveUser.program || liveUser.department || "",
            isPracticumCoordinator: isPracticumCoordinator
        };

        const myPendingCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: { $regex: '^PENDING' } 
        });

        const myApprovedCount = await ATAForm.countDocuments({ 
            userID: sessionUserID, 
            status: 'FINALIZED' 
        });

        const latestForm = await ATAForm.findOne({ userID: sessionUserID }).sort({ createdAt: -1 });

        let lastSubmissionDate = "None";
        let lastStatus = "None";
        let totalUnits = 0;
        let effectiveUnits = 0;

        if (latestForm) {
            lastSubmissionDate = new Date(latestForm.createdAt).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', year: 'numeric' 
            });
            lastStatus = latestForm.status.replace('_', ' '); 
            totalUnits = latestForm.totalTeachingUnits || 0;
            effectiveUnits = (latestForm.totalEffectiveUnits || 0) + (latestForm.totalRemedialUnits || 0);
        }

        res.render("ATA/dashboard_window", {
            user: safeUser,
            role: safeUser.role,
            employmentType: safeUser.employmentType || "Full-Time",
            isPracticumCoordinator: isPracticumCoordinator, // 👈 Safely passed to EJS!
            myPendingCount: myPendingCount,  
            myApprovedCount: myApprovedCount,
            lastSubmissionDate: lastSubmissionDate, 
            lastStatus: lastStatus,                 
            totalUnits: totalUnits,                 
            effectiveUnits: effectiveUnits,         
            currentPageCategory: 'ata'
        });

    } catch (error) {
        console.error("Error loading dashboard data:", error);
        res.status(500).send("Server Error loading dashboard.");
    }
});
// ==========================================
// 📄 VIEW MY SUBMISSIONS (SECURED)
// ==========================================
router.get("/submissions", requireAuth, async (req, res) => {
    try {
        // 👇 SECURITY BLOCK: Kick executives out if they type the URL
        const userRole = req.user.role || "";
        if (['VPAA', 'HR', 'HRMO'].includes(userRole)) {
            return res.redirect('/ata/dashboard/window');
        }

        let userID = "unknown";
        if (req.user) {
            if (req.user._id && req.user._id.$oid) userID = req.user._id.$oid;
            else if (req.user._id) userID = req.user._id.toString();
            else if (req.user.id) userID = req.user.id;
            else if (req.user.employeeId) userID = req.user.employeeId;
        }

        const filterType = req.query.filter || 'all';
        let dbQuery = { userID: userID };

        if (filterType === 'approved') {
            dbQuery.status = 'FINALIZED'; 
        } else if (filterType === 'pending') {
            dbQuery.status = { $ne: 'FINALIZED' };
        }

        const myForms = await ATAForm.find(dbQuery).sort({ createdAt: -1 });

        res.render("ATA/submissions", { 
            forms: myForms,
            user: req.user,                
            currentPageCategory: 'ata',
            filterType: filterType 
        });

    } catch (error) {
        console.error("Error loading submissions:", error);
        res.status(500).send("Error loading submissions page.");
    }
});

// ==========================================
// 📄 VIEW SINGLE SUBMISSION
// ==========================================
router.get("/view-submission/:id", requireAuth, async (req, res) => {
    try {
        const form = await ATAForm.findById(req.params.id);
        if (!form) return res.status(404).send("Form not found");

        res.render("ATA/view-submission", {
            form: form,
            user: req.user,
            role: req.user.role,
            currentPageCategory: 'ata'
        });
    } catch (error) {
        console.error("Error loading view submission page:", error);
        res.status(500).send("Server Error loading page.");
    }
});

const archivedViewRoles = ['Program-Chair', 'Dean', 'VPAA', 'HR', 'HRMO'];
 
router.get("/archived-atas", requireAuth, async (req, res) => {
    try {
        const userRole = req.user.role || "";
 
        // 🔒 SECURITY: Only admin roles can view archived ATAs
        if (!archivedViewRoles.includes(userRole) && !req.user.isPracticumCoordinator) {
            return res.redirect('/ata/dashboard/window');
        }
 
        const safeUser = getSafeUser(req.user);
 
        // Fetch all ATAForms with status ARCHIVED
        // Exclude heavy fields not needed for the list view
        const forms = await ATAForm.find({ status: 'ARCHIVED' })
            .select('facultyName userID college program position employmentType term academicYear approvalHistory archivedAt updatedAt status')
            .sort({ archivedAt: -1, updatedAt: -1 });
 
        const totalCount = forms.length;
 
        res.render("ATA/archived-atas", {
            user:                  safeUser,
            role:                  safeUser.role,
            employmentType:        safeUser.employmentType,
            isPracticumCoordinator: safeUser.isPracticumCoordinator,
            forms:                 forms,
            totalCount:            totalCount,
            currentPageCategory:   'ata'
        });
 
    } catch (error) {
        console.error("[Archived ATAs] Error loading page:", error);
        res.status(500).send("Server Error loading Archived ATAs.");
    }
});


router.get("/reports", requireAuth, (req, res) => res.render("ATA/reports"));
router.get("/profile", requireAuth, (req, res) => res.render("ATA/profile"));
router.get("/admin/courses", requireAuth, (req, res) => res.render("ATA/admin-courses"));

export default router;