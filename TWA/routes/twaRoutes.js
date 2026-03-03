
import express from "express";

const router = express.Router();


const twsStore = new Map();

function newId() {
  return "TWS-" + Math.random().toString(16).slice(2, 8).toUpperCase();
}

function computeTotals(loads = []) {
  let totalUnits = 0;
  let totalHours = 0;

  for (const r of loads) {
    const units = Number(r.units || 0);
    const lec = Number(r.lec || 0);
    const lab = Number(r.lab || 0);
    const sec = Number(r.sections || 1);

    totalUnits += units;
    totalHours += (lec + lab) * sec;
  }

  
  const equivLoad = totalUnits + Math.round(totalHours / 3);

  return { totalUnits, totalHours, equivLoad };
}

function getDraft(id) {
  return twsStore.get(id) || null;
}


router.get("/dashboard", (req, res) => {
  const list = Array.from(twsStore.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.render("twsLandingPage", { list });
});


router.get("/create", (req, res) => {
  const id = newId();

  const draft = {
    id,
    createdAt: Date.now(),
    status: "Draft",
    faculty: {
      name: "",
      empId: "",
      dept: "",
      acadYear: "",
      term: "",
      empStatus: "",
    },
    loads: [
      { code: "CE 101", title: "Intro to Engineers", units: 3, lec: 2, lab: 2, sections: 1 },
      { code: "ME 202", title: "Thermodynamics", units: 4, lec: 3, lab: 3, sections: 1 },
      { code: "CH 305", title: "Chemical Engineering", units: 3, lec: 2, lab: 3, sections: 1 },
    ],
  };

  draft.totals = computeTotals(draft.loads);
  twsStore.set(id, draft);

  res.redirect(`/twa/faculty/${id}`);
});


router.get("/faculty/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");
  res.render("twsFacultyInfo", { tws });
});


router.post("/faculty/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");

  tws.faculty = {
    name: req.body.name ?? "",
    empId: req.body.empId ?? "",
    dept: req.body.dept ?? "",
    acadYear: req.body.acadYear ?? "",
    term: req.body.term ?? "",
    empStatus: req.body.empStatus ?? "",
  };

  const action = req.body.action;
  if (action === "next") return res.redirect(`/twa/teaching-load/${tws.id}`);
  return res.redirect(`/twa/faculty/${tws.id}`);
});


router.get("/teaching-load/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");
  res.render("twsTeachingLoad", { tws });
});


router.post("/teaching-load/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");

  
  const codes = [].concat(req.body.code || []);
  const titles = [].concat(req.body.title || []);
  const units = [].concat(req.body.units || []);
  const lecs = [].concat(req.body.lec || []);
  const labs = [].concat(req.body.lab || []);
  const secs = [].concat(req.body.sections || []);

  let rows = codes.map((_, i) => ({
    code: codes[i] ?? "",
    title: titles[i] ?? "",
    units: units[i] ?? 0,
    lec: lecs[i] ?? 0,
    lab: labs[i] ?? 0,
    sections: secs[i] ?? 1,
  }));

  const action = req.body.action;

  if (action === "addRow") {
    rows.push({ code: "", title: "", units: 0, lec: 0, lab: 0, sections: 1 });
  }

  if (action === "removeRow" && rows.length > 1) {
    rows.pop();
  }

  tws.loads = rows;
  tws.totals = computeTotals(rows);

  if (action === "back") return res.redirect(`/twa/faculty/${tws.id}`);
  if (action === "next") return res.redirect(`/twa/summary/${tws.id}`);

  return res.redirect(`/twa/teaching-load/${tws.id}`);
});


router.get("/summary/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");
  res.render("twsSummary", { tws });
});


router.post("/summary/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");

  const action = req.body.action;

  if (action === "edit") return res.redirect(`/twa/faculty/${tws.id}`);

  if (action === "submit") {
    tws.status = "Submitted";
    return res.redirect(`/twa/status/${tws.id}`);
  }

  return res.redirect(`/twa/summary/${tws.id}`);
});


router.get("/status/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");
  res.render("twsSubmissionStatus", { tws });
});


router.get("/approval/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");
  res.render("twsApprovalRouting", { tws });
});

router.post("/approval/:id", (req, res) => {
  const tws = getDraft(req.params.id);
  if (!tws) return res.redirect("/twa/dashboard");

  const action = req.body.action;
  if (action === "approve") tws.status = "Approved";
  if (action === "reject") tws.status = "Rejected";

  return res.redirect("/twa/archived");
});


router.get("/archived", (req, res) => {
  const list = Array.from(twsStore.values()).filter((x) => x.status !== "Draft");
  res.render("twsArchived", { list });
});

export default router;