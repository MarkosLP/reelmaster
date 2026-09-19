import {
  ImageGenerationRequestSchema,
  type ImageGenerationRequest,
} from "../../domain/image-generation";
import { VisualResolutionError } from "../../domain/visual-plan";

export const workflowVersion = "sdxl-lightning-2step-v1";
export const generationParameters = {
  steps: 2,
  cfg: 1,
  sampler: "euler",
  scheduler: "sgm_uniform",
  denoise: 1,
  batch: 1,
} as const;
export function buildComfyWorkflow(
  raw: ImageGenerationRequest,
  checkpoint: string,
  prefix: string,
) {
  const parsed = ImageGenerationRequestSchema.safeParse(raw);
  if (!parsed.success)
    throw new VisualResolutionError("INVALID_SPEC", "Invalid image request");
  const r = parsed.data;
  if (
    r.width !== 512 ||
    r.height !== 768 ||
    r.options.iterations !== 2 ||
    r.options.guidanceStrength !== 1 ||
    !/^reelmaster_[a-f0-9]{32}$/.test(prefix)
  )
    throw new VisualResolutionError(
      "INVALID_SPEC",
      "Only the validated 512x768, 2-step, CFG 1 profile is enabled",
    );
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: r.prompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: r.negativePrompt ?? "", clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: r.width, height: r.height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: r.seed,
        steps: 2,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "sgm_uniform",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: prefix },
    },
  };
}
