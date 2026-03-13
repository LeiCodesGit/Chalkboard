/**
 * TWS Input Validation
 * Server-side validators for all TWS form inputs.
 */

/**
 * Validate faculty info fields.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateFacultyInfo(body) {
  const errors = [];
  const name = (body.name || "").trim();
  const empId = (body.empId || "").trim();
  const dept = (body.dept || "").trim();
  const acadYear = (body.acadYear || "").trim();
  const term = (body.term || "").trim();

  if (!name || name.length < 2) errors.push("Faculty name is required (min 2 chars).");
  if (name.length > 200) errors.push("Faculty name must be under 200 characters.");
  if (!empId) errors.push("Employee ID is required.");
  if (empId.length > 50) errors.push("Employee ID must be under 50 characters.");
  if (!dept) errors.push("Department is required.");
  if (!acadYear) errors.push("Academic year is required.");
  if (!term) errors.push("Term is required.");

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of load rows.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateLoadRows(loads) {
  const errors = [];
  if (!Array.isArray(loads)) return { valid: true, errors: [] };

  loads.forEach((row, idx) => {
    const units = Number(row.units);
    const lec = Number(row.lec);
    const lab = Number(row.lab);
    const sections = Number(row.sections);

    if (isNaN(units) || units < 0) errors.push(`Row ${idx + 1}: units must be >= 0.`);
    if (isNaN(lec) || lec < 0) errors.push(`Row ${idx + 1}: lecture hours must be >= 0.`);
    if (isNaN(lab) || lab < 0) errors.push(`Row ${idx + 1}: lab hours must be >= 0.`);
    if (isNaN(sections) || sections < 1) errors.push(`Row ${idx + 1}: sections must be >= 1.`);
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validate course-add payload.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateCourseAdd(body) {
  const errors = [];
  const code = (body.code || "").trim();
  const title = (body.title || "").trim();
  const day = (body.day || "").trim();
  const timeSlot = (body.timeSlot || "").trim();
  const units = Number(body.units);

  if (!code) errors.push("Course code is required.");
  if (!title) errors.push("Course title is required.");
  if (!day) errors.push("Day is required.");
  if (!timeSlot) errors.push("Time slot is required.");
  if (isNaN(units) || units <= 0) errors.push("Units must be greater than 0.");

  return { valid: errors.length === 0, errors };
}

/**
 * Validate approval action.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateApprovalAction(body) {
  const errors = [];
  const action = (body.action || "").trim();
  const remarks = (body.remarks || "").trim();
  const validActions = ["approve", "reject", "return"];

  if (!validActions.includes(action)) errors.push(`Invalid action. Must be one of: ${validActions.join(", ")}.`);
  if (remarks.length > 500) errors.push("Remarks must be under 500 characters.");

  return { valid: errors.length === 0, errors };
}

/**
 * Validate program chair action.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateChairAction(body) {
  const errors = [];
  const action = (body.action || "").trim();
  const id = (body.id || "").trim();
  const validActions = ["send", "return", "sendToDean"];

  if (!id) errors.push("TWS ID is required.");
  if (!validActions.includes(action)) errors.push(`Invalid action. Must be one of: ${validActions.join(", ")}.`);

  return { valid: errors.length === 0, errors };
}
