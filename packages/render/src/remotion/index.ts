import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.js";

// Remotion entry point (referenced by the bundler in the render stage + studio).
registerRoot(RemotionRoot);
