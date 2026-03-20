import mongoose from "mongoose";
import dotenv from "dotenv";
import Subject from "../models/TWS/subject.js";

dotenv.config();

const subjects = [
  { code: "ELT1011", title: "Circuits 1", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "CN1014", title: "Construction", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "CPET2114", title: "Microprocessor Systems", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "GE1110", title: "UTS (Understanding the Self)", units: 1.5, department: "CEA", program: "CpE", isActive: true },
  { code: "GE1081", title: "Ethics", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "GE1053", title: "Numerical Methods", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "MG1210", title: "Entrepreneurship", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "ELT1016", title: "Electronic Devices", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "ELT1021", title: "Digital Design", units: 3, department: "CEA", program: "CpE", isActive: true },
  { code: "ME1123", title: "Thermodynamics", units: 3, department: "CEA", program: "CpE", isActive: true },
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "mainDB",
    });

    for (const subject of subjects) {
      await Subject.updateOne(
        { code: subject.code },
        { $set: subject },
        { upsert: true }
      );
    }

    console.log("TWS subjects seeded successfully into mainDB.");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

run();