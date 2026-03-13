import express from "express";
// import bcrypt from "bcrypt";
import { mainDB } from "../../database/mongo-dbconnect.js";
import userSchema from "../../models/user.js";

const MainUser = mainDB.model("User", userSchema);
const loginRoutes = express.Router();

// GET login page
loginRoutes.get("/", (req, res) => {
    res.render("MainPages/login");   // renders views/MainPages/login.ejs
});

// POST login logic
loginRoutes.post("/", async (req, res) => {
    try {
        const { username, password } = req.body;
        const fullEmail = `${username.toLowerCase()}@mcm.edu.ph`;

        const user = await MainUser.findOne({ email: fullEmail });

        if (!user) {
            return res.status(401).json({ message: "User not found." });
        }

        // Plain text check
        if (password !== user.password) {
            return res.status(401).json({ message: "Incorrect password." });
        }

        // --- SESSION LOGIC START ---
        req.session.user = {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            program: user.program || "",
            department: user.department || "",
            employmentType: user.employmentType || "",
        };
        // --- SESSION LOGIC END ---

        res.status(200).json({ 
            message: "Login successful!",
            role: user.role 
        });

    } catch (error) {
        res.status(500).json({ message: "Server error: " + error.message });
    }
});

// For Logout
loginRoutes.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("Logout error:", err);
            return res.status(500).send("Could not log out.");
        }
        res.clearCookie('connect.sid'); 
        res.redirect("/login");
    });
});
export default loginRoutes;