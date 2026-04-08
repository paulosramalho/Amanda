import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "amanda-ads-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Amanda Ads Backend",
    status: "running",
    health: "/health",
  });
});

app.listen(PORT, () => {
  console.log(`Amanda backend running on port ${PORT}`);
});
