import { z } from "zod";

export const ticketAdjustmentSchema = z.object({
  targetUserId: z.string().uuid(),
  delta: z.number().int().min(-2147483647).max(2147483647).refine((n) => n !== 0, "Enter a nonzero ticket adjustment"),
  reason: z.string().trim().min(1, "A reason is required").max(200),
  requestId: z.string().uuid(),
});