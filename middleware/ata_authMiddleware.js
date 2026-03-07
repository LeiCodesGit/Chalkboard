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
// 👑 2. THE VIP BOUNCER (Do you have the right role?)
// ==========================================
export const checkRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(500).json({ error: "Server Error: Role check ran before Auth check." });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: `Forbidden: You do not have permission. Required roles: ${allowedRoles.join(' or ')}` 
            });
        }

        next();
    };
};