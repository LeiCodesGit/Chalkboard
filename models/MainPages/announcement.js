import { mainDB } from '../../database/mongo-dbconnect.js';
import { Schema } from 'mongoose';

const announcementSchema = new Schema(
    {
        department:    { type: String, required: true, trim: true },
        category:      { type: String, required: true, trim: true },
        headline:      { type: String, required: true, trim: true },
        messageDetail: { type: String, required: true },
        postedBy: {
            userId:     { type: String },
            firstName:  { type: String },
            lastName:   { type: String },
            role:       { type: String },
            department: { type: String }
        }
    },
    { timestamps: true }
);

const Announcement = mainDB.model('Announcement', announcementSchema);

export { announcementSchema };
export default Announcement;