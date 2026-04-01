#!/usr/bin/env npx tsx
/**
 * Direct invocation of handleComputeShowProfileJob — bypasses job dispatch.
 * Usage: npx tsx scripts/invoke-show-profile-job.ts <podcastId>
 */
import { handleComputeShowProfileJob } from "../server/job-workers/compute-show-profile";
import type { Job } from "@shared/schema";

const podcastId = process.argv[2] || "06c1280f-ffca-446d-917e-a6eb4a57dada";

const mockJob = {
  id: "local-invoke",
  type: "compute_show_profile",
  status: "pending",
  result: { podcastId },
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Job;

console.log(`[INVOKE] Running compute_show_profile job for podcast ${podcastId}`);

handleComputeShowProfileJob(mockJob, (msg, pct) => {
  console.log(`[PROGRESS ${pct}%] ${msg}`);
})
  .then(result => {
    console.log("\n[INVOKE] Job complete:", JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error("\n[INVOKE] Job failed:", err);
    process.exit(1);
  });
