import express from "express";

import { apiV1Router } from "./routes.js";

export function buildApp() {
  const app = express();

  // Middleware for JSON parsing.
  app.use(express.json());

  // Group routes under /api.
  app.use("/api", apiV1Router);

  return app;
}
