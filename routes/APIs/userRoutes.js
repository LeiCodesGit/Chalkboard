import express from 'express';
import bcrypt from 'bcrypt';
import { mainDB, backup1, backup2 } from "../../database/mongo-dbconnect.js";
import userSchema from "../../models/user.js";

const MainUser = mainDB.model("User", userSchema);
const Backup1User = backup1.model("User", userSchema);
const Backup2User = backup2.model("User", userSchema);
const router = express.Router();

const SALT_ROUNDS = 12;

// ==========================================
// CREATE - POST /api/users/add
// ==========================================

router.post('/add', async (req, res) => {
    try {
        const userData = { ...req.body };

        if (!userData.password) {
            return res.status(400).json({ message: "Password is required." });
        }
        userData.password = await bcrypt.hash(userData.password, SALT_ROUNDS);

        const savePromises = [
            new MainUser(userData).save(),
            new Backup1User(userData).save(),
            new Backup2User(userData).save()
        ];

        await Promise.all(savePromises);

        res.status(201).json({
            message: "Success: User created in MainDB, Backup1, and Backup2!"
        });

    } catch (error) {
        console.error("Triple Save Error:", error);

        if (error.code === 11000) {
            return res.status(400).json({
                message: "Error: Email or Employee ID already exists in the system."
            });
        }

        res.status(500).json({ message: "Server Error: " + error.message });
    }
});

// ==========================================
// UPDATE - PUT /api/users/:id
// ==========================================

router.put('/:id', async (req, res) => {
    const {
        email,
        firstName,
        lastName,
        middleName,
        employeeId,
        phoneNumber,
        birthdate,
        gender,
        address,
        role,
        employmentType,
        employmentStatus,
        employmentFromOutside,
        program,
        department,
        password
    } = req.body;

    try {
        const updateData = {
            email,
            firstName,
            lastName,
            middleName,
            employeeId,
            phoneNumber,
            birthdate,
            gender,
            address,
            role,
            employmentType,
            employmentStatus,
            employmentFromOutside,
            program,
            department
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        // If a new password was provided, hash it before saving
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        // Update all three databases in parallel
        const [updatedUser] = await Promise.all([
            MainUser.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: false }
            ).select('-password'),
            Backup1User.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: false }
            ),
            Backup2User.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: false }
            )
        ]);

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(updatedUser);

    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ message: `${field} already exists` });
        }

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            return res.status(400).json({ message: "Validation error", errors });
        }

        if (error.kind === "ObjectId") {
            return res.status(400).json({ message: "Invalid user ID format" });
        }

        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// READ ALL - POST /api/users/search (with filters)
// ==========================================

router.post('/search', async (req, res) => {
    const {
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
        search,
        role,
        program,
        department,
        employmentStatus,
        employmentType,
        gender
    } = req.body;

    try {
        const query = {};

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { employeeId: { $regex: search, $options: "i" } }
            ];
        }

        if (role) query.role = role;
        if (program) query.program = program;
        if (department) query.department = department;
        if (employmentStatus) query.employmentStatus = employmentStatus;
        if (employmentType) query.employmentType = employmentType;
        if (gender) query.gender = gender;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

        const [users, total] = await Promise.all([
            MainUser.find(query)
                .select("-password")
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            MainUser.countDocuments(query)
        ]);

        res.status(200).json({
            data: users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalUsers: total,
                usersPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// READ BY ID - GET /api/users/:id
// ==========================================

router.get('/:id', async (req, res) => {
    try {
        const user = await MainUser.findById(req.params.id).select("-password").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(user);

    } catch (error) {
        if (error.kind === "ObjectId") {
            return res.status(400).json({ message: "Invalid user ID format" });
        }

        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// DELETE - DELETE /api/users/:id
// ==========================================

router.delete('/:id', async (req, res) => {
    try {
        const [deletedUser] = await Promise.all([
            MainUser.findByIdAndDelete(req.params.id),
            Backup1User.findByIdAndDelete(req.params.id),
            Backup2User.findByIdAndDelete(req.params.id)
        ]);

        if (!deletedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User deleted successfully" });

    } catch (error) {
        if (error.kind === "ObjectId") {
            return res.status(400).json({ message: "Invalid user ID format" });
        }

        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// UPDATE SIGNATURE - POST /api/users/update-signature
// ==========================================
router.post('/update-signature', async (req, res) => {
    try {
        const { signatureImage } = req.body;
        const userId = req.session?.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (!signatureImage || typeof signatureImage !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid signature image' });
        }

        // Update user signature in all databases
        const updateOp = { signatureImage };
        await Promise.all([
            MainUser.findByIdAndUpdate(userId, updateOp),
            Backup1User.findByIdAndUpdate(userId, updateOp),
            Backup2User.findByIdAndUpdate(userId, updateOp)
        ]);

        res.status(200).json({ success: true, message: 'Signature updated successfully' });
    } catch (error) {
        console.error('Error updating signature:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;