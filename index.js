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
const PORT = process.env.PORT || 3000;

// JSON
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

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

// ========================
// Middleware
// ========================
// ADDED: These are required for the Bulk Delete feature
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
import tlaApiRoutes          from "./routes/APIs/TLA/tlaRoutes.js";
import tlaApprovalApiRoutes  from "./routes/APIs/TLA/tlaApprovalStatusRoutes.js";
import tlaPreDigitalRoutes   from "./routes/APIs/TLA/tlaPreDigitalSessionRoutes.js";
import tlaPostDigitalRoutes  from "./routes/APIs/TLA/tlaPostDigitalSessionRoutes.js";

// Syllabus
import courseOverviewRoutes from "./routes/Syllabus/courseOverview.js";
import syllabusCourseOverviewActions from "./models/Syllabus/syllabusCourseOverview.js";
import syllabusApprovalStatusActions from "./models/Syllabus/syllabusApprovalStatus.js";
import newSyllabusRoutes from "./routes/Syllabus/newSyllabusRoutes.js";
import infoSyllabusRoutes from "./routes/Syllabus/infoSyllabusRoutes.js";
import courseOverviewFacultyRoutes from "./routes/Syllabus/courseOverviewFaculty.js";
import syllabusApprovalRoutes from "./routes/Syllabus/syllabusApproval.js";
import reviewSyllabusRoutes from "./routes/Syllabus/reviewSyllabusRoutes.js";
import syllabusApprovalTechAsstRouter from "./routes/Syllabus/syllabusApprovalTechAsstRoutes.js";
import endorseSyllabusRouter from "./routes/Syllabus/endorseSyllabusRoutes.js";
import deanApprovalRouter from "./routes/Syllabus/deanApprovalRoutes.js";
import adminOverviewRouter from "./routes/Syllabus/adminOverviewRoute.js";
import scheduleSyllabusRoutes from "./routes/Syllabus/scheduleSyllabusRoutes.js";

// ATA
import ataPages from "./routes/ATA/ataPages.js";

//TWS
import twsRoutes from "./routes/TWS/twsRoutes.js";


// ========================
// Routes
// ========================
// Main Pages
app.use("/login",loginRoutes);
app.use("/institution",professorRoutes);
app.use("/admin/users", userRoutes); //admin user API
app.use("/admin",adminRoutes);
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
app.use("/api/tla/approval",      tlaApprovalApiRoutes);
app.use("/api/tla/pre-digital",   tlaPreDigitalRoutes);
app.use("/api/tla/post-digital",  tlaPostDigitalRoutes);
app.use("/api/tla",               tlaApiRoutes);

//Syllabus
app.get("/syllabus", (req, res) => {
    res.redirect("/syllabus/507f1f77bcf86cd799439011");
});
app.use("/syllabus/api", syllabusCourseOverviewActions);
app.use("/syllabus/approval", syllabusApprovalStatusActions);
app.use("/syllabus/create", newSyllabusRoutes);
app.use("/syllabus/info", infoSyllabusRoutes);
app.use("/syllabus/approve", syllabusApprovalRoutes);
app.use("/syllabus/edit", reviewSyllabusRoutes);
app.use("/syllabus/schedule", scheduleSyllabusRoutes);
app.use("/syllabus/tech-assistant", syllabusApprovalTechAsstRouter);
app.use("/syllabus/prog-chair", endorseSyllabusRouter);
app.use("/syllabus/dean/approve", deanApprovalRouter);
app.use("/syllabus/hr", adminOverviewRouter);
app.use("/syllabus", courseOverviewRoutes); // wildcard /:userId — MUST be last

// Faculty specific route
app.use("/faculty", courseOverviewFacultyRoutes);

// ATA Pages
app.use("/ata", ataPages);

// TWS
app.use("/tws", twsRoutes);



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