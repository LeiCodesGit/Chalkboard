import crypto from "crypto";

const db = {
  tws: new Map(), 
};

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function calcTotals(loadRows = []) {
  const totalUnits = loadRows.reduce((s, r) => s + (Number(r.units) || 0), 0);
  const totalLec = loadRows.reduce((s, r) => s + (Number(r.lecHours) || 0), 0);
  const totalLab = loadRows.reduce((s, r) => s + (Number(r.labHours) || 0), 0);

  const equivalentLoad = totalUnits + totalLec + totalLab;

  return {
    totalUnits,
    totalHours: { lec: totalLec, lab: totalLab },
    equivalentLoad,
    equivalentNonTeachingLoad: 0,
  };
}

export function createDraft() {
  const id = newId();

  const record = {
    id,
    academicYear: "2025 - 2026",
    term: "1st",
    dateCreated: new Date().toLocaleDateString("en-US"),
    status: "Draft", 
    faculty: {
      name: "",
      employeeId: "",
      department: "",
      academicYear: "2025 - 2026",
      term: "1st",
      employmentStatus: "",
    },
    teachingLoad: [
      { code: "CE 101", title: "Intro to Engineers", units: 3, lecHours: 2, labHours: 2, sections: 1 },
      { code: "ME 202", title: "Thermodynamics", units: 4, lecHours: 3, labHours: 3, sections: 1 },
      { code: "CH 305", title: "Chemical Engineering", units: 3, lecHours: 2, labHours: 3, sections: 1 },
    ],
    approval: {
      approvedBy: "DEAN",
      signature: "",
      date: "",
      decision: "Pending", 
    },
  };

  db.tws.set(id, record);
  return record;
}

export function getAll() {
  return Array.from(db.tws.values());
}

export function getById(id) {
  return db.tws.get(id) || null;
}

export function updateFaculty(id, faculty) {
  const rec = getById(id);
  if (!rec) return null;
  rec.faculty = { ...rec.faculty, ...faculty };
  return rec;
}

export function addLoadRow(id) {
  const rec = getById(id);
  if (!rec) return null;
  rec.teachingLoad.push({ code: "", title: "", units: 0, lecHours: 0, labHours: 0, sections: 1 });
  return rec;
}

export function removeLoadRow(id) {
  const rec = getById(id);
  if (!rec) return null;
  if (rec.teachingLoad.length > 1) rec.teachingLoad.pop();
  return rec;
}

export function updateLoadRows(id, rows) {
  const rec = getById(id);
  if (!rec) return null;
  rec.teachingLoad = rows;
  return rec;
}

export function submitTws(id) {
  const rec = getById(id);
  if (!rec) return null;
  rec.status = "Submitted";
  return rec;
}

export function setApproval(id, decision) {
  const rec = getById(id);
  if (!rec) return null;
  rec.approval.decision = decision;
  rec.status = decision === "Approved" ? "Approved" : "Rejected";
  rec.approval.date = new Date().toLocaleDateString("en-US");
  return rec;
}

export function getTotals(id) {
  const rec = getById(id);
  if (!rec) return null;
  return calcTotals(rec.teachingLoad);
}

export function getArchived() {
  return getAll().filter((r) => r.status === "Approved");
}