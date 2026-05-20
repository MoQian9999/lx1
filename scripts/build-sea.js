// ============================================================
// SEA 构建脚本
// 1. 嵌入 public/ 文件 → _embedded_assets.js
// 2. esbuild 打包 server + express + ws → dist/server.bundle.js
// 3. Node.js SEA 生成 blob 并注入到可执行文件
// 4. 打包 release 目录
// ============================================================

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SCRIPTS_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DIR = path.join(ROOT, "release");
const BOX_DIR = path.join(ROOT, "box");

// 平台配置
const PLATFORM = process.argv[2] || os.platform(); // linux | win32 | darwin
const NODE_VERSION = process.version.slice(1); // "24.15.0"

// ============================================================
// 步骤 1：嵌入 public/ 文件
// ============================================================
function embedPublicFiles() {
  console.log("[1/6] 嵌入 public/ 文件...");

  const assets = {};
  // 递归读取 public/ 下所有文件
  function readDir(dir, base) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = "/" + path.relative(PUBLIC_DIR, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        readDir(fullPath, base);
      } else {
        const isBinary = [".png", ".ico", ".jpg", ".jpeg", ".gif", ".woff", ".woff2"].some(ext =>
          entry.name.toLowerCase().endsWith(ext)
        );
        const content = fs.readFileSync(fullPath);
        if (isBinary) {
          assets[relPath] = { _base64: true, data: content.toString("base64") };
        } else {
          assets[relPath] = content.toString("utf-8");
        }
      }
    }
  }
  readDir(PUBLIC_DIR);

  // 写入嵌入资源文件
  const moduleCode = "module.exports = " + JSON.stringify(assets, null, 2) + ";";
  fs.writeFileSync(path.join(SCRIPTS_DIR, "_embedded_assets.js"), moduleCode, "utf-8");
  console.log("  已嵌入 " + Object.keys(assets).length + " 个文件");
}

// ============================================================
// 步骤 2：esbuild 打包
// ============================================================
function bundleWithEsbuild() {
  console.log("[2/6] esbuild 打包...");

  const entryFile = path.join(SCRIPTS_DIR, "server-entry.js");
  // esbuild 需要从根目录运行，因为 server.js 中 require("express") 等需要从 ROOT 的 node_modules 解析
  const result = spawnSync("npx", [
    "esbuild",
    entryFile,
    "--bundle",
    "--platform=node",
    "--target=node" + NODE_VERSION.split(".")[0],
    "--format=cjs",
    "--outfile=" + path.join(DIST_DIR, "server.bundle.js"),
    "--log-level=warning",
    "--color=true",
  ], { cwd: ROOT, stdio: "inherit" });

  if (result.status !== 0) {
    console.error("esbuild 打包失败");
    process.exit(1);
  }
  console.log("  打包完成: dist/server.bundle.js");
}

// ============================================================
// 步骤 3：生成 SEA 配置
// ============================================================
function generateSeaConfig() {
  console.log("[3/6] 生成 SEA 配置...");

  const config = {
    main: path.join(DIST_DIR, "server.bundle.js"),
    output: path.join(DIST_DIR, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
  };

  const configPath = path.join(DIST_DIR, "sea-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("  配置已生成: dist/sea-config.json");
  return configPath;
}

// ============================================================
// 步骤 4：生成 SEA blob
// ============================================================
function createSeaBlob(configPath) {
  console.log("[4/6] 生成 SEA blob...");

  const result = spawnSync("node", [
    "--experimental-sea-config", configPath,
  ], { cwd: ROOT, stdio: "inherit" });

  if (result.status !== 0) {
    console.error("SEA blob 生成失败");
    process.exit(1);
  }
  console.log("  blob 已生成: dist/sea-prep.blob");
}

// ============================================================
// 步骤 5：下载/复制 Node.js 平台二进制
// ============================================================
function getNodeBinary() {
  console.log("[5/6] 准备 " + PLATFORM + " 平台 Node 二进制...");

  const ext = PLATFORM === "win32" ? ".exe" : "";
  const binaryName = "node" + ext;
  const outName = PLATFORM === "win32" ? "桌游集合.exe" : "桌游集合";
  const outPath = path.join(DIST_DIR, outName);

  // 首先尝试使用当前系统的 node 二进制（同平台时直接复制）
  const currentNodePath = process.execPath;

  if (PLATFORM === os.platform()) {
    // 同平台：直接复制当前 node
    fs.copyFileSync(currentNodePath, outPath);
    fs.chmodSync(outPath, 0o755);
    console.log("  使用当前系统 Node 二进制: " + outPath);
    return outPath;
  }

  // 跨平台：需要下载对应平台的 Node 二进制
  let downloadUrl;
  if (PLATFORM === "win32") {
    // Windows: 直接下载 node.exe
    downloadUrl = "https://nodejs.org/dist/v" + NODE_VERSION + "/win-x64/node.exe";
  } else if (PLATFORM === "darwin") {
    downloadUrl = "https://nodejs.org/dist/v" + NODE_VERSION +
      "/node-v" + NODE_VERSION + "-darwin-arm64.tar.gz";
  } else {
    downloadUrl = "https://nodejs.org/dist/v" + NODE_VERSION +
      "/node-v" + NODE_VERSION + "-linux-x64.tar.gz";
  }

  console.log("  下载: " + downloadUrl);

  try {
    if (PLATFORM === "win32") {
      // 直接下载 exe
      execSync("curl -L -o " + outPath + " " + downloadUrl, { stdio: "inherit" });
    } else {
      // 下载 tar.gz 并解压
      const tarballPath = path.join(DIST_DIR, "node-download.tar.gz");
      execSync("curl -L -o " + tarballPath + " " + downloadUrl, { stdio: "inherit" });
      execSync("tar -xzf " + tarballPath + " -C " + DIST_DIR, { stdio: "inherit" });

      const downloadName = PLATFORM === "darwin" ? "darwin-arm64" : "linux-x64";
      const extractedDir = path.join(DIST_DIR, "node-v" + NODE_VERSION + "-" + downloadName);
      const nodeBin = path.join(extractedDir, "bin", "node");
      fs.copyFileSync(nodeBin, outPath);
      fs.chmodSync(outPath, 0o755);

      // 清理
      fs.rmSync(extractedDir, { recursive: true, force: true });
      fs.unlinkSync(tarballPath);
    }
  } catch (e) {
    console.error("下载失败:", e.message);
    console.log("  提示：跨平台编译需要手动准备目标平台的 Node 二进制");
    console.log("  将 " + binaryName + " 放到 " + outPath);
    process.exit(1);
  }

  return outPath;
}

// ============================================================
// 步骤 6：注入 blob 到可执行文件
// ============================================================
function injectBlob(binaryPath) {
  console.log("[6/6] 注入 SEA blob 到可执行文件...");

  const blobPath = path.join(DIST_DIR, "sea-prep.blob");

  // postject 的 sentinel fuse 因 Node 版本而异，需要用 Node 计算
  // 这里使用 npx postject
  const result = spawnSync("npx", [
    "postject",
    binaryPath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ], { cwd: ROOT, stdio: "inherit" });

  if (result.status !== 0) {
    console.error("blob 注入失败");
    process.exit(1);
  }
  console.log("  注入完成: " + binaryPath);
}

// ============================================================
// 辅助：构建简单的 ZIP 文件
// ============================================================
function buildZip(entries) {
  // 简易 ZIP 构建器，支持文件和目录
  const chunks = [];
  const centralDir = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const isDir = entry.data === null;
    const data = isDir ? Buffer.alloc(0) : entry.data;
    const crc = isDir ? 0 : crc32(data);

    // 本地文件头
    const localHeader = Buffer.alloc(30 + nameBuf.length + data.length);
    let pos = 0;
    localHeader.writeUInt32LE(0x04034b50, pos); pos += 4; // 签名
    localHeader.writeUInt16LE(20, pos); pos += 2;          // 版本
    localHeader.writeUInt16LE(0x0800, pos); pos += 2;     // 标志（bit11=UTF-8）
    localHeader.writeUInt16LE(0, pos); pos += 2;          // 压缩方法（store）
    localHeader.writeUInt16LE(0, pos); pos += 2;          // 时间
    localHeader.writeUInt16LE(0, pos); pos += 2;          // 日期
    localHeader.writeUInt32LE(crc, pos); pos += 4;
    localHeader.writeUInt32LE(data.length, pos); pos += 4; // 压缩后大小
    localHeader.writeUInt32LE(data.length, pos); pos += 4; // 原始大小
    localHeader.writeUInt16LE(nameBuf.length, pos); pos += 2;
    localHeader.writeUInt16LE(0, pos); pos += 2;           // extra 长度
    nameBuf.copy(localHeader, pos);
    data.copy(localHeader, pos + nameBuf.length);

    chunks.push(localHeader);

    // 中央目录项
    const cdEntry = Buffer.alloc(46 + nameBuf.length);
    pos = 0;
    cdEntry.writeUInt32LE(0x02014b50, pos); pos += 4;
    cdEntry.writeUInt16LE(20, pos); pos += 2;
    cdEntry.writeUInt16LE(20, pos); pos += 2;
    cdEntry.writeUInt16LE(0x0800, pos); pos += 2;                     // UTF-8
    cdEntry.writeUInt16LE(0, pos); pos += 2;
    cdEntry.writeUInt16LE(0, pos); pos += 2;
    cdEntry.writeUInt16LE(0, pos); pos += 2;
    cdEntry.writeUInt32LE(crc, pos); pos += 4;
    cdEntry.writeUInt32LE(data.length, pos); pos += 4;
    cdEntry.writeUInt32LE(data.length, pos); pos += 4;
    cdEntry.writeUInt16LE(nameBuf.length, pos); pos += 2;
    cdEntry.writeUInt16LE(0, pos); pos += 2;                          // extra
    cdEntry.writeUInt16LE(0, pos); pos += 2;                          // comment
    cdEntry.writeUInt16LE(0, pos); pos += 2;                          // disk start
    cdEntry.writeUInt16LE(0, pos); pos += 2;                          // internal attr
    cdEntry.writeUInt32LE(isDir ? 0x10 : 0x20, pos); pos += 4;       // external attr
    cdEntry.writeUInt32LE(offset, pos); pos += 4;
    nameBuf.copy(cdEntry, pos);

    centralDir.push(cdEntry);
    offset += localHeader.length;
  }

  const cdOffset = offset;
  const cdBuf = Buffer.concat(centralDir);

  // EOCD
  const eocd = Buffer.alloc(22);
  let pos = 0;
  eocd.writeUInt32LE(0x06054b50, pos); pos += 4;
  eocd.writeUInt16LE(0, pos); pos += 2;
  eocd.writeUInt16LE(0, pos); pos += 2;
  eocd.writeUInt16LE(entries.length, pos); pos += 2;
  eocd.writeUInt16LE(entries.length, pos); pos += 2;
  eocd.writeUInt32LE(cdBuf.length, pos); pos += 4;
  eocd.writeUInt32LE(cdOffset, pos); pos += 4;
  eocd.writeUInt16LE(0, pos);

  return Buffer.concat([...chunks, cdBuf, eocd]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================
// 辅助：复制目录
// ============================================================
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================================
// 步骤 7：打包 release
// ============================================================
function packageRelease(binaryPath) {
  console.log("[打包] 创建 Release 包...");

  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const packageName = "桌游集合";
  const version = require(path.join(ROOT, "package.json")).version;
  const platformName = PLATFORM === "win32" ? "windows" :
    PLATFORM === "darwin" ? "macos" : "linux";

  // 使用 _pkg 子目录避免与可执行文件名冲突
  const pkgDir = path.join(DIST_DIR, "_pkg", packageName);

  // 清理并创建打包目录
  fs.rmSync(path.join(DIST_DIR, "_pkg"), { recursive: true, force: true });
  fs.mkdirSync(pkgDir, { recursive: true });

  // 复制可执行文件
  const ext = PLATFORM === "win32" ? ".exe" : "";
  const exeName = packageName + ext;
  fs.copyFileSync(binaryPath, path.join(pkgDir, exeName));
  if (PLATFORM !== "win32") {
    fs.chmodSync(path.join(pkgDir, exeName), 0o755);
  }

  // 复制 box/ 目录（游戏模块）
  copyDir(BOX_DIR, path.join(pkgDir, "box"));

  // 创建压缩包
  let releaseFile;
  const pkgBase = path.join(DIST_DIR, "_pkg");
  const archiveExt = PLATFORM === "win32" ? ".zip" : ".tar.gz";
  releaseFile = path.join(RELEASE_DIR, packageName + "-v" + version + "-" + platformName + archiveExt);

  if (PLATFORM === "win32") {
    // Windows: 使用 node 原生方式创建 zip（无外部依赖）
    const { createWriteStream } = require("fs");
    const { join, relative } = require("path");
    // 递归添加文件到 zip（使用简单的 store 模式）
    function addDirToZip(dir, basePath, zipEntries) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(basePath, fullPath).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          zipEntries.push({ name: relPath + "/", data: null });
          addDirToZip(fullPath, basePath, zipEntries);
        } else {
          zipEntries.push({ name: relPath, data: fs.readFileSync(fullPath) });
        }
      }
    }
    const zipEntries = [];
    addDirToZip(pkgDir, pkgBase, zipEntries);

    // 手动创建 zip 文件
    const zipBuf = buildZip(zipEntries);
    fs.writeFileSync(releaseFile, zipBuf);
  } else {
    spawnSync("tar", ["-czf", path.resolve(releaseFile), packageName], { cwd: pkgBase, stdio: "inherit" });
  }

  console.log("  Release 包: " + releaseFile);
  console.log("");
  console.log("========================================");
  console.log("  构建完成！");
  console.log("  Release 包: " + releaseFile);
  console.log("  可执行文件: " + binaryPath);
  console.log("========================================");

  return releaseFile;
}

// ============================================================
// 主流程
// ============================================================
function main() {
  console.log("========================================");
  console.log("  桌游集合 - SEA 构建");
  console.log("  目标平台: " + PLATFORM);
  console.log("  Node 版本: v" + NODE_VERSION);
  console.log("========================================");
  console.log("");

  // 清理上次构建产物，避免目录/文件冲突
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 步骤 1-4：构建
  embedPublicFiles();
  bundleWithEsbuild();
  const configPath = generateSeaConfig();
  createSeaBlob(configPath);

  // 步骤 5-6：平台二进制 + 注入
  const binaryPath = getNodeBinary();
  injectBlob(binaryPath);

  // 步骤 7：打包 release
  const releaseFile = packageRelease(binaryPath);

  // 输出文件大小
  const stats = fs.statSync(releaseFile);
  console.log("Release 文件大小: " + (stats.size / (1024 * 1024)).toFixed(1) + " MB");
}

main();
