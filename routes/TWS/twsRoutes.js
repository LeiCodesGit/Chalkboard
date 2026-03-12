import express from "express";
const router = express.Router();

/* ======================================================
   LANDING
====================================================== */
router.get("/", (req, res) => {
  res.render("TWS/twsLandingWelcome", { currentPageCategory: "tws" });
});

/* ======================================================
   IN-MEMORY STORE
====================================================== */
const twsStore = new Map();

function newId() {
  return "TWS-" + Math.random().toString(16).slice(2, 8).toUpperCase();
}

function getOr404(req, res) {
  const tws = twsStore.get(req.params.id);
  if (!tws) {
    res.status(404).send("TWS not found");
    return null;
  }
  return tws;
}

function computeTotals(loads = []) {
  let totalUnits = 0;
  let totalHours = 0;

  loads.forEach(r => {
    const u = Number(r.units || 0);
    const lec = Number(r.lec || 0);
    const lab = Number(r.lab || 0);
    const sec = Number(r.sections || 1);

    totalUnits += u;
    totalHours += (lec + lab) * sec;
  });

  return { totalUnits, totalHours };
}

/* ======================================================
   DASHBOARD
====================================================== */
router.get("/dashboard", (req, res) => {
  const list = Array.from(twsStore.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.render("TWS/twsCreatePage", { list, currentPageCategory: "tws" });
});

/* ======================================================
   CREATE NEW TWS (START FLOW)
====================================================== */
router.get("/create", (req, res) => {
  const id = newId();

  twsStore.set(id, {
    id,
    createdAt: Date.now(),
    status: "Draft",
    faculty: {},
    loads: [],
    createdWorkload: [],
    totals: { totalUnits: 0, totalHours: 0 },
    approval: { status: "Not Submitted" },
    archived: false,
  });


  res.redirect(`/tws/create-teaching-workload/${id}`);
});

/* ======================================================
   STEP 1 — CREATE TEACHING WORKLOAD (SUBJECT LIST + POPUP)
====================================================== */
router.get("/create-teaching-workload/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  const subjects = [
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


  if (!Array.isArray(tws.createdWorkload)) tws.createdWorkload = [];

  res.render("TWS/twsCreateTeachingWorkloadPopup", {
    tws,
    subjects,
    currentPageCategory: "tws",
  });
});

router.post("/create-teaching-workload/:id/add", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  if (!Array.isArray(tws.createdWorkload)) tws.createdWorkload = [];

  const { code, title, units, timeSlot, sectionRoom } = req.body;

  const exists = tws.createdWorkload.some(s => s.code === code);
  if (!exists) {
    tws.createdWorkload.push({
      code: code || "",
      title: title || "",
      units: units || "0",
      timeSlot: timeSlot || "",
      sectionRoom: sectionRoom || "",
    });
  }

  // balik sa same page after add
  return res.redirect(`/tws/create-teaching-workload/${tws.id}`);
});

/* ======================================================
   STEP 2 — CREATED TEACHING WORKLOAD (GRID / SCHEDULE)
====================================================== */
router.get("/created-teaching-workload/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  res.render("TWS/twsCreatedTeachingWorkload", {
    tws,
    currentPageCategory: "tws",
  });
});

/* ======================================================
   STEP 3 — FACULTY INFO
====================================================== */
router.get("/faculty/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  res.render("TWS/twsFacultyInfo", { tws, currentPageCategory: "tws" });
});

router.post("/faculty/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  tws.faculty = req.body;
  res.redirect(`/tws/teaching-load/${tws.id}`);
});

/* ======================================================
   STEP 4 — TEACHING LOAD DETAILS
====================================================== */
router.get("/teaching-load/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  res.render("TWS/twsTeachingLoad", { tws, currentPageCategory: "tws" });
});

router.post("/teaching-load/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  tws.loads = req.body.loads || [];
  tws.totals = computeTotals(tws.loads);

  res.redirect(`/tws/summary/${tws.id}`);
});

/* ======================================================
   STEP 5 — SUMMARY
====================================================== */
router.get("/summary/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  tws.totals = computeTotals(tws.loads);
  res.render("TWS/twsSummary", { tws, currentPageCategory: "tws" });
});

/* ======================================================
   SUBMISSION STATUS
====================================================== */
router.get("/status/:id", (req, res) => {
  const tws = getOr404(req, res);
  if (!tws) return;

  res.render("TWS/twsSubmissionStatus", { tws, currentPageCategory: "tws" });
});

/* ======================================================
   ARCHIVED
====================================================== */
router.get("/archived", (req, res) => {
  const list = Array.from(twsStore.values()).filter(t => t.archived);
  res.render("TWS/twsArchived", { list, currentPageCategory: "tws" });
});

/* ======================================================
   PROGRAM CHAIR
====================================================== */
router.get("/program-chair", (req, res) => {
  const submitted = Array.from(twsStore.values()).filter(
    t => t.status === "Submitted"
  );

  res.render("TWS/twsProgramChair", {
    submitted,
    personal: submitted,
    currentPageCategory: "tws",
  });
});

export default router;