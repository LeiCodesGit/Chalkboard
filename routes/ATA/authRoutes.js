import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Your REAL database users for the simulator
export const mockUsers = {
    "prof1": { _id: "699dd503a2b3c891dbd08861", role: "Professor", department: "CEA", program: "CpE", name: "Full-Time Professor", employmentType: "Full-Time", isPracticumCoordinator: false },
    "prof2": { _id: "699dd503a2b3c891dbd08862", role: "Professor", department: "CEA", program: "CpE", name: "John Doe", employmentType: "Part-Time", isPracticumCoordinator: false },
    "chair1": { _id: "699e5f7c5ecad71ff30de57b", role: "Program-Chair", department: "CEA", program: "CpE", name: "Jane Doe", employmentType: "Full-Time", isPracticumCoordinator: false },
    "dean1": { _id: "699de1968c29e4ec0c455131", role: "Dean", department: "CEA", program: "CpE", name: "Steph Curry", employmentType: "Full-Time", isPracticumCoordinator: false },
    
    // 👇 FIXED: Changed role to exactly match the DB Schema Enum
    "coord1": { _id: "699dd503a2b3c891dbd08899", role: "Practicum-Coordinator", department: "CEA", program: "CpE", name: "Johnny Bravo", employmentType: "Full-Time", isPracticumCoordinator: true },
    
    // 👇 NEW: Added missing VPAA test account so you can test the final step
    "vpaa1": { _id: "699de1968c29e4ec0c455999", role: "VPAA", department: "Mapua", program: "ALL", name: "Boss VPAA", employmentType: "Full-Time", isPracticumCoordinator: false }
};
router.post('/simulate-login', (req, res) => {
    const { userId } = req.body;  
    const user = mockUsers[userId];

    if (!user) return res.status(404).json({ error: "User not found" });

    // Generate a REAL token
    const token = jwt.sign(user, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });

    // Put the token securely inside a Cookie!
    res.cookie('jwt', token, { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 });
    
    res.json({ success: true, message: `Logged in as ${user.name}`, role: user.role });
});

// Logout Route
router.get('/logout', (req, res) => {
    res.clearCookie('jwt');
    res.redirect('/ata');
});

export default router;