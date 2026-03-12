import express from 'express';
import { TLA_Main, TLA_B1, TLA_B2, Status_Main, Status_B1, Status_B2 } from '../../../models/TLA/tlaModels.js';

const Approval_Main = Status_Main;
const Approval_B1   = Status_B1;
const Approval_B2   = Status_B2;

const router = express.Router();

// CREATE Approval Status
router.post('/', async (req, res) => {
    try {
        const newApproval = await Approval_Main.create(req.body);
        const backup = { ...newApproval.toObject() }; delete backup._id;
        await Promise.all([ Approval_B1.create(backup), Approval_B2.create(backup) ]);
        res.status(201).json(newApproval);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ by TLA ID
router.get('/tla/:tlaID', async (req, res) => {
    try {
        const approval = await Approval_Main.findOne({ tlaID: req.params.tlaID }).populate('tlaID');
        if (!approval) return res.status(404).json({ message: 'Approval status not found' });
        res.status(200).json(approval);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// READ all – optional filter via query params
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        const approvals = await Approval_Main.find(filter).populate('tlaID');
        res.status(200).json(approvals);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UPDATE Approval Status (approve / return / archive)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Approval_Main.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) return res.status(404).json({ message: 'Approval status not found' });

        await Promise.all([
            Approval_B1.findByIdAndUpdate(id, req.body),
            Approval_B2.findByIdAndUpdate(id, req.body)
        ]);

        // Mirror status onto TLA document
        if (req.body.status) {
            const tlaStatus = req.body.status === 'Approved' ? 'Approved'
                            : req.body.status === 'Returned' ? 'Returned'
                            : req.body.status === 'Pending'  ? 'Pending'
                            : 'Draft';
            await Promise.all([
                TLA_Main.findByIdAndUpdate(updated.tlaID, { status: tlaStatus }),
                TLA_B1.findByIdAndUpdate(updated.tlaID, { status: tlaStatus }),
                TLA_B2.findByIdAndUpdate(updated.tlaID, { status: tlaStatus })
            ]);
        }

        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE Approval Status
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Promise.all([
            Approval_Main.findByIdAndDelete(id),
            Approval_B1.findByIdAndDelete(id),
            Approval_B2.findByIdAndDelete(id)
        ]);
        res.status(200).json({ message: 'Approval status deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;