// ============================================================
// 桌游集合 - 后台服务器
// 使用 Express 托管静态文件，WebSocket 处理联机通信
// ============================================================

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

// ============================================================
// 命令行参数解析：获取端口号
// ============================================================
const args = process.argv.slice(2);
const portArg = args.find(a => !a.startsWith("--"));
let PORT = parseInt(portArg) || null; // null 表示需要交互式输入

// ============================================================
// Express 应用：托管 public 文件夹 + API 接口
// ============================================================
const app = express();

// 判断是否运行在打包模式（有嵌入的 public 资源）
if (global.__EMBEDDED_PUBLIC__) {
  // SEA 打包模式：从内存中服务 public/ 文件
  const embedded = global.__EMBEDDED_PUBLIC__;
  app.use((req, res, next) => {
    // 仅处理根路径下的静态文件请求（/index.html, /style.css, /script.js）
    let filePath = req.path;
    if (filePath === "/") filePath = "/index.html";
    const content = embedded[filePath];
    if (content) {
      const ext = filePath.split(".").pop();
      const mimeTypes = {
        html: "text/html; charset=utf-8",
        css: "text/css; charset=utf-8",
        js: "application/javascript; charset=utf-8",
        svg: "image/svg+xml",
        png: "image/png",
        ico: "image/x-icon",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      // base64 编码的内容需要解码
      const body = content._base64 ? Buffer.from(content.data, "base64") : content;
      res.send(body);
    } else {
      next();
    }
  });
} else {
  // 源码模式：从文件系统托管 public 文件夹
  app.use(express.static(path.join(__dirname, "public")));
}

// 同时托管 box 目录，方便游戏文件被加载
// 游戏 HTML 通过 /box/游戏名/game.html 访问
app.use("/box", express.static(path.join(__dirname, "box")));

// API：获取所有游戏列表（扫描 box 目录下的 info.json）
app.get("/api/games", (req, res) => {
  const boxDir = path.join(__dirname, "box");
  const games = [];
  try {
    const dirs = fs.readdirSync(boxDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const infoPath = path.join(boxDir, dir.name, "info.json");
        if (fs.existsSync(infoPath)) {
          try {
            const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
            games.push({
              id: dir.name,          // 文件夹名作为游戏 ID
              name: info.name,       // 中文名
              emoji: info.emoji,     // emoji 图标
              minPlayers: info.minPlayers,
              maxPlayers: info.maxPlayers,
            });
          } catch (e) {
            console.warn(`[警告] 无法解析 ${dir.name}/info.json:`, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error("[错误] 读取 box 目录失败:", e.message);
  }
  res.json(games);
});

// 创建 HTTP 服务器
const server = http.createServer(app);

// ============================================================
// WebSocket 服务
// ============================================================
const wss = new WebSocketServer({ server });
// 处理 ws 库从 HTTP server 转发的错误（如端口占用），避免 unhandled error
wss.on("error", (err) => {
  if (err.code !== "EADDRINUSE") {
    console.error("WebSocket 错误:", err.message);
  }
});

// ---------- 内存数据 ----------
// 在线用户列表：Map<username, { ws, avatarText, textColor, borderColor, currentRoom, currentGame }>
const users = new Map();
// 房间列表：Map<roomId, { id, gameName, players: [], maxPlayers, status, customReady }>
const rooms = new Map();
// 战绩统计：Map<gameName, Map<username, { wins, losses, draws }>>
const gameStats = new Map();

// 生成唯一房间 ID
let roomIdCounter = 0;
function generateRoomId() {
  return "room_" + Date.now() + "_" + (++roomIdCounter);
}

// ============================================================
// 工具函数：广播在线用户列表给所有人
// ============================================================
function broadcastUserList() {
  const userList = [];
  for (const [username, u] of users) {
    userList.push({
      username,
      avatarText: u.avatarText,
      textColor: u.textColor,
      borderColor: u.borderColor,
      gameName: u.currentGame || null, // null 表示在大厅
    });
  }
  const msg = JSON.stringify({ type: "users_update", users: userList });
  for (const [, u] of users) {
    if (u.ws.readyState === 1) {
      u.ws.send(msg);
    }
  }
}

// ============================================================
// 工具函数：向房间内所有玩家发送消息
// ============================================================
function broadcastToRoom(roomId, msg) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = typeof msg === "string" ? msg : JSON.stringify(msg);
  for (const player of room.players) {
    const u = users.get(player.username);
    if (u && u.ws.readyState === 1) {
      u.ws.send(data);
    }
  }
}

// ============================================================
// 工具函数：记录游戏结果并广播战绩
// ============================================================
function recordGameResult(gameName, username, result) {
  if (!gameStats.has(gameName)) {
    gameStats.set(gameName, new Map());
  }
  const stat = gameStats.get(gameName);
  if (!stat.has(username)) {
    stat.set(username, { wins: 0, losses: 0, draws: 0 });
  }
  const record = stat.get(username);
  if (result === "win") record.wins++;
  else if (result === "loss") record.losses++;
  else if (result === "draw") record.draws++;
}

function broadcastStats(gameName) {
  const stat = gameStats.get(gameName);
  if (!stat) return;
  const statsArray = [];
  for (const [username, record] of stat) {
    statsArray.push({
      username,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
    });
  }
  const msg = JSON.stringify({ type: "stats_update", gameName, stats: statsArray });
  for (const [, u] of users) {
    if (u.ws.readyState === 1) {
      u.ws.send(msg);
    }
  }
}

// ============================================================
// 工具函数：更新房间信息给房间内玩家
// ============================================================
function sendRoomUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  broadcastToRoom(roomId, {
    type: "room_update",
    roomId: room.id,
    gameName: room.gameName,
    players: room.players.map(p => ({
      username: p.username,
      avatarText: p.avatarText,
      textColor: p.textColor,
      borderColor: p.borderColor,
      ready: p.ready || false,
    })),
    maxPlayers: room.maxPlayers,
    status: room.status,
  });
}

// ============================================================
// 工具函数：处理玩家离开房间
// ============================================================
function removePlayerFromRoom(username) {
  const u = users.get(username);
  if (!u || !u.currentRoom) return;

  const room = rooms.get(u.currentRoom);
  if (!room) {
    u.currentRoom = null;
    u.currentGame = null;
    return;
  }

  // 从房间移除该玩家
  room.players = room.players.filter(p => p.username !== username);
  u.currentRoom = null;
  u.currentGame = null;

  if (room.players.length === 0) {
    // 房间空了，删除房间
    rooms.delete(room.id);
  } else {
    // 如果游戏进行中有人离开，通知剩余玩家
    if (room.status === "playing") {
      room.status = "waiting";
      sendRoomUpdate(room.id);
      broadcastToRoom(room.id, {
        type: "game_action",
        action: "player_left",
        data: { username, message: "对手离开了房间" },
      });
    } else {
      sendRoomUpdate(room.id);
    }
  }
}

// ============================================================
// WebSocket 消息处理
// ============================================================
wss.on("connection", (ws) => {
  let currentUsername = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {

      // ---------- 登录 ----------
      case "login": {
        const { username, avatarText, textColor, borderColor } = msg;
        if (!username || typeof username !== "string" || username.trim().length === 0) {
          ws.send(JSON.stringify({ type: "login_result", success: false, error: "用户名不能为空" }));
          return;
        }
        const name = username.trim();
        // 检查重名
        if (users.has(name)) {
          ws.send(JSON.stringify({ type: "login_result", success: false, error: "该用户名已被使用，请更换" }));
          return;
        }
        currentUsername = name;
        const defaultAvatar = avatarText || name.slice(0, 6);
        users.set(name, {
          ws,
          avatarText: defaultAvatar,
          textColor: textColor || "#333333",
          borderColor: borderColor || "#cccccc",
          currentRoom: null,
          currentGame: null,
        });
        ws.send(JSON.stringify({
          type: "login_result",
          success: true,
          profile: {
            username: name,
            avatarText: defaultAvatar,
            textColor: textColor || "#333333",
            borderColor: borderColor || "#cccccc",
          },
        }));
        broadcastUserList();
        break;
      }

      // ---------- 更新头像配置 ----------
      case "update_profile": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u) return;
        const { avatarText, textColor, borderColor } = msg;
        // 限制头像文字 1-3 个字符
        if (avatarText !== undefined) {
          u.avatarText = avatarText.slice(0, 6) || currentUsername.slice(0, 6);
        }
        if (textColor !== undefined) u.textColor = textColor;
        if (borderColor !== undefined) u.borderColor = borderColor;
        ws.send(JSON.stringify({
          type: "profile_updated",
          profile: {
            username: currentUsername,
            avatarText: u.avatarText,
            textColor: u.textColor,
            borderColor: u.borderColor,
          },
        }));
        broadcastUserList();
        // 如果当前在房间中，也通知房间内其他玩家更新
        if (u.currentRoom) {
          sendRoomUpdate(u.currentRoom);
        }
        break;
      }

      // ---------- 查询等待中房间 ----------
      case "get_rooms": {
        const availableRooms = [];
        for (const [, room] of rooms) {
          if (room.gameName === msg.gameName && room.status === "waiting") {
            availableRooms.push({
              id: room.id,
              gameName: room.gameName,
              host: room.players[0] ? {
                username: room.players[0].username,
                avatarText: room.players[0].avatarText,
                textColor: room.players[0].textColor,
                borderColor: room.players[0].borderColor,
              } : null,
              players: room.players.map(p => ({
                username: p.username,
                avatarText: p.avatarText,
                textColor: p.textColor,
                borderColor: p.borderColor,
              })),
              maxPlayers: room.maxPlayers,
              status: room.status,
            });
          }
        }
        ws.send(JSON.stringify({ type: "rooms_list", rooms: availableRooms }));
        break;
      }

      // ---------- 创建房间 ----------
      case "create_room": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u) return;

        // 先读取游戏的配置
        const gameName = msg.gameName;
        const infoPath = path.join(__dirname, "box", gameName, "info.json");
        let maxPlayers = 2;
        let minPlayers = 2;
        let customReady = false;
        try {
          const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
          maxPlayers = info.maxPlayers || 2;
          minPlayers = info.minPlayers || 2;
          customReady = info.customReady || false;
        } catch {}

        // 如果用户已在其他房间，先退出
        if (u.currentRoom) {
          removePlayerFromRoom(currentUsername);
        }

        const roomId = generateRoomId();
        const room = {
          id: roomId,
          gameName,
          players: [{
            username: currentUsername,
            avatarText: u.avatarText,
            textColor: u.textColor,
            borderColor: u.borderColor,
            ready: false,
          }],
          maxPlayers,
          minPlayers,
          customReady,
          status: "waiting",
        };
        rooms.set(roomId, room);
        u.currentRoom = roomId;
        u.currentGame = gameName;

        ws.send(JSON.stringify({ type: "room_created", roomId, gameName, customReady }));
        broadcastUserList();
        // 发送初始房间状态（包含 ready 信息）
        sendRoomUpdate(roomId);
        break;
      }

      // ---------- 加入房间 ----------
      case "join_room": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u) return;

        const room = rooms.get(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: "error", message: "房间不存在" }));
          return;
        }
        if (room.status !== "waiting") {
          ws.send(JSON.stringify({ type: "error", message: "房间已开始游戏" }));
          return;
        }
        if (room.players.length >= room.maxPlayers) {
          ws.send(JSON.stringify({ type: "error", message: "房间已满" }));
          return;
        }
        // 不能重复加入
        if (room.players.find(p => p.username === currentUsername)) {
          ws.send(JSON.stringify({ type: "error", message: "你已在此房间中" }));
          return;
        }

        // 如果用户已在其他房间，先退出
        if (u.currentRoom) {
          removePlayerFromRoom(currentUsername);
        }

        room.players.push({
          username: currentUsername,
          avatarText: u.avatarText,
          textColor: u.textColor,
          borderColor: u.borderColor,
          ready: false,
        });
        u.currentRoom = room.id;
        u.currentGame = room.gameName;

        ws.send(JSON.stringify({
          type: "room_joined",
          roomId: room.id,
          gameName: room.gameName,
          customReady: room.customReady || false,
          players: room.players.map(p => ({
            username: p.username,
            avatarText: p.avatarText,
            textColor: p.textColor,
            borderColor: p.borderColor,
            ready: p.ready || false,
          })),
        }));

        // 不再自动开始游戏，等待玩家准备
        // customReady 游戏由游戏自行管理，普通游戏通过 set_ready 触发

        sendRoomUpdate(room.id);
        broadcastUserList();
        break;
      }

      // ---------- 设置准备状态 ----------
      case "set_ready": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u || !u.currentRoom) return;
        const room = rooms.get(u.currentRoom);
        if (!room) return;

        const player = room.players.find(p => p.username === currentUsername);
        if (!player) return;
        player.ready = !!msg.ready;

        // 广播准备状态更新
        broadcastToRoom(room.id, {
          type: "ready_update",
          players: room.players.map(p => ({
            username: p.username,
            ready: p.ready || false,
          })),
        });

        // 检查是否全部准备
        const allReady = room.players.every(p => p.ready);
        if (allReady && room.players.length >= (room.minPlayers || 2)) {
          room.status = "playing";
          room._statsRecorded = false;
          const firstPlayerIndex = Math.floor(Math.random() * room.players.length);
          broadcastToRoom(room.id, {
            type: "game_start",
            roomId: room.id,
            players: room.players.map(p => ({
              username: p.username,
              avatarText: p.avatarText,
              textColor: p.textColor,
              borderColor: p.borderColor,
            })),
            firstTurn: room.players[firstPlayerIndex].username,
          });
        }
        break;
      }

      // ---------- 离开房间 ----------
      case "leave_room": {
        if (!currentUsername) return;
        removePlayerFromRoom(currentUsername);
        ws.send(JSON.stringify({ type: "room_left" }));
        broadcastUserList();
        break;
      }

      // ---------- 游戏内操作转发 ----------
      case "game_action": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u || !u.currentRoom) return;
        const room = rooms.get(u.currentRoom);
        if (!room) return;

        // 将操作广播给房间内所有其他玩家（不含发送者自身）
        const forwardMsg = JSON.stringify({
          type: "game_action",
          action: msg.action,
          data: msg.data,
          from: currentUsername,
        });
        for (const player of room.players) {
          if (player.username !== currentUsername) {
            const pu = users.get(player.username);
            if (pu && pu.ws.readyState === 1) {
              pu.ws.send(forwardMsg);
            }
          }
        }
        break;
      }

      // ---------- 再来一局 ----------
      case "play_again": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u || !u.currentRoom) return;
        const room = rooms.get(u.currentRoom);
        if (!room) return;

        // 重置所有玩家的准备状态
        room.status = "waiting";
        room._statsRecorded = false;
        for (const p of room.players) {
          p.ready = false;
        }

        // 发送准备状态更新（所有人未准备）
        broadcastToRoom(room.id, {
          type: "ready_update",
          players: room.players.map(p => ({
            username: p.username,
            ready: false,
          })),
        });
        break;
      }

      // ---------- 游戏结束（战绩记录）----------
      case "game_over": {
        if (!currentUsername) return;
        const u = users.get(currentUsername);
        if (!u || !u.currentRoom) return;
        const room = rooms.get(u.currentRoom);
        if (!room) return;

        // 防止同一局重复记录
        if (room._statsRecorded) return;
        room._statsRecorded = true;

        const gameName = msg.gameName;

        if (msg.isDraw) {
          for (const player of room.players) {
            recordGameResult(gameName, player.username, "draw");
          }
        } else if (msg.winners && msg.winners.length > 0) {
          for (const player of room.players) {
            if (msg.winners.includes(player.username)) {
              recordGameResult(gameName, player.username, "win");
            } else {
              recordGameResult(gameName, player.username, "loss");
            }
          }
        } else if (msg.result === "win") {
          recordGameResult(gameName, currentUsername, "win");
          for (const player of room.players) {
            if (player.username !== currentUsername) {
              recordGameResult(gameName, player.username, "loss");
            }
          }
        } else if (msg.result === "loss") {
          recordGameResult(gameName, currentUsername, "loss");
          for (const player of room.players) {
            if (player.username !== currentUsername) {
              recordGameResult(gameName, player.username, "win");
            }
          }
        }

        broadcastStats(gameName);
        break;
      }

      // ---------- 查询战绩 ----------
      case "get_stats": {
        const gameName = msg.gameName;
        if (gameName && gameStats.has(gameName)) {
          const stat = gameStats.get(gameName);
          const statsArray = [];
          for (const [username, record] of stat) {
            statsArray.push({
              username,
              wins: record.wins,
              losses: record.losses,
              draws: record.draws,
            });
          }
          ws.send(JSON.stringify({ type: "stats_update", gameName, stats: statsArray }));
        } else if (gameName) {
          ws.send(JSON.stringify({ type: "stats_update", gameName, stats: [] }));
        }
        break;
      }

      default:
        break;
    }
  });

  // ---------- 连接断开 ----------
  ws.on("close", () => {
    if (currentUsername && users.has(currentUsername)) {
      removePlayerFromRoom(currentUsername);
      users.delete(currentUsername);
      broadcastUserList();
    }
  });

  // 发送心跳保持连接
  ws.on("pong", () => {});
});

// 每30秒发送心跳检测
setInterval(() => {
  for (const [, u] of users) {
    if (u.ws.readyState === 1) {
      u.ws.ping();
    }
  }
}, 30000);

// ============================================================
// 启动服务器（支持交互式端口输入）
// ============================================================
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        result.push({ name, ip: addr.address });
      }
    }
  }
  return result;
}

function showBanner(port) {
  const ips = getLocalIPs();
  console.log("========================================");
  console.log("  桌游集合 - 服务器已启动");
  console.log("  本机访问：http://localhost:" + port);
  console.log("");
  if (ips.length === 0) {
    console.log("  (未检测到局域网 IP)");
  } else if (ips.length === 1) {
    console.log("  局域网地址：http://" + ips[0].ip + ":" + port);
  } else {
    console.log("  检测到多个 IP，请根据你的网络选择对应地址：");
    for (const item of ips) {
      console.log("    http://" + item.ip + ":" + port + "  (" + item.name + ")");
    }
  }
  console.log("========================================");
}

function tryStartServer(port) {
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error("EADDRINUSE"));
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      // 移除一次性错误监听，换上常驻错误处理
      server.removeAllListeners("error");
      server.on("error", (err) => {
        console.error("服务器运行时错误:", err.message);
      });
      resolve();
    });
  });
}

// 交互式端口输入
async function promptPort() {
  // 已有命令行参数，直接使用
  if (PORT !== null) {
    try {
      await tryStartServer(PORT);
      showBanner(PORT);
      return;
    } catch (err) {
      if (err.message === "EADDRINUSE") {
        console.error("端口 " + PORT + " 已被占用，请更换一个端口");
        process.exit(1);
      } else {
        console.error("服务器启动失败:", err.message);
        process.exit(1);
      }
    }
  }

  // 无命令行参数，交互式输入
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("========================================");
  console.log("  桌游集合 - 局域网联机桌游平台");
  console.log("========================================");
  console.log("");

  const askPort = () => {
    return new Promise((resolve) => {
      rl.question("请输入要使用的端口号（直接回车则默认使用 3000）：", (answer) => {
        resolve(answer);
      });
    });
  };

  while (true) {
    const answer = await askPort();
    const port = parseInt(answer) || 3000;

    try {
      await tryStartServer(port);
      rl.close();
      showBanner(port);
      return;
    } catch (err) {
      if (err.message === "EADDRINUSE") {
        console.log("端口 " + port + " 已被占用，请更换一个端口");
        console.log("");
      } else {
        console.error("服务器启动失败:", err.message);
        rl.close();
        process.exit(1);
      }
    }
  }
}

promptPort();
