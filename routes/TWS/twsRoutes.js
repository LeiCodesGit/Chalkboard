import express from "express";
import TWS from "../../models/TWS/tws.js";
import Course from "../../models/TWS/course.js";
import TWSApprovalStatus from "../../models/TWS/twsApprovalStatus.js";
import User from "../../models/user.js";
import mongoose from "mongoose";
import Subject from "../../models/TWS/subject.js";
import { calculateTwsLoadsFromCourses } from "../../utils/twsLoadCalculator.js";
import puppeteer from "puppeteer";
import ATACourse from "../../models/ATA/Course.js";
import {
  getSessionUser, getSessionUserId, getSessionUserRole,
  buildFacultyName, normalizeEmail, facultyMatchesTws,
  defaultFacultyFromUser, computeTotals,
  normalizeLoads, normalizeTwsForView, approverLabel, asyncHandler,
} from "../../utils/twsHelpers.js";
import {
  validateFacultyInfo, validateLoadRows, validateCourseAdd,
  validateApprovalAction, validateChairAction,
} from "../../utils/twsValidation.js";
import { transitionOrThrow, canTransition, getStepperState } from "../../utils/twsStateMachine.js";

const router = express.Router();

/* ── User model — user.js exports a schema, not a model ── */
const UserModel = mongoose.models.User || mongoose.model("User", User);

/* ======================================================
   MIDDLEWARE
====================================================== */
function requireLoggedIn(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.redirect("/login");
  req.twsUser = user;
  next();
}

function requireProgramChairOrDean(req, res, next) {
  const user = getSessionUser(req);
  const role = getSessionUserRole(user);

  if (!user) return res.redirect("/login");

  if (!["Program-Chair", "Dean"].includes(role)) {
    return res
      .status(403)
      .send("Forbidden: only Program Chair and Dean can access this TWS backend.");
  }

  req.twsUser = user;
  next();
}

function requireDean(req, res, next) {
  const user = getSessionUser(req);
  const role = getSessionUserRole(user);

  if (!user) return res.redirect("/login");

  if (role !== "Dean") {
    return res.status(403).send("Forbidden: Dean access only.");
  }

  req.twsUser = user;
  next();
}

function requireProgramChair(req, res, next) {
  const user = getSessionUser(req);
  const role = getSessionUserRole(user);
  if (!user) return res.redirect("/login");
  if (role !== "Program-Chair") {
    return res.status(403).send("Forbidden: Program Chair access only.");
  }
  req.twsUser = user;
  next();
}

function requireHROrAdmin(req, res, next) {
  const user = getSessionUser(req);
  const role = getSessionUserRole(user);
  if (!user) return res.redirect("/login");
  if (!["HR", "Admin", "Super-Admin"].includes(role)) {
    return res.status(403).send("Forbidden: HR or Admin access only.");
  }
  req.twsUser = user;
  next();
}

function requireProfessor(req, res, next) {
  const user = getSessionUser(req);
  const role = getSessionUserRole(user);

  if (!user) return res.redirect("/login");

  if (role !== "Professor") {
    return res.status(403).send("Forbidden: Professor access only.");
  }

  req.twsUser = user;
  next();
}

async function getOwnedTwsOr404(req, res) {
  const userId = getSessionUserId(req.twsUser);

  const tws = await TWS.findOne({
    _id: req.params.id,
    userID: userId,
  });

  if (!tws) {
    res.status(404).send("TWS not found");
    return null;
  }

  return tws;
}

async function getAnyTwsOr404(req, res) {
  const tws = await TWS.findById(req.params.id);

  if (!tws) {
    res.status(404).send("TWS not found");
    return null;
  }

  return tws;
}

async function getAccessibleTwsOr404(req, res) {
  const role = getSessionUserRole(req.twsUser);
  const viewerId = String(getSessionUserId(req.twsUser) || "");

  // Dean can view any TWS
  if (role === "Dean") {
    return getAnyTwsOr404(req, res);
  }

  // HR/Admin can view archived records and details
  if (["HR", "Admin", "Super-Admin"].includes(role)) {
    return getAnyTwsOr404(req, res);
  }

  // Professor can view TWS assigned to them
    if (role === "Professor") {
    const tws = await TWS.findById(req.params.id);
    if (!tws) {
      res.status(404).send("TWS not found");
      return null;
    }

    const isAssigned = facultyMatchesTws(tws, req.twsUser);

    if (!isAssigned) {
      res.status(403).send("Forbidden: this TWS is not assigned to you.");
      return null;
    }

    return tws;
  }

  // Program Chair can view own TWS and records in their department.
  if (role === "Program-Chair") {
    const tws = await TWS.findById(req.params.id);
    if (!tws) {
      res.status(404).send("TWS not found");
      return null;
    }

    const ownerId = String(tws.userID || "");
    const chairDept = req.twsUser?.department || "";
    const twsDept = tws.faculty?.dept || "";
    const canView = ownerId === viewerId || (chairDept && twsDept && chairDept === twsDept);

    if (!canView) {
      res.status(403).send("Forbidden: this TWS is outside your scope.");
      return null;
    }

    return tws;
  }

  // Everyone else falls back to owned records only.
  return getOwnedTwsOr404(req, res);
}

async function getEditableTwsOr404(req, res) {
  const role = getSessionUserRole(req.twsUser);
  const viewerId = String(getSessionUserId(req.twsUser) || "");

  if (role === "Dean") {
    return getAnyTwsOr404(req, res);
  }

  if (role === "Program-Chair") {
    const tws = await TWS.findById(req.params.id);

    if (!tws) {
      res.status(404).send("TWS not found");
      return null;
    }

    const ownerId = String(tws.userID || "");
    const chairDept = req.twsUser?.department || "";
    const twsDept = tws.faculty?.dept || "";

    const canEdit =
      ownerId === viewerId ||
      (chairDept && twsDept && chairDept === twsDept);

    if (!canEdit) {
      res.status(403).send("Forbidden: this TWS is outside your editable scope.");
      return null;
    }

    return tws;
  }

  return getOwnedTwsOr404(req, res);
}

/**
 * Batch-fetch approvals for an array of TWS docs, avoiding N+1.
 */
async function batchApprovals(twsDocs) {
  const ids = twsDocs.map((t) => t._id);
  const approvals = await TWSApprovalStatus.find({ twsID: { $in: ids } }).lean();
  const map = {};
  approvals.forEach((a) => { map[String(a.twsID)] = a; });
  return map;
}

async function getSignatoryNamesByDepartment(dept) {
  let deanName = "";
  let programChairName = "";

  if (!dept) {
    return { deanName, programChairName };
  }

  const [deanUser, chairUser] = await Promise.all([
    UserModel.findOne({ role: "Dean", department: dept }).lean(),
    UserModel.findOne({ role: "Program-Chair", department: dept }).lean(),
  ]);

  if (deanUser) deanName = buildFacultyName(deanUser);
  if (chairUser) programChairName = buildFacultyName(chairUser);

  return { deanName, programChairName };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

async function resolveUserDisplayNameByEmail(email) {
  const normalizedEmail = normalizeEmail(email || "");
  if (!normalizedEmail) return "";

  const user = await UserModel.findOne({ email: normalizedEmail }).lean();
  return user ? buildFacultyName(user) : "";
}

async function resolveSignatoryNames(tws) {
  const { deanName: deanNameByDept, programChairName: chairNameByDept } =
    await getSignatoryNamesByDepartment(tws?.faculty?.dept || "");

  const [deanNameByEmail, chairNameByEmail] = await Promise.all([
    resolveUserDisplayNameByEmail(tws?.deanSignerEmail || ""),
    resolveUserDisplayNameByEmail(tws?.programChairSignerEmail || ""),
  ]);

  return {
    deanName: firstNonEmpty(tws?.deanSignerName, deanNameByEmail, deanNameByDept),
    programChairName: firstNonEmpty(
      tws?.programChairSignerName,
      chairNameByEmail,
      chairNameByDept
    ),
  };
}

function buildPdfFilename(tws) {
  const facultyName = String(tws?.faculty?.name || "faculty")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "");

  const term = String(tws?.term || tws?.faculty?.term || "term")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "");

  const schoolYear = String(tws?.schoolYear || tws?.faculty?.acadYear || "school-year")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]/g, "");

  return `TWS_${facultyName}_${term}_${schoolYear}.pdf`;
}

async function refreshTwsComputedLoads(twsId) {
  const [tws, courses] = await Promise.all([
    TWS.findById(twsId),
    Course.find({ twsID: twsId }).lean(),
  ]);

  if (!tws) return null;

  const computed = calculateTwsLoadsFromCourses(courses);

  tws.totals = computed.totals;
  tws.teachingHours = computed.teachingHours;
  tws.totalHours = computed.totalHours;
  tws.academicUnits = computed.academicUnits;
  tws.totalUnits = computed.totalUnits;

  await tws.save();
  return tws;
}

/* ======================================================
   LANDING
====================================================== */
router.get("/", requireLoggedIn, (req, res) => {
  const role = getSessionUserRole(req.twsUser);

  if (role === "Dean") return res.redirect("/tws/dean");
  if (role === "Program-Chair") return res.redirect("/tws/program-chair");
  if (role === "Professor") return res.redirect("/tws/dashboard");
  if (["HR", "Admin", "Super-Admin"].includes(role)) {
    return res.redirect("/tws/hr-archive");
  }

  return res.render("TWS/twsLandingWelcome", {
    currentPageCategory: "tws",
    user: req.twsUser,
  });
});

router.get("/get-started", requireLoggedIn, (req, res) => {
  const role = getSessionUserRole(req.twsUser);

  if (role === "Dean") return res.redirect("/tws/dean");
  if (role === "Program-Chair") return res.redirect("/tws/program-chair");
  if (role === "Professor") return res.redirect("/tws/dashboard");
  if (role === "HR" || role === "Admin" || role === "Super-Admin") {
    return res.redirect("/tws/hr-archive");
  }

  return res.redirect("/tws");
});

/* ======================================================
   DASHBOARD
   - Dean => redirect to /tws/dean
   - Program Chair => TWS create page
   - Professor => Faculty dashboard
====================================================== */
router.get(
  "/dashboard",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const role = getSessionUserRole(req.twsUser);
    const userId = getSessionUserId(req.twsUser);

    // Dean goes to their own approval dashboard
    if (role === "Dean") {
      return res.redirect("/tws/dean");
    }

    // HR/Admin go to archive
    if (["HR", "Admin", "Super-Admin"].includes(role)) {
      return res.redirect("/tws/hr-archive");
    }

    // Professor => Faculty dashboard
    if (role === "Professor") {
      const facultyName = buildFacultyName(req.twsUser);
      const employeeId = req.twsUser?.employeeId || "";
      const facultyEmail = normalizeEmail(req.twsUser?.email || "");

      const facultyMatcher = {
        $or: [
          ...(employeeId ? [{ assignedFacultyId: employeeId }, { "faculty.empId": employeeId }] : []),
          ...(facultyEmail ? [{ assignedFacultyEmail: facultyEmail }, { "faculty.email": facultyEmail }] : []),
          ...(facultyName ? [{ assignedFacultyName: facultyName }, { "faculty.name": facultyName }] : []),
        ],
      };

      const docs = await TWS.find(facultyMatcher).sort({ createdAt: -1 }).lean();

      const normalized = docs.map((tws) => ({
        ...tws,
        id: String(tws._id),
        faculty: tws.faculty || {},
        status: tws.status || "Draft",
      }));

      return res.render("TWS/twsFacultyDashboard", {
        list: normalized.filter((tws) => tws.status !== "Archived"),
        archivedList: normalized.filter((tws) => tws.status === "Archived"),
        currentPageCategory: "tws",
        user: req.twsUser,
      });
    }

    // Program Chair => Create page
    if (role !== "Program-Chair") {
      return res
        .status(403)
        .send("Forbidden: only Program Chair, Dean, or Professor can access TWS dashboard.");
    }

    const docs = await TWS.find({ userID: userId }).sort({ createdAt: -1 }).lean();

    const list = docs.map((tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
      status: tws.status || "Draft",
    }));

    return res.render("TWS/twsCreatePage", {
      list,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   CREATE NEW TWS
====================================================== */
router.get(
  "/create",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const userId = getSessionUserId(req.twsUser);
    const role = getSessionUserRole(req.twsUser);

    const newTws = await TWS.create({
      userID: userId,
      createdByRole: role,
      faculty: defaultFacultyFromUser(req.twsUser),
      status: "Draft",
      loads: [],
      totals: { totalUnits: 0, totalHours: 0, equivLoad: 0 },
      term: "",
      schoolYear: "",
    });

    await TWSApprovalStatus.create({
      twsID: newTws._id,
      status: "Not Submitted",
      remarks: "",
      approvedBy: "",
      approvalDate: null,
    });

    res.redirect(`/tws/faculty/${newTws._id}`);
  })
);

/* ======================================================
   STEP 1 — FACULTY INFO
====================================================== */
router.get(
  "/faculty/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const viewerRole = getSessionUserRole(req.twsUser);
    const viewerDept = req.twsUser?.department || "";
    const viewerProgram = req.twsUser?.program || "";

    let assignableRoles = ["Professor", "Program-Chair"];

    if (viewerRole === "Program-Chair") {
      // Add Dean only if you really want dean selectable for TWS
      assignableRoles = ["Professor", "Program-Chair", "Dean"];
    }

    if (viewerRole === "Dean") {
      assignableRoles = ["Program-Chair"];
    }

    const facultyFilter = { role: { $in: assignableRoles } };

    if (viewerRole === "Program-Chair" && viewerProgram) {
      facultyFilter.program = viewerProgram;
    }

    if (viewerRole === "Dean" && viewerDept) {
      facultyFilter.department = viewerDept;
    }

    const professorDocs = await UserModel.find(facultyFilter)
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean();

    const professors = professorDocs.map((prof) => ({
      id: String(prof._id),
      name: buildFacultyName(prof),
      empId: prof.employeeId || "",
      email: normalizeEmail(prof.email || ""),
      dept: prof.department || "",
      program: prof.program || "",
    }));

    let selectedProfessorId = "";
    const currentFacultyEmail = normalizeEmail(tws.faculty?.email || "");
    const currentFacultyEmpId = String(tws.faculty?.empId || "").trim();

    const matchedProfessor = professors.find((prof) =>
      (currentFacultyEmail && prof.email === currentFacultyEmail) ||
      (currentFacultyEmpId && prof.empId === currentFacultyEmpId)
    );

    if (matchedProfessor) {
      selectedProfessorId = matchedProfessor.id;
    }

    res.render("TWS/twsFacultyInfo", {
      tws: normalizeTwsForView(tws),
      professors,
      selectedProfessorId,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/faculty/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const action = req.body.action || "next";
    const viewerRole = getSessionUserRole(req.twsUser);
    const viewerDept = req.twsUser?.department || "";
    const viewerProgram = req.twsUser?.program || "";

    let assignableRoles = ["Professor", "Program-Chair"];

    if (viewerRole === "Program-Chair") {
      // Add Dean only if dean should also be selectable
      assignableRoles = ["Professor", "Program-Chair", "Dean"];
    }

    if (viewerRole === "Dean") {
      assignableRoles = ["Program-Chair"];
    }

    const facultyFilter = {
      _id: req.body.selectedProfessorId || null,
      role: { $in: assignableRoles },
    };

    if (viewerRole === "Program-Chair" && viewerProgram) {
      facultyFilter.program = viewerProgram;
    }

    if (viewerRole === "Dean" && viewerDept) {
      facultyFilter.department = viewerDept;
    }

    const selectedProfessor = await UserModel.findOne(facultyFilter).lean();

    const listFilter = { role: { $in: assignableRoles } };

    if (viewerRole === "Program-Chair" && viewerProgram) {
      listFilter.program = viewerProgram;
    }

    if (viewerRole === "Dean" && viewerDept) {
      listFilter.department = viewerDept;
    }

    const professorDocs = await UserModel.find(listFilter)
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean();

    const professors = professorDocs.map((prof) => ({
      id: String(prof._id),
      name: buildFacultyName(prof),
      empId: prof.employeeId || "",
      email: normalizeEmail(prof.email || ""),
      dept: prof.department || "",
      program: prof.program || "",
    }));

    const facultyPayload = {
      selectedProfessorId: req.body.selectedProfessorId || "",
      name: selectedProfessor ? buildFacultyName(selectedProfessor) : "",
      empId: selectedProfessor?.employeeId || "",
      email: normalizeEmail(selectedProfessor?.email || ""),
      dept: selectedProfessor?.department || "",
      program: selectedProfessor?.program || "",
      acadYear: req.body.acadYear || "",
      term: req.body.term || "",
      empStatus: req.body.empStatus || "",
    };

    const { valid, errors } = validateFacultyInfo(facultyPayload);

    if (!valid) {
      const fallbackView = normalizeTwsForView(tws);
      fallbackView.faculty = {
        ...fallbackView.faculty,
        name: facultyPayload.name,
        empId: facultyPayload.empId,
        email: facultyPayload.email,
        dept: facultyPayload.dept,
        program: facultyPayload.program,
        acadYear: facultyPayload.acadYear,
        term: facultyPayload.term,
        empStatus: facultyPayload.empStatus,
      };

      return res.status(400).render("TWS/twsFacultyInfo", {
        tws: fallbackView,
        professors,
        selectedProfessorId: facultyPayload.selectedProfessorId,
        currentPageCategory: "tws",
        user: req.twsUser,
        validationErrors: errors,
      });
    }

    tws.faculty = {
      name: facultyPayload.name,
      empId: facultyPayload.empId,
      email: facultyPayload.email,
      dept: facultyPayload.dept,
      program: facultyPayload.program,
      acadYear: facultyPayload.acadYear,
      term: facultyPayload.term,
      empStatus: facultyPayload.empStatus,
    };

    tws.term = facultyPayload.term;
    tws.schoolYear = facultyPayload.acadYear;
    tws.assignedFacultyId = facultyPayload.empId;
    tws.assignedFacultyEmail = facultyPayload.email;
    tws.assignedFacultyName = facultyPayload.name;

    await tws.save();

    if (action === "save") {
      return res.redirect("/tws/dashboard");
    }

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

/* ======================================================
   STEP 2 — ADD SUBJECTS
====================================================== */
router.get(
  "/create-teaching-workload/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();

    const twsDept = tws.faculty?.dept || "";
    const twsProgram = tws.faculty?.program || "";
    const twsTerm = tws.faculty?.term || tws.term || "";

    let subjects = [];

    const ataCurricula = await ATACourse.find(
      twsProgram
        ? { program: twsProgram }
        : {}
    ).lean();

    if (ataCurricula && ataCurricula.length) {
      const flattened = ataCurricula.flatMap((curriculum) =>
        (curriculum.courses || []).map((course) => ({
          code: String(course.courseCode || "").trim().toUpperCase(),
          title: String(course.courseTitle || "").trim(),
          units: Number(course.units || 0),
          department: twsDept,
          program: twsProgram,
          isActive: true,
        }))
      );

      const uniqueMap = new Map();
      flattened.forEach((subject) => {
        if (subject.code && !uniqueMap.has(subject.code)) {
          uniqueMap.set(subject.code, subject);
        }
      });

      subjects = Array.from(uniqueMap.values()).sort((a, b) => {
        return a.code.localeCompare(b.code) || a.title.localeCompare(b.title);
      });
    }

    if (!subjects.length) {
      subjects = await Subject.find(
        twsProgram
          ? { isActive: true, $or: [{ program: twsProgram }, { program: "" }] }
          : { isActive: true }
      )
        .sort({ code: 1, title: 1 })
        .lean();
    }
    
    res.render("TWS/twsCreateTeachingWorkloadPopup", {
      tws: normalizeTwsForView(tws, courses),
      subjects,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/create-teaching-workload/:id/add",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const { valid, errors } = validateCourseAdd(req.body);
    if (!valid) {
      return res.status(400).send(`Validation failed: ${errors.join(" ")}`);
    }

    const code = String(req.body.code || "").trim().toUpperCase();
    const day = String(req.body.day || "").trim();
    const startTime = String(req.body.startTime || "").trim();
    const endTime = String(req.body.endTime || "").trim();
    const sectionRoom = String(req.body.sectionRoom || "").trim();

    let subject = await Subject.findOne({ code, isActive: true }).lean();

    if (!subject) {
      const ataCurricula = await ATACourse.find({ "courses.courseCode": code }).lean();

      for (const curriculum of ataCurricula) {
        const matched = (curriculum.courses || []).find(
          (c) => String(c.courseCode || "").trim().toUpperCase() === code
        );

        if (matched) {
          subject = {
            code: String(matched.courseCode || "").trim().toUpperCase(),
            title: String(matched.courseTitle || "").trim(),
            units: Number(matched.units || 0),
          };
          break;
        }
      }
    }

    if (!subject) {
      return res.status(404).send("Selected subject was not found in the database.");
    }

    const normalizedTimeRange = `${startTime} - ${endTime}`;
    const normalizedTimeSlot = day ? `${day} ${normalizedTimeRange}` : normalizedTimeRange;

    const exists = await Course.findOne({
      twsID: tws._id,
      courseCode: code,
    });

    if (!exists) {
      const [section = "", designatedRoom = ""] = sectionRoom
        .split("|")
        .map((x) => x.trim());

      await Course.create({
        twsID: tws._id,
        courseCode: subject.code || "",
        courseTitle: subject.title || "",
        description: subject.title || "",
        units: Number(subject.units || 0),
        day,
        startTime,
        endTime,
        time: normalizedTimeRange,
        timeSlot: normalizedTimeSlot,
        sectionRoom,
        section,
        designatedRoom,
        department: tws.faculty?.dept || "",
      });

      await refreshTwsComputedLoads(tws._id);
    }

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

router.post(
  "/create-teaching-workload/:id/update",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const { valid, errors } = validateCourseAdd(req.body);
    if (!valid) {
      return res.status(400).send(`Validation failed: ${errors.join(" ")}`);
    }

    const code = String(req.body.code || "").trim().toUpperCase();
    const day = String(req.body.day || "").trim();
    const startTime = String(req.body.startTime || "").trim();
    const endTime = String(req.body.endTime || "").trim();
    const sectionRoom = String(req.body.sectionRoom || "").trim();

    const existingCourse = await Course.findOne({
      twsID: tws._id,
      courseCode: code,
    });

    if (!existingCourse) {
      return res.status(404).send("Course entry not found for this TWS.");
    }

    const normalizedTimeRange = `${startTime} - ${endTime}`;
    const normalizedTimeSlot = day ? `${day} ${normalizedTimeRange}` : normalizedTimeRange;

    const [section = "", designatedRoom = ""] = sectionRoom
      .split("|")
      .map((x) => x.trim());

    existingCourse.day = day;
    existingCourse.startTime = startTime;
    existingCourse.endTime = endTime;
    existingCourse.time = normalizedTimeRange;
    existingCourse.timeSlot = normalizedTimeSlot;
    existingCourse.sectionRoom = sectionRoom;
    existingCourse.section = section;
    existingCourse.designatedRoom = designatedRoom;

    await existingCourse.save();
    await refreshTwsComputedLoads(tws._id);

    const from = String(req.query?.from || req.body?.from || "").trim().toLowerCase();
    if (from === "created") {
      return res.redirect(`/tws/created-teaching-workload/${tws._id}`);
    }

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

router.post(
  "/create-teaching-workload/:id/remove",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) {
      return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
    }

    await Course.deleteOne({
      twsID: tws._id,
      courseCode: code,
    });

    await refreshTwsComputedLoads(tws._id);

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

/* ======================================================
   STEP 3 — CREATED TEACHING WORKLOAD
====================================================== */

router.get(
  "/created-teaching-workload/:id",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const isViewOnly = String(req.query?.mode || "").toLowerCase() === "view";

    // VIEW mode = broader access (Dean / Program Chair dept scope / assigned faculty / owner)
    // EDIT mode = owner only
    const tws = isViewOnly
      ? await getAccessibleTwsOr404(req, res)
      : await getOwnedTwsOr404(req, res);

    if (!tws) return;

    const from = String(req.query?.from || "").toLowerCase();
    const role = getSessionUserRole(req.twsUser);

    let viewBackUrl = "/tws/dashboard";
    if (from === "dean") {
      viewBackUrl = "/tws/dean";
    } else if (from === "program-chair") {
      viewBackUrl = "/tws/program-chair";
    } else if (role === "Dean") {
      viewBackUrl = "/tws/dean";
    }

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();

    const { deanName, programChairName } = await resolveSignatoryNames(tws);

    const twsView = normalizeTwsForView(tws, courses, approval);
    twsView.deanName = deanName;
    twsView.programChairName = programChairName;

    res.render("TWS/twsCreatedTeachingWorkload", {
      tws: twsView,
      isViewOnly,
      viewBackUrl,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   STEP 4 — TEACHING LOAD DETAILS
====================================================== */
router.get(
  "/teaching-load/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    res.render("TWS/twsTeachingLoad", {
      tws: normalizeTwsForView(tws),
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/teaching-load/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const action = req.body.action || "next";
    let loads = normalizeLoads(req.body.loads);

    if (action === "addRow") {
      loads.push({
        courseCode: "",
        courseTitle: "",
        units: 0,
        lec: 0,
        lab: 0,
        sections: 1,
      });
    }

    if (action === "removeRow" && loads.length > 0) {
      loads.pop();
    }

    // Validate load rows when moving forward
    if (action === "next") {
      const { valid, errors } = validateLoadRows(loads);
      if (!valid) {
        return res.status(400).render("TWS/twsTeachingLoad", {
          tws: { ...normalizeTwsForView(tws), loads },
          currentPageCategory: "tws",
          user: req.twsUser,
          validationErrors: errors,
        });
      }
    }

    tws.loads = loads;
    tws.totals = computeTotals(loads);

    tws.teachingHours = tws.totals.totalHours;
    tws.totalHours = tws.totals.totalHours;
    tws.academicUnits = tws.totals.totalUnits;
    tws.totalUnits = tws.totals.totalUnits;

    await tws.save();

    if (action === "back") {
      return res.redirect(`/tws/created-teaching-workload/${tws._id}`);
    }

    if (action === "save" || action === "addRow" || action === "removeRow") {
      return res.redirect(`/tws/teaching-load/${tws._id}`);
    }

    return res.redirect(`/tws/summary/${tws._id}`);
  })
);

/* ======================================================
   STEP 5 — SUMMARY
====================================================== */
router.get(
  "/summary/:id",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const tws = await getAccessibleTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();
    const errorMessage = req.query?.error ? String(req.query.error) : "";
    const from = String(req.query?.from || "").toLowerCase();
    const viewerRole = getSessionUserRole(req.twsUser);
    const viewerId = String(getSessionUserId(req.twsUser) || "");
    const ownerId = String(tws.userID || "");
    const viewerDept = req.twsUser?.department || "";
    const twsDept = tws.faculty?.dept || "";

    const canManageAsChair =
      viewerRole === "Dean" ||
      (
        viewerRole === "Program-Chair" &&
        (
          (viewerId && ownerId && viewerId === ownerId) ||
          (viewerDept && twsDept && viewerDept === twsDept)
        )
      );

    let viewBackUrl = "/tws/dashboard";
    if (from === "dean") {
      viewBackUrl = "/tws/dean";
    } else if (from === "program-chair") {
      viewBackUrl = "/tws/program-chair";
    } else if (viewerRole === "Dean") {
      viewBackUrl = "/tws/dean";
    }

    res.render("TWS/twsSummary", {
      tws: normalizeTwsForView(tws, courses, approval),
      currentPageCategory: "tws",
      user: req.twsUser,
      errorMessage,
      canManageAsChair,
      viewBackUrl,
    });
  })
);

router.post(
  "/summary/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getEditableTwsOr404(req, res);
    if (!tws) return;

    const action = req.body.action || "edit";
    const actorRole = getSessionUserRole(req.twsUser);
    const doneRedirect = actorRole === "Dean" ? "/tws/dean" : "/tws/dashboard";

    if (action === "edit") {
      return res.redirect(`/tws/faculty/${tws._id}`);
    }

    if (action === "sendToFaculty") {
      try { transitionOrThrow(tws.status, "Sent to Faculty"); } catch (e) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
      }
      tws.status = "Sent to Faculty";
      tws.sentToFacultyAt = new Date();
      tws.sentToDeanAt = null;
      tws.approvedAt = null;
      tws.assignedFacultyId = tws.faculty?.empId || "";
      tws.assignedFacultyEmail = normalizeEmail(tws.faculty?.email || "");
      tws.assignedFacultyName = tws.faculty?.name || "";

      tws.facultySigned = false;
      tws.facultySignedAt = null;
      tws.facultySignatureImage = "";
      tws.facultySignerName = "";
      tws.facultySignerEmpId = "";
      tws.facultySignerEmail = "";

      tws.programChairSigned = false;
      tws.programChairSignedAt = null;
      tws.programChairSignatureImage = "";
      tws.programChairSignerName = "";
      tws.programChairSignerEmpId = "";
      tws.programChairSignerEmail = "";

      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";

      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Not Submitted",
          remarks: "Sent to Faculty",
          approvedBy: "",
          approvalDate: null,
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.redirect(doneRedirect);
    }

    if (action === "sendToDean") {
      const viewerRole = getSessionUserRole(req.twsUser);
      if (viewerRole !== "Program-Chair") {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Only Program Chair can endorse TWS to Dean.")}`);
      }

      if (tws.status !== "Sent to Faculty") {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("TWS must be in 'Sent to Faculty' status before endorsing to Dean.")}`);
      }

      if (!tws.facultySigned || !tws.facultySignatureImage) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Faculty signature is required before endorsing to Dean.")}`);
      }

      const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();
      const signatureImage = liveUser?.signatureImage || "";
      if (!signatureImage) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Program Chair must set up e-signature before sending to Dean.")}`);
      }

      try { transitionOrThrow(tws.status, "Sent to Dean"); } catch (e) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
      }

      tws.status = "Sent to Dean";
      tws.sentToDeanAt = new Date();
      tws.programChairSigned = true;
      tws.programChairSignedAt = new Date();
      tws.programChairSignatureImage = signatureImage;
      tws.programChairSignerName = buildFacultyName(liveUser || req.twsUser);
      tws.programChairSignerEmpId = req.twsUser?.employeeId || "";
      tws.programChairSignerEmail = normalizeEmail(req.twsUser?.email || "");

      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Pending",
          remarks: "Endorsed to Dean by Program Chair",
          approvedBy: "",
          approvalDate: null,
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.redirect(doneRedirect);
    }

    return res.redirect(`/tws/summary/${tws._id}`);
  })
);

router.get(
  "/signature-settings",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();

    return res.render("TWS/twsSignatureSettings", {
      currentPageCategory: "tws",
      user: {
        ...req.twsUser,
        signatureImage: liveUser?.signatureImage || req.twsUser?.signatureImage || "",
      },
    });
  })
);

router.post(
  "/signature-settings",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const { signatureImage } = req.body;

    if (!signatureImage || !String(signatureImage).startsWith("data:image/")) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature image.",
      });
    }

    const liveUser = await UserModel.findById(getSessionUserId(req.twsUser));
    if (!liveUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    liveUser.signatureImage = signatureImage;
    await liveUser.save();

    if (req.session?.user) {
      req.session.user.signatureImage = signatureImage;
    }
    if (req.session?.account) {
      req.session.account.signatureImage = signatureImage;
    }
    return res.json({
      success: true,
      message: "E-signature saved successfully.",
    });
  })
);

router.post(
  "/signature-settings/clear",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const liveUser = await UserModel.findById(getSessionUserId(req.twsUser));
    if (!liveUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    liveUser.signatureImage = "";
    await liveUser.save();

    if (req.session?.user) {
      req.session.user.signatureImage = "";
    }
    if (req.session?.account) {
      req.session.account.signatureImage = "";
    }
    return res.json({
      success: true,
      message: "E-signature removed successfully.",
    });
  })
);

router.get(
  "/pdf/:id",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const tws = await getAccessibleTwsOr404(req, res);
    if (!tws) return;

    if (!["Approved", "Archived"].includes(tws.status)) {
      return res
        .status(400)
        .send("PDF download is only available for final approved or archived TWS records.");
    }

    if (!tws.facultySigned || !tws.programChairSigned || !tws.deanSigned) {
      return res
        .status(400)
        .send("PDF download is only available after Faculty, Program Chair, and Dean signatures are complete.");
    }

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();

    const { deanName, programChairName } = await resolveSignatoryNames(tws);

    const twsView = normalizeTwsForView(tws, courses, approval);
    twsView.deanName = deanName;
    twsView.programChairName = programChairName;
    const assetBaseUrl = `${req.protocol}://${req.get("host")}`;

    const html = await new Promise((resolve, reject) => {
      req.app.render(
        "TWS/twsPdf",
        {
          tws: twsView,
          user: req.twsUser,
          currentPageCategory: "tws",
          generatedAt: new Date(),
          assetBaseUrl,
        },
        (err, renderedHtml) => {
          if (err) return reject(err);
          resolve(renderedHtml);
        }
      );
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBytes = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: {
          top: "8mm",
          right: "8mm",
          bottom: "8mm",
          left: "8mm",
        },
      });

      const pdfBuffer = Buffer.isBuffer(pdfBytes)
        ? pdfBytes
        : Buffer.from(pdfBytes);

      tws.pdf = pdfBuffer;
      await tws.save();

      const filename = buildPdfFilename(tws);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(pdfBuffer);
    } finally {
      await browser.close();
    }
  })
);

/* ======================================================
   FACULTY SIGNATURE
====================================================== */
router.post(
  "/signature",
  requireProfessor,
  asyncHandler(async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send("TWS ID is required.");

    const tws = await TWS.findById(id);
    if (!tws) return res.status(404).send("TWS not found.");

    const isAssigned = facultyMatchesTws(tws, req.twsUser);
    if (!isAssigned) {
      return res.status(403).send("Forbidden: this TWS is not assigned to you.");
    }

    if (tws.status !== "Sent to Faculty") {
      return res.status(400).send("This TWS is not currently open for faculty signing.");
    }

    if (tws.facultySigned) {
      return res.status(400).send("This TWS is already signed by the faculty.");
    }

    const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();
    const signatureImage = liveUser?.signatureImage || "";

    if (!signatureImage) {
  return res
    .status(400)
    .send("No saved signature found in your account. Please upload your signature first.");
}

    tws.facultySigned = true;
    tws.facultySignedAt = new Date();
    tws.facultySignatureImage = signatureImage;
    tws.facultySignerName = buildFacultyName(liveUser || req.twsUser);
    tws.facultySignerEmpId = req.twsUser?.employeeId || "";
    tws.facultySignerEmail = normalizeEmail(req.twsUser?.email || "");
    tws.sentToDeanAt = null;

    await tws.save();

    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        $set: {
          twsID: tws._id,
          status: "Not Submitted",
          remarks: "Signed by faculty. Waiting for Program Chair endorsement.",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return res.redirect("/tws/dashboard");
  })
);

router.post(
  "/faculty-return/:id",
  requireProfessor,
  asyncHandler(async (req, res) => {
    const tws = await TWS.findById(req.params.id);
    if (!tws) return res.status(404).send("TWS not found.");

    const isAssigned = facultyMatchesTws(tws, req.twsUser);
    if (!isAssigned) {
      return res.status(403).send("Forbidden: this TWS is not assigned to you.");
    }

    if (tws.status !== "Sent to Faculty") {
      return res.status(400).send("This TWS is not currently assigned for faculty action.");
    }

    tws.status = "Returned to Program Chair";
    tws.facultySigned = false;
    tws.facultySignedAt = null;
    tws.facultySignatureImage = "";
    tws.facultySignerName = "";
    tws.facultySignerEmpId = "";
    tws.facultySignerEmail = "";
    tws.sentToDeanAt = null;

    tws.programChairSigned = false;
    tws.programChairSignedAt = null;
    tws.programChairSignatureImage = "";
    tws.programChairSignerName = "";
    tws.programChairSignerEmpId = "";
    tws.programChairSignerEmail = "";

    tws.deanSigned = false;
    tws.deanSignedAt = null;
    tws.deanSignatureImage = "";
    tws.deanSignerName = "";
    tws.deanSignerEmpId = "";
    tws.deanSignerEmail = "";

    await tws.save();

    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        $set: {
          twsID: tws._id,
          status: "Returned",
          remarks: "Returned by faculty for revision.",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return res.redirect("/tws/dashboard");
  })
);

/* ======================================================
   SEND APPROVED TWS TO HR ARCHIVE
====================================================== */
router.post(
  "/send-to-hr/:id",
  requireHROrAdmin,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    try {
      transitionOrThrow(tws.status, "Archived");
    } catch (e) {
      return res.status(400).send(e.message);
    }

    if (!tws.facultySigned || !tws.programChairSigned || !tws.deanSigned) {
      return res.status(400).send("Cannot archive: required signatures are incomplete.");
    }

    tws.status = "Archived";
    tws.archived = true;
    tws.archivedAt = new Date();

    await tws.save();

    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        status: "Archived",
        remarks: "Archived by HR/Admin",
        approvedBy: approverLabel(req.twsUser),
        approvalDate: new Date(),
      },
      { upsert: true, returnDocument: "after" }
    );

    return res.redirect("/tws/hr-archive");
  })
);

/* ======================================================
   DEAN PAGE
====================================================== */
router.get(
  "/dean",
  requireDean,
  asyncHandler(async (req, res) => {
    const activeDocs = await TWS.find({ status: { $ne: "Archived" } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const archivedDocs = await TWS.find({ status: "Archived" })
      .sort({ archivedAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const approvalMap = await batchApprovals([...activeDocs, ...archivedDocs]);

    const mapTws = (defaultStatus) => (tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
      approval: approvalMap[String(tws._id)] || { status: defaultStatus },
    });

    res.render("TWS/twsDean", {
      list: activeDocs.map(mapTws("Pending")),
      archivedList: archivedDocs.map(mapTws("Archived")),
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   DEAN APPROVAL PAGE
====================================================== */
router.get(
  "/approval/:id",
  requireDean,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();

    res.render("TWS/twsApprovalRouting_dean", {
      tws: normalizeTwsForView(tws, courses, approval),
      errorMessage: req.query?.error ? String(req.query.error) : "",
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/approval/:id",
  requireDean,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    const { valid, errors } = validateApprovalAction(req.body);
    if (!valid) return res.status(400).send(`Validation failed: ${errors.join(" ")}`);

    const action = req.body.action || "approve";
    const remarks = req.body.remarks || "";

    if (action === "approve") {
      if (!tws.facultySigned || !tws.facultySignatureImage) {
        return res.redirect(`/tws/approval/${tws._id}?error=${encodeURIComponent("Faculty signature is required before dean approval.")}`);
      }

      if (!tws.programChairSigned || !tws.programChairSignatureImage) {
        return res.redirect(`/tws/approval/${tws._id}?error=${encodeURIComponent("Program Chair signature is required before dean approval.")}`);
      }

      const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();
      const deanSignatureImage = liveUser?.signatureImage || "";
      if (!deanSignatureImage) {
        return res.redirect(`/tws/approval/${tws._id}?error=${encodeURIComponent("Please set up your Dean e-signature first before approving.")}`);
      }

      try { transitionOrThrow(tws.status, "Approved"); } catch (e) {
        return res.redirect(`/tws/approval/${tws._id}?error=${encodeURIComponent(e.message)}`);
      }

      tws.status = "Approved";
      tws.approvedAt = new Date();
      tws.deanSigned = true;
      tws.deanSignedAt = new Date();
      tws.deanSignatureImage = deanSignatureImage;
      tws.deanSignerName = buildFacultyName(liveUser || req.twsUser);
      tws.deanSignerEmpId = req.twsUser?.employeeId || "";
      tws.deanSignerEmail = normalizeEmail(req.twsUser?.email || "");

      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Approved",
          remarks: remarks || "Approved by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.redirect("/tws/dean");
    }

    if (action === "reject") {
      try { transitionOrThrow(tws.status, "Rejected"); } catch (e) {
        return res.status(400).send(e.message);
      }
      tws.status = "Rejected";
      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Rejected",
          remarks: remarks || "Rejected by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.redirect("/tws/dean");
    }

    if (action === "return") {
      try { transitionOrThrow(tws.status, "Returned to Program Chair"); } catch (e) {
        return res.status(400).send(e.message);
      }
      tws.status = "Returned to Program Chair";
      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Returned",
          remarks: remarks || "Returned to Program Chair by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, returnDocument: "after" }
      );

      return res.redirect("/tws/dean");
    }

    return res.redirect(`/tws/approval/${tws._id}`);
  })
);

/* ======================================================
   STATUS
====================================================== */
router.get(
  "/status/:id",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const tws = await getAccessibleTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();

    const twsView = normalizeTwsForView(tws, courses, approval);
    twsView.stepperState = getStepperState(tws.status);

    res.render("TWS/twsSubmissionStatus", {
      tws: twsView,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   DELETE TWS
====================================================== */
router.post(
  "/:id/delete",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    await Course.deleteMany({ twsID: tws._id });
    await TWSApprovalStatus.deleteMany({ twsID: tws._id });
    await TWS.deleteOne({ _id: tws._id });

    return res.redirect("/tws/dashboard");
  })
);

/* ======================================================
   ARCHIVED
====================================================== */
router.get(
  "/archived",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const role = getSessionUserRole(req.twsUser);
    const userId = getSessionUserId(req.twsUser);

    const filter =
      role === "Dean"
        ? { status: "Archived" }
        : role === "Professor"
                ? {
            status: "Archived",
            $or: [
              ...(req.twsUser?.employeeId ? [{ assignedFacultyId: req.twsUser.employeeId }, { "faculty.empId": req.twsUser.employeeId }] : []),
              ...(req.twsUser?.email ? [{ assignedFacultyEmail: normalizeEmail(req.twsUser.email) }, { "faculty.email": normalizeEmail(req.twsUser.email) }] : []),
              ...(buildFacultyName(req.twsUser) ? [{ assignedFacultyName: buildFacultyName(req.twsUser) }, { "faculty.name": buildFacultyName(req.twsUser) }] : []),
            ],
          }
        : { userID: userId, status: "Archived" };

    const docs = await TWS.find(filter).sort({ createdAt: -1 }).lean();

    const list = docs.map((tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
    }));

    res.render("TWS/twsArchived", {
      list,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   TA / HR ARCHIVES
====================================================== */
router.get(
  "/ta-archive",
  requireHROrAdmin,
  asyncHandler(async (req, res) => {
    const docs = await TWS.find({ status: "Archived" }).sort({ createdAt: -1 }).lean();

    const list = docs.map((tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
    }));

    return res.render("TWS/twsTAArchive", {
      list,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.get(
  "/hr-archive",
  requireHROrAdmin,
  asyncHandler(async (req, res) => {
    const activeDocs = await TWS.find({ status: { $ne: "Archived" } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const archivedDocs = await TWS.find({ status: "Archived" })
      .sort({ archivedAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const normalize = (tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
    });

    return res.render("TWS/twsHRArchive", {
      list: activeDocs.map(normalize),
      archivedList: archivedDocs.map(normalize),
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   PROGRAM CHAIR PAGE (Phase 3)
====================================================== */
router.get(
  "/program-chair",
  requireProgramChair,
  asyncHandler(async (req, res) => {
    const dept = req.twsUser?.department || "";
    const program = req.twsUser?.program || "";
    const userId = String(getSessionUserId(req.twsUser) || "");

    const scopeFilters = [{ userID: userId }];

    if (program) {
      scopeFilters.push({ "faculty.program": program });
    } else if (dept) {
      scopeFilters.push({ "faculty.dept": dept });
    }

    const allDocs = await TWS.find({ $or: scopeFilters })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const approvalMap = await batchApprovals(allDocs);

    const normalizeDoc = (tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
      status: tws.status || "Draft",
      approval: approvalMap[String(tws._id)] || { status: "Not Submitted" },
    });

    const normalizedDocs = allDocs.map(normalizeDoc);

    const activeList = normalizedDocs.filter((tws) => tws.status !== "Archived");
    const archivedList = normalizedDocs.filter((tws) => tws.status === "Archived");

    res.render("TWS/twsProgramChair", {
      list: activeList,
      archivedList,
      currentPageCategory: "tws",
      user: req.twsUser,
      errorMessage: req.query?.error ? String(req.query.error) : "",
    });
  })
);

/* ======================================================
   PROGRAM CHAIR ACTION (Phase 3)
====================================================== */
router.post(
  "/program-chair/action",
  requireProgramChair,
  asyncHandler(async (req, res) => {
    const { valid, errors } = validateChairAction(req.body);
    if (!valid) return res.status(400).send(`Validation failed: ${errors.join(" ")}`);

    const twsId = req.body.id;
    const action = req.body.action;
    const tws = await TWS.findById(twsId);
    if (!tws) return res.status(404).send("TWS not found");

    const chairDept = req.twsUser?.department || "";
    const twsDept = tws.faculty?.dept || "";
    const isOwner = String(tws.userID || "") === String(getSessionUserId(req.twsUser) || "");
    if (chairDept && twsDept && chairDept !== twsDept && !isOwner) {
      return res.status(403).send("Forbidden: this TWS is outside your department scope.");
    }

    if (action === "sendToFaculty") {
      if (!canTransition(tws.status, "Sent to Faculty")) {
        const msg = `Cannot send to Faculty from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }

      tws.status = "Sent to Faculty";
      tws.sentToFacultyAt = new Date();
      tws.sentToDeanAt = null;
      tws.approvedAt = null;
      tws.assignedFacultyId = tws.faculty?.empId || "";
      tws.assignedFacultyEmail = normalizeEmail(tws.faculty?.email || "");
      tws.assignedFacultyName = tws.faculty?.name || "";

      tws.facultySigned = false;
      tws.facultySignedAt = null;
      tws.facultySignatureImage = "";
      tws.facultySignerName = "";
      tws.facultySignerEmpId = "";
      tws.facultySignerEmail = "";

      tws.programChairSigned = false;
      tws.programChairSignedAt = null;
      tws.programChairSignatureImage = "";
      tws.programChairSignerName = "";
      tws.programChairSignerEmpId = "";
      tws.programChairSignerEmail = "";

      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";

      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Not Submitted", remarks: "Sent to Faculty by Program Chair", approvedBy: "", approvalDate: null },
        { upsert: true, returnDocument: "after" }
      );
      return res.redirect("/tws/program-chair");
    }

    if (action === "send" || action === "sendToDean") {
      if (tws.status !== "Sent to Faculty") {
        const msg = "TWS must be in 'Sent to Faculty' status before sending to Dean.";
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }

      if (!canTransition(tws.status, "Sent to Dean")) {
        const msg = `Cannot send to Dean from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }

      if (!tws.facultySigned || !tws.facultySignatureImage) {
        const msg = "Faculty must sign first before sending to Dean.";
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }

      const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();
      const signatureImage = liveUser?.signatureImage || "";
      if (!signatureImage) {
        const msg = "Please set up your Program Chair e-signature before sending to Dean.";
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }

      tws.status = "Sent to Dean";
      tws.sentToDeanAt = new Date();
      tws.programChairSigned = true;
      tws.programChairSignedAt = new Date();
      tws.programChairSignatureImage = signatureImage;
      tws.programChairSignerName = buildFacultyName(liveUser || req.twsUser);
      tws.programChairSignerEmpId = req.twsUser?.employeeId || "";
      tws.programChairSignerEmail = normalizeEmail(req.twsUser?.email || "");

      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Pending", remarks: "Endorsed by Program Chair", approvedBy: approverLabel(req.twsUser), approvalDate: new Date() },
        { upsert: true, returnDocument: "after" }
      );
      return res.redirect("/tws/program-chair");
    }

    if (action === "return") {
      if (!canTransition(tws.status, "Draft")) {
        const msg = `Cannot return to Draft from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }
      tws.status = "Draft";
      tws.sentToDeanAt = null;
      tws.approvedAt = null;

      tws.facultySigned = false;
      tws.facultySignedAt = null;
      tws.facultySignatureImage = "";
      tws.facultySignerName = "";
      tws.facultySignerEmpId = "";
      tws.facultySignerEmail = "";

      tws.programChairSigned = false;
      tws.programChairSignedAt = null;
      tws.programChairSignatureImage = "";
      tws.programChairSignerName = "";
      tws.programChairSignerEmpId = "";
      tws.programChairSignerEmail = "";

      tws.deanSigned = false;
      tws.deanSignedAt = null;
      tws.deanSignatureImage = "";
      tws.deanSignerName = "";
      tws.deanSignerEmpId = "";
      tws.deanSignerEmail = "";

      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Returned", remarks: "Returned by Program Chair", approvedBy: approverLabel(req.twsUser), approvalDate: new Date() },
        { upsert: true, returnDocument: "after" }
      );
      return res.redirect("/tws/program-chair");
    }

    return res.redirect("/tws/program-chair");
  })
);

/* ======================================================
   REVIEW DETAILS
====================================================== */
router.get(
  "/review-details",
  requireDean,
  asyncHandler(async (req, res) => {
    const docs = await TWS.find({
      status: {
        $in: ["Sent to Dean", "Approved", "Rejected", "Returned to Program Chair"],
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    const list = docs.map((tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
    }));

    res.render("TWS/twsReviewDetails", {
      list,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

/* ======================================================
   ERROR HANDLER
====================================================== */
router.use((err, req, res, next) => {
  console.error("TWS Route Error:", err);

  if (err.message && err.message.startsWith("Invalid status transition")) {
    return res.status(400).send(err.message);
  }

  res.status(500).send("TWS server error");
});

export default router;
