import { describe, expect, test } from "bun:test";
import { ticketAdjustmentSchema } from "./ticket-adjustment-schema";

const input = { targetUserId: "d81e4875-03ed-4c2c-9b93-086fa7b307e1", requestId: "45903734-f0c5-406e-9509-0c4dd37fcfa2", delta: 3, reason: "Manual correction" };
describe("manual ticket adjustments", () => {
  test("accepts adding tickets", () => expect(ticketAdjustmentSchema.parse(input).delta).toBe(3));
  test("accepts removing tickets", () => expect(ticketAdjustmentSchema.parse({ ...input, delta: -3 }).delta).toBe(-3));
  test("requires whole tickets", () => expect(ticketAdjustmentSchema.safeParse({ ...input, delta: 1.5 }).success).toBe(false));
  test("requires a reason", () => expect(ticketAdjustmentSchema.safeParse({ ...input, reason: "  " }).success).toBe(false));
});