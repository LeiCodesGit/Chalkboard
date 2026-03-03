import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import twaRoutes from "./routes/twaRoutes.js";

const app = express();
const PORT = 3002;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/twa/public", express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/twa", twaRoutes);


app.get("/", (req, res) => res.redirect("/twa/dashboard"));

app.listen(PORT, () => {
  console.log(`✅ TWA running at http://localhost:${PORT}/twa/dashboard`);
});