import express from 'express';

const infoSyllabusRoutes = express.Router();

infoSyllabusRoutes.get('/', (req, res) => {
    res.render('Syllabus/infoSyllabus', { currentPageCategory: "syllabus" });
});

export default infoSyllabusRoutes;