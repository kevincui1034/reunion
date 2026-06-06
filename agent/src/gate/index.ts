/**
 * Intent gate entry point.  [Owner: Pablo]
 * Stable seam: `classify(window) → IntentVerdict`. Heuristic today; ONNX later.
 */
export { classify, type GateOptions } from "./heuristic.js";
// TODO(Pablo): export an ONNX-backed `classify` from ./onnx.js and switch here
// once the model is trained. Callers never change.
