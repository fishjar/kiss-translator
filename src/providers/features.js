import { projectApiCapabilities } from "../config/serviceSelection";
import { getCapabilityDescriptor } from "./capabilities";
/** Feature options are separate from enabled task capabilities. */
export function supportsServiceFeature(api, feature, capability = "translate") {
  const descriptor = getCapabilityDescriptor(
    projectApiCapabilities(api),
    capability
  );
  if (feature === "batch") return descriptor?.batch?.supported === true;
  if (feature === "stream")
    return descriptor?.outputModes?.includes("stream") === true;
  return descriptor?.[feature] === true;
}
