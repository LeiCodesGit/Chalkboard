/**
 * TWS Helpers — shared utility functions extracted from twsRoutes.js
 */

export function getSessionUser(req) {
  return req.session?.user || req.session?.account || req.user || null;
}

export function getSessionUserId(user) {
  return user?._id || user?.id || user?.userId || null;
}

export function getSessionUserRole(user) {
  return user?.role || user?.userRole || null;
}

export function buildFacultyName(user) {
  const parts = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean);
  return parts.join(" ").trim();
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function facultyMatchesTws(tws, user) {
  const empId = String(user?.employeeId || "").trim();
  const email = normalizeEmail(user?.email || "");
  const name = buildFacultyName(user);

  return (
    (empId && tws?.assignedFacultyId === empId) ||
    (email && normalizeEmail(tws?.assignedFacultyEmail) === email) ||
    (empId && tws?.faculty?.empId === empId) ||
    (email && normalizeEmail(tws?.faculty?.email) === email) ||
    (!!name && tws?.assignedFacultyName === name) ||
    (!!name && tws?.faculty?.name === name)
  );
}

export function defaultFacultyFromUser(user) {
  return {
    name: buildFacultyName(user),
    empId: user?.employeeId || "",
    email: normalizeEmail(user?.email || ""),
    dept: user?.department || "",
    acadYear: "",
    term: "",
    empStatus: user?.employmentType || "",
  };
}

export function computeTotals(loads = []) {
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

  return { totalUnits, totalHours, equivLoad: totalHours };
}

export function normalizeLoads(loads) {
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

function buildDisplayTimeSlot(course) {
  const day = String(course.day || "").trim();
  const startTime = String(course.startTime || "").trim();
  const endTime = String(course.endTime || "").trim();

  if (day && startTime && endTime) {
    return `${day} ${startTime} - ${endTime}`;
  }

  if (startTime && endTime) {
    return `${startTime} - ${endTime}`;
  }

  return course.timeSlot || course.time || "";
}

export function normalizeCourseForView(c) {
  return {
    code: c.courseCode || "",
    title: c.courseTitle || c.description || "",
    units: Number(c.units || 0),
    day: c.day || "",
    startTime: c.startTime || "",
    endTime: c.endTime || "",
    timeSlot: buildDisplayTimeSlot(c),
    sectionRoom:
      c.sectionRoom || [c.section, c.designatedRoom].filter(Boolean).join(" | "),
  };
}

export function normalizeTwsForView(twsDoc, courses = [], approval = null) {
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

export function approverLabel(user) {
  const name = buildFacultyName(user);
  return name || user?.email || "Dean";
}

export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}