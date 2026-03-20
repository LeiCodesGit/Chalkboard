import { EventEmitter } from "events";
import TWSNotification from "../models/TWS/twsNotification.js";
import {
  buildFacultyName,
  getSessionUserId,
  getSessionUserRole,
  normalizeEmail,
} from "./twsHelpers.js";

export const twsNotificationEmitter = new EventEmitter();
twsNotificationEmitter.setMaxListeners(250);

function viewerIdForNotification(user) {
  return String(getSessionUserId(user) || normalizeEmail(user?.email || "") || "").trim();
}

function actorLabel(actor) {
  const name = buildFacultyName(actor);
  if (name) return name;

  const email = normalizeEmail(actor?.email || "");
  if (email) return email;

  return "System";
}

function baseAudienceFromTws(tws) {
  return {
    audienceRoles: ["Program-Chair", "Dean", "Professor"],
    department: String(tws?.faculty?.dept || "").trim(),
    program: String(tws?.faculty?.program || "").trim(),
    facultyEmail: normalizeEmail(tws?.assignedFacultyEmail || tws?.faculty?.email || ""),
    facultyEmpId: String(tws?.assignedFacultyId || tws?.faculty?.empId || "").trim(),
  };
}

function normalizeRecipientScope(recipients = {}) {
  const userIds = Array.isArray(recipients.userIds) ? recipients.userIds : [];
  const emails = Array.isArray(recipients.emails) ? recipients.emails : [];
  const empIds = Array.isArray(recipients.empIds) ? recipients.empIds : [];

  return {
    recipientUserIds: [...new Set(userIds.map((v) => String(v || "").trim()).filter(Boolean))],
    recipientEmails: [...new Set(emails.map((v) => normalizeEmail(v)).filter(Boolean))],
    recipientEmpIds: [...new Set(empIds.map((v) => String(v || "").trim()).filter(Boolean))],
  };
}

function hasExplicitRecipients(notification) {
  return (
    (Array.isArray(notification?.recipientUserIds) && notification.recipientUserIds.length > 0) ||
    (Array.isArray(notification?.recipientEmails) && notification.recipientEmails.length > 0) ||
    (Array.isArray(notification?.recipientEmpIds) && notification.recipientEmpIds.length > 0)
  );
}

function isReadByViewer(notification, user) {
  const viewerId = viewerIdForNotification(user);
  if (!viewerId) return false;
  return Array.isArray(notification?.readBy)
    ? notification.readBy.some((entry) => String(entry?.userId || "") === viewerId)
    : false;
}

function isHiddenByViewer(notification, user) {
  const viewerId = viewerIdForNotification(user);
  if (!viewerId) return false;
  return Array.isArray(notification?.hiddenBy)
    ? notification.hiddenBy.some((entry) => String(entry?.userId || "") === viewerId)
    : false;
}

export function userCanSeeTwsNotification(notification, user) {
  const role = getSessionUserRole(user);
  if (!role) return false;

  const roles = Array.isArray(notification?.audienceRoles) ? notification.audienceRoles : [];
  if (!roles.includes(role)) return false;

  const viewerDepartment = String(user?.department || "").trim();
  const viewerProgram = String(user?.program || "").trim();
  const viewerUserId = String(getSessionUserId(user) || "").trim();
  const viewerEmail = normalizeEmail(user?.email || "");
  const viewerEmpId = String(user?.employeeId || "").trim();

  if (hasExplicitRecipients(notification)) {
    const recipientUserIds = Array.isArray(notification?.recipientUserIds)
      ? notification.recipientUserIds.map((v) => String(v || "").trim())
      : [];
    const recipientEmails = Array.isArray(notification?.recipientEmails)
      ? notification.recipientEmails.map((v) => normalizeEmail(v))
      : [];
    const recipientEmpIds = Array.isArray(notification?.recipientEmpIds)
      ? notification.recipientEmpIds.map((v) => String(v || "").trim())
      : [];

    return (
      (viewerUserId && recipientUserIds.includes(viewerUserId)) ||
      (viewerEmail && recipientEmails.includes(viewerEmail)) ||
      (viewerEmpId && recipientEmpIds.includes(viewerEmpId))
    );
  }

  if (role === "Professor") {
    const notifEmail = normalizeEmail(notification?.facultyEmail || "");
    const notifEmpId = String(notification?.facultyEmpId || "").trim();

    return (
      (notifEmail && viewerEmail && notifEmail === viewerEmail) ||
      (notifEmpId && viewerEmpId && notifEmpId === viewerEmpId)
    );
  }

  if (role === "Program-Chair") {
    const notifProgram = String(notification?.program || "").trim();
    const notifDepartment = String(notification?.department || "").trim();

    if (notifProgram && viewerProgram) return notifProgram === viewerProgram;
    if (notifDepartment && viewerDepartment) return notifDepartment === viewerDepartment;
    return true;
  }

  if (role === "Dean") {
    const notifDepartment = String(notification?.department || "").trim();
    if (notifDepartment && viewerDepartment) return notifDepartment === viewerDepartment;
  }

  return true;
}

export function toUserNotificationPayload(notification, user) {
  const twsId = String(notification?.twsID || "");
  const role = String(getSessionUserRole(user) || "").trim();

  let targetUrl = twsId ? `/tws/summary/${encodeURIComponent(twsId)}` : "/tws/dashboard";
  if (twsId && role === "Dean") {
    targetUrl = `/tws/summary/${encodeURIComponent(twsId)}?from=dean`;
  } else if (twsId && role === "Program-Chair") {
    targetUrl = `/tws/summary/${encodeURIComponent(twsId)}?from=program-chair`;
  } else if (twsId && role === "Professor") {
    targetUrl = `/tws/summary/${encodeURIComponent(twsId)}?from=faculty`;
  }

  return {
    id: String(notification?._id || ""),
    twsID: twsId,
    eventType: notification?.eventType || "status-update",
    title: notification?.title || "TWS Update",
    message: notification?.message || "",
    statusFrom: notification?.statusFrom || "",
    statusTo: notification?.statusTo || "",
    recipientUserIds: Array.isArray(notification?.recipientUserIds) ? notification.recipientUserIds : [],
    recipientEmails: Array.isArray(notification?.recipientEmails) ? notification.recipientEmails : [],
    recipientEmpIds: Array.isArray(notification?.recipientEmpIds) ? notification.recipientEmpIds : [],
    targetUrl,
    createdAt: notification?.createdAt || new Date(),
    isRead: isReadByViewer(notification, user),
    isHidden: isHiddenByViewer(notification, user),
  };
}

export async function getNotificationsForUser(user, options = {}) {
  const role = getSessionUserRole(user);
  if (!role) return [];

  const limit = Math.max(1, Math.min(50, Number(options.limit || 12)));
  const query = { audienceRoles: role };

  if (role === "Professor") {
    const email = normalizeEmail(user?.email || "");
    const empId = String(user?.employeeId || "").trim();
    const professorScopes = [];

    if (email) professorScopes.push({ facultyEmail: email });
    if (empId) professorScopes.push({ facultyEmpId: empId });
    if (!professorScopes.length) return [];

    query.$or = professorScopes;
  }

  const docs = await TWSNotification.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(limit * 3, limit))
    .lean();

  return docs
    .filter((doc) => userCanSeeTwsNotification(doc, user) && !isHiddenByViewer(doc, user))
    .slice(0, limit)
    .map((doc) => toUserNotificationPayload(doc, user));
}

export async function markNotificationAsRead(notificationId, user) {
  const notification = await TWSNotification.findById(notificationId);
  if (!notification) return null;

  if (!userCanSeeTwsNotification(notification.toObject(), user)) {
    return null;
  }

  if (isHiddenByViewer(notification.toObject(), user)) {
    return null;
  }

  const viewerId = viewerIdForNotification(user);
  if (!viewerId) return null;

  const alreadyRead = notification.readBy.some(
    (entry) => String(entry?.userId || "") === viewerId
  );

  if (!alreadyRead) {
    notification.readBy.push({ userId: viewerId, readAt: new Date() });
    await notification.save();
  }

  return toUserNotificationPayload(notification.toObject(), user);
}

export async function hideNotificationForUser(notificationId, user) {
  const notification = await TWSNotification.findById(notificationId);
  if (!notification) return null;

  if (!userCanSeeTwsNotification(notification.toObject(), user)) {
    return null;
  }

  const viewerId = viewerIdForNotification(user);
  if (!viewerId) return null;

  const alreadyHidden = notification.hiddenBy.some(
    (entry) => String(entry?.userId || "") === viewerId
  );

  if (!alreadyHidden) {
    notification.hiddenBy.push({ userId: viewerId, hiddenAt: new Date() });
    await notification.save();
  }

  return toUserNotificationPayload(notification.toObject(), user);
}

export async function hideAllNotificationsForUser(user) {
  const role = getSessionUserRole(user);
  if (!role) return 0;

  const viewerId = viewerIdForNotification(user);
  if (!viewerId) return 0;

  const candidateDocs = await TWSNotification.find({ audienceRoles: role })
    .sort({ createdAt: -1 })
    .lean();

  const targetIds = candidateDocs
    .filter((doc) => userCanSeeTwsNotification(doc, user) && !isHiddenByViewer(doc, user))
    .map((doc) => String(doc._id));

  if (!targetIds.length) return 0;

  const result = await TWSNotification.updateMany(
    { _id: { $in: targetIds } },
    { $push: { hiddenBy: { userId: viewerId, hiddenAt: new Date() } } }
  );

  return Number(result?.modifiedCount || 0);
}

export async function publishTwsStatusNotification({ tws, fromStatus, toStatus, actor, audienceRoles, recipients }) {
  if (!tws || !fromStatus || !toStatus || fromStatus === toStatus) return null;

  const actorName = actorLabel(actor || {});
  const facultyName = String(tws?.faculty?.name || "Faculty").trim() || "Faculty";

  const recipientScope = normalizeRecipientScope(recipients);

  const created = await TWSNotification.create({
    twsID: tws._id,
    eventType: "status-update",
    title: `TWS Status Updated: ${toStatus}`,
    message: `${facultyName} workload moved from ${fromStatus} to ${toStatus} by ${actorName}.`,
    statusFrom: fromStatus,
    statusTo: toStatus,
    createdByRole: String(getSessionUserRole(actor) || "System"),
    createdByName: actorName,
    createdByEmail: normalizeEmail(actor?.email || ""),
    audienceRoles: Array.isArray(audienceRoles) && audienceRoles.length
      ? audienceRoles
      : ["Program-Chair", "Dean", "Professor"],
    ...recipientScope,
    ...baseAudienceFromTws(tws),
  });

  twsNotificationEmitter.emit("notification", created.toObject());
  return created;
}

export async function publishTwsFacultyNoteNotification({ tws, actor, noteText, isReturn = false, audienceRoles, recipients }) {
  if (!tws || !noteText) return null;

  const actorName = actorLabel(actor || {});
  const facultyName = String(tws?.faculty?.name || "Faculty").trim() || "Faculty";
  const trimmed = String(noteText).trim();

  const recipientScope = normalizeRecipientScope(recipients);

  const created = await TWSNotification.create({
    twsID: tws._id,
    eventType: "faculty-note",
    title: isReturn ? "Faculty Returned TWS with Notes" : "Faculty Note Added",
    message: `${facultyName}: ${trimmed.slice(0, 220)}${trimmed.length > 220 ? "..." : ""}`,
    statusFrom: String(tws?.status || ""),
    statusTo: String(tws?.status || ""),
    createdByRole: String(getSessionUserRole(actor) || "Professor"),
    createdByName: actorName,
    createdByEmail: normalizeEmail(actor?.email || ""),
    audienceRoles: Array.isArray(audienceRoles) && audienceRoles.length
      ? audienceRoles
      : ["Program-Chair", "Dean", "Professor"],
    ...recipientScope,
    ...baseAudienceFromTws(tws),
  });

  twsNotificationEmitter.emit("notification", created.toObject());
  return created;
}
