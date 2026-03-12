import express from 'express';
import Course from '../models/Course.js';

const router = express.Router();

// SHOW PAGE
router.get('/courses', async (req, res) => {
    const curricula = await Course.find();
    res.render('admin-courses', { curricula });
});

// SAVE CURRICULUM
router.post('/courses/save', async (req, res) => {
    try {
        const { program, title, courseCode, courseName, units } = req.body;

        const codes = Array.isArray(courseCode) ? courseCode : [courseCode];
        const names = Array.isArray(courseName) ? courseName : [courseName];
        const unitList = Array.isArray(units) ? units : [units];

        const coursesArray = codes.map((code, index) => ({
            courseCode: code,
            courseTitle: names[index],
            units: Number(unitList[index])
        }));

        const newCurriculum = new Course({
            program: program,
            term: title,
            courses: coursesArray
        });

        await newCurriculum.save();

        res.redirect('/admin/courses');

    } catch (error) {
        res.status(500).send(error.message);
    }
});

export default router;