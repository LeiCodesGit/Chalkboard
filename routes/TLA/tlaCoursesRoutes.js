import express from 'express';
import { requireLogin, getCourses } from '../../controllers/tlaController.js';

const coursesRoutes = express.Router();

// GET /tla/courses — list courses from Syllabus
coursesRoutes.get('/', requireLogin, getCourses);

export default coursesRoutes;
