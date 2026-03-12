import express from 'express';
import { Pre_Main, Pre_B1, Pre_B2 } from '../../../models/TLA/tlaModels.js';

const router = express.Router();

// CREATE Pre-Digital Session
router.post('/', async (req, res) => {
    try {
        const newSession = await Pre_Main.create(req.body);
        const backup = { ...newSession.toObject() }; delete backup._id;
        await Promise.all([ Pre_B1.create(backup), Pre_B2.create(backup) ]);
        res.status(201).json(newSession);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ by TLA ID
router.get('/tla/:tlaID', async (req, res) => {
    try {
        const sessions = await Pre_Main.find({ tlaID: req.params.tlaID });
        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ single by ID
router.get('/:id', async (req, res) => {
    try {
        const session = await Pre_Main.findById(req.params.id);
        if (!session) return res.status(404).json({ message: 'Pre-Digital session not found' });
        res.status(200).json(session);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UPDATE Pre-Digital Session
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Pre_Main.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: 'Pre-Digital session not found' });
        await Promise.all([
            Pre_B1.findByIdAndUpdate(id, req.body),
            Pre_B2.findByIdAndUpdate(id, req.body)
        ]);
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE Pre-Digital Session
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Promise.all([
            Pre_Main.findByIdAndDelete(id),
            Pre_B1.findByIdAndDelete(id),
            Pre_B2.findByIdAndDelete(id)
        ]);
        res.status(200).json({ message: 'Pre-Digital session deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;