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
  const fullName = parts.join(" ").trim();
  if (fullName) return fullName;

  // Fallback for session/user payloads that store a single combined name.
  return String(user?.name || user?.fullName || user?.displayName || "").trim();
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

function normalizeCourseForView(c) {
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

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const raw = String(timeStr).trim();

  // Accept both "7:00 AM" and "7:00" formats.
  const withPeriod = /\b(AM|PM)\b/i.test(raw) ? raw : `${raw} AM`;
  const match = withPeriod.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = String(match[3]).toUpperCase();

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function extractStartEnd(course) {
  const start = String(course?.startTime || "").trim();
  const end = String(course?.endTime || "").trim();
  if (start && end) return { start, end };

  const slot = String(course?.timeSlot || "").trim();
  if (!slot) return { start: "", end: "" };

  const match = slot.match(/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(.+?)\s*-\s*(.+)$/i);
  if (!match) return { start: "", end: "" };

  return {
    start: String(match[2] || "").trim(),
    end: String(match[3] || "").trim(),
  };
}

function classifyUnitBucket(course) {
  const text = `${course?.code || ""} ${course?.title || ""}`.toLowerCase();

  if (text.includes("nstp")) return "nstp";
  if (text.includes("physical education") || /(^|\s)pe\d*(\s|$)/i.test(text)) return "pe";
  if (text.includes("values")) return "values";

  return "academic";
}

function computeDerivedMetrics(courses, tws) {
  const hasCourses = Array.isArray(courses) && courses.length > 0;
  const advisingHours = round2(tws?.advisingHours || 0);
  const consultationHours = round2(tws?.consultationHours || 0);
  const committeeWorks = round2(tws?.committeeWorks || 0);
  const deloadingUnits = round2(tws?.deloadingUnits || 0);

  if (!hasCourses) {
    const fallbackTotals = tws?.totals || { totalUnits: 0, totalHours: 0, equivLoad: 0 };
    return {
      totals: {
        totalUnits: round2(fallbackTotals.totalUnits),
        totalHours: round2(fallbackTotals.totalHours),
        equivLoad: round2(fallbackTotals.equivLoad),
      },
      teachingHours: round2(tws?.teachingHours || fallbackTotals.totalHours || 0),
      advisingHours,
      consultationHours,
      committeeWorks,
      totalHours: round2(tws?.totalHours || fallbackTotals.totalHours || 0),
      academicUnits: round2(tws?.academicUnits || fallbackTotals.totalUnits || 0),
      peUnits: round2(tws?.peUnits || 0),
      valuesUnits: round2(tws?.valuesUnits || 0),
      nstpUnits: round2(tws?.nstpUnits || 0),
      deloadingUnits,
      totalUnits: round2(tws?.totalUnits || fallbackTotals.totalUnits || 0),
    };
  }

  let teachingMinutes = 0;
  let academicUnits = 0;
  let peUnits = 0;
  let valuesUnits = 0;
  let nstpUnits = 0;

  courses.forEach((course) => {
    const units = round2(course?.units || 0);
    const bucket = classifyUnitBucket(course);

    if (bucket === "academic") academicUnits += units;
    else if (bucket === "pe") peUnits += units;
    else if (bucket === "values") valuesUnits += units;
    else if (bucket === "nstp") nstpUnits += units;

    const { start, end } = extractStartEnd(course);
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (startMin !== null && endMin !== null && endMin > startMin) {
      teachingMinutes += endMin - startMin;
    }
  });

  const teachingHours = round2(teachingMinutes / 60);
  const totalHours = round2(teachingHours + advisingHours + consultationHours + committeeWorks);
  const totalUnits = round2(academicUnits + peUnits + valuesUnits + nstpUnits);

  return {
    totals: {
      totalUnits,
      totalHours: teachingHours,
      equivLoad: teachingHours,
    },
    teachingHours,
    advisingHours,
    consultationHours,
    committeeWorks,
    totalHours,
    academicUnits: round2(academicUnits),
    peUnits: round2(peUnits),
    valuesUnits: round2(valuesUnits),
    nstpUnits: round2(nstpUnits),
    deloadingUnits,
    totalUnits,
  };
}

export function normalizeTwsForView(twsDoc, courses = [], approval = null) {
  const tws = typeof twsDoc.toObject === "function" ? twsDoc.toObject() : twsDoc;
  const createdWorkload = courses.map(normalizeCourseForView);
  const metrics = computeDerivedMetrics(createdWorkload, tws);

  return {
    ...tws,
    id: String(tws._id),
    faculty: tws.faculty || {},
    loads: Array.isArray(tws.loads) ? tws.loads : [],
    totals: metrics.totals,
    createdWorkload,
    teachingHours: metrics.teachingHours,
    advisingHours: metrics.advisingHours,
    consultationHours: metrics.consultationHours,
    committeeWorks: metrics.committeeWorks,
    totalHours: metrics.totalHours,
    academicUnits: metrics.academicUnits,
    peUnits: metrics.peUnits,
    valuesUnits: metrics.valuesUnits,
    nstpUnits: metrics.nstpUnits,
    deloadingUnits: metrics.deloadingUnits,
    totalUnits: metrics.totalUnits,
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