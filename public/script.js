// ============================================================
// 桌游集合 - 大厅交互逻辑与 WebSocket 通信
// ============================================================

// ---------- 预设色盘 ----------
const COLOR_PALETTE = [
  { name: "红色", value: "#e74c3c" },
  { name: "蓝色", value: "#3498db" },
  { name: "绿色", value: "#2ecc71" },
  { name: "黄色", value: "#f1c40f" },
  { name: "紫色", value: "#9b59b6" },
  { name: "橙色", value: "#e67e22" },
  { name: "粉色", value: "#e91e90" },
  { name: "黑色", value: "#333333" },
];

// ---------- 全局状态 ----------
let currentUser = null;       // 当前登录用户名
let currentProfile = null;    // { username, avatarText, textColor, borderColor }
let ws = null;                // WebSocket 连接
let serverHost = "";          // 服务器 IP:端口
let games = [];               // 游戏列表

// ============================================================
// 初始化
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // 设置底部栏地址
  serverHost = window.location.host;
  document.getElementById("serverInfo").textContent =
    "服务器地址：" + window.location.host;

  // 生成色盘 UI
  buildColorPalettes();

  // 连接 WebSocket
  connectWebSocket();

  // 加载游戏列表
  fetchGames();

  // 监听来自游戏 iframe 的消息，转发到 WebSocket
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === "game_ready") {
      // iframe 加载完成，标记就绪并转发暂存消息
      window._iframeReady = true;
      if (pendingGameMessages.length > 0) {
        for (const m of pendingGameMessages) {
          const iframe = document.getElementById("gameIframe");
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(m, "*");
          }
        }
        pendingGameMessages = [];
      }
    } else if (msg.type === "game_action" || msg.type === "play_again" || msg.type === "game_over" || msg.type === "set_ready" || msg.type === "leave_room" || (msg.type && msg.type.startsWith("ww_"))) {
      // 将游戏 iframe 的操作转发到服务器 (包括狼人杀等插件的消息)
      sendMessage(msg);
    }
  });
});

// ============================================================
// 色盘生成
// ============================================================
function buildColorPalettes() {
  const textPalette = document.getElementById("textColorPalette");
  const borderPalette = document.getElementById("borderColorPalette");

  for (const c of COLOR_PALETTE) {
    // 文字颜色色块
    const swatch1 = document.createElement("div");
    swatch1.className = "color-swatch";
    swatch1.style.backgroundColor = c.value;
    swatch1.title = c.name;
    swatch1.onclick = () => {
      currentProfile.textColor = c.value;
      updateSwatchSelection("textColorPalette", c.value);
      saveProfile();
      applyProfile();
      sendProfileUpdate();
    };
    textPalette.appendChild(swatch1);

    // 边框颜色色块
    const swatch2 = document.createElement("div");
    swatch2.className = "color-swatch";
    swatch2.style.backgroundColor = c.value;
    swatch2.title = c.name;
    swatch2.onclick = () => {
      currentProfile.borderColor = c.value;
      updateSwatchSelection("borderColorPalette", c.value);
      saveProfile();
      applyProfile();
      sendProfileUpdate();
    };
    borderPalette.appendChild(swatch2);
  }
}

// 更新色块选中状态
function updateSwatchSelection(paletteId, color) {
  const palette = document.getElementById(paletteId);
  for (const s of palette.children) {
    s.classList.toggle("selected", s.style.backgroundColor === color);
  }
}

// ============================================================
// WebSocket 连接
// ============================================================
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[联机] 已连接到服务器");
    // 尝试自动登录（从 localStorage 恢复）
    autoLogin();
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleMessage(msg);
  };

  ws.onclose = () => {
    console.log("[联机] 连接断开，3秒后重连...");
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {
    console.log("[联机] 连接错误");
  };
}

// ============================================================
// 消息路由
// ============================================================
function handleMessage(msg) {
  switch (msg.type) {

    case "login_result":
      if (msg.success) {
        currentUser = msg.profile.username;
        currentProfile = msg.profile;
        saveProfile();
        applyProfile();
        showAccountProfile();
      } else {
        document.getElementById("loginError").textContent = msg.error || "登录失败";
      }
      break;

    case "profile_updated":
      currentProfile = msg.profile;
      applyProfile();
      break;

    case "users_update":
      renderOnlineList(msg.users);
      break;

    case "rooms_list":
      renderRoomList(msg.rooms);
      break;

    case "room_created":
      window._customReadyGame = !!msg.customReady;
      if (msg.customReady) {
        enterGame(msg.roomId, msg.gameName);
      } else {
        enterRoomPanel(msg.roomId, msg.gameName);
      }
      break;

    case "room_joined":
      window._customReadyGame = !!msg.customReady;
      if (msg.customReady) {
        enterGame(msg.roomId, msg.gameName);
      } else {
        enterRoomPanel(msg.roomId, msg.gameName);
        if (msg.players) {
          updateRoomPanel(msg.players);
        }
      }
      break;

    case "ready_update":
      // customReady 游戏：始终转发给 iframe（不受 _gameActive 限制）
      if (window._customReadyGame) {
        notifyGameIframe(msg);
        return;
      }
      if (window._gameActive) {
        // 普通游戏再来一局：清除游戏 iframe，回到房间面板
        const iframe = document.getElementById("gameIframe");
        iframe.src = "";
        iframe.style.display = "none";
        pendingGameMessages = [];
        window._iframeReady = false;
        window._gameActive = false;
        window._myReady = false;
      }
      // 确保房间面板可见
      document.getElementById("gameContainer").style.display = "flex";
      showRoomPanel();
      updateRoomPanel(msg.players);
      break;

    case "room_update":
      // 如果房间面板正在显示，更新面板
      if (document.getElementById("roomPanel") && document.getElementById("roomPanel").style.display !== "none") {
        updateRoomPanel(msg.players);
        return;
      }
      // 否则转发给游戏 iframe
      notifyGameIframe(msg);
      break;

    case "game_start":
      // 如果房间面板还在显示，先隐藏面板并加载游戏
      if (document.getElementById("roomPanel") && document.getElementById("roomPanel").style.display !== "none") {
        hideRoomPanel();
        enterGame(msg.roomId, window._currentRoomGame);
      }
      window._gameActive = true;
      // 游戏开始，通知 iframe
      notifyGameIframe(msg);
      break;

    case "game_action":
      // 游戏操作转发，通知 iframe
      notifyGameIframe(msg);
      break;

    case "room_left":
      exitGameUI();
      break;

    case "stats_update":
      if (!window._gameStats) window._gameStats = {};
      window._gameStats[msg.gameName] = msg.stats;
      refreshStatsDisplay(msg.gameName);
      break;

    case "error":
      alert(msg.message || "操作失败");
      break;

    default:
      // 转发游戏插件消息（如 ww_*）到游戏 iframe
      if (msg.type && msg.type.startsWith("ww_")) {
        notifyGameIframe(msg);
      }
      break;
  }
}

// 待转发的消息队列（iframe 未加载完成时暂存）
let pendingGameMessages = [];

// ============================================================
// 向游戏 iframe 发送消息
// ============================================================
function notifyGameIframe(msg) {
  const iframe = document.getElementById("gameIframe");
  // 只有 iframe 发送 game_ready 后才认为就绪，避免 postMessage 到未加载完的页面
  if (iframe && window._iframeReady) {
    iframe.contentWindow.postMessage(msg, "*");
  } else {
    // iframe 尚未就绪，暂存消息，等 game_ready 后刷新
    pendingGameMessages.push(msg);
  }
}

// ============================================================
// 自动登录
// ============================================================
function autoLogin() {
  const saved = localStorage.getItem("bgHub_profile");
  if (!saved) return;
  try {
    const profile = JSON.parse(saved);
    sendMessage({
      type: "login",
      username: profile.username,
      avatarText: profile.avatarText,
      textColor: profile.textColor,
      borderColor: profile.borderColor,
    });
  } catch {
    localStorage.removeItem("bgHub_profile");
  }
}

// ============================================================
// 手動登录
// ============================================================
function doLogin() {
  const usernameInput = document.getElementById("loginUsername");
  const username = usernameInput.value.trim();
  if (!username) {
    document.getElementById("loginError").textContent = "请输入用户名";
    return;
  }
  document.getElementById("loginError").textContent = "";
  sendMessage({
    type: "login",
    username: username,
    avatarText: username.slice(0, 6),
    textColor: "#333333",
    borderColor: "#cccccc",
  });
}

// ============================================================
// 退出登录
// ============================================================
function doLogout() {
  // 离开房间（如果在房间中）
  sendMessage({ type: "leave_room" });
  currentUser = null;
  currentProfile = null;
  localStorage.removeItem("bgHub_profile");
  document.getElementById("accountLogin").style.display = "block";
  document.getElementById("accountProfile").style.display = "none";
  document.getElementById("loginError").textContent = "";
  updateUserBlock(null);
  exitGameUI();
}

// ============================================================
// 保存/读取头像配置到 localStorage
// ============================================================
function saveProfile() {
  if (currentProfile) {
    localStorage.setItem("bgHub_profile", JSON.stringify(currentProfile));
  }
}

// ============================================================
// 发送头像更新
// ============================================================
function sendProfileUpdate() {
  sendMessage({
    type: "update_profile",
    avatarText: currentProfile.avatarText,
    textColor: currentProfile.textColor,
    borderColor: currentProfile.borderColor,
  });
}

// ============================================================
// 用户修改头像文字
// ============================================================
function updateProfile() {
  const input = document.getElementById("inputAvatarText");
  const text = input.value.slice(0, 6);
  currentProfile.avatarText = text || currentUser.slice(0, 6);
  applyProfile();
  saveProfile();
  sendProfileUpdate();
}

// ============================================================
// 将头像配置应用到所有 UI 元素
// ============================================================
function applyProfile() {
  if (!currentProfile) return;
  updateUserBlock(currentProfile);
  document.getElementById("profileGreeting").textContent =
    "你好，" + currentProfile.username;
  document.getElementById("inputAvatarText").value = currentProfile.avatarText;
  updateSwatchSelection("textColorPalette", currentProfile.textColor);
  updateSwatchSelection("borderColorPalette", currentProfile.borderColor);
}

// ============================================================
// 显示已登录的账户面板
// ============================================================
function showAccountProfile() {
  document.getElementById("accountLogin").style.display = "none";
  document.getElementById("accountProfile").style.display = "flex";
  // 确保账户抽屉处于展开状态
  const body = document.getElementById("drawerAccount");
  if (!body.classList.contains("open")) {
    body.classList.add("open");
    body.previousElementSibling.classList.add("active");
  }
}

// ============================================================
// 更新左上角 User 方块
// ============================================================
function updateUserBlock(profile) {
  const block = document.getElementById("userBlock");
  const textEl = document.getElementById("userBlockText");
  if (!profile) {
    textEl.style.color = "var(--gray)";
    block.style.borderColor = "var(--gray)";
    textEl.textContent = "user";
  } else {
    textEl.style.color = profile.textColor;
    block.style.borderColor = profile.borderColor;
    textEl.textContent = profile.avatarText;
  }
}

// ============================================================
// 侧边栏开关
// ============================================================
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const isOpen = sidebar.classList.contains("open");
  if (isOpen) {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  } else {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  }
}

// ============================================================
// 抽屉折叠切换
// ============================================================
function toggleDrawer(name) {
  const body = document.getElementById("drawer" + name.charAt(0).toUpperCase() + name.slice(1));
  const header = body.previousElementSibling;
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open", !isOpen);
  header.classList.toggle("active", !isOpen);
}

// ============================================================
// 加载游戏列表（HTTP API）
// ============================================================
async function fetchGames() {
  try {
    const res = await fetch("/api/games");
    games = await res.json();
    renderGameCards();
  } catch {
    document.getElementById("loadingHint").textContent = "加载游戏列表失败，请检查服务器";
  }
}

// ============================================================
// 渲染游戏卡片
// ============================================================
function renderGameCards() {
  const container = document.getElementById("gameCards");
  container.innerHTML = "";
  if (games.length === 0) {
    container.innerHTML = '<p id="loadingHint">暂无可用的游戏</p>';
    return;
  }
  for (const game of games) {
    const wrapper = document.createElement("div");
    wrapper.className = "game-card-wrapper";

    const card = document.createElement("div");
    card.className = "game-card";
    card.onclick = () => onGameClick(game);
    card.innerHTML =
      '<span class="game-emoji">' + game.emoji + '</span>' +
      '<div class="game-name">' + game.name + '</div>' +
      '<div class="game-players">' + game.minPlayers + '-' + game.maxPlayers + '人</div>';
    wrapper.appendChild(card);

    // 战绩按钮
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "btn-stats-toggle";
    toggleBtn.textContent = "战绩";
    toggleBtn.onclick = (e) => { e.stopPropagation(); toggleStats(game.id); };
    wrapper.appendChild(toggleBtn);

    // 战绩面板（默认隐藏）
    const statsPanel = document.createElement("div");
    statsPanel.id = "statsPanel_" + game.id;
    statsPanel.className = "stats-panel";
    statsPanel.style.display = "none";
    statsPanel.innerHTML = '<p class="stats-empty">加载中...</p>';
    wrapper.appendChild(statsPanel);

    container.appendChild(wrapper);
  }
}

// ============================================================
// 请求战绩数据
// ============================================================
function requestStats(gameName) {
  sendMessage({ type: "get_stats", gameName: gameName });
}

function toggleStats(gameName) {
  const panel = document.getElementById("statsPanel_" + gameName);
  if (!panel) return;
  if (panel.style.display === "none") {
    requestStats(gameName);
    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

function refreshStatsDisplay(gameName) {
  const panel = document.getElementById("statsPanel_" + gameName);
  if (!panel || panel.style.display === "none") return;
  const stats = (window._gameStats && window._gameStats[gameName]) || [];
  renderStatsTable(panel, stats);
}

function renderStatsTable(container, stats) {
  if (!stats || stats.length === 0) {
    container.innerHTML = '<p class="stats-empty">暂无战绩数据</p>';
    return;
  }
  const sorted = [...stats].sort((a, b) => b.wins - a.wins);
  let html = '<table class="stats-table"><thead><tr>' +
    '<th>玩家</th><th>胜</th><th>负</th><th>平</th><th>胜率</th>' +
    '</tr></thead><tbody>';
  for (const s of sorted) {
    const total = s.wins + s.losses + s.draws;
    const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
    html += '<tr>' +
      '<td>' + s.username + '</td>' +
      '<td>' + s.wins + '</td>' +
      '<td>' + s.losses + '</td>' +
      '<td>' + s.draws + '</td>' +
      '<td>' + rate + '%</td>' +
      '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ============================================================
// 点击游戏卡片
// ============================================================
function onGameClick(game) {
  if (!currentUser) {
    alert("请先登录后再进入游戏");
    return;
  }
  // 先关闭侧边栏
  toggleSidebar();

  // 查询该游戏的等待中房间
  sendMessage({ type: "get_rooms", gameName: game.id });
  // 暂存当前选择的游戏 ID，等待 rooms_list 回调
  window._pendingGame = game;
}

// ============================================================
// 渲染房间列表弹窗
// ============================================================
function renderRoomList(rooms) {
  const game = window._pendingGame;
  if (!game) return;

  const modalOverlay = document.getElementById("roomModalOverlay");
  const roomListEl = document.getElementById("roomList");
  document.getElementById("roomModalTitle").textContent = game.name + " - 等待中的房间";

  roomListEl.innerHTML = "";

  if (rooms.length === 0) {
    roomListEl.innerHTML =
      '<p style="text-align:center;color:var(--textDim);padding:20px;">暂无等待中的房间</p>';
  } else {
    for (const room of rooms) {
      const item = document.createElement("div");
      item.className = "room-item";

      const host = room.host;
      // 房主头像
      const avatar = document.createElement("div");
      avatar.className = "room-host-avatar";
      avatar.style.borderColor = host ? host.borderColor : "#ccc";
      avatar.style.color = host ? host.textColor : "#999";
      avatar.textContent = host ? host.avatarText : "?";

      // 房间信息
      const info = document.createElement("div");
      info.className = "room-info";
      info.textContent =
        "房主：" + (host ? host.username : "?") +
        " (" + room.players.length + "/" + room.maxPlayers + "人)";

      // 加入按钮
      const joinBtn = document.createElement("button");
      joinBtn.className = "btn-primary";
      joinBtn.textContent = "加入";
      joinBtn.onclick = () => {
        closeRoomModal();
        sendMessage({ type: "join_room", roomId: room.id });
      };

      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(joinBtn);
      roomListEl.appendChild(item);
    }
  }

  // 更新"创建新房间"按钮
  document.getElementById("btnCreateRoom").onclick = () => {
    closeRoomModal();
    sendMessage({ type: "create_room", gameName: game.id });
  };

  // 关闭按钮
  document.getElementById("btnCloseRoom").onclick = () => {
    closeRoomModal();
    window._pendingGame = null;
  };

  // 如果没有等待房间且只有单人游戏，直接创建
  if (rooms.length === 0 && game.minPlayers === 1 && game.maxPlayers === 1) {
    closeRoomModal();
    sendMessage({ type: "create_room", gameName: game.id });
    return;
  }

  modalOverlay.style.display = "flex";
}

// 关闭房间弹窗
function closeRoomModal() {
  document.getElementById("roomModalOverlay").style.display = "none";
}

// ============================================================
// 进入游戏：显示 iframe 容器并加载游戏页面
// ============================================================
function enterGame(roomId, gameName) {
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("gameContainer").style.display = "flex";
  // 隐藏房间面板（customReady 游戏由游戏自身管理准备流程）
  document.getElementById("roomPanel").style.display = "none";

  const iframe = document.getElementById("gameIframe");
  iframe.style.display = "block";
  // 通过 URL 参数传递房间 ID 和用户信息，让游戏页面拿到上下文
  const gameUrl = "/box/" + encodeURIComponent(gameName) + "/game.html" +
    "?roomId=" + encodeURIComponent(roomId) +
    "&gameName=" + encodeURIComponent(gameName) +
    "&username=" + encodeURIComponent(currentUser) +
    "&avatarText=" + encodeURIComponent(currentProfile.avatarText) +
    "&textColor=" + encodeURIComponent(currentProfile.textColor) +
    "&borderColor=" + encodeURIComponent(currentProfile.borderColor);
  iframe.src = gameUrl;
  window._iframeReady = false;
}

// ============================================================
// 房间准备面板
// ============================================================
function enterRoomPanel(roomId, gameName) {
  window._currentRoomGame = gameName;
  window._currentRoomId = roomId;
  window._gameActive = false;

  document.getElementById("mainContent").style.display = "none";
  document.getElementById("gameContainer").style.display = "flex";
  document.getElementById("gameIframe").style.display = "none";

  const panel = document.getElementById("roomPanel");
  panel.style.display = "flex";
  document.getElementById("roomPanelTitle").textContent = "房间 - " + getGameDisplayName(gameName);
  document.getElementById("roomStatusText").textContent = "等待所有玩家准备...";
  document.getElementById("btnReady").textContent = "准备";
  document.getElementById("btnReady").classList.remove("is-ready");
  window._myReady = false;

  // 初始化玩家列表（包含自己）
  const initialPlayers = [{
    username: currentUser,
    avatarText: currentProfile.avatarText,
    textColor: currentProfile.textColor,
    borderColor: currentProfile.borderColor,
    ready: false,
  }];
  updateRoomPanel(initialPlayers);
}

function showRoomPanel() {
  const panel = document.getElementById("roomPanel");
  if (panel) {
    panel.style.display = "flex";
    document.getElementById("gameIframe").style.display = "none";
    document.getElementById("btnReady").textContent = "准备";
    document.getElementById("btnReady").classList.remove("is-ready");
    window._myReady = false;
  }
}

function hideRoomPanel() {
  const panel = document.getElementById("roomPanel");
  if (panel) {
    panel.style.display = "none";
  }
}

function updateRoomPanel(players) {
  const listEl = document.getElementById("roomPlayerList");
  if (!listEl) return;

  listEl.innerHTML = "";

  let readyCount = 0;
  for (const p of players) {
    const item = document.createElement("div");
    item.className = "room-player-item";

    const avatar = document.createElement("div");
    avatar.className = "room-player-avatar";
    avatar.style.borderColor = p.borderColor || "#ccc";
    avatar.style.color = p.textColor || "#999";
    avatar.textContent = p.avatarText || p.username.slice(0, 6);

    const name = document.createElement("div");
    name.className = "room-player-name";
    name.textContent = p.username;

    const ready = document.createElement("div");
    ready.className = "room-player-ready " + (p.ready ? "ready" : "waiting");
    ready.textContent = p.ready ? "✓ 已准备" : "⏳ 等待中";

    item.appendChild(avatar);
    item.appendChild(name);
    item.appendChild(ready);
    listEl.appendChild(item);

    if (p.ready) readyCount++;
  }

  document.getElementById("roomStatusText").textContent =
    "等待所有玩家准备...（" + readyCount + "/" + players.length + "）";
}

function toggleReady() {
  window._myReady = !window._myReady;
  const btn = document.getElementById("btnReady");
  if (window._myReady) {
    btn.textContent = "取消准备";
    btn.classList.add("is-ready");
  } else {
    btn.textContent = "准备";
    btn.classList.remove("is-ready");
  }
  sendMessage({ type: "set_ready", ready: window._myReady });
}

function getGameDisplayName(gameId) {
  // 从已加载的游戏列表中查找显示名称
  if (games && games.length) {
    const found = games.find(g => g.id === gameId);
    if (found) return found.name;
  }
  return gameId;
}

// ============================================================
// 离开游戏 / 离开房间
// ============================================================
function leaveGame() {
  sendMessage({ type: "leave_room" });
}

function leaveRoom() {
  sendMessage({ type: "leave_room" });
}

// 退出游戏 UI（由 room_left 消息触发）
function exitGameUI() {
  document.getElementById("gameContainer").style.display = "none";
  document.getElementById("mainContent").style.display = "block";
  const iframe = document.getElementById("gameIframe");
  iframe.src = "";
  iframe.style.display = "none";
  pendingGameMessages = [];
  window._iframeReady = false;
  window._gameActive = false;
  window._customReadyGame = false;
  window._currentRoomGame = null;
  window._currentRoomId = null;
  window._myReady = false;
  // 隐藏房间面板
  const panel = document.getElementById("roomPanel");
  if (panel) panel.style.display = "none";
}

// ============================================================
// 渲染在线玩家列表
// ============================================================
function renderOnlineList(users) {
  const container = document.getElementById("onlineList");
  container.innerHTML = "";

  // 按游戏分组
  const groups = {};
  for (const u of users) {
    const key = u.gameName || "大厅";
    if (!groups[key]) groups[key] = [];
    groups[key].push(u);
  }

  // 排序：大厅组排第一
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === "大厅") return -1;
    if (b === "大厅") return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const group = document.createElement("div");
    group.className = "online-group";

    const label = document.createElement("div");
    label.className = "online-group-label";
    label.textContent = key + "（" + groups[key].length + "人）";
    group.appendChild(label);

    const playersRow = document.createElement("div");
    playersRow.className = "online-group-players";

    for (const u of groups[key]) {
      const avatar = document.createElement("div");
      avatar.className = "online-avatar";
      avatar.style.border = "2px solid " + u.borderColor;
      avatar.style.color = u.textColor;
      avatar.style.backgroundColor = "rgba(255,255,255,0.05)";
      avatar.textContent = u.avatarText;
      avatar.title = u.username;
      playersRow.appendChild(avatar);
    }
    group.appendChild(playersRow);
    container.appendChild(group);
  }
}

// ============================================================
// 发出 WebSocket 消息
// ============================================================
function sendMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
