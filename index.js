import express from "express";

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./database/mongo-dbconnect.js";
import session from 'express-session';


// ========================
// ES Module __dirname fix
// ========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================
// Load .env from ROOT
// ========================
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config();
console.log("MONGO_URI:", process.env.MONGO_URI);

const app = express();
app.get('/ping', (req, res) => {
    console.log("DEBUG: RECEIVED PING");
    res.send('PONG');
});
const PORT = process.env.PORT || 3000;

// JSON & URL Encoding (Increased limit for Base64 Images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 12,
        secure: false
    }
}));

// ADDED: Make session user available to all templates via res.locals.user
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ========================
// View Engine Setup
// ========================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========================
// Static Assets
// ========================
app.use(express.static(path.join(__dirname, "public")));

// ========================
// Import Routes
// ========================
// Main Pages
import loginRoutes from "./routes/MainPages/loginRoutes.js";
import professorRoutes from "./routes/MainPages/professorRoutes.js";
import adminRoutes from "./routes/MainPages/adminRoutes.js";
import progChairRoutes from "./routes/MainPages/progChairRoutes.js";
import deanRoutes from "./routes/MainPages/deanRoutes.js";
import userRoutes from './routes/APIs/userRoutes.js';

// TLA
import dashBoardRoutes from "./routes/TLA/tlaDashboardRoutes.js";
import coursesRoutes from "./routes/TLA/tlaCoursesRoutes.js";
import overviewRoutes from "./routes/TLA/tlaOverviewRoutes.js";
import formRoutes from "./routes/TLA/tlaFormRoutes.js";
import approvalRoutes from "./routes/TLA/tlaApprovalRoutes.js";

// TLA APIs
import tlaApiRoutes from "./routes/APIs/TLA/tlaRoutes.js";
import tlaApprovalApiRoutes from "./routes/APIs/TLA/tlaApprovalStatusRoutes.js";
import tlaPreDigitalRoutes from "./routes/APIs/TLA/tlaPreDigitalSessionRoutes.js";
import tlaPostDigitalRoutes from "./routes/APIs/TLA/tlaPostDigitalSessionRoutes.js";

// Syllabus
import courseOverviewRoutes from "./routes/Syllabus/courseOverview.js";
import syllabusCourseOverviewActions from "./models/Syllabus/syllabusCourseOverview.js";
import syllabusApprovalStatusActions from "./models/Syllabus/syllabusApprovalStatus.js";
import newSyllabusRoutes from "./routes/Syllabus/newSyllabusRoutes.js";
import infoSyllabusRoutes from "./routes/Syllabus/infoSyllabusRoutes.js";
import courseOverviewFacultyRoutes from "./routes/Syllabus/courseOverviewFaculty.js";
import syllabusApprovalRoutes from "./routes/Syllabus/syllabusApproval.js";
import endorseSyllabusRouter from "./routes/Syllabus/endorseSyllabusRoutes.js";
import deanApprovalRouter from "./routes/Syllabus/deanApprovalRoutes.js";
import adminOverviewRouter from "./routes/Syllabus/adminOverviewRoute.js";
import scheduleSyllabusRoutes from "./routes/Syllabus/scheduleSyllabusRoutes.js";
import previewRoutes from "./routes/Syllabus/previewRoutes.js";

// ATA
import ataPages from "./routes/ATA/ataPages.js";

// ========================
// Routes
// ========================
// Main Pages
app.use("/login", loginRoutes);
app.use("/institution", professorRoutes);
app.use("/admin/users", userRoutes); //admin user API
app.use("/admin", adminRoutes);
app.use("/progChair", progChairRoutes);
app.use("/dean", deanRoutes);

//TLA Pages
app.use("/tla/dashboard", dashBoardRoutes);
app.use("/tla/courses", coursesRoutes);
app.use("/tla/overview", overviewRoutes);
app.use("/tla/form", formRoutes);
app.use("/tla/approval", approvalRoutes);
app.get("/tla", (req, res) => res.redirect("/tla/courses"));

// TLA APIs
app.use("/api/tla/approval", tlaApprovalApiRoutes);
app.use("/api/tla/pre-digital", tlaPreDigitalRoutes);
app.use("/api/tla/post-digital", tlaPostDigitalRoutes);
app.use("/api/tla", tlaApiRoutes);

//Syllabus
app.get("/syllabus", (req, res) => {
    // Role-based redirection for the generic /syllabus path
    if (req.session.user) {
        const role = req.session.user.role;
        if (role === 'Admin' || role === 'HR') return res.redirect('/syllabus/hr');
        if (role === 'Dean' || role === 'dean') return res.redirect('/dean/syllabus');
        if (role === 'Program-Chair' || role === 'program-chair') return res.redirect('/syllabus/prog-chair');
        if (role === 'Professor' || role === 'professor') return res.redirect('/faculty');
        return res.redirect(`/syllabus/${req.session.user.id}`);
    }
    res.redirect("/login");
});

app.use((req, res, next) => {
    next();
});

app.use("/syllabus/api", syllabusCourseOverviewActions);
app.use("/syllabus/approval", syllabusApprovalStatusActions);
app.use("/syllabus/create", newSyllabusRoutes);
app.use("/syllabus/info", infoSyllabusRoutes);
app.use("/syllabus/approve", syllabusApprovalRoutes);
app.use("/syllabus/schedule", scheduleSyllabusRoutes);
app.use("/syllabus/prog-chair", endorseSyllabusRouter);
app.use("/syllabus/dean/approve", deanApprovalRouter);
app.use("/syllabus/preview", previewRoutes);
app.use("/syllabus/hr", adminOverviewRouter);
app.use("/syllabus", courseOverviewRoutes); // wildcard /:userId — MUST be last

// Faculty specific route
app.use("/faculty", courseOverviewFacultyRoutes);

// ATA Pages
app.use("/ata", ataPages);



// ========================
// 404 (LAST)
// ========================
app.use((req, res) => {
    res.status(404).send("404 not found");
});

// ========================
// database
// ========================
await connectDB();

// ========================
// Server
// ========================
app.listen(PORT, () => {
    console.log(`listening on port http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/login`);
    console.log(`Server Running`)
});