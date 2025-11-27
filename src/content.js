import { run } from "./common";

globalThis.__KISS_CONTEXT__ = "content";

run();

// 监听来自选项页面的消息，用于跳转到指定时间
window.addEventListener("message", function(event) {
  // 检查消息来源和类型
  if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
    // 查找页面上的视频元素
    const video = document.querySelector('video');
    if (video) {
      // 将毫秒转换为秒并设置视频时间
      video.currentTime = event.data.time / 1000;
      
      // 如果视频暂停则播放
      if (video.paused) {
        video.play()
          .catch(e => console.log("Auto-play prevented by browser policy:", e));
      }
    }
  }
});
