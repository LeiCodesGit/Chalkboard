# TWS System — Full Code Analysis Report

> **Date:** March 6, 2026
> **Scope:** Teaching Workload Sheet (TWS) subsystem
> **Phase:** Step 1 — Analysis Only (No code implementation)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [File Inventory](#2-file-inventory)
3. [How the Current TWS Logic Works](#3-how-the-current-tws-logic-works)
   - 3.1 [Data Storage — Two Competing Systems](#31-data-storage--two-competing-systems)
   - 3.2 [User Flow (Multi-Step Wizard)](#32-user-flow-multi-step-wizard)
   - 3.3 [Approval Workflow (Role-Based)](#33-approval-workflow-role-based)
   - 3.4 [Status State Machine](#34-status-state-machine)
4. [Client-Side and Server-Side Interactions](#4-client-side-and-server-side-interactions)
5. [Data Flow Between Components](#5-data-flow-between-components)
6. [Dependencies and External Modules](#6-dependencies-and-external-modules)
7. [Current Limitations and Problems](#7-current-limitations-and-problems)
   - 7.1 [Critical Issues](#71-critical-issues)
   - 7.2 [Design Issues](#72-design-issues)
8. [Per-File Detailed Breakdown](#8-per-file-detailed-breakdown)
   - 8.1 [Routes](#81-routes--routestwstwsroutesjs)
   - 8.2 [Models (Mongoose — Dead Code)](#82-models-mongoose--dead-code)
   - 8.3 [In-Memory Store (Dead Code)](#83-in-memory-store--dead-code)
   - 8.4 [Views (EJS Templates)](#84-views-ejs-templates)
   - 8.5 [CSS Stylesheets](#85-css-stylesheets)
   - 8.6 [App Entry Point](#86-app-entry-point--indexjs)
9. [Summary](#9-summary)

---

## 1. System Overview

The TWS (Teaching Workload Sheet) is a multi-step, multi-role workflow system for creating, reviewing, approving, and archiving faculty teaching workload sheets within a university CMS.

**Tech stack:**
- **Runtime:** Node.js with ES Modules (`"type": "module"`)
- **Framework:** Express.js v5
- **Templating:** EJS (server-side rendering)
- **Intended Database:** MongoDB via Mongoose v9
- **Actual Storage:** In-memory JavaScript `Map()` (volatile — lost on restart)
- **Session:** `express-session` (configured globally but unused by TWS)

---

## 2. File Inventory

### Routes
| File | Purpose |
|------|---------|
| `routes/TWS/twsRoutes.js` | Single monolithic route file (~290 lines). All 20+ GET/POST handlers for all roles. |

### Models (Mongoose — NOT USED)
| File | Mongoose Model | Fields |
|------|---------------|--------|
| `models/TWS/tws.js` | `TWS` | userID (ref User), term, schoolYear, teachingHours, advisingHours, consultationHours, committeeWorks, totalHours, academicUnits, peUnits, nstpUnits, deloadingUnits, totalUnits, immediateHead, pdf (Buffer) |
| `models/TWS/twsApprovalStatus.js` | `TWSApprovalStatus` | twsID (ref TWS), approvalDate, remarks, approvedBy, status (Approved/Pending/Not Submitted) |
| `models/TWS/course.js` | `Course` | twsID (ref TWS), courseCode, section, isLecture, lectureHours, labHours, units, designatedRoom, time, day, department, description |

### In-Memory Store (NOT USED)
| File | Purpose |
|------|---------|
| `models/TWS/twsStore.js` | Standalone in-memory store with `Map()`. Exports: `createDraft()`, `getAll()`, `getById()`, `updateFaculty()`, `addLoadRow()`, `removeLoadRow()`, `updateLoadRows()`, `submitTws()`, `setApproval()`, `getTotals()`, `getArchived()`. **Never imported by any route.** |

### Views (17 EJS files)
| File | Role/Step | Description |
|------|-----------|-------------|
| `views/TWS/twsLandingWelcome.ejs` | All | Welcome page, links to Program Chair |
| `views/TWS/twsFacultyDashboard.ejs` | Faculty | Dashboard listing TWS records, signature panel, submit panel |
| `views/TWS/twsCreateTeachingWorkloadPopup.ejs` | Faculty (Step 1) | Subject list + modal popup for adding subjects |
| `views/TWS/twsCreatedTeachingWorkload.ejs` | Faculty (Step 2) | Timetable grid + load details sidebar |
| `views/TWS/twsFacultyInfo.ejs` | Faculty (Step 3) | Faculty information form |
| `views/TWS/twsTeachingLoad.ejs` | Faculty (Step 4) | Editable teaching load table |
| `views/TWS/twsSummary.ejs` | Faculty (Step 5) | Summary/preview + submit button |
| `views/TWS/twsSubmissionStatus.ejs` | Faculty | Stepper showing submission progress |
| `views/TWS/twsApprovalRouting.ejs` | Generic | Approval/Reject form (Dean) |
| `views/TWS/twsApprovalRouting_dean.ejs` | Dean | Dean-specific approval routing UI |
| `views/TWS/twsProgramChair.ejs` | Program Chair | Submitted TWS list + personal course load |
| `views/TWS/twsDean.ejs` | Dean | Pending TWS list + approval details |
| `views/TWS/twsArchived.ejs` | Faculty | Archived/completed TWS list |
| `views/TWS/twsTAArchive.ejs` | TA (Tech Asst) | Archive view with search + detail panel |
| `views/TWS/twsHRArchive.ejs` | HR | Archive view with detail panel |
| `views/TWS/twsReviewDetails.ejs` | Dean/Secretary | All TWS records list |
| `views/TWS/twsCreatePage.ejs` | Faculty | Alternate create page (similar to Archived view) |

### CSS (3 files)
| File | Used By |
|------|---------|
| `public/TWS/css/twsStyle.css` | Landing, Program Chair, Faculty wizard pages |
| `public/TWS/css/twsstyles.css` | Faculty Dashboard, TA Archive, HR Archive |
| `public/TWS/css/twsDeanStyle.css` | Dean pages, Review Details, Approval Routing (Dean) |

### Static Assets
| File | Type |
|------|------|
| `public/TWS/img/logo.png` | Logo image |
| `public/TWS/img/background.png` | Background image (used by all TWS CSS) |

### App Entry
| File | Relevant Lines |
|------|---------------|
| `index.js` | `import twsRoutes from "./routes/TWS/twsRoutes.js"` → `app.use("/tws", twsRoutes)` |

---

## 3. How the Current TWS Logic Works

### 3.1 Data Storage — Two Competing Systems

There are **three data-layer components**, but **none are connected to each other**:

#### A. The ACTUAL data store: In-memory `Map()` in `twsRoutes.js` (lines 15–16)

```js
const twsStore = new Map();
```

- This is what all routes actually read/write.
- Records are plain JS objects:
  ```js
  {
    id: "TWS-A3F2B1",
    createdAt: 1709712345678,
    status: "Draft",
    faculty: {},
    loads: [],
    createdWorkload: [],
    totals: { totalUnits: 0, totalHours: 0 },
    approval: { status: "Not Submitted" },
    archived: false,
  }
  ```
- IDs generated with `Math.random().toString(16).slice(2,8).toUpperCase()`
- **ALL data lost on every server restart.**

#### B. DEAD CODE: `models/TWS/twsStore.js`

- A more sophisticated in-memory store using `crypto.randomBytes`
- Exports functions: `createDraft()`, `getAll()`, `getById()`, `updateFaculty()`, `addLoadRow()`, `removeLoadRow()`, `updateLoadRows()`, `submitTws()`, `setApproval()`, `getTotals()`, `getArchived()`
- Has hardcoded default teaching load data
- **Never imported anywhere. Completely dead code.**

#### C. DEAD CODE: Mongoose Models

- `models/TWS/tws.js` — `TWS` schema with full fields
- `models/TWS/twsApprovalStatus.js` — `TWSApprovalStatus` schema
- `models/TWS/course.js` — `Course` schema
- **None are imported or used by any TWS route.**
- They use `mongoose.model()` (default connection) rather than the project's `mainDB` named connection from `database/mongo-dbconnect.js`, so even if imported they'd target the wrong database.

### 3.2 User Flow (Multi-Step Wizard)

The faculty-facing flow is a sequential wizard:

```
Landing Page (/tws/)
    │
    ▼
Faculty Dashboard (/tws/dashboard)
    │  [Click "+ Create New TWS"]
    ▼
CREATE: GET /tws/create
    │  → Generates new draft in Map
    │  → Redirects to Step 1
    ▼
STEP 1: Subject Selection (/tws/create-teaching-workload/:id)
    │  → Displays hardcoded list of 10 subjects
    │  → Faculty picks subjects via popup modal
    │  → POST .../add adds to tws.createdWorkload[]
    │  → Click "Next"
    ▼
STEP 2: Schedule Grid (/tws/created-teaching-workload/:id)
    │  → Displays a timetable grid
    │  → ⚠ Grid is STATIC/HARDCODED (doesn't reflect added subjects)
    │  → Shows load details sidebar
    │  → Click "Next"
    ▼
STEP 3: Faculty Info (/tws/faculty/:id)
    │  → Form: name, empId, dept, acadYear, term, empStatus
    │  → POST saves to tws.faculty
    │  → Redirects to Step 4
    ▼
STEP 4: Teaching Load Details (/tws/teaching-load/:id)
    │  → Editable table: courseCode, section, units, lec, lab, sections
    │  → ⚠ Form field names are FLAT (broken — doesn't produce arrays)
    │  → POST saves to tws.loads, computes totals
    │  → Redirects to Step 5
    ▼
STEP 5: Summary (/tws/summary/:id)
    │  → Read-only preview of faculty info + totals
    │  → "Submit to Dean" or "Edit"
    │  → Submit changes status to "Submitted"
    │  → Redirects to Submission Status
    ▼
Submission Status (/tws/status/:id)
    │  → Stepper UI: Submitted → Secretary Review → Chair Endorsement → Dean Approval
    │  → Links to Approval Routing
    ▼
Approval Routing (/tws/approval/:id)
    → Dean can Approve or Reject
```

#### Hardcoded Subject List (Step 1)

The 10 subjects are defined directly in the route handler:

| Code | Title | Units |
|------|-------|-------|
| ELT1011 | Circuits 1 | 3.0 |
| CN1014 | Construction | 3.0 |
| CPET2114 | Microprocessor Systems | 3.0 |
| GE1110 | UTS (Understanding the Self) | 1.5 |
| GE1081 | Ethics | 3.0 |
| GE1053 | Numerical Methods | 3.0 |
| MG1210 | Entrepreneurship | 3.0 |
| ELT1016 | Electronic Devices | 3.0 |
| ELT1021 | Digital Design | 3.0 |
| ME1123 | Thermodynamics | 3.0 |

### 3.3 Approval Workflow (Role-Based)

| Role | Route | Behavior |
|------|-------|----------|
| **Program Chair** | `GET /tws/program-chair` | Lists submitted TWS. Can "approve" (→ "For Chair Review"), "return" (→ "Returned for Revision"). |
| **Program Chair** | `POST /tws/program-chair/action` | Handles `approve` and `return` actions. **Does NOT handle `send` or `sendToDean`** (which are in the template). |
| **Dean** | `GET /tws/dean` | Lists pending (Submitted, For Chair Review, Returned) and approved TWS records. |
| **Dean** | `GET /tws/approval/:id` | Shows approval form. |
| **Dean** | `POST /tws/approval/:id` | Approve (→ Archived) or Reject (→ "Returned for Revision"). |
| **Archives** | `GET /tws/archived` | Faculty view of archived records. |
| **TA Archive** | `GET /tws/ta-archive` | Tech Assistant view of archived records with search. |
| **HR Archive** | `GET /tws/hr-archive` | HR view of archived records. |
| **Review Details** | `GET /tws/review-details` | Dean/Secretary view — lists all TWS records. |

### 3.4 Status State Machine

```
                                    ┌─────────────────────┐
                                    │                     │
    Draft ──→ Submitted ──→ For Chair Review ──→ Approved (Archived)
                  │                                  ▲
                  │                                  │
                  └──→ Returned for Revision ────────┘
```

**Statuses in the system:**
- `Draft` — Initial state on creation
- `Submitted` — Faculty submits
- `For Chair Review` — Program Chair approves
- `Returned for Revision` — Program Chair or Dean returns
- `Approved` — Dean approves (also sets `archived: true`)

---

## 4. Client-Side and Server-Side Interactions

### Server-Side (Express Routes)

- **All logic lives in a single route file** — `routes/TWS/twsRoutes.js`
- No controller layer, no service layer, no middleware
- Traditional form-based pattern: `POST` → server processes → `res.redirect()`
- No REST API endpoints, no JSON responses, no AJAX/fetch
- `computeTotals()` helper computes `totalUnits` and `totalHours` from loads

### Client-Side (EJS Templates)

Minimal JavaScript — only:

| File | Client JS | Purpose |
|------|-----------|---------|
| `twsCreateTeachingWorkloadPopup.ejs` | `openModal()`, `closeModal()` | Show/hide subject-add popup |
| `twsFacultyDashboard.ejs` | Anonymous IIFE | Format current date for signature |
| `twsTAArchive.ejs` | `filterTA()` | Client-side search filter by name |
| `twsTAArchive.ejs` | `showArchiveDetail()` | Populate archive detail panel |
| `twsHRArchive.ejs` | `showDetail()` | Populate archive detail panel |

**What's NOT present:**
- No client-side form validation
- No fetch/AJAX calls
- No dynamic UI updates (everything is full page reload)
- No loading states or error feedback

---

## 5. Data Flow Between Components

```
┌──────────────────┐
│   Browser/User   │
│  (Form Submit)   │
└────────┬─────────┘
         │ POST (form-urlencoded)
         ▼
┌──────────────────┐
│  Express Router  │
│ (twsRoutes.js)   │
│                  │
│  - Parse body    │
│  - Mutate Map    │
│  - Compute totals│
│  - Redirect      │
└────────┬─────────┘
         │ GET (redirect)
         ▼
┌──────────────────┐
│  Express Router  │
│ (GET handler)    │
│                  │
│  - Read from Map │
│  - res.render()  │
└────────┬─────────┘
         │ HTML
         ▼
┌──────────────────┐
│  EJS Template    │
│ (views/TWS/)     │
│                  │
│  - Render data   │
│  - Static CSS    │
│  - Minimal JS    │
└────────┬─────────┘
         │ HTML Response
         ▼
┌──────────────────┐
│   Browser/User   │
│  (View Result)   │
└──────────────────┘
```

**Key observations:**
- Data flows unidirectionally: Browser → Route → Map → Template → Browser
- No database in the actual flow
- The `tws` object passed to templates is a **direct reference** to the Map entry (mutations are in-place on the same object)
- No data transformation layer between storage and presentation

---

## 6. Dependencies and External Modules

### Used by TWS

| Package | Version | Usage |
|---------|---------|-------|
| `express` | ^5.2.1 | Routing, HTTP server |
| `ejs` | ^4.0.1 | Server-side HTML templating |
| `express-session` | ^1.19.0 | Configured globally in `index.js` (but TWS doesn't use `req.session`) |

### Available but UNUSED by TWS

| Package | Version | Potential Use |
|---------|---------|---------------|
| `mongoose` | ^9.2.1 | MongoDB ODM — models exist but aren't connected |
| `mongodb` | ^7.1.0 | Raw MongoDB driver |
| `jsonwebtoken` | ^9.0.3 | JWT-based authentication |
| `multer` | ^2.0.2 | File uploads |
| `puppeteer` | ^24.37.5 | PDF generation (headless browser) |
| `pdf-lib` | ^1.17.1 | PDF manipulation |
| `docxtemplater` | ^3.68.3 | DOCX generation |
| `pizzip` | ^3.2.0 | ZIP handling (used with docxtemplater) |
| `dotenv` | ^17.3.1 | Environment variables |
| `cookie-parser` | ^1.4.7 | Cookie parsing |

### Middleware Available but UNUSED by TWS

| File | Exports | Usage |
|------|---------|-------|
| `middleware/authMiddleware.js` | `isAuthenticated`, `authorizeRoles(…roles)` | Session-based auth + role checking. **Never applied to any TWS route.** |

### User Model

`models/user.js` defines:
- Roles: `Professor`, `Program-Chair`, `Dean`, `HR`, `Admin`, `Super-Admin`
- Departments: `ATYCB`, `CAS`, `CCIS`, `CEA`, `CHS`, `N/A`
- Programs: 25 programs across departments
- Auth: password field (no hashing visible in schema)

---

## 7. Current Limitations and Problems

### 7.1 Critical Issues

#### 1. No Data Persistence
The entire TWS system runs on an in-memory `Map()`. **All data is lost on every server restart.** The Mongoose models in `models/TWS/` are dead code — never imported, never used.

#### 2. No Authentication or Authorization
TWS routes have **zero middleware**. Anyone can:
- Access faculty pages without logging in
- Access Program Chair pages without being a Program Chair
- Access Dean pages without being a Dean
- Access HR/TA archives without authorization

The `authMiddleware.js` exists in the project but is never imported into TWS routes.

#### 3. Duplicate / Dead Code
- `models/TWS/twsStore.js` — A standalone in-memory store module that is **never used**. The routes file duplicates its own in-memory logic.
- `models/TWS/tws.js`, `twsApprovalStatus.js`, `course.js` — Mongoose schemas that are **never imported**.
- `views/TWS/twsCreatePage.ejs` and `views/TWS/twsArchived.ejs` — Nearly identical content duplicating `twsFacultyDashboard.ejs`.

#### 4. No Input Validation or Sanitization
- `req.body` is used directly with **no validation**
- No type checking, no required-field enforcement
- No XSS prevention (EJS `<%= %>` does auto-escape, but no server-side cleaning)
- Faculty info fields (name, empId, dept) can be any string or empty

#### 5. Hardcoded Subject List
The 10 subjects in Step 1 are hardcoded in the route handler, not from a database or configuration. Cannot be managed by admins.

#### 6. Static Schedule Grid (Step 2)
The timetable in `twsCreatedTeachingWorkload.ejs` displays **hardcoded blocks** (`GE104A`, `CPE2114`, `GE1033`, `NSTP`) that **don't reflect the subjects actually added by the user** in Step 1. The grid is purely visual/decorative.

#### 7. Broken Teaching Load Form (Step 4)
In `twsTeachingLoad.ejs`, all input fields have **flat `name` attributes**:
```html
<input name="courseCode" ... />
<input name="units" ... />
```
Instead of indexed arrays like:
```html
<input name="loads[0][courseCode]" ... />
<input name="loads[0][units]" ... />
```
Express parses these as a single value or flat array, **not as structured rows**. The route handler expects `req.body.loads` (an array of objects) but the form **never produces that shape**. This means Step 4 is effectively broken.

#### 8. No Error Handling
- No `try/catch` blocks
- No error middleware
- No logging
- If something goes wrong, Express returns generic 500 errors with no user feedback

### 7.2 Design Issues

#### 9. Monolithic Route File
All 20+ route handlers (GET and POST) for **all roles** (Faculty, Program Chair, Dean, HR, TA) are in a single 290-line file with mixed concerns.

#### 10. No Separation of Concerns
Business logic (status transitions, totals computation), data access (Map operations), and HTTP handling (req/res) are all tangled together in route handlers. No controller layer, no service layer.

#### 11. Inconsistent CSS Architecture
Three separate CSS files with overlapping/conflicting patterns:

| File | Prefix | Used By |
|------|--------|---------|
| `twsStyle.css` | `.tws-*` | Landing, wizard steps, Program Chair |
| `twsstyles.css` | `.main`, `.panel`, `.tws-table` | Faculty Dashboard, TA/HR Archive |
| `twsDeanStyle.css` | `.twsd-*` | Dean, Review Details, Approval (Dean) |

Different pages use different CSS architectures, making the UI inconsistent.

#### 12. Unhandled Actions in Program Chair

The `twsProgramChair.ejs` template has buttons that POST actions not handled by the route:

| Button | Posts `action:` | Handled? |
|--------|----------------|----------|
| View | (link, not POST) | ✅ |
| Send | `"send"` | ❌ Not handled |
| Return | `"return"` | ✅ |
| Send to Dean | `"sendToDean"` | ❌ Not handled |

The route at `POST /tws/program-chair/action` only handles `"approve"` and `"return"`.

#### 13. Dean Page Uses Program Chair Endpoint
In `twsDean.ejs`, the "Return" button POSTs to `/tws/program-chair/action`, which is the Program Chair's endpoint — not a Dean-specific one. This is a routing/architectural mistake.

#### 14. No User Context in Templates
Several templates reference `user.name` or expect session data, but **no `user` variable is ever passed** from route handlers to templates. The faculty dashboard signature pre-fills with:
```ejs
<%= (typeof user !== 'undefined' && user && user.name) ? user.name : '' %>
```
This always evaluates to empty string because `user` is never provided.

#### 15. `twsApprovalRouting_dean.ejs` is Never Rendered
The template `twsApprovalRouting_dean.ejs` exists but **no route renders it**. The approval route renders `twsApprovalRouting.ejs` instead.

#### 16. Signature Endpoint Does Nothing
`POST /tws/signature` accepts the form submission but discards the data — it just redirects back to the dashboard without saving anything.

#### 17. `package.json` Has Duplicate Key
```json
"type": "module",
"type": "module",
```
The `"type"` key is duplicated. Only the last one takes effect (which happens to be the same value, so no runtime error, but it's still incorrect).

---

## 8. Per-File Detailed Breakdown

### 8.1 Routes — `routes/TWS/twsRoutes.js`

**Lines:** ~290
**Mount point:** `/tws` (registered in `index.js`)

#### Route Table

| Method | Path | Handler Purpose | Renders / Redirects |
|--------|------|----------------|---------------------|
| GET | `/` | Landing page | `TWS/twsLandingWelcome` |
| GET | `/dashboard` | Faculty dashboard | `TWS/twsFacultyDashboard` |
| GET | `/create` | Generate new draft + redirect | → `/tws/create-teaching-workload/:id` |
| GET | `/create-teaching-workload/:id` | Step 1: Subject list + popup | `TWS/twsCreateTeachingWorkloadPopup` |
| POST | `/create-teaching-workload/:id/add` | Add subject to workload | → `/tws/create-teaching-workload/:id` |
| GET | `/created-teaching-workload/:id` | Step 2: Schedule grid | `TWS/twsCreatedTeachingWorkload` |
| GET | `/faculty/:id` | Step 3: Faculty info form | `TWS/twsFacultyInfo` |
| POST | `/faculty/:id` | Save faculty info | → `/tws/teaching-load/:id` |
| GET | `/teaching-load/:id` | Step 4: Teaching load table | `TWS/twsTeachingLoad` |
| POST | `/teaching-load/:id` | Save loads + compute totals | → `/tws/summary/:id` |
| GET | `/summary/:id` | Step 5: Summary preview | `TWS/twsSummary` |
| POST | `/summary/:id` | Submit or edit | → `/tws/status/:id` or `/tws/faculty/:id` |
| GET | `/status/:id` | Submission status stepper | `TWS/twsSubmissionStatus` |
| GET | `/approval/:id` | Approval routing | `TWS/twsApprovalRouting` |
| POST | `/approval/:id` | Approve or reject | → `/tws/summary/:id` |
| POST | `/signature` | Faculty signature (no-op) | → `/tws/dashboard` |
| GET | `/archived` | Archived list | `TWS/twsArchived` |
| GET | `/ta-archive` | TA archive | `TWS/twsTAArchive` |
| GET | `/hr-archive` | HR archive | `TWS/twsHRArchive` |
| GET | `/program-chair` | Program Chair dashboard | `TWS/twsProgramChair` |
| POST | `/program-chair/action` | Chair approve/return | → `/tws/program-chair` |
| GET | `/dean` | Dean dashboard | `TWS/twsDean` |
| GET | `/review-details` | Review list | `TWS/twsReviewDetails` |

#### Helper Functions

```
newId()          → Generates "TWS-" + random hex (6 chars)
getOr404(req,res) → Looks up TWS by req.params.id, returns 404 if not found
computeTotals(loads) → Sums units and (lec + lab) * sections across load rows
```

### 8.2 Models (Mongoose — Dead Code)

#### `models/TWS/tws.js` — TWS Schema

```
userID          ObjectId (ref "User", required)
term            String
schoolYear      String
teachingHours   Number
advisingHours   Number
consultationHours Number
committeeWorks  Number
totalHours      Number
academicUnits   Number
peUnits         Number
nstpUnits       Number
deloadingUnits  Number
totalUnits      Number
immediateHead   String
pdf             Buffer
timestamps      true (createdAt, updatedAt)
```

#### `models/TWS/twsApprovalStatus.js` — Approval Status Schema

```
twsID           ObjectId (ref "TWS", required)
approvalDate    Date
remarks         String
approvedBy      String
status          String (enum: Approved, Pending, Not Submitted)
timestamps      true
```

#### `models/TWS/course.js` — Course Schema

```
twsID           ObjectId (ref "TWS", required)
courseCode       String
section          String
isLecture        Boolean
lectureHours     String
labHours         String
units            Number
designatedRoom   String
time             String
day              String
department       String
description      String
```

### 8.3 In-Memory Store — Dead Code

#### `models/TWS/twsStore.js`

Exports:
| Function | Description |
|----------|-------------|
| `createDraft()` | Creates new record with hardcoded teaching load data |
| `getAll()` | Returns all records from Map |
| `getById(id)` | Lookup by ID |
| `updateFaculty(id, faculty)` | Merges faculty fields |
| `addLoadRow(id)` | Appends empty row to teachingLoad |
| `removeLoadRow(id)` | Pops last row from teachingLoad |
| `updateLoadRows(id, rows)` | Replaces teachingLoad array |
| `submitTws(id)` | Sets status to "Submitted" |
| `setApproval(id, decision)` | Sets approval decision + date |
| `getTotals(id)` | Computes totals from teachingLoad |
| `getArchived()` | Filters records with status "Approved" |

Default teaching load in `createDraft()`:
```
CE 101  - Intro to Engineers     (3 units, 2 lec, 2 lab)
ME 202  - Thermodynamics         (4 units, 3 lec, 3 lab)
CH 305  - Chemical Engineering   (3 units, 2 lec, 3 lab)
```

> **Note:** This module is literally never imported. It was likely an earlier attempt at abstracting the data layer that was abandoned.

### 8.4 Views (EJS Templates)

#### Template → Data Dependencies

| Template | Variables Expected | Actually Provided |
|---------|-------------------|-------------------|
| `twsLandingWelcome` | `currentPageCategory` | ✅ |
| `twsFacultyDashboard` | `list`, `currentPageCategory`, `user` | ✅ list, ✅ category, ❌ user (never passed) |
| `twsCreateTeachingWorkloadPopup` | `tws`, `subjects`, `currentPageCategory` | ✅ all |
| `twsCreatedTeachingWorkload` | `tws`, `currentPageCategory` | ✅ (but grid is hardcoded) |
| `twsFacultyInfo` | `tws`, `currentPageCategory` | ✅ |
| `twsTeachingLoad` | `tws`, `currentPageCategory` | ✅ (but form names broken) |
| `twsSummary` | `tws`, `currentPageCategory` | ✅ |
| `twsSubmissionStatus` | `tws`, `currentPageCategory` | ✅ |
| `twsApprovalRouting` | `tws`, `currentPageCategory` | ✅ |
| `twsApprovalRouting_dean` | `tws`, `currentPageCategory` | ❌ Never rendered |
| `twsProgramChair` | `submitted`, `personal`, `currentPageCategory` | ✅ |
| `twsDean` | `pending`, `details`, `currentPageCategory` | ✅ |
| `twsArchived` | `list`, `currentPageCategory` | ✅ |
| `twsTAArchive` | `list`, `currentPageCategory` | ✅ |
| `twsHRArchive` | `list`, `currentPageCategory` | ✅ |
| `twsReviewDetails` | `list`, `currentPageCategory` | ✅ |
| `twsCreatePage` | `list`, `currentPageCategory` | ❌ Never rendered (no route) |

#### All Templates Include

```ejs
<%- include("../partials/sideMenuBar", { currentPageCategory: "tws" }) %>
```

The sidebar partial is a shared component with navigation links.

### 8.5 CSS Stylesheets

#### `public/TWS/css/twsStyle.css`
- Variables: `--tws-bg-overlay`, `--tws-glass`, `--tws-pill`, `--tws-card`, `--tws-green`, `--tws-blue`
- Uses glassmorphism (translucent cards, backdrop-filter)
- Grid-based layout with 260px sidebar + 1fr main
- Covers: Landing, Program Chair, all wizard step pages, modal popup
- Background: fixed full-screen background image

#### `public/TWS/css/twsstyles.css`
- Completely separate styling system
- Uses `.main`, `.shell`, `.panel` classes (simpler, no glass prefix)
- Covers: Faculty Dashboard, TA Archive, HR Archive
- Different design language from `twsStyle.css`

#### `public/TWS/css/twsDeanStyle.css`
- Variables: `--glass`, `--pill`, `--card`, etc. (no `tws-` prefix — potential conflicts)
- Uses `.twsd-*` class prefix
- Covers: Dean dashboard, Review Details, Approval Routing (Dean)
- Yet another design language

### 8.6 App Entry Point — `index.js`

**TWS-relevant lines:**

```js
// Line 100: Import
import twsRoutes from "./routes/TWS/twsRoutes.js";

// Line 157: Mount
app.use("/tws", twsRoutes);
```

**Global middleware that affects TWS:**
- `express.json()` — parses JSON bodies (applied **twice** — lines 27 and 46)
- `express.urlencoded({ extended: true })` — parses form bodies (applied **twice**)
- `express-session` — session configured but TWS routes never read `req.session`
- Static file serving from `public/`

**Middleware NOT applied to TWS:**
- `isAuthenticated` — not used
- `authorizeRoles()` — not used

---

## 9. Summary

The TWS system is a **UI prototype / front-end demo** — a visually complete multi-step wizard with role-based views (Faculty, Program Chair, Dean, HR, TA), but with **no real backend infrastructure**.

### What Works
- Navigation flow between pages
- EJS templates render correctly with placeholder data
- Subject addition popup modal (Step 1)
- Faculty info form saves to in-memory store
- Status transitions (Draft → Submitted → Approved)
- Archive filtering (TA search)

### What Does Not Work
- **No persistence** — all data lost on restart
- **No auth** — all pages publicly accessible
- **No validation** — any input accepted
- **Step 2 grid** — completely decorative
- **Step 4 form** — field names don't produce structured data
- **Signature** — saves nothing
- **Some actions** — "Send", "Send to Dean" buttons do nothing
- **Dead code** — 4 files (~250 lines) never used

### Quantified Assessment

| Metric | Value |
|--------|-------|
| Total TWS files | 27 |
| Route handlers | 23 (12 GET, 8 POST) |
| EJS templates | 17 |
| CSS files | 3 |
| Dead code files | 4 (twsStore.js, tws.js, twsApprovalStatus.js, course.js) |
| Lines of route code | ~290 |
| Lines of dead model code | ~250 |
| Auth middleware on TWS routes | 0 |
| Input validation | 0 |
| Database queries | 0 |
| API endpoints (JSON) | 0 |
| Client-side JS functions | 5 (total across all templates) |

---

> **This concludes Step 1 — Code Analysis.**
> Steps 2–5 (Architecture Planning, Implementation Plan, Integration Planning, Documentation Plan) will follow upon approval.
