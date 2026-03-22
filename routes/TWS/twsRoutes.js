import express from "express";
import TWS from "../../models/TWS/tws.js";
import Course from "../../models/TWS/course.js";
import TWSApprovalStatus from "../../models/TWS/twsApprovalStatus.js";
import User from "../../models/user.js";
import mongoose from "mongoose";
import Subject from "../../models/TWS/subject.js";
import { calculateTwsLoadsFromCourses } from "../../utils/twsLoadCalculator.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
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
  hasOverlappingSchedule, validateFacultyNote,
} from "../../utils/twsValidation.js";
import { transitionOrThrow, canTransition, getStepperState } from "../../utils/twsStateMachine.js";
import {
  getNotificationsForUser,
  hideAllNotificationsForUser,
  hideNotificationForUser,
  markNotificationAsRead,
  publishTwsFacultyNoteNotification,
  publishTwsStatusNotification,
  toUserNotificationPayload,
  twsNotificationEmitter,
  userCanSeeTwsNotification,
} from "../../utils/twsNotifications.js";

const router = express.Router();

/* ── User model — user.js exports a schema, not a model ── */
const UserModel = mongoose.models.User || mongoose.model("User", User);

const LOGO_PATH = path.join(process.cwd(), "public", "ATA", "images", "mapua_logo.png");

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

function safeNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function format2(value) {
    return safeNum(value).toFixed(2);
  }

  function truncateText(text, max = 40) {
    const str = String(text || "").trim();
    if (str.length <= max) return str;
    return str.slice(0, max - 3) + "...";
  }

  function toMinutes(timeStr) {
    if (!timeStr) return null;
    const raw = String(timeStr).trim();
    const hasAmPm = /\b(AM|PM)\b/i.test(raw);
    const normalized = hasAmPm ? raw : `${raw} AM`;
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const ampm = String(match[3]).toUpperCase();

    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    return hour * 60 + minute;
  }

  function parseSchedule(item) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const rawDay = String(item?.day || "").trim();
    const rawStart = String(item?.startTime || "").trim();
    const rawEnd = String(item?.endTime || "").trim();
    const rawSlot = String(item?.timeSlot || "").trim();

    let day = rawDay;
    let start = rawStart;
    let end = rawEnd;

    if ((!start || !end) && rawSlot) {
      const match = rawSlot.match(/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(.+?)\s*-\s*(.+)$/i);
      if (match) {
        day = day || String(match[1] || "").trim();
        start = start || String(match[2] || "").trim();
        end = end || String(match[3] || "").trim();
      }
    }

    if (!days.includes(day)) return null;

    const startMin = toMinutes(start);
    const endMin = toMinutes(end);

    if (startMin == null || endMin == null || endMin <= startMin) return null;

    return { day, start, end, startMin, endMin };
  }

  async function embedSignatureImage(pdfDoc, dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
      return null;
    }

    try {
      const base64Part = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      const buffer = Buffer.from(base64Part, "base64");

      if (dataUrl.startsWith("data:image/png")) {
        return await pdfDoc.embedPng(buffer);
      }

      if (
        dataUrl.startsWith("data:image/jpeg") ||
        dataUrl.startsWith("data:image/jpg")
      ) {
        return await pdfDoc.embedJpg(buffer);
      }

      return null;
    } catch (err) {
      console.error("Failed to embed signature image:", err.message);
      return null;
    }
  }

  async function embedLogo(pdfDoc) {
    try {
      if (!fs.existsSync(LOGO_PATH)) return null;
      const bytes = fs.readFileSync(LOGO_PATH);
      return await pdfDoc.embedPng(bytes);
    } catch (err) {
      console.error("Failed to load logo:", err.message);
      return null;
    }
  }

  async function renderTwsPdf(payload) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape approx
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.2, 0.2, 0.2);

  const drawText = (text, x, y, opts = {}) => {
    if (text == null || text === "") return;
    page.drawText(String(text), {
      x,
      y,
      size: opts.size || 9,
      font: opts.bold ? bold : font,
      color: opts.color || black,
    });
  };

  const drawCenteredText = (text, centerX, y, opts = {}) => {
    if (text == null || text === "") return;
    const value = String(text);
    const f = opts.bold ? bold : font;
    const size = opts.size || 9;
    const width = f.widthOfTextAtSize(value, size);
    page.drawText(value, {
      x: centerX - width / 2,
      y,
      size,
      font: f,
      color: opts.color || black,
    });
  };

  const drawRightText = (text, rightX, y, opts = {}) => {
    if (text == null || text === "") return;
    const value = String(text);
    const f = opts.bold ? bold : font;
    const size = opts.size || 9;
    const width = f.widthOfTextAtSize(value, size);
    page.drawText(value, {
      x: rightX - width,
      y,
      size,
      font: f,
      color: opts.color || black,
    });
  };

  const drawLine = (x1, y1, x2, y2, thickness = 1) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color: black,
    });
  };

  const drawRect = (x, y, w, h, fillColor = null, borderWidth = 1) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: black,
      borderWidth,
      color: fillColor || undefined,
    });
  };

  const drawWrappedText = (text, x, y, maxWidth, opts = {}) => {
    if (!text) return;
    const size = opts.size || 8;
    const lineHeight = opts.lineHeight || (size + 2);
    const useBold = !!opts.bold;
    const f = useBold ? bold : font;
    const words = String(text).split(/\s+/);
    let line = "";
    let currentY = y;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const testWidth = f.widthOfTextAtSize(test, size);

      if (testWidth > maxWidth && line) {
        page.drawText(line, {
          x,
          y: currentY,
          size,
          font: f,
          color: opts.color || black,
        });
        currentY -= lineHeight;
        line = word;
      } else {
        line = test;
      }
    }

    if (line) {
      page.drawText(line, {
        x,
        y: currentY,
        size,
        font: f,
        color: opts.color || black,
      });
    }
  };

  const logo = await embedLogo(pdfDoc);

  const leftMargin = 28;
  const rightMargin = 814;
  const topY = 555;

  // Header
  if (logo) {
    page.drawImage(logo, { x: leftMargin, y: 495, width: 50, height: 50 });
  }

  drawText("Mapua Malayan Colleges Mindanao", 80, 532, { size: 12, bold: true });
  drawText("General Douglas MacArthur Highway, Matina, Davao City", 80, 518, { size: 8, color: gray });
  drawText("www.mmcm.edu.ph", 80, 506, { size: 8, color: gray });

  drawRightText("Instructor Schedule", rightMargin, 532, { size: 12, bold: true });
  drawRightText(`${payload.termLabel} | AY ${payload.ayLabel}`, rightMargin, 518, { size: 9, bold: true });

  drawCenteredText(String(payload.facultyName || "INSTRUCTOR").toUpperCase(), 421, 480, {
    size: 12,
    bold: true,
    color: rgb(0.70, 0.16, 0.16),
  });

  // Main layout
  const scheduleX = 28;
  const scheduleY = 145;
  const scheduleW = 560;
  const scheduleH = 315;

  const detailsX = 620;
  const detailsY = 145;
  const detailsW = 195;
  const detailsH = 315;

  drawRect(scheduleX, scheduleY, scheduleW, scheduleH, null, 1);
  drawRect(detailsX, detailsY, detailsW, detailsH, null, 1);

  // Schedule grid
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const times = [
    "7:00", "8:15", "9:30", "10:45", "12:00", "1:15 PM",
    "2:30", "3:45", "5:00", "6:15", "7:30", "8:45"
  ];

  const timeColW = 54;
  const dayColW = (scheduleW - timeColW) / 7;
  const headerH = 24;
  const rowH = (scheduleH - headerH) / 12;

  // Vertical lines
  for (let i = 0; i <= 7; i++) {
    const x = scheduleX + timeColW + i * dayColW;
    if (i < 7) {
      drawLine(x, scheduleY, x, scheduleY + scheduleH, 1);
    }
  }

  drawLine(scheduleX + timeColW, scheduleY, scheduleX + timeColW, scheduleY + scheduleH, 1);

  // Horizontal lines
  drawLine(scheduleX, scheduleY + scheduleH - headerH, scheduleX + scheduleW, scheduleY + scheduleH - headerH, 1);

  for (let i = 1; i <= 12; i++) {
    const y = scheduleY + scheduleH - headerH - i * rowH;
    drawLine(scheduleX, y, scheduleX + scheduleW, y, 1);
  }

  // Day headers
  for (let i = 0; i < days.length; i++) {
    const centerX = scheduleX + timeColW + i * dayColW + dayColW / 2;
    drawCenteredText(days[i], centerX, scheduleY + scheduleH - 16, {
      size: 9,
      bold: true,
    });
  }

  // Time labels
  for (let i = 0; i < times.length; i++) {
    const centerY = scheduleY + scheduleH - headerH - i * rowH - rowH / 2 - 3;
    drawCenteredText(times[i], scheduleX + timeColW / 2, centerY, {
      size: 8,
      bold: true,
    });
  }

  const dayMap = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };

  const colorList = [
    rgb(0.86, 0.93, 0.99),
    rgb(0.86, 0.97, 0.89),
    rgb(0.99, 0.95, 0.78),
    rgb(0.99, 0.91, 0.95),
    rgb(0.93, 0.91, 0.99),
    rgb(1.0, 0.89, 0.90),
  ];

  const keyOrder = [];
  const keyToColor = {};

  for (const item of payload.createdWorkload) {
    const key = `${String(item?.code || "").trim()}|${String(item?.sectionRoom || "").trim()}`;
    if (key && !keyOrder.includes(key)) keyOrder.push(key);
  }

  keyOrder.sort();

  keyOrder.forEach((key, idx) => {
    keyToColor[key] = colorList[idx % colorList.length];
  });

  for (const item of payload.createdWorkload) {
    const parsed = parseSchedule(item);
    if (!parsed) continue;

    const dayIndex = dayMap[parsed.day];
    if (dayIndex == null) continue;

    const startOffset = (parsed.startMin - 420) / 75; // 7:00 AM base
    const endOffset = (parsed.endMin - 420) / 75;

    const rowStart = Math.max(0, startOffset);
    const rowSpan = Math.max(1, endOffset - startOffset);

    const blockX = scheduleX + timeColW + dayIndex * dayColW + 1.5;
    const blockY = scheduleY + scheduleH - headerH - (rowStart + rowSpan) * rowH + 1.5;
    const blockW = dayColW - 3;
    const blockH = rowSpan * rowH - 3;

    const key = `${String(item?.code || "").trim()}|${String(item?.sectionRoom || "").trim()}`;
    const fill = keyToColor[key] || colorList[0];

    page.drawRectangle({
      x: blockX,
      y: blockY,
      width: blockW,
      height: blockH,
      color: fill,
      borderColor: black,
      borderWidth: 1,
    });

    const code = item?.code || "-";
    const sectionRoom = String(item?.sectionRoom || "-").replace(/\s*\|\s*/g, " | ");

    if (blockH < 38) {
      // small block: code + section/room
      drawCenteredText(truncateText(code, 14), blockX + blockW / 2, blockY + blockH - 10, {
        size: 6.0,
        bold: true,
      });
      drawCenteredText(truncateText(sectionRoom, 16), blockX + blockW / 2, blockY + 5, {
        size: 4.8,
      });
    } else {
      // normal block: code + section/room
      drawCenteredText(truncateText(code, 16), blockX + blockW / 2, blockY + blockH - 10, {
        size: 6.4,
        bold: true,
      });
      drawCenteredText(truncateText(sectionRoom, 18), blockX + blockW / 2, blockY + blockH - 21, {
        size: 5.2,
      });
    }
  }

  let detailY = detailsY + detailsH - 40;

  const statRow = (label, value, isBold = false) => {
    drawText(label, detailsX + 10, detailY, { size: 8.5, bold: isBold });
    drawRightText(value, detailsX + detailsW - 10, detailY, { size: 8.5, bold: true });
    detailY -= 14;
  };

  const divider = () => {
    drawLine(detailsX + 8, detailY + 6, detailsX + detailsW - 8, detailY + 6, 1);
    detailY -= 8;
  };

  statRow("Teaching Hours", format2(payload.teachingHours));
  statRow("Advising Hours", format2(payload.advisingHours));
  statRow("Consultation Hours", format2(payload.consultationHours));
  statRow("Committee Works", format2(payload.committeeWorks));
  divider();
  statRow("Total Hours", format2(payload.totalHours), true);
  divider();

  // Reserve space at the bottom for Unit Distribution
  const reservedBottomSpace = 110;
  const detailBottomLimit = detailsY + reservedBottomSpace;

  if (!payload.createdWorkload.length) {
    drawText("No schedule assigned.", detailsX + 10, detailY, { size: 7.5 });
    detailY -= 14;
  } else {
    const sortedWorkload = [...payload.createdWorkload].sort((a, b) => {
      return String(a?.code || "").localeCompare(String(b?.code || ""));
    });

    for (const item of sortedWorkload) {
      const estimatedNeeded = 18;

      if (detailY - estimatedNeeded < detailBottomLimit) break;

      drawText(`${truncateText(item?.code || "-", 16)}`, detailsX + 10, detailY, {
        size: 7.2,
        bold: true,
      });

      drawRightText(format2(item?.units || 0), detailsX + detailsW - 10, detailY, {
        size: 7.2,
        bold: true,
      });

      detailY -= 8;

      const lineText = `${item?.day || ""} ${item?.startTime || ""} - ${item?.endTime || ""} | ${item?.sectionRoom || "-"}`;

      drawWrappedText(
        lineText,
        detailsX + 10,
        detailY,
        detailsW - 20,
        { size: 5.8, lineHeight: 6.5 }
      );

      detailY -= 11;

      drawLine(detailsX + 8, detailY + 3, detailsX + detailsW - 8, detailY + 3, 0.5);
      detailY -= 4;
    }
  }

  divider();
  drawCenteredText("Unit Distribution", detailsX + detailsW / 2, detailY + 4, {
    size: 9,
    bold: true,
  });
  detailY -= 10;

  const compactStatRow = (label, value, isBold = false) => {
    drawText(label, detailsX + 10, detailY, { size: 8, bold: isBold });
    drawRightText(value, detailsX + detailsW - 10, detailY, { size: 8, bold: true });
    detailY -= 11;
  };

  compactStatRow("Academic", format2(payload.academicUnits));
  compactStatRow("PE", format2(payload.peUnits));
  compactStatRow("Values", format2(payload.valuesUnits));
  compactStatRow("NSTP", format2(payload.nstpUnits));
  compactStatRow("Deloading", format2(payload.deloadingUnits));

  drawLine(detailsX + 8, detailY + 5, detailsX + detailsW - 8, detailY + 5, 1);
  detailY -= 7;

  compactStatRow("Total Units", format2(payload.totalUnits), true);

  // Signatures
  const sigTopY = 62;
  const sigWidth = 210;
  const sigHeight = 40;

  const sigCols = [
    { x: 60, label: "Dean", image: payload.deanSignatureImage, name: payload.deanSignerName || payload.deanName || "" },
    { x: 315, label: "Program Chair", image: payload.programChairSignatureImage, name: payload.programChairSignerName || payload.programChairName || "" },
    { x: 570, label: "Instructor", image: payload.facultySignatureImage, name: payload.facultySignerName || payload.facultyName || "Instructor" },
  ];

  for (const sig of sigCols) {
    const img = await embedSignatureImage(pdfDoc, sig.image);

    if (img) {
      const scale = Math.min(120 / img.width, 24 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      page.drawImage(img, {
        x: sig.x + (sigWidth - w) / 2,
        y: sigTopY + 18,
        width: w,
        height: h,
      });
    }

    drawLine(sig.x + 15, sigTopY + 14, sig.x + sigWidth - 15, sigTopY + 14, 1);
    drawCenteredText(sig.name || "", sig.x + sigWidth / 2, sigTopY + 4, {
      size: 8,
      bold: true,
    });
    drawCenteredText(sig.label, sig.x + sigWidth / 2, sigTopY - 8, {
      size: 8,
      color: gray,
    });
  }

  drawRightText(
    `Generated on ${payload.generatedAt}`,
    rightMargin,
    18,
    { size: 7.5, color: gray }
  );

  return pdfDoc.save();
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

function isSelfAssignedProgramChairTws(tws, user) {
  const role = getSessionUserRole(user);
  if (role !== "Program-Chair") return false;

  const userEmpId = String(user?.employeeId || "").trim();
  const userEmail = normalizeEmail(user?.email || "");

  const assignedEmpId = String(
    tws?.assignedFacultyId || tws?.faculty?.empId || ""
  ).trim();

  const assignedEmail = normalizeEmail(
    tws?.assignedFacultyEmail || tws?.faculty?.email || ""
  );

  return (
    (userEmpId && assignedEmpId && userEmpId === assignedEmpId) ||
    (userEmail && assignedEmail && userEmail === assignedEmail)
  );
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

function buildScheduleCandidateFromInput(body) {
  return {
    day: String(body?.day || "").trim(),
    startTime: String(body?.startTime || "").trim(),
    endTime: String(body?.endTime || "").trim(),
  };
}

function describeCourseSchedule(course) {
  const code = String(course?.courseCode || "").trim() || "another subject";
  const day = String(course?.day || "").trim() || "Unknown day";
  const start = String(course?.startTime || "").trim() || "Unknown start";
  const end = String(course?.endTime || "").trim() || "Unknown end";
  return `${code} (${day} ${start} - ${end})`;
}

async function findScheduleConflictInTws(twsId, candidate, options = {}) {
  const courses = await Course.find({ twsID: twsId }).lean();
  const excludeId = String(options?.excludeCourseId || "").trim();

  const conflict = courses.find((course) => {
    if (excludeId && String(course?._id || "") === excludeId) return false;
    return hasOverlappingSchedule(course, candidate);
  });

  return conflict || null;
}

function createRecipientScope() {
  return {
    userIds: new Set(),
    emails: new Set(),
    empIds: new Set(),
  };
}

function addRecipientFromUser(scope, user) {
  if (!scope || !user) return;
  if (user?._id) scope.userIds.add(String(user._id));

  const email = normalizeEmail(user?.email || "");
  if (email) scope.emails.add(email);

  const empId = String(user?.employeeId || "").trim();
  if (empId) scope.empIds.add(empId);
}

function addFacultyFallbackRecipient(scope, tws) {
  if (!scope || !tws) return;

  const facultyEmail = normalizeEmail(
    tws?.assignedFacultyEmail || tws?.faculty?.email || ""
  );
  const facultyEmpId = String(
    tws?.assignedFacultyId || tws?.faculty?.empId || ""
  ).trim();

  if (facultyEmail) scope.emails.add(facultyEmail);
  if (facultyEmpId) scope.empIds.add(facultyEmpId);
}

function toRecipientPayload(scope) {
  return {
    userIds: Array.from(scope.userIds),
    emails: Array.from(scope.emails),
    empIds: Array.from(scope.empIds),
  };
}

async function resolveAssignedFacultyUser(tws) {
  const facultyEmail = normalizeEmail(
    tws?.assignedFacultyEmail || tws?.faculty?.email || ""
  );
  const facultyEmpId = String(
    tws?.assignedFacultyId || tws?.faculty?.empId || ""
  ).trim();

  const filters = [];
  if (facultyEmail) filters.push({ email: facultyEmail });
  if (facultyEmpId) filters.push({ employeeId: facultyEmpId });
  if (!filters.length) return null;

  return UserModel.findOne({ $or: filters }).lean();
}

async function resolveProgramChairUsersByTws(tws) {
  const roleFilter = { role: "Program-Chair" };
  const program = String(tws?.faculty?.program || "").trim();
  const dept = String(tws?.faculty?.dept || "").trim();

  if (program) {
    roleFilter.program = program;
  } else if (dept) {
    roleFilter.department = dept;
  }

  return UserModel.find(roleFilter).lean();
}

async function resolveDeanUsersByTws(tws) {
  const dept = String(tws?.faculty?.dept || "").trim();
  const roleFilter = { role: "Dean" };

  if (dept) {
    roleFilter.department = dept;
  }

  return UserModel.find(roleFilter).lean();
}

async function buildStatusNotificationScope(tws, toStatus) {
  const scope = createRecipientScope();

  const [facultyUser, programChairUsers, deanUsers] = await Promise.all([
    resolveAssignedFacultyUser(tws),
    resolveProgramChairUsersByTws(tws),
    resolveDeanUsersByTws(tws),
  ]);

  if (String(tws?.userID || "").trim()) {
    scope.userIds.add(String(tws.userID));
  }

  addRecipientFromUser(scope, facultyUser);
  addFacultyFallbackRecipient(scope, tws);
  (programChairUsers || []).forEach((user) => addRecipientFromUser(scope, user));
  (deanUsers || []).forEach((user) => addRecipientFromUser(scope, user));

  if (toStatus === "Sent to Faculty") {
    const facultyOnlyScope = createRecipientScope();
    addRecipientFromUser(facultyOnlyScope, facultyUser);
    addFacultyFallbackRecipient(facultyOnlyScope, tws);
    return {
      audienceRoles: ["Professor"],
      recipients: toRecipientPayload(facultyOnlyScope),
    };
  }

  if (toStatus === "Faculty Approved") {
    const chairScope = createRecipientScope();
    if (String(tws?.userID || "").trim()) {
      chairScope.userIds.add(String(tws.userID));
    }
    (programChairUsers || []).forEach((user) => addRecipientFromUser(chairScope, user));
    return {
      audienceRoles: ["Program-Chair"],
      recipients: toRecipientPayload(chairScope),
    };
  }

  if (toStatus === "Sent to Dean") {
    const deanScope = createRecipientScope();
    (deanUsers || []).forEach((user) => addRecipientFromUser(deanScope, user));
    return {
      audienceRoles: ["Dean"],
      recipients: toRecipientPayload(deanScope),
    };
  }

  if (toStatus === "Returned to Program Chair") {
    const chairScope = createRecipientScope();
    if (String(tws?.userID || "").trim()) {
      chairScope.userIds.add(String(tws.userID));
    }
    (programChairUsers || []).forEach((user) => addRecipientFromUser(chairScope, user));
    return {
      audienceRoles: ["Program-Chair"],
      recipients: toRecipientPayload(chairScope),
    };
  }

  if (["Approved", "Rejected", "Archived"].includes(toStatus)) {
    return {
      audienceRoles: ["Program-Chair", "Dean", "Professor"],
      recipients: toRecipientPayload(scope),
    };
  }

  return {
    audienceRoles: ["Program-Chair", "Dean", "Professor"],
    recipients: toRecipientPayload(scope),
  };
}

async function buildFacultyNoteNotificationScope(tws, isReturn) {
  const scope = createRecipientScope();

  if (String(tws?.userID || "").trim()) {
    scope.userIds.add(String(tws.userID));
  }

  const [programChairUsers, deanUsers] = await Promise.all([
    resolveProgramChairUsersByTws(tws),
    resolveDeanUsersByTws(tws),
  ]);

  (programChairUsers || []).forEach((user) => addRecipientFromUser(scope, user));
  if (isReturn) {
    (deanUsers || []).forEach((user) => addRecipientFromUser(scope, user));
  }

  return {
    audienceRoles: isReturn ? ["Program-Chair", "Dean"] : ["Program-Chair"],
    recipients: toRecipientPayload(scope),
  };
}

async function notifyStatusUpdateIfNeeded({ tws, previousStatus, actor }) {
  const currentStatus = String(tws?.status || "");
  if (!previousStatus || !currentStatus || previousStatus === currentStatus) return;

  const { audienceRoles, recipients } = await buildStatusNotificationScope(tws, currentStatus);

  await publishTwsStatusNotification({
    tws,
    fromStatus: previousStatus,
    toStatus: currentStatus,
    actor,
    audienceRoles,
    recipients,
  });
}

/* ======================================================
   NOTIFICATIONS
====================================================== */
router.get(
  "/notifications",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query?.limit || 12);
    const notifications = await getNotificationsForUser(req.twsUser, { limit });
    return res.json({ notifications });
  })
);

router.post(
  "/notifications/:id/read",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const notification = await markNotificationAsRead(req.params.id, req.twsUser);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    return res.json({ success: true, notification });
  })
);

router.post(
  "/notifications/:id/remove",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const notification = await hideNotificationForUser(req.params.id, req.twsUser);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    return res.json({ success: true, notificationId: String(notification.id || req.params.id) });
  })
);

router.post(
  "/notifications/remove-all",
  requireLoggedIn,
  asyncHandler(async (req, res) => {
    const removedCount = await hideAllNotificationsForUser(req.twsUser);
    return res.json({ success: true, removedCount });
  })
);

router.get("/notifications/stream", requireLoggedIn, async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const initial = await getNotificationsForUser(req.twsUser, { limit: 8 });
    res.write(`event: bootstrap\ndata:${JSON.stringify(initial)}\n\n`);

    const onNotification = (notificationDoc) => {
      if (!userCanSeeTwsNotification(notificationDoc, req.twsUser)) return;

      const payload = toUserNotificationPayload(notificationDoc, req.twsUser);
      res.write(`event: notification\ndata:${JSON.stringify(payload)}\n\n`);
    };

    twsNotificationEmitter.on("notification", onNotification);

    const keepAlive = setInterval(() => {
      res.write(`: keep-alive ${Date.now()}\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      twsNotificationEmitter.off("notification", onNotification);
    });
  } catch (error) {
    console.error("TWS notification stream error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: "Unable to start notification stream." });
    }
    return res.end();
  }
});

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
    const errorMessage = req.query?.error ? String(req.query.error) : "";

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
      errorMessage,
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
    const scheduleCandidate = buildScheduleCandidateFromInput({ day, startTime, endTime });

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

    if (exists) {
      const message = `Subject ${code} is already added to this workload.`;
      return res.redirect(`/tws/create-teaching-workload/${tws._id}?error=${encodeURIComponent(message)}`);
    }

    const conflict = await findScheduleConflictInTws(tws._id, scheduleCandidate);
    if (conflict) {
      const message = `Schedule conflict detected with ${describeCourseSchedule(conflict)}.`;
      return res.redirect(`/tws/create-teaching-workload/${tws._id}?error=${encodeURIComponent(message)}`);
    }

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
    const from = String(req.query?.from || req.body?.from || "").trim().toLowerCase();

    const existingCourse = await Course.findOne({
      twsID: tws._id,
      courseCode: code,
    });

    if (!existingCourse) {
      return res.status(404).send("Course entry not found for this TWS.");
    }

    const scheduleCandidate = buildScheduleCandidateFromInput({ day, startTime, endTime });
    const conflict = await findScheduleConflictInTws(tws._id, scheduleCandidate, {
      excludeCourseId: existingCourse._id,
    });

    if (conflict) {
      const message = `Schedule conflict detected with ${describeCourseSchedule(conflict)}.`;
      if (from === "created") {
        return res.redirect(`/tws/created-teaching-workload/${tws._id}?error=${encodeURIComponent(message)}`);
      }
      return res.redirect(`/tws/create-teaching-workload/${tws._id}?error=${encodeURIComponent(message)}`);
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
    const errorMessage = req.query?.error ? String(req.query.error) : "";
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
      errorMessage,
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
    const noteSaved = req.query?.noteSaved === "1";
    const from = String(req.query?.from || "").toLowerCase();
    const viewerRole = getSessionUserRole(req.twsUser);
    const viewerId = String(getSessionUserId(req.twsUser) || "");
    const ownerId = String(tws.userID || "");
    const viewerDept = req.twsUser?.department || "";
    const twsDept = tws.faculty?.dept || "";
    const selfAssignedProgramChair = isSelfAssignedProgramChairTws(tws, req.twsUser);

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
      noteSaved,
      canManageAsChair,
      viewBackUrl,
      selfAssignedProgramChair,
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
      const previousStatus = tws.status;
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

      tws.facultyNotes = "";
      tws.facultyNotesUpdatedAt = null;
      tws.facultyNotesUpdatedBy = "";

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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

      return res.redirect(doneRedirect);
    }

    if (action === "sendToDean") {
      const viewerRole = getSessionUserRole(req.twsUser);
      const selfAssignedProgramChair = isSelfAssignedProgramChairTws(tws, req.twsUser);
      if (viewerRole !== "Program-Chair") {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Only Program Chair can endorse TWS to Dean.")}`);
      }

      if (selfAssignedProgramChair) {
        if (!["Draft", "Returned to Program Chair", "Rejected"].includes(tws.status)) {
          return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Self-assigned Program Chair TWS can only be sent to Dean from Draft, Returned to Program Chair, or Rejected status.")}`);
        }
      } else {
        if (!["Sent to Faculty", "Faculty Approved"].includes(tws.status)) {
          return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("TWS must be in 'Sent to Faculty' or 'Faculty Approved' status before endorsing to Dean.")}`);
        }

        if (!tws.facultySigned || !tws.facultySignatureImage) {
          return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Faculty signature is required before endorsing to Dean.")}`);
        }
      }

      const liveUser = await UserModel.findById(getSessionUserId(req.twsUser)).lean();
      const signatureImage = liveUser?.signatureImage || "";
      if (!signatureImage) {
        return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent("Program Chair must set up e-signature before sending to Dean.")}`);
      }

      if (!selfAssignedProgramChair) {
        try { transitionOrThrow(tws.status, "Sent to Dean"); } catch (e) {
          return res.redirect(`/tws/summary/${tws._id}?error=${encodeURIComponent(e.message)}`);
        }
      }

      const previousStatus = tws.status;
      tws.status = "Sent to Dean";
      tws.sentToDeanAt = new Date();

      if (selfAssignedProgramChair) {
        tws.facultySigned = true;
        tws.facultySignedAt = new Date();
        tws.facultySignatureImage = signatureImage;
        tws.facultySignerName = buildFacultyName(liveUser || req.twsUser);
        tws.facultySignerEmpId = req.twsUser?.employeeId || "";
        tws.facultySignerEmail = normalizeEmail(req.twsUser?.email || "");
      }

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
          remarks: selfAssignedProgramChair
            ? "Self-assigned Program Chair TWS endorsed directly to Dean"
            : "Endorsed to Dean by Program Chair",
          approvedBy: "",
          approvalDate: null,
        },
        { upsert: true, returnDocument: "after" }
      );

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

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

    const createdWorkload = Array.isArray(twsView?.createdWorkload) ? twsView.createdWorkload : [];

    const teachingHours = safeNum(twsView?.teachingHours);
    const advisingHours = safeNum(twsView?.advisingHours);
    const consultationHours = safeNum(twsView?.consultationHours);
    const committeeWorks = safeNum(twsView?.committeeWorks);
    const computedHours = teachingHours + advisingHours + consultationHours + committeeWorks;
    const totalHours = safeNum(
      twsView?.totalHours != null ? twsView.totalHours : (twsView?.totals?.totalHours ?? computedHours)
    );

    const computedUnits = createdWorkload.reduce((acc, item) => acc + safeNum(item?.units), 0);
    const totalUnits = safeNum(
      twsView?.totalUnits != null ? twsView.totalUnits : (twsView?.totals?.totalUnits ?? computedUnits)
    );

    const payload = {
      facultyName: String(twsView?.faculty?.name || twsView?.facultySignerName || "").trim(),
      termLabel: String(twsView?.term || twsView?.faculty?.term || "N/A").trim(),
      ayLabel: String(twsView?.schoolYear || twsView?.faculty?.acadYear || "N/A").trim(),

      teachingHours,
      advisingHours,
      consultationHours,
      committeeWorks,
      totalHours,

      academicUnits: safeNum(twsView?.academicUnits),
      peUnits: safeNum(twsView?.peUnits),
      nstpUnits: safeNum(twsView?.nstpUnits),
      valuesUnits: safeNum(twsView?.valuesUnits),
      deloadingUnits: safeNum(twsView?.deloadingUnits),
      totalUnits,

      createdWorkload,

      deanName: twsView?.deanName || "",
      deanSignerName: twsView?.deanSignerName || "",
      deanSignatureImage: twsView?.deanSignatureImage || "",

      programChairName: twsView?.programChairName || "",
      programChairSignerName: twsView?.programChairSignerName || "",
      programChairSignatureImage: twsView?.programChairSignatureImage || "",

      facultySignerName: twsView?.facultySignerName || "",
      facultySignatureImage: twsView?.facultySignatureImage || "",

      generatedAt: new Date().toLocaleString("en-US", {
        timeZone: "Asia/Manila",
      }),
    };

    const pdfBytes = await renderTwsPdf(payload);
    const pdfBuffer = Buffer.from(pdfBytes);

    tws.pdf = pdfBuffer;
    await tws.save();

    const filename = buildPdfFilename(tws);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
  })
);

/* ======================================================
   FACULTY SIGNATURE
====================================================== */
router.post(
  "/faculty-note/:id",
  requireProfessor,
  asyncHandler(async (req, res) => {
    const tws = await TWS.findById(req.params.id);
    if (!tws) return res.status(404).send("TWS not found.");

    const isAssigned = facultyMatchesTws(tws, req.twsUser);
    if (!isAssigned) {
      return res.status(403).send("Forbidden: this TWS is not assigned to you.");
    }

    if (!["Sent to Faculty", "Faculty Approved"].includes(tws.status)) {
      return res.status(400).send("Faculty notes can only be updated while this TWS is under faculty review.");
    }

    const { valid, errors, note } = validateFacultyNote(req.body?.remarks || "");
    if (!valid) {
      return res.status(400).send(`Validation failed: ${errors.join(" ")}`);
    }

    tws.facultyNotes = note;
    tws.facultyNotesUpdatedAt = new Date();
    tws.facultyNotesUpdatedBy = buildFacultyName(req.twsUser) || normalizeEmail(req.twsUser?.email || "");
    await tws.save();

    if (note) {
      const noteScope = await buildFacultyNoteNotificationScope(tws, false);
      await publishTwsFacultyNoteNotification({
        tws,
        actor: req.twsUser,
        noteText: note,
        isReturn: false,
        audienceRoles: noteScope.audienceRoles,
        recipients: noteScope.recipients,
      });
    }

    return res.redirect(`/tws/summary/${tws._id}?noteSaved=1`);
  })
);

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

    try {
      transitionOrThrow(tws.status, "Faculty Approved");
    } catch (e) {
      return res.status(400).send(e.message);
    }

    const previousStatus = tws.status;
    tws.status = "Faculty Approved";
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

    await notifyStatusUpdateIfNeeded({
      tws,
      previousStatus,
      actor: req.twsUser,
    });

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

    if (!["Sent to Faculty", "Faculty Approved"].includes(tws.status)) {
      return res.status(400).send("This TWS is not currently assigned for faculty action.");
    }

    const { valid, errors, note } = validateFacultyNote(req.body?.remarks || "");
    if (!valid) {
      return res.status(400).send(`Validation failed: ${errors.join(" ")}`);
    }

    try {
      transitionOrThrow(tws.status, "Returned to Program Chair");
    } catch (e) {
      return res.status(400).send(e.message);
    }

    const previousStatus = tws.status;
    tws.status = "Returned to Program Chair";
    tws.facultyNotes = note;
    tws.facultyNotesUpdatedAt = note ? new Date() : null;
    tws.facultyNotesUpdatedBy = note
      ? buildFacultyName(req.twsUser) || normalizeEmail(req.twsUser?.email || "")
      : "";

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
          remarks: note
            ? `Returned by faculty for revision. Notes: ${note}`
            : "Returned by faculty for revision.",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    if (note) {
      const noteScope = await buildFacultyNoteNotificationScope(tws, true);
      await publishTwsFacultyNoteNotification({
        tws,
        actor: req.twsUser,
        noteText: note,
        isReturn: true,
        audienceRoles: noteScope.audienceRoles,
        recipients: noteScope.recipients,
      });
    }

    await notifyStatusUpdateIfNeeded({
      tws,
      previousStatus,
      actor: req.twsUser,
    });

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

    try {
      transitionOrThrow(tws.status, "Archived");
    } catch (e) {
      return res.status(400).send(e.message);
    }

    if (!tws.facultySigned || !tws.programChairSigned || !tws.deanSigned) {
      return res.status(400).send("Cannot archive: required signatures are incomplete.");
    }

    const previousStatus = tws.status;
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

    await notifyStatusUpdateIfNeeded({
      tws,
      previousStatus,
      actor: req.twsUser,
    });
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

      const previousStatus = tws.status;
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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

      return res.redirect("/tws/dean");
    }

    if (action === "reject") {
      try { transitionOrThrow(tws.status, "Rejected"); } catch (e) {
        return res.status(400).send(e.message);
      }
      const previousStatus = tws.status;
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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

      return res.redirect("/tws/dean");
    }

    if (action === "return") {
      try { transitionOrThrow(tws.status, "Returned to Program Chair"); } catch (e) {
        return res.status(400).send(e.message);
      }
      const previousStatus = tws.status;
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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

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

      const previousStatus = tws.status;
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

      tws.facultyNotes = "";
      tws.facultyNotesUpdatedAt = null;
      tws.facultyNotesUpdatedBy = "";

      await tws.save();

      await TWSApprovalStatus.findOneAndUpdate(
        { twsID: tws._id },
        { status: "Not Submitted", remarks: "Sent to Faculty by Program Chair", approvedBy: "", approvalDate: null },
        { upsert: true, returnDocument: "after" }
      );

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

      return res.redirect("/tws/program-chair");
    }

    if (action === "send" || action === "sendToDean") {
      if (!["Sent to Faculty", "Faculty Approved"].includes(tws.status)) {
        const msg = "TWS must be in 'Sent to Faculty' or 'Faculty Approved' status before sending to Dean.";
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

      const previousStatus = tws.status;
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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

      return res.redirect("/tws/program-chair");
    }

    if (action === "return") {
      if (!canTransition(tws.status, "Draft")) {
        const msg = `Cannot return to Draft from status "${tws.status}".`;
        return res.redirect(`/tws/program-chair?error=${encodeURIComponent(msg)}`);
      }
      const previousStatus = tws.status;
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

      await notifyStatusUpdateIfNeeded({
        tws,
        previousStatus,
        actor: req.twsUser,
      });

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
