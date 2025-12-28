import express from "express";

import { apiV1Router } from "./routes.js";

export function buildApp() {
  const app = express();

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Credentials are not allowed when Access-Control-Allow-Origin is '*'
    // res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Middleware for JSON parsing.
  app.use(express.json());

  // Group routes under /api.
  app.use("/api", apiV1Router);

  return app;
}
