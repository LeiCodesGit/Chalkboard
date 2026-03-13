/**
 * TWS Status State Machine
 * Enforces valid status transitions and provides helpers.
 */

const VALID_TRANSITIONS = {
  "Draft":                      ["Sent to Faculty", "Sent to Dean"],
  "Sent to Faculty":            ["Sent to Dean", "Returned to Program Chair"],
  "Sent to Dean":               ["Approved", "Rejected", "Returned to Program Chair"],
  "Approved":                   ["Archived"],
  "Rejected":                   ["Draft"],
  "Returned to Program Chair":  ["Draft", "Sent to Faculty", "Sent to Dean"],
  "Archived":                   [],
};

const ALL_STATUSES = Object.keys(VALID_TRANSITIONS);

/**
 * Check if a transition from one status to another is valid.
 */
export function canTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

/**
 * Attempt to transition a TWS document to a new status.
 * Throws an error if the transition is invalid.
 * Returns the new status string.
 */
export function transitionOrThrow(currentStatus, newStatus) {
  if (!canTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid status transition: "${currentStatus}" → "${newStatus}". ` +
      `Allowed from "${currentStatus}": [${(VALID_TRANSITIONS[currentStatus] || []).join(", ")}]`
    );
  }
  return newStatus;
}

/**
 * Get which step number (1-based) corresponds to a given status for the stepper UI.
 * Returns { step, label, isRejected, isReturned }
 */
export function getStepperState(status) {
  switch (status) {
    case "Draft":
      return { step: 0, label: "Draft", isRejected: false, isReturned: false };
    case "Sent to Faculty":
      return { step: 1, label: "Sent to Faculty", isRejected: false, isReturned: false };
    case "Sent to Dean":
      return { step: 2, label: "Pending Dean Approval", isRejected: false, isReturned: false };
    case "Approved":
      return { step: 3, label: "Approved by Dean", isRejected: false, isReturned: false };
    case "Archived":
      return { step: 4, label: "Archived", isRejected: false, isReturned: false };
    case "Rejected":
      return { step: 2, label: "Rejected by Dean", isRejected: true, isReturned: false };
    case "Returned to Program Chair":
      return { step: 2, label: "Returned for Revision", isRejected: false, isReturned: true };
    default:
      return { step: 0, label: status || "Unknown", isRejected: false, isReturned: false };
  }
}

export { ALL_STATUSES, VALID_TRANSITIONS };
