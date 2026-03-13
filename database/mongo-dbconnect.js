import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const baseURI = process.env.MONGO_URI;

const mainDB = mongoose.createConnection(baseURI, {
  dbName: "mainDB",
});

const backup1 = mongoose.createConnection(baseURI, {
  dbName: "backup1",
});

const backup2 = mongoose.createConnection(baseURI, {
  dbName: "backup2",
});

mainDB.once("open", () => console.log("✅ Connected to mainDB"));
backup1.once("open", () => console.log("✅ Connected to backup1"));
backup2.once("open", () => console.log("✅ Connected to backup2"));

const connectDB = async () => {
  try {
    console.log("Initializing MongoDB connections...");

    await mongoose.connect(baseURI, {
      dbName: "mainDB",
    });

    console.log("✅ Connected to default mongoose (mainDB)");

    try {
      const indexes = await mongoose.connection.collection("tws").indexes();
      const hasOldIdIndex = indexes.some((idx) => idx.name === "id_1");

      if (hasOldIdIndex) {
        await mongoose.connection.collection("tws").dropIndex("id_1");
        console.log("✅ Dropped old index: id_1 from tws collection");
      } else {
        console.log("ℹ️ No old id_1 index found on tws collection");
      }
    } catch (indexErr) {
      console.log("ℹ️ TWS index cleanup skipped:", indexErr.message);
    }
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
};

export { mainDB, backup1, backup2 };
export default connectDB;