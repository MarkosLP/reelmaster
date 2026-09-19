import type { VisualPlan } from "../../domain/visual-plan";
import type { VisualAsset } from "../../domain/visual-asset";
export type VisualResolution = {
  asset: VisualAsset;
  metrics: {
    generationMs: number;
    cache: "hit" | "miss";
    bytes: number;
    inputHash: string;
    cacheHit?: boolean;
    importMs?: number;
    cacheRecovered?: boolean;
  };
};
// Infrastructure closes over private storage and the fixed local environment.
export interface VisualResolver {
  readonly id: string;
  resolve(plan: VisualPlan): Promise<VisualResolution>;
}
