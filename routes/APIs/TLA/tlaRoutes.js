import express from 'express';
import {
    TLA_Main, TLA_B1, TLA_B2,
    Pre_Main, Pre_B1, Pre_B2,
    Post_Main, Post_B1, Post_B2,
    Status_Main, Status_B1, Status_B2
} from '../../../models/TLA/tlaModels.js';

const router = express.Router();

// ── Helpers ──
function syncBackup(model1, model2, id, data) {
    return Promise.all([
        model1.findByIdAndUpdate(id, data, { new: false }),
        model2.findByIdAndUpdate(id, data, { new: false })
    ]);
}

function stripId(doc) {
    const d = doc.toObject ? doc.toObject() : { ...doc };
    delete d._id;
    return d;
}

// ── TLA CRUD ──

// CREATE TLA (+ pre-digital session + approval status stub)
router.post('/', async (req, res) => {
    try {
        const { preDigital, ...tlaData } = req.body;

        const newTLA = await TLA_Main.create(tlaData);
        const tlaBackup = stripId(newTLA);
        await Promise.all([ TLA_B1.create(tlaBackup), TLA_B2.create(tlaBackup) ]);

        // Create pre-digital session if provided
        let preDoc = null;
        if (preDigital) {
            preDigital.tlaID = newTLA._id;
            preDoc = await Pre_Main.create(preDigital);
            const preBackup = stripId(preDoc);
            await Promise.all([ Pre_B1.create(preBackup), Pre_B2.create(preBackup) ]);
        }

        // Create approval status stub
        const statusDoc = await Status_Main.create({ tlaID: newTLA._id, status: 'Not Submitted' });
        const statusBackup = stripId(statusDoc);
        await Promise.all([ Status_B1.create(statusBackup), Status_B2.create(statusBackup) ]);

        res.status(201).json({ tla: newTLA, preDigital: preDoc, status: statusDoc });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ – all TLAs for a user
router.get('/user/:userID', async (req, res) => {
    try {
        const tlas = await TLA_Main.find({ userID: req.params.userID }).sort({ weekNumber: 1 });
        const tlaIDs = tlas.map(t => t._id);
        const statuses = await Status_Main.find({ tlaID: { $in: tlaIDs } });
        res.status(200).json({ tlas, statuses });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ – single TLA with all sub-documents
router.get('/:id', async (req, res) => {
    try {
        const tla = await TLA_Main.findById(req.params.id);
        if (!tla) return res.status(404).json({ message: 'TLA not found' });

        const [preDigital, postDigital, status] = await Promise.all([
            Pre_Main.find({ tlaID: tla._id }),
            Post_Main.find({ tlaID: tla._id }),
            Status_Main.findOne({ tlaID: tla._id })
        ]);

        res.status(200).json({ tla, preDigital, postDigital, status });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UPDATE TLA
router.put('/:id', async (req, res) => {
    try {
        const { preDigital, postDigital, ...tlaData } = req.body;
        const { id } = req.params;

        const updated = await TLA_Main.findByIdAndUpdate(id, tlaData, { new: true });
        if (!updated) return res.status(404).json({ message: 'TLA not found' });
        await syncBackup(TLA_B1, TLA_B2, id, tlaData);

        // Upsert pre-digital
        if (preDigital) {
            await Pre_Main.findOneAndUpdate({ tlaID: id }, { ...preDigital, tlaID: id }, { upsert: true, new: true });
            await Pre_B1.findOneAndUpdate({ tlaID: id }, { ...preDigital, tlaID: id }, { upsert: true });
            await Pre_B2.findOneAndUpdate({ tlaID: id }, { ...preDigital, tlaID: id }, { upsert: true });
        }

        // Upsert post-digital
        if (postDigital) {
            await Post_Main.findOneAndUpdate({ tlaID: id }, { ...postDigital, tlaID: id }, { upsert: true, new: true });
            await Post_B1.findOneAndUpdate({ tlaID: id }, { ...postDigital, tlaID: id }, { upsert: true });
            await Post_B2.findOneAndUpdate({ tlaID: id }, { ...postDigital, tlaID: id }, { upsert: true });
        }

        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// SUBMIT TLA (change status to Pending)
router.patch('/:id/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const update = { status: 'Pending', approvalDate: null, remarks: null };

        const statusDoc = await Status_Main.findOneAndUpdate(
            { tlaID: id },
            update,
            { new: true }
        );
        await Status_B1.findOneAndUpdate({ tlaID: id }, update);
        await Status_B2.findOneAndUpdate({ tlaID: id }, update);

        // Also update tla status field
        await TLA_Main.findByIdAndUpdate(id, { status: 'Pending' });
        await TLA_B1.findByIdAndUpdate(id, { status: 'Pending' });
        await TLA_B2.findByIdAndUpdate(id, { status: 'Pending' });

        res.status(200).json(statusDoc);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE TLA (cascade: pre, post, status)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Promise.all([
            TLA_Main.findByIdAndDelete(id),
            TLA_B1.findByIdAndDelete(id),
            TLA_B2.findByIdAndDelete(id),
            Pre_Main.deleteMany({ tlaID: id }),
            Pre_B1.deleteMany({ tlaID: id }),
            Pre_B2.deleteMany({ tlaID: id }),
            Post_Main.deleteMany({ tlaID: id }),
            Post_B1.deleteMany({ tlaID: id }),
            Post_B2.deleteMany({ tlaID: id }),
            Status_Main.deleteMany({ tlaID: id }),
            Status_B1.deleteMany({ tlaID: id }),
            Status_B2.deleteMany({ tlaID: id })
        ]);
        res.status(200).json({ message: 'TLA and all related records deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;