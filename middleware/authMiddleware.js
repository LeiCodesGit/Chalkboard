// 1. Check if user is logged in
export const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    // If not logged in, redirect to login page or send 401
    return res.status(401).redirect("/login"); 
};

// 2. Check if user has a specific role (e.g., 'admin')
export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ message: "Unauthorized: No session found" });
        }

        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({ 
                message: `Forbidden: Role '${req.session.user.role}' does not have access.` 
            });
        }

        next();
    };
};