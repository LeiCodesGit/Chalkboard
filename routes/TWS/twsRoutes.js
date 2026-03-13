import express from "express";
import TWS from "../../models/TWS/tws.js";
import Course from "../../models/TWS/course.js";
import TWSApprovalStatus from "../../models/TWS/twsApprovalStatus.js";
import User from "../../models/user.js";
import mongoose from "mongoose";
import SUBJECTS from "../../config/twsSubjects.js";
import {
  getSessionUser, getSessionUserId, getSessionUserRole,
  buildFacultyName, defaultFacultyFromUser, computeTotals,
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
    const empId = req.twsUser?.employeeId || "";
    const name = buildFacultyName(req.twsUser);
    const isAssigned =
      tws.assignedFacultyId === empId ||
      tws.assignedFacultyName === name ||
      tws.faculty?.empId === empId ||
      tws.faculty?.name === name;
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

/* ======================================================
   LANDING
====================================================== */
router.get("/", requireLoggedIn, (req, res) => {
  res.render("TWS/twsLandingWelcome", {
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

      const docs = await TWS.find({
        $or: [
          { assignedFacultyId: employeeId },
          { assignedFacultyName: facultyName },
          { "faculty.empId": employeeId },
          { "faculty.name": facultyName },
        ],
      })
        .sort({ createdAt: -1 })
        .lean();

      const list = docs.map((tws) => ({
        ...tws,
        id: String(tws._id),
        faculty: tws.faculty || {},
        status: tws.status || "Draft",
      }));

      return res.render("TWS/twsFacultyDashboard", {
        list,
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
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    res.render("TWS/twsFacultyInfo", {
      tws: normalizeTwsForView(tws),
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/faculty/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const action = req.body.action || "next";

    // Validate (skip on save-as-draft)
    if (action !== "save") {
      const { valid, errors } = validateFacultyInfo(req.body);
      if (!valid) {
        return res.status(400).render("TWS/twsFacultyInfo", {
          tws: normalizeTwsForView(tws),
          currentPageCategory: "tws",
          user: req.twsUser,
          validationErrors: errors,
        });
      }
    }

    tws.faculty = {
      name: req.body.name || "",
      empId: req.body.empId || "",
      dept: req.body.dept || "",
      acadYear: req.body.acadYear || "",
      term: req.body.term || "",
      empStatus: req.body.empStatus || "",
    };

    tws.term = req.body.term || "";
    tws.schoolYear = req.body.acadYear || "";
    tws.assignedFacultyId = req.body.empId || "";
    tws.assignedFacultyName = req.body.name || "";

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
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();

    res.render("TWS/twsCreateTeachingWorkloadPopup", {
      tws: normalizeTwsForView(tws, courses),
      subjects: SUBJECTS,
      currentPageCategory: "tws",
      user: req.twsUser,
    });
  })
);

router.post(
  "/create-teaching-workload/:id/add",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const { valid, errors } = validateCourseAdd(req.body);
    if (!valid) {
      return res.status(400).send(`Validation failed: ${errors.join(" ")}`);
    }

    const { code, title, units, day, timeSlot, sectionRoom } = req.body;
    const normalizedDay = String(day || "").trim();
    const normalizedTimeRange = String(timeSlot || "").trim();
    const normalizedTimeSlot = normalizedDay
      ? `${normalizedDay} ${normalizedTimeRange}`
      : normalizedTimeRange;

    const exists = await Course.findOne({
      twsID: tws._id,
      courseCode: code,
    });

    if (!exists) {
      const [section = "", designatedRoom = ""] = String(sectionRoom || "")
        .split("|")
        .map((x) => x.trim());

      await Course.create({
        twsID: tws._id,
        courseCode: code || "",
        courseTitle: title || "",
        description: title || "",
        units: Number(units || 0),
        day: normalizedDay,
        timeSlot: normalizedTimeSlot,
        sectionRoom: sectionRoom || "",
        time: normalizedTimeRange,
        section,
        designatedRoom,
        department: tws.faculty?.dept || "",
      });
    }

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

router.post(
  "/create-teaching-workload/:id/remove",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
    }

    await Course.deleteOne({
      twsID: tws._id,
      courseCode: code,
    });

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
    if (from === "dean" || role === "Dean") {
      viewBackUrl = "/tws/dean";
    } else if (from === "program-chair" || role === "Program-Chair") {
      viewBackUrl = "/tws/program-chair";
    }

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await TWSApprovalStatus.findOne({ twsID: tws._id }).lean();

    const dept = tws.faculty?.dept || "";
    let deanName = "";
    let programChairName = "";

    if (dept) {
      const [deanUser, chairUser] = await Promise.all([
        UserModel.findOne({ role: "Dean", department: dept }).lean(),
        UserModel.findOne({ role: "Program-Chair", department: dept }).lean(),
      ]);
      if (deanUser) deanName = buildFacultyName(deanUser);
      if (chairUser) programChairName = buildFacultyName(chairUser);
    }

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
    const tws = await getOwnedTwsOr404(req, res);
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
    const tws = await getOwnedTwsOr404(req, res);
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
    const viewerRole = getSessionUserRole(req.twsUser);
    const viewerId = String(getSessionUserId(req.twsUser) || "");
    const ownerId = String(tws.userID || "");
    const canManageAsChair =
      ["Program-Chair", "Dean"].includes(viewerRole) &&
      viewerId &&
      ownerId &&
      viewerId === ownerId;

    res.render("TWS/twsSummary", {
      tws: normalizeTwsForView(tws, courses, approval),
      currentPageCategory: "tws",
      user: req.twsUser,
      errorMessage,
      canManageAsChair,
    });
  })
);

router.post(
  "/summary/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const action = req.body.action || "edit";

    if (action === "edit") {
      return res.redirect(`/tws/faculty/${tws._id}`);
    }

    if (action === "sendToFaculty") {
      try { transitionOrThrow(tws.status, "Sent to Faculty"); } catch (e) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
      }
      tws.status = "Sent to Faculty";
      tws.sentToFacultyAt = new Date();
      tws.assignedFacultyId = tws.faculty?.empId || "";
      tws.assignedFacultyName = tws.faculty?.name || "";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Not Submitted",
          remarks: "Sent to Faculty",
          approvedBy: "",
          approvalDate: null,
        },
        { upsert: true, new: true }
      );

      return res.redirect("/tws/dashboard");
    }

    if (action === "sendToDean") {
      try { transitionOrThrow(tws.status, "Sent to Dean"); } catch (e) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
      }
      tws.status = "Sent to Dean";
      tws.sentToDeanAt = new Date();
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Pending",
          remarks: "Submitted to Dean",
          approvedBy: "",
          approvalDate: null,
        },
        { upsert: true, new: true }
      );

      return res.redirect("/tws/dashboard");
    }

    return res.redirect(`/tws/summary/${tws._id}`);
  })
);

/* ======================================================
   FACULTY SIGNATURE
====================================================== */
router.post(
  "/signature",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const { id } = req.body;
    if (!id) return res.redirect("/tws/dashboard");

    const tws = await TWS.findById(id);
    if (!tws) return res.redirect("/tws/dashboard");

    const role = getSessionUserRole(req.twsUser);
    if (role !== "Professor") {
      return res.status(403).send("Forbidden: only Faculty/Professor can sign TWS.");
    }

    // Object-level auth: only the assigned faculty can sign
    const empId = req.twsUser?.employeeId || "";
    const name = buildFacultyName(req.twsUser);
    const isAssigned = tws.assignedFacultyId === empId || tws.assignedFacultyName === name;
    if (!isAssigned) return res.status(403).send("Forbidden: this TWS is not assigned to you.");

    try { transitionOrThrow(tws.status, "Sent to Dean"); } catch (e) {
      return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
    }

    tws.status = "Sent to Dean";
    tws.sentToDeanAt = new Date();
    await tws.save();

    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        status: "Pending",
        remarks: "Faculty signed and sent to Dean",
        approvedBy: "",
        approvalDate: null,
      },
      { upsert: true, new: true }
    );

    return res.redirect("/tws/dashboard");
  })
);

router.post(
  "/faculty-return/:id",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    const role = getSessionUserRole(req.twsUser);
    if (role !== "Professor") {
      return res.status(403).send("Forbidden: only Faculty/Professor can return TWS for revision.");
    }

    const empId = req.twsUser?.employeeId || "";
    const name = buildFacultyName(req.twsUser);
    const isAssigned =
      tws.assignedFacultyId === empId ||
      tws.assignedFacultyName === name ||
      tws.faculty?.empId === empId ||
      tws.faculty?.name === name;
    if (!isAssigned) return res.status(403).send("Forbidden: this TWS is not assigned to you.");

    try { transitionOrThrow(tws.status, "Returned to Program Chair"); } catch (e) {
      return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
    }

    tws.status = "Returned to Program Chair";
    await tws.save();

    const remarks = String(req.body?.remarks || "").trim();
    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        status: "Returned",
        remarks: remarks || "Returned for revision by Faculty",
        approvedBy: buildFacultyName(req.twsUser) || "Faculty",
        approvalDate: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.redirect("/tws/dashboard");
  })
);

/* ======================================================
   SEND APPROVED TWS TO HR ARCHIVE
====================================================== */
router.post(
  "/send-to-hr/:id",
  requireDean,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    try { transitionOrThrow(tws.status, "Archived"); } catch (e) {
      return res.status(400).send(e.message);
    }

    tws.status = "Archived";
    tws.archivedAt = new Date();
    await tws.save();

    await TWSApprovalStatus.findOneAndUpdate(
      { twsID: tws._id },
      {
        remarks: "Sent to HR archive",
      },
      { new: true }
    );

    return res.redirect("/tws/dean");
  })
);

/* ======================================================
   DEAN PAGE
====================================================== */
router.get(
  "/dean",
  requireDean,
  asyncHandler(async (req, res) => {
    const userId = getSessionUserId(req.twsUser);

    const pendingDocs = await TWS.find({
      status: "Sent to Dean",
    })
      .sort({ createdAt: -1 })
      .lean();

    const approvedDocs = await TWS.find({
      status: "Approved",
    })
      .sort({ updatedAt: -1 })
      .lean();

    const personalDocs = await TWS.find({ userID: userId }).sort({ createdAt: -1 }).lean();

    // Batch approval lookup (N+1 fix)
    const allDocs = [...pendingDocs, ...approvedDocs, ...personalDocs];
    const approvalMap = await batchApprovals(allDocs);

    const mapTws = (defaultStatus) => (tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
      approval: approvalMap[String(tws._id)] || { status: defaultStatus },
    });

    res.render("TWS/twsDean", {
      pending: pendingDocs.map(mapTws("Pending")),
      details: approvedDocs.map(mapTws("Approved")),
      personal: personalDocs.map(mapTws("Draft")),
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
      try { transitionOrThrow(tws.status, "Approved"); } catch (e) {
        return res.status(400).send(e.message);
      }
      tws.status = "Approved";
      tws.approvedAt = new Date();
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Approved",
          remarks: remarks || "Approved by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, new: true }
      );

      return res.redirect("/tws/dean");
    }

    if (action === "reject") {
      try { transitionOrThrow(tws.status, "Rejected"); } catch (e) {
        return res.status(400).send(e.message);
      }
      tws.status = "Rejected";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Rejected",
          remarks: remarks || "Rejected by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, new: true }
      );

      return res.redirect("/tws/dean");
    }

    if (action === "return") {
      try { transitionOrThrow(tws.status, "Returned to Program Chair"); } catch (e) {
        return res.status(400).send(e.message);
      }
      tws.status = "Returned to Program Chair";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        {
          status: "Returned",
          remarks: remarks || "Returned to Program Chair by Dean",
          approvedBy: approverLabel(req.twsUser),
          approvalDate: new Date(),
        },
        { upsert: true, new: true }
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
              { assignedFacultyId: req.twsUser?.employeeId || "" },
              { assignedFacultyName: buildFacultyName(req.twsUser) },
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
    const docs = await TWS.find({ status: "Archived" }).sort({ createdAt: -1 }).lean();

    const list = docs.map((tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
    }));

    return res.render("TWS/twsHRArchive", {
      list,
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
    const userId = getSessionUserId(req.twsUser);
    const dept = req.twsUser?.department || "";

    // Submitted TWS in the chair's department that need review
    const submittedDocs = await TWS.find({
      status: { $in: ["Sent to Faculty", "Sent to Dean", "Returned to Program Chair"] },
      "faculty.dept": dept,
    }).sort({ createdAt: -1 }).lean();

    // Personal TWS created by this Program Chair
    const personalDocs = await TWS.find({ userID: userId }).sort({ createdAt: -1 }).lean();

    // Batch approval lookups (N+1 fix)
    const allDocs = [...submittedDocs, ...personalDocs];
    const approvalMap = await batchApprovals(allDocs);

    const mapTws = (tws) => ({
      ...tws,
      id: String(tws._id),
      faculty: tws.faculty || {},
      status: tws.status || "Draft",
      approval: approvalMap[String(tws._id)] || { status: "Not Submitted" },
    });

    res.render("TWS/twsProgramChair", {
      submitted: submittedDocs.map(mapTws),
      personal: personalDocs.map(mapTws),
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

    if (action === "send" || action === "sendToDean") {
      if (!canTransition(tws.status, "Sent to Dean")) {
        const msg = `Cannot send to Dean from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }
      tws.status = "Sent to Dean";
      tws.sentToDeanAt = new Date();
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Pending", remarks: "Endorsed by Program Chair", approvedBy: approverLabel(req.twsUser), approvalDate: new Date() },
        { upsert: true, new: true }
      );
      return res.redirect("/tws/program-chair");
    }

    if (action === "return") {
      if (!canTransition(tws.status, "Draft")) {
        const msg = `Cannot return to Draft from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }
      tws.status = "Draft";
      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Returned", remarks: "Returned by Program Chair", approvedBy: approverLabel(req.twsUser), approvalDate: new Date() },
        { upsert: true, new: true }
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