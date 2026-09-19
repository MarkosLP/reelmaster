import type {
  ImageGenerationProvider,
  ImageProviderIdentity,
} from "../../application/ports/image-generation-provider";
import { unavailableImageCapability } from "../../domain/image-generation";
import { VisualResolutionError } from "../../domain/visual-plan";
import { readComfyConfig } from "./comfy-config";
import { ComfyUIImageProvider } from "./comfy-image-provider";
export class UnavailableImageProvider implements ImageGenerationProvider {
  capability() {
    return unavailableImageCapability;
  }
  identity(): ImageProviderIdentity {
    throw new VisualResolutionError(
      "UNAVAILABLE",
      "No verified local image backend or model",
    );
  }
  async generate(): Promise<Uint8Array> {
    throw new VisualResolutionError(
      "UNAVAILABLE",
      "No verified local image backend or model",
    );
  }
}
export const createLocalImageProvider = (): ImageGenerationProvider => {
  const config = readComfyConfig();
  return config
    ? new ComfyUIImageProvider(config)
    : new UnavailableImageProvider();
};
