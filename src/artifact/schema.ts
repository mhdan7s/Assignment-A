import { z } from "zod";

/**
 * Minimal Zod stub for Phase 1. Full capability contract expands in Phase 5.
 * Focal evaluation point — keep versioned and reviewable.
 */
export const CapabilityArtifactSchema = z.object({
  schemaVersion: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

export type CapabilityArtifact = z.infer<typeof CapabilityArtifactSchema>;
