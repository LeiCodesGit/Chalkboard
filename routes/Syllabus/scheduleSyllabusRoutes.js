import express from 'express';
import mongoose from 'mongoose';
import { mainDB } from '../../database/mongo-dbconnect.js';

// Import all Syllabus models
import Syllabus from '../../models/Syllabus/syllabus.js';
import ProgramEducationalObjectives from '../../models/Syllabus/programEducationObjectives.js';
import StudentEducationalObjectives from '../../models/Syllabus/studentEducationalObjectives.js';
import CourseOutcomes from '../../models/Syllabus/courseOutcomes.js';
import CourseMapping from '../../models/Syllabus/courseMapping.js';
import WeeklySchedule from '../../models/Syllabus/weeklySchedule.js';
import CourseEvaluationPerCO from '../../models/Syllabus/courseEvaluationPerCO.js';
import SyllabusApprovalStatus from '../../models/Syllabus/syllabusApprovalStatus.js';

const scheduleSyllabusRoutes = express.Router();

scheduleSyllabusRoutes.get('/:syllabusId', async (req, res) => {
    try {
        const syllabusId = req.params.syllabusId;
        const schedules = await WeeklySchedule.find({ syllabusID: syllabusId }).sort({ week: 1 });
        const evaluation = await CourseEvaluationPerCO.find({ syllabusID: syllabusId });

        res.render('Syllabus/scheduleSyllabus', { 
            currentPageCategory: "syllabus",
            syllabusId: syllabusId,
            schedules: schedules || [],
            evaluation: evaluation || [],
            userRole: req.session.user ? req.session.user.role : '',
            userId: req.session.user ? req.session.user.id : ''
        });
    } catch (err) {
        console.error("Error fetching schedule/evaluation:", err);
        res.render('Syllabus/scheduleSyllabus', { 
            currentPageCategory: "syllabus",
            syllabusId: req.params.syllabusId,
            schedules: [],
            evaluation: [],
            userRole: req.session.user ? req.session.user.role : '',
            userId: req.session.user ? req.session.user.id : ''
        });
    }
});

scheduleSyllabusRoutes.post('/submit', async (req, res) => {
    try {
        const payload = req.body;
        console.log("RECEIVED PAYLOAD FROM FRONTEND:", JSON.stringify({ 
            hasBasicInfo: !!payload.basicInfo, 
            hasId: !!payload.syllabusId, 
            syllabusIdValue: payload.syllabusId 
        }));
        
        const syllabusID = payload.syllabusId;
        if (!syllabusID) {
            return res.status(400).json({ success: false, error: "Missing course ID from payload." });
        }

        const existingSyllabus = await Syllabus.findById(syllabusID);
        if (!existingSyllabus) {
            return res.status(404).json({ success: false, error: "Course not found in database." });
        }
        
        // 1. Update existing main Syllabus document
        existingSyllabus.courseCode = payload.basicInfo.courseCode || existingSyllabus.courseCode;
        existingSyllabus.courseTitle = payload.basicInfo.courseTitle || existingSyllabus.courseTitle;
        existingSyllabus.preRequisite = payload.basicInfo.preRequisite || "";
        existingSyllabus.coRequisite = payload.basicInfo.coRequisite || "";
        existingSyllabus.units = parseInt(payload.basicInfo.units) || existingSyllabus.units || 0;
        existingSyllabus.classSchedule = parseInt(payload.basicInfo.classSchedule) || existingSyllabus.classSchedule || 0;
        existingSyllabus.courseDesign = payload.basicInfo.courseDesign || "";
        existingSyllabus.courseDescription = payload.basicInfo.courseDescription || "";
        existingSyllabus.term = payload.basicInfo.term || "";
        existingSyllabus.schoolYear = payload.basicInfo.schoolYear || "";
        existingSyllabus.programPreparedFor = payload.basicInfo.programPreparedFor || "";
        existingSyllabus.textbook = payload.basicInfo.textbook || "";
        existingSyllabus.references = payload.basicInfo.references || "";

        if (payload.conceptMap) {
            existingSyllabus.conceptMap = payload.conceptMap;
        }

        await existingSyllabus.save();

        // Clean out any old dependent drafts so they don't multiply infinitely
        await ProgramEducationalObjectives.deleteMany({ syllabusID });
        await StudentEducationalObjectives.deleteMany({ syllabusID });
        await CourseOutcomes.deleteMany({ syllabusID });
        await CourseMapping.deleteMany({ syllabusID });
        await WeeklySchedule.deleteMany({ syllabusID });
        await CourseEvaluationPerCO.deleteMany({ syllabusID });
        await SyllabusApprovalStatus.deleteMany({ syllabusID });

        // 2. Save Program Educational Objectives
        if (payload.programObjectives && payload.programObjectives.length > 0) {
            const peo = new ProgramEducationalObjectives({
                syllabusID,
                description: payload.programObjectives,
                rating: (payload.programObjectivesRating && payload.programObjectivesRating.length > 0) ? payload.programObjectivesRating : Array(payload.programObjectives.length).fill("I") // Default rating
            });
            await peo.save();
        }

        // 2.5 Save Student Educational Objectives
        if (payload.studentObjectives && payload.studentObjectives.length > 0) {
            const seo = new StudentEducationalObjectives({
                syllabusID,
                description: payload.studentObjectives,
                rating: (payload.studentObjectivesRating && payload.studentObjectivesRating.length > 0) ? payload.studentObjectivesRating : Array(payload.studentObjectives.length).fill("I")
            });
            await seo.save();
        }

        // 3. Save Course Outcomes
        if (payload.courseOutcomesEditor && payload.courseOutcomesEditor.length > 0) {
            for (const co of payload.courseOutcomesEditor) {
                const assessmentTask = payload.courseOutcomesAssessment?.find(
                    a => a.coNumber === co.coNumber
                );
                const newCo = new CourseOutcomes({
                    syllabusID,
                    coNumber: co.coNumber,
                    description: [co.description],
                    thinkingSkills: [co.thinkingSkills],
                    assessmentTasks: assessmentTask ? assessmentTask.assessmentTasks : '',
                    minSatisfactoryPerf: assessmentTask ? (parseFloat(assessmentTask.minSatisfactoryPerf) || 0) : 0
                });
                await newCo.save();
            }
        }

        // 4. Save Course Mapping
        if (payload.courseMapping && payload.courseMapping.length > 0) {
            for (const map of payload.courseMapping) {
                const newMapping = new CourseMapping({
                    syllabusID,
                    numberOfCO: parseInt(map.coNumber.replace(/\D/g, '')) || 0,
                    program: "Engineering", // Default based on placeholder
                    fromAtoL: map.alignments
                });
                await newMapping.save();
            }
        }

        // 5. Save Weekly Schedule
        if (payload.weeklySchedule && payload.weeklySchedule.length > 0) {
            for (const sched of payload.weeklySchedule) {
                const newSched = new WeeklySchedule({
                    syllabusID,
                    week: parseInt(sched.week) || 0,
                    outcomeCo: parseInt(sched.coNumber.replace(/\D/g, '')) || 0,
                    outcomeMo: sched.moNumber,
                    outcomeIlo: sched.iloNumber,
                    coverageDay: parseInt(sched.coverageDay) || 0,
                    coverageTopic: sched.coverageTopic,
                    tlaMode: sched.tlaMode,
                    tlaActivities: sched.tlaActivities,
                    assessmentTaskMode: sched.assessmentTaskMode,
                    assessmentTaskTask: sched.assessmentTaskTask,
                    referenceNum: sched.referenceNum,
                    dateCovered: sched.dateCovered
                });
                await newSched.save();
            }
        }

        // 6. Save Course Evaluation
        if (payload.courseEvaluation && payload.courseEvaluation.length > 0) {
            for (const evalEntry of payload.courseEvaluation) {
                const newEval = new CourseEvaluationPerCO({
                    syllabusID,
                    coNumber: evalEntry.coNumber,
                    moduleCode: evalEntry.moduleCode,
                    // Parse weights safely
                    onlineTaskWeight: parseFloat(evalEntry.assessmentWeightLT) || 0,
                    longExaminationWeight: parseFloat(evalEntry.assessmentWeightPE) || 0,
                    moduleWeight: parseFloat(evalEntry.modularWeight) || 0,
                    finalWeight: parseFloat(evalEntry.finalWeight) || 0
                });
                await newEval.save();
            }
        }

        // 7. Create Approval Status (Pending)
        const approval = new SyllabusApprovalStatus({
            syllabusID,
            status: "Pending",
            remarks: "Syllabus Initial Submission"
        });
        await approval.save();

        res.json({ success: true, syllabusId: syllabusID });
    } catch (error) {
        console.error("Error in /syllabus/schedule/submit:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default scheduleSyllabusRoutes;