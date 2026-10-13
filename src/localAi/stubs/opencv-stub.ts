// Offscreen 宿主主线程中 @techstark/opencv-js 的轻量桩实现。
// 实际 OCR 推理完全在 worker-entry (Web Worker) 子线程中执行，主线程无需内联完整的 OpenCV 运行时。
const opencvStub = {
  Mat: class {},
  onRuntimeInitialized: null,
};

export default opencvStub;
