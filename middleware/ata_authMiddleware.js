
import { mainDB } from '../database/mongo-dbconnect.js';
// ==========================================
// 🛡️ 1. THE STRICT BOUNCER (Production Only)
// ==========================================
export const requireAuth = (req, res, next) => {
    
    // 🌟 SCENARIO A: PRODUCTION (Main Branch) 🌟
    // Does the Main branch's express-session exist?
    if (req.session && req.session.user) {
        req.user = req.session.user; // Use the real database user!
        return next(); 
    }

    // 🛑 SCENARIO B: NO LOGIN AT ALL 🛑
    // If it's an API request (like submitting a form in the background)
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ error: "Access Denied: Your session has expired. Please log in again." });
    }
    
    // If they are just trying to load a webpage, kick them to the official login page
    return res.redirect("/login"); 
};

// ==========================================
// 👑 2. THE VIP BOUNCER (Live DB Fetch Version)
// ==========================================
export const checkRole = (...allowedRoles) => {
    return async (req, res, next) => { // 👈 Make sure to add 'async' here!
        if (!req.user) {
            return res.status(500).json({ error: "Server Error: Role check ran before Auth check." });
        }

        try {
            // 1. Get the ID from the session
            let sessionUserID = "unknown";
            if (req.user._id && req.user._id.$oid) sessionUserID = req.user._id.$oid;
            else if (req.user._id) sessionUserID = req.user._id.toString();
            else if (req.user.id) sessionUserID = req.user.id;
            else if (req.user.employeeId) sessionUserID = req.user.employeeId;

            // 2. Fetch the LIVE user data directly from MongoDB
            const User = mainDB.model('User');
            const liveUser = await User.findById(sessionUserID);

            if (!liveUser) {
                return res.status(403).json({ error: "Forbidden: Account not found in database." });
            }

            const primaryRole = liveUser.role;
            const isPracticumCoord = liveUser.isPracticumCoordinator === true;

            // 3. If their primary role is on the VIP list, let them in!
            if (allowedRoles.includes(primaryRole)) {
                return next();
            }

            // 4. If the route allows Practicum Coordinators, and they have the live boolean flag, let them in!
            if (allowedRoles.includes('Practicum-Coordinator') && isPracticumCoord) {
                return next();
            }

            // 5. Otherwise, kick them out.
            return res.status(403).json({ 
                error: `Forbidden: You do not have permission. Required roles: ${allowedRoles.join(' or ')}` 
            });

        } catch (error) {
            console.error("Middleware DB Error:", error);
            return res.status(500).json({ error: "Server error during role verification." });
        }
    };
};