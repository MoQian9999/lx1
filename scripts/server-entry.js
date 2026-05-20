// ============================================================
// SEA 打包入口
// 被 server.js 引用：检测到嵌入资源时从内存服务 public/
// 否则回退到 express.static 文件系统模式
// box/ 游戏目录永远从磁盘加载（支持动态添加游戏）
// ============================================================

let embeddedPublic = null;
try {
  // build 脚本会生成此文件，内含所有 public/ 文件的内容映射
  embeddedPublic = require("./_embedded_assets");
} catch {
  // 源码运行时此文件不存在，使用 express.static 方式
}

// 注入到全局供 server.js 使用
global.__EMBEDDED_PUBLIC__ = embeddedPublic;

// 启动服务器逻辑（server.js 被打包进同一文件后，此 require 只加载一次）
require("../server");
