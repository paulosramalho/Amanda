import "dotenv/config";
import cors from "cors";
import express from "express";
import { prisma } from "./lib/prisma.js";
import { toBusinessDateAtNoon, toBusinessDateIsoString } from "./lib/businessDate.js";

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

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      ok: true,
      service: "amanda-ads-backend",
      db: "reachable",
      businessDateRule: "UTC-3 T12:00:00",
      businessDate: toBusinessDateIsoString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: "amanda-ads-backend",
      db: "unreachable",
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
});

app.get("/business-date", (_req, res) => {
  const businessDateAtNoon = toBusinessDateAtNoon();

  res.status(200).json({
    ok: true,
    iso: toBusinessDateIsoString(businessDateAtNoon),
    utc: businessDateAtNoon.toISOString(),
    rule: "Always UTC-3 T12:00:00",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Amanda Ads Backend",
    status: "running",
    health: "/health",
    databaseHealth: "/health/db",
    businessDate: "/business-date",
  });
});

const server = app.listen(PORT, () => {
  console.log(`Amanda backend running on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
