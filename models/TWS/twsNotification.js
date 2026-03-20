import mongoose, { Schema, model } from "mongoose";

const notificationReadSchema = new Schema(
  {
    userId: { type: String, required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const notificationHiddenSchema = new Schema(
  {
    userId: { type: String, required: true },
    hiddenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const twsNotificationSchema = new Schema(
  {
    twsID: { type: Schema.Types.ObjectId, ref: "TWS", required: true },
    eventType: {
      type: String,
      enum: ["status-update", "faculty-note"],
      default: "status-update",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },

    statusFrom: { type: String, default: "" },
    statusTo: { type: String, default: "" },

    audienceRoles: {
      type: [String],
      default: ["Program-Chair", "Dean", "Professor"],
    },

    recipientUserIds: {
      type: [String],
      default: [],
    },
    recipientEmails: {
      type: [String],
      default: [],
    },
    recipientEmpIds: {
      type: [String],
      default: [],
    },

    department: { type: String, default: "" },
    program: { type: String, default: "" },
    facultyEmail: { type: String, default: "" },
    facultyEmpId: { type: String, default: "" },

    createdByRole: { type: String, default: "" },
    createdByName: { type: String, default: "" },
    createdByEmail: { type: String, default: "" },

    readBy: {
      type: [notificationReadSchema],
      default: [],
    },

    hiddenBy: {
      type: [notificationHiddenSchema],
      default: [],
    },
  },
  { timestamps: true }
);

twsNotificationSchema.index({ audienceRoles: 1, createdAt: -1 });
twsNotificationSchema.index({ department: 1, program: 1, createdAt: -1 });
twsNotificationSchema.index({ facultyEmail: 1, facultyEmpId: 1, createdAt: -1 });
twsNotificationSchema.index({ recipientUserIds: 1, createdAt: -1 });
twsNotificationSchema.index({ recipientEmails: 1, createdAt: -1 });
twsNotificationSchema.index({ recipientEmpIds: 1, createdAt: -1 });
twsNotificationSchema.index({ "hiddenBy.userId": 1, createdAt: -1 });

const TWSNotification =
  mongoose.models.TWSNotification || model("TWSNotification", twsNotificationSchema);

export default TWSNotification;
