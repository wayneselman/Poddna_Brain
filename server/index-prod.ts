import fs from "node:fs";
import path from "node:path";
import { type Server } from "node:http";

import express, { type Express } from "express";
import runApp from "./app";
import { injectOgTags } from "./og-tags";

export async function serveStatic(app: Express, _server: Server) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", async (req, res, next) => {
    if (req.originalUrl === "/health" || req.originalUrl.startsWith("/api")) {
      return next();
    }

    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;

    if (url.startsWith("/creator")) {
      try {
        let html = await fs.promises.readFile(indexPath, "utf-8");
        html = await injectOgTags(html, url);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch {
        res.sendFile(indexPath);
      }
    } else {
      res.sendFile(indexPath);
    }
  });
}

async function main() {
  const server = await runApp(serveStatic);
  
  // Handle graceful shutdown
  const shutdown = () => {
    console.log("Shutting down gracefully...");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  
  // The Express server's event loop naturally keeps the process alive
  // No additional keep-alive mechanism needed
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
