import express from "express";
import TWS from "../../models/TWS/tws.js";
import Course from "../../models/TWS/course.js";
import TWSApprovalStatus from "../../models/TWS/twsApprovalStatus.js";

const router = express.Router();

/* ======================================================
   STATIC SUBJECTS
====================================================== */
const SUBJECTS = [
  { code: "ELT1011", title: "Circuits 1", units: 3.0 },
  { code: "CN1014", title: "Construction", units: 3.0 },
  { code: "CPET2114", title: "Microprocessor Systems", units: 3.0 },
  { code: "GE1110", title: "UTS (Understanding the Self)", units: 1.5 },
  { code: "GE1081", title: "Ethics", units: 3.0 },
  { code: "GE1053", title: "Numerical Methods", units: 3.0 },
  { code: "MG1210", title: "Entrepreneurship", units: 3.0 },
  { code: "ELT1016", title: "Electronic Devices", units: 3.0 },
  { code: "ELT1021", title: "Digital Design", units: 3.0 },
  { code: "ME1123", title: "Thermodynamics", units: 3.0 },
];

/* ======================================================
   HELPERS
====================================================== */
function getSessionUser(req) {
  return req.session?.user || req.session?.account || req.user || null;
}

function getSessionUserId(user) {
  return user?._id || user?.id || user?.userId || null;
}

function getSessionUserRole(user) {
  return user?.role || user?.userRole || null;
}

function buildFacultyName(user) {
  const parts = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean);
  return parts.join(" ").trim();
}

function defaultFacultyFromUser(user) {
  return {
    name: buildFacultyName(user),
    empId: user?.employeeId || "",
    dept: user?.department || "",
    acadYear: "",
    term: "",
    empStatus: user?.employmentType || "",
  };
}

function computeTotals(loads = []) {
  let totalUnits = 0;
  let totalHours = 0;

  loads.forEach((r) => {
    const units = Number(r.units || 0);
    const lec = Number(r.lec || 0);
    const lab = Number(r.lab || 0);
    const sections = Number(r.sections || 1);

    totalUnits += units;
    totalHours += (lec + lab) * sections;
  });

  return {
    totalUnits,
    totalHours,
    equivLoad: totalHours,
  };
}

function normalizeLoads(loads) {
  if (!loads) return [];
  const rows = Array.isArray(loads) ? loads : Object.values(loads);

  return rows.map((r) => ({
    courseCode: r.courseCode || "",
    courseTitle: r.courseTitle || "",
    units: Number(r.units || 0),
    lec: Number(r.lec || 0),
    lab: Number(r.lab || 0),
    sections: Number(r.sections || 1),
  }));
}

function normalizeCourseForView(c) {
  return {
    code: c.courseCode || "",
    title: c.courseTitle || c.description || "",
    units: Number(c.units || 0),
    timeSlot: c.timeSlot || c.time || "",
    sectionRoom:
      c.sectionRoom || [c.section, c.designatedRoom].filter(Boolean).join(" | "),
  };
}

function normalizeTwsForView(twsDoc, courses = [], approval = null) {
  const tws = typeof twsDoc.toObject === "function" ? twsDoc.toObject() : twsDoc;

  return {
    ...tws,
    id: String(tws._id),
    faculty: tws.faculty || {},
    loads: Array.isArray(tws.loads) ? tws.loads : [],
    totals: tws.totals || { totalUnits: 0, totalHours: 0, equivLoad: 0 },
    createdWorkload: courses.map(normalizeCourseForView),
    approval: approval || { status: "Not Submitted" },
  };
}

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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

  if (role === "Dean") {
    return getAnyTwsOr404(req, res);
  }

  return getOwnedTwsOr404(req, res);
}

async function getApprovalForTws(twsId) {
  return TWSApprovalStatus.findOne({ twsID: twsId }).lean();
}

function approverLabel(user) {
  const name = buildFacultyName(user);
  return name || user?.email || "Dean";
}

/* ======================================================
   LANDING
====================================================== */
router.get("/", (req, res) => {
  res.render("TWS/twsLandingWelcome", { currentPageCategory: "tws" });
});

/* ======================================================
   DASHBOARD
   - Program Chair / Dean => TWS create page
   - Professor => Faculty dashboard
====================================================== */
router.get(
  "/dashboard",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const role = getSessionUserRole(req.twsUser);
    const userId = getSessionUserId(req.twsUser);

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

    if (!["Program-Chair", "Dean"].includes(role)) {
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

    const { code, title, units, timeSlot, sectionRoom } = req.body;

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
        timeSlot: timeSlot || "",
        sectionRoom: sectionRoom || "",
        time: timeSlot || "",
        section,
        designatedRoom,
        department: tws.faculty?.dept || "",
      });
    }

    return res.redirect(`/tws/create-teaching-workload/${tws._id}`);
  })
);

/* ======================================================
   STEP 3 — CREATED TEACHING WORKLOAD
====================================================== */
router.get(
  "/created-teaching-workload/:id",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    const tws = await getOwnedTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await getApprovalForTws(tws._id);

    res.render("TWS/twsCreatedTeachingWorkload", {
      tws: normalizeTwsForView(tws, courses, approval),
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
    const role = getSessionUserRole(req.twsUser);

    let tws = null;

    if (role === "Dean") {
      tws = await getAnyTwsOr404(req, res);
    } else if (role === "Professor") {
      tws = await getAnyTwsOr404(req, res);
    } else {
      tws = await getOwnedTwsOr404(req, res);
    }

    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await getApprovalForTws(tws._id);

    res.render("TWS/twsSummary", {
      tws: normalizeTwsForView(tws, courses, approval),
      currentPageCategory: "tws",
      user: req.twsUser,
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

/* ======================================================
   SEND APPROVED TWS TO HR ARCHIVE
====================================================== */
router.post(
  "/send-to-hr/:id",
  requireDean,
  asyncHandler(async (req, res) => {
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    if (tws.status !== "Approved") {
      return res.status(400).send("Only approved TWS can be sent to HR archive.");
    }

    tws.status = "Archived";
    tws.archived = true;
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
    const pendingDocs = await TWS.find({
      status: "Sent to Dean",
      archived: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    const approvedDocs = await TWS.find({
      status: "Approved",
      archived: false,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const pending = await Promise.all(
      pendingDocs.map(async (tws) => {
        const approval = await getApprovalForTws(tws._id);
        return {
          ...tws,
          id: String(tws._id),
          faculty: tws.faculty || {},
          approval: approval || { status: "Pending" },
        };
      })
    );

    const details = await Promise.all(
      approvedDocs.map(async (tws) => {
        const approval = await getApprovalForTws(tws._id);
        return {
          ...tws,
          id: String(tws._id),
          faculty: tws.faculty || {},
          approval: approval || { status: "Approved" },
        };
      })
    );

    res.render("TWS/twsDean", {
      pending,
      details,
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
    const approval = await getApprovalForTws(tws._id);

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

    const action = req.body.action || "approve";
    const remarks = req.body.remarks || "";

    if (action === "approve") {
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
    const tws = await getAnyTwsOr404(req, res);
    if (!tws) return;

    const courses = await Course.find({ twsID: tws._id }).sort({ createdAt: 1 }).lean();
    const approval = await getApprovalForTws(tws._id);

    res.render("TWS/twsSubmissionStatus", {
      tws: normalizeTwsForView(tws, courses, approval),
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
        ? { archived: true }
        : role === "Professor"
        ? {
            archived: true,
            $or: [
              { assignedFacultyId: req.twsUser?.employeeId || "" },
              { assignedFacultyName: buildFacultyName(req.twsUser) },
            ],
          }
        : { userID: userId, archived: true };

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
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const docs = await TWS.find({ archived: true }).sort({ createdAt: -1 }).lean();

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
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const docs = await TWS.find({ archived: true }).sort({ createdAt: -1 }).lean();

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
   PROGRAM CHAIR PAGE
====================================================== */
router.get(
  "/program-chair",
  requireProgramChairOrDean,
  asyncHandler(async (req, res) => {
    return res.redirect("/tws/dashboard");
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
  res.status(500).send("TWS server error");
});

export default router;