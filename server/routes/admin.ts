import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, requireAdmin, requireAdminOrModerator } from "../replitAuth";

export function buildAdminRouter(): Router {
  const router = Router();

  router.get("/users", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  router.get("/jobs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { type, status, limit } = req.query;
      let jobs;

      if (type && status) {
        jobs = await storage.getJobsByType(type as string, status as string);
      } else if (type) {
        jobs = await storage.getJobsByType(type as string);
      } else if (status) {
        jobs = await storage.getJobsByStatus(status as string, limit ? parseInt(limit as string) : 100);
      } else {
        jobs = await storage.getJobsByStatus("pending", limit ? parseInt(limit as string) : 100);
      }

      res.json(jobs);
    } catch (error) {
      console.error("[ADMIN_JOBS] Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  router.get("/jobs/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const [pending, running, done, failed] = await Promise.all([
        storage.countJobsByStatus("pending"),
        storage.countJobsByStatus("running"),
        storage.countJobsByStatus("done"),
        storage.countJobsByStatus("error"),
      ]);

      res.json({
        pending,
        running,
        completed: done,
        failed,
        total: pending + running + done + failed,
      });
    } catch (error) {
      console.error("[ADMIN_JOBS] Error fetching job stats:", error);
      res.status(500).json({ error: "Failed to fetch job stats" });
    }
  });

  router.get("/jobs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  router.post("/jobs/:id/retry", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const retriedJob = await storage.retryJob(req.params.id);
      res.json(retriedJob);
    } catch (error) {
      console.error("Error retrying job:", error);
      res.status(500).json({ error: "Failed to retry job" });
    }
  });

  router.post("/jobs/:id/cancel", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const cancelledJob = await storage.cancelJob(req.params.id);
      res.json(cancelledJob);
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  return router;
}
