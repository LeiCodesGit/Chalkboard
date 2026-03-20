import { Schema, model } from "mongoose";

const userSchema = new Schema({
	address: { type: String },
	birthdate: { type: Date },
	gender: { type: String },

	password: {
		type: String,
		required: true
	},

	employmentFromOutside: {
		type: Boolean,
		default: false
	},

	employmentType: {
		type: String,
		enum: ["Full-Time", "Part-Time"]
	},

	employmentStatus: {
		type: String,
		enum: ["Yes", "No"],
		default: "No"
	},

	role: {
		type: String,
		enum: ["Professor", "Program-Chair", "Dean", "HR", "Admin", "Super-Admin", "Practicum-Coordinator", "VPAA", "HRMO" ],
		default: "Professor"
	},

	department: {
        type: String,
        enum: ["ATYCB", "CAS", "CCIS", "CEA", "CHS", "N/A"],
        required: true
    },

    program: {
        type: String,
        required: true,
        enum: [
            // ATYCB
            "ENTREP", "MA", "REM", "TM", "BSA", "AIS",
            // CAS
            "COMM", "MMA",
            // CCIS
            "CS", "EMC", "IS",
            // CEA
            "AR", "ChE", "CE", "CpE", "EE", "ECE", "IE", "ME",
            // CHS
            "BIO", "PHARM", "PSYCH", "PT", "MEDTECH",
			"N/A"
        ]
    },

	email: {
		type: String,
		required: true,
		unique: true
	},

	middleName: { type: String },
	firstName: { type: String, required: true },
	lastName: { type: String, required: true },

	employeeId: {
		type: String,
		unique: true
	},

	signatureImage: {
		type: String,
		default: ""
	}

}, { timestamps: true });

export default userSchema;
