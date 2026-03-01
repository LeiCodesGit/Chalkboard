import express from 'express';

const scheduleSyllabusRoutes = express.Router();

scheduleSyllabusRoutes.get('/', (req, res) => {
    res.render('Syllabus/scheduleSyllabus', { currentPageCategory: "syllabus" });
});

export default scheduleSyllabusRoutes;