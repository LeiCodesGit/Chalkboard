import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import Subject from "../models/TWS/subject.js";

dotenv.config();

function printUsage() {
  console.log(`Usage:
  node scripts/importTwsSubjectsFromPdf.js --file <path-to-pdf> [options]

Options:
  --department <value>     Default department for new records (default: CEA)
  --program <value>        Default program for new records (default: CpE)
  --default-units <value>  Units for newly inserted records (default: 3)
  --dry-run                Parse and preview only (no DB write)
  --help                   Show this help message

Example:
  node scripts/importTwsSubjectsFromPdf.js --file ./data/courses.pdf --department CEA --program CpE
`);
}

function parseArgs(argv) {
  const args = {
    file: "",
    department: "CEA",
    program: "CpE",
    defaultUnits: 3,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help") {
      args.help = true;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--file") {
      args.file = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }

    if (token.startsWith("--file=")) {
      args.file = token.split("=").slice(1).join("=").trim();
      continue;
    }

    if (token === "--department") {
      args.department = String(argv[i + 1] || "").trim() || args.department;
      i += 1;
      continue;
    }

    if (token.startsWith("--department=")) {
      args.department = token.split("=").slice(1).join("=").trim() || args.department;
      continue;
    }

    if (token === "--program") {
      args.program = String(argv[i + 1] || "").trim() || args.program;
      i += 1;
      continue;
    }

    if (token.startsWith("--program=")) {
      args.program = token.split("=").slice(1).join("=").trim() || args.program;
      continue;
    }

    if (token === "--default-units") {
      args.defaultUnits = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token.startsWith("--default-units=")) {
      args.defaultUnits = Number(token.split("=").slice(1).join("="));
      continue;
    }
  }

  if (!Number.isFinite(args.defaultUnits) || args.defaultUnits < 0) {
    throw new Error("--default-units must be a number >= 0.");
  }

  return args;
}

function normalizeLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function looksLikeHeader(line) {
  return /course\s*code|subject\s*code|course\s*title|subject\s*title|units?/i.test(line);
}

function looksLikeCode(token) {
  return /^[A-Z]{2,}[A-Z0-9-]*\d{2,}[A-Z0-9-]*$/i.test(token);
}

function cleanTitle(raw) {
  let title = normalizeLine(raw).replace(/^[-:|]+\s*/, "");

  // Curriculum tables usually append columns after the title, starting at the
  // first decimal unit value (e.g., "3.75 - 3.0 None None").
  title = title.replace(/\s+\d+\.\d+\b.*$/i, "").trim();

  const startsWithUnits = title.match(/^\d+(?:\.\d+)?\s+(.+)$/);
  if (startsWithUnits) {
    title = startsWithUnits[1].trim();
  }

  title = title.replace(/\s+None(?:\s+None)*$/i, "").trim();
  title = title.replace(/\s+-\s*$/, "").trim();
  return title;
}

function extractSubjectsFromPdfText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const seenCodes = new Set();
  const subjects = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (looksLikeHeader(line)) continue;

    const codeOnlyMatch = line.match(/^([A-Z]{2,}[A-Z0-9-]*\d{2,}[A-Z0-9-]*)$/i);
    if (codeOnlyMatch) {
      const code = codeOnlyMatch[1].toUpperCase();
      const nextLine = normalizeLine(lines[i + 1] || "");
      if (!nextLine || looksLikeHeader(nextLine) || looksLikeCode(nextLine)) {
        continue;
      }

      const title = cleanTitle(nextLine);
      if (!title || /^[-\d.\s]+$/.test(title) || seenCodes.has(code)) {
        continue;
      }

      subjects.push({ code, title });
      seenCodes.add(code);
      i += 1;
      continue;
    }

    const inlineMatch = line.match(/^([A-Z]{2,}[A-Z0-9-]*\d{2,}[A-Z0-9-]*)\s*(?:[-:|]|\s)\s*(.+)$/i);
    if (!inlineMatch) continue;

    const code = inlineMatch[1].toUpperCase();
    const rawTitle = inlineMatch[2];
    const title = cleanTitle(rawTitle);

    if (!title || /^[-\d.\s]+$/.test(title) || seenCodes.has(code)) {
      continue;
    }

    subjects.push({ code, title });
    seenCodes.add(code);
  }

  return subjects;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
      printUsage();
      process.exit(0);
    }

    if (!args.file) {
      printUsage();
      throw new Error("Missing required --file argument.");
    }

    const pdfPath = path.resolve(process.cwd(), args.file);
    const fileBuffer = await fs.readFile(pdfPath);
    const parser = new PDFParse({ data: fileBuffer });
    const textResult = await parser.getText();
    await parser.destroy();
    const subjects = extractSubjectsFromPdfText(textResult.text || "");

    if (!subjects.length) {
      throw new Error("No course code/title pairs were detected in the PDF text.");
    }

    console.log(`Parsed ${subjects.length} subject(s) from PDF.`);
    console.table(subjects.slice(0, 20));

    if (args.dryRun) {
      console.log("Dry run complete. No database changes were made.");
      process.exit(0);
    }

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in environment.");
    }

    await mongoose.connect(process.env.MONGO_URI, { dbName: "mainDB" });

    const operations = subjects.map((subject) => ({
      updateOne: {
        filter: { code: subject.code },
        update: {
          $set: {
            code: subject.code,
            title: subject.title,
            isActive: true,
          },
          $setOnInsert: {
            units: args.defaultUnits,
            department: args.department,
            program: args.program,
          },
        },
        upsert: true,
      },
    }));

    const result = await Subject.bulkWrite(operations, { ordered: false });

    console.log("Import complete.");
    console.log(`Matched: ${result.matchedCount || 0}`);
    console.log(`Modified: ${result.modifiedCount || 0}`);
    console.log(`Inserted: ${result.upsertedCount || 0}`);

    process.exit(0);
  } catch (error) {
    console.error("PDF import failed:", error.message || error);
    process.exit(1);
  }
}

main();
