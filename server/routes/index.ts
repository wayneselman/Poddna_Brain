import type { Express } from "express";
import type { Server } from "http";
import { registerRoutes } from "../routes";

export async function initializeRoutes(app: Express): Promise<Server> {
  return registerRoutes(app);
}
