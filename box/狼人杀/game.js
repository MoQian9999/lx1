// ============================================================
// 狼人杀 - 客户端逻辑
// ============================================================

// ============================================================
// 常量：角色数据 (完整定义，与server.js对应)
// ============================================================
const ROLE_DATA = {
  werewolf: { id:"werewolf", name:"狼人", emoji:"🐺", team:"werewolf", isStandard:true, skillDesc:"每晚与队友共同选择一名玩家击杀。白天可自爆直接进入黑夜。", nightAction:true },
  white_wolf_king: { id:"white_wolf_king", name:"白狼王", emoji:"👑", team:"werewolf", isStandard:false, skillDesc:"白天发言阶段可自爆，自爆时可带走一名玩家。" },
  wolf_beauty: { id:"wolf_beauty", name:"狼美人", emoji:"💋", team:"werewolf", isStandard:false, skillDesc:"每晚魅惑一名玩家，自身出局时被魅惑者随之殉情。不可连续两晚魅惑同一人。", nightAction:true },
  wolf_king: { id:"wolf_king", name:"狼王", emoji:"⚔️", team:"werewolf", isStandard:false, skillDesc:"出局后可开枪带走一名玩家。被毒杀或殉情时不能开枪。" },
  hidden_wolf: { id:"hidden_wolf", name:"隐狼", emoji:"🫥", team:"werewolf", isStandard:false, skillDesc:"被预言家查验时显示为好人。知道狼队友但不参与夜间刀人。所有狼队友出局后可获得刀人技能。" },
  gargoyle: { id:"gargoyle", name:"石像鬼", emoji:"🗿", team:"werewolf", isStandard:false, skillDesc:"不能自爆。每晚可查验一名玩家的具体身份。不与狼队见面。", nightAction:true },
  demon: { id:"demon", name:"恶魔", emoji:"👹", team:"werewolf", isStandard:false, skillDesc:"不会死于夜晚。每晚可查验一名玩家是否为神职。被预言家查验时预言家死亡。", nightAction:true },
  blood_moon: { id:"blood_moon", name:"血月使徒", emoji:"🌑", team:"werewolf", isStandard:false, skillDesc:"自爆后不立即死亡，下一夜结束时才死亡。自爆后好人技能对其同伙无效。" },
  seer: { id:"seer", name:"预言家", emoji:"🔮", team:"villager", isStandard:true, skillDesc:"每晚可查验一名玩家身份，获得该玩家阵营（好人/狼人）。", nightAction:true },
  witch: { id:"witch", name:"女巫", emoji:"🧪", team:"villager", isStandard:true, skillDesc:"拥有解药和毒药各一瓶。解药可救活被刀的玩家，毒药可毒杀一名玩家。每瓶药整局只能用一次，同一晚只能用一瓶。", nightAction:true },
  hunter: { id:"hunter", name:"猎人", emoji:"🏹", team:"villager", isStandard:true, skillDesc:"出局时可开枪带走一名玩家。被女巫毒死时不能开枪。" },
  guard: { id:"guard", name:"守卫", emoji:"🛡️", team:"villager", isStandard:true, skillDesc:"每晚守护一名玩家（可自守），被守护者免疫狼人刀。不能连续两晚守护同一人。同守同救（奶穿）会导致该玩家死亡。", nightAction:true },
  idiot: { id:"idiot", name:"白痴", emoji:"🤡", team:"villager", isStandard:true, skillDesc:"白天被投票放逐时可翻牌自证免死。翻牌后留在场上但失去投票权。" },
  knight: { id:"knight", name:"骑士", emoji:"🐴", team:"villager", isStandard:false, skillDesc:"白天放逐投票前可翻牌决斗一名玩家：目标为狼人则狼人死亡，目标为好人则骑士死亡。整局仅一次。" },
  bear: { id:"bear", name:"熊", emoji:"🐻", team:"villager", isStandard:false, skillDesc:"天亮时若左右相邻存活玩家中有狼人则咆哮，否则不咆哮。" },
  gravekeeper: { id:"gravekeeper", name:"守墓人", emoji:"🪦", team:"villager", isStandard:false, skillDesc:"天亮后可得知上一轮被投票放逐玩家的身份阵营。" },
  demon_hunter: { id:"demon_hunter", name:"猎魔人", emoji:"🗡️", team:"villager", isStandard:false, skillDesc:"从第二夜起每夜猎杀一名玩家。目标为狼人则目标死亡，好人则自己死亡。", nightAction:true },
  miracle_merchant: { id:"miracle_merchant", name:"奇迹商人", emoji:"💎", team:"villager", isStandard:false, skillDesc:"首夜可给予一名玩家技能（验人/毒药/守护）。给到狼人则狼人暴毙。", nightAction:true },
  dreamweaver: { id:"dreamweaver", name:"摄梦人", emoji:"💤", team:"villager", isStandard:false, skillDesc:"每晚选一名玩家梦游，梦游者免疫夜间伤害。摄梦人死亡时梦游者同死。连续两晚同一目标则该目标死亡。", nightAction:true },
  penguin: { id:"penguin", name:"企鹅", emoji:"🐧", team:"villager", isStandard:false, skillDesc:"每晚冰冻一名玩家，被冰冻者当晚无法发动技能。不可连续两晚冰冻同一人。", nightAction:true },
  crow: { id:"crow", name:"乌鸦", emoji:"🐦‍⬛", team:"villager", isStandard:false, skillDesc:"每晚在玩家头上插旗，被插旗者白天投票时多一票。", nightAction:true },
  villager: { id:"villager", name:"村民", emoji:"👨‍🌾", team:"villager", isStandard:true, skillDesc:"无特殊技能，依靠白天发言和推理找出狼人并投票放逐。" },
  cupid: { id:"cupid", name:"丘比特", emoji:"💘", team:"third_party", isStandard:false, skillDesc:"首夜指定两名玩家成为情侣。同阵营保持原阵营，异阵营组成第三方。", nightAction:true },
  thief: { id:"thief", name:"盗贼", emoji:"🎭", team:"villager", isStandard:false, skillDesc:"开局从两张多余身份牌中选择一张，另一张作废。有狼人选狼人。" },
  wild_child: { id:"wild_child", name:"野孩子", emoji:"🌱", team:"villager", isStandard:false, skillDesc:"首日选择一名玩家为榜样。榜样出局后变狼人。" },
  bomber: { id:"bomber", name:"炸弹人", emoji:"💣", team:"third_party", isStandard:false, skillDesc:"被投票放逐后所有投他票的玩家全部死亡。" },
};

const DEFAULT_SETUPS = {
  6: { werewolf:2, villager:2, seer:1, witch:1 },
  7: { werewolf:2, villager:3, seer:1, witch:1 },
  8: { werewolf:3, villager:2, seer:1, witch:1, hunter:1 },
  9: { werewolf:3, villager:3, seer:1, witch:1, hunter:1 },
  10: { werewolf:3, villager:3, seer:1, witch:1, hunter:1, guard:1 },
  11: { werewolf:4, villager:3, seer:1, witch:1, hunter:1, guard:1 },
  12: { werewolf:4, villager:4, seer:1, witch:1, hunter:1, guard:1 },
};
for (let n=13; n<=18; n++) {
  const wc = 4+Math.floor((n-12)/3);
  DEFAULT_SETUPS[n] = { werewolf:wc, villager:n-wc-4, seer:1, witch:1, hunter:1, guard:1 };
}

// ============================================================
// 全局状态
// ============================================================
const S = {
  // URL 参数
  roomId: "", gameName: "", username: "",
  avatarText: "", textColor: "", borderColor: "",
  // 游戏状态
  phase: "waiting", round: 0, phaseEndTime: 0,
  seats: [], judgeSeat: null, sheriffSeat: null,
  mySeat: null, myRole: null, myRoleData: null,
  totalPlayers: 6, alive: true,
  config: null,
  // 夜间
  nightPrompt: "", nightTargets: [],
  actionSubmitted: false,
  // 发言
  speechOrder: [], currentSpeaker: -1,
  // 投票
  votes: {},
  // 狼人聊天
  wolfChat: [],
  // TTS
  muted: true,
  // 模板
  templates: {},
  // 缩放 (pre-game)
  zoom: 1.0,
  // Canvas 尺寸缓存（仅在 zoom 或 resize 时更新）
  canvasSize: 0,
};

// ============================================================
// 通信模块
// ============================================================
function sendToServer(msg) {
  window.parent.postMessage(msg, "*");
}

function handleServerMessage(msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "ww_config_update": handleConfigUpdate(msg); break;
    case "ww_seat_update": handleSeatUpdate(msg); break;
    case "ww_game_started": handleGameStarted(msg); break;
    case "ww_role_assign": handleRoleAssign(msg); break;
    case "ww_phase_update": handlePhaseUpdate(msg); break;
    case "ww_voice": handleVoice(msg); break;
    case "ww_speech_token": handleSpeechToken(msg); break;
    case "ww_speech_skip": handleSpeechSkip(msg); break;
    case "ww_vote_update": handleVoteUpdate(msg); break;
    case "ww_vote_result": handleVoteResult(msg); break;
    case "ww_sheriff_result": handleSheriffResult(msg); break;
    case "ww_knight_result": handleKnightResult(msg); break;
    case "ww_night_result": handleNightResult(msg); break;
    case "ww_wolf_chat_msg": handleWolfChatMsg(msg); break;
    case "ww_action_ack": handleActionAck(msg); break;
    case "ww_game_over": handleGameOver(msg); break;
    case "ww_play_again": handlePlayAgain(msg); break;
    case "ww_error": showError(msg.message); break;
    case "ww_player_disconnect": handlePlayerDisconnect(msg); break;
    case "ww_miracle_gift": handleMiracleGift(msg); break;
    case "ww_witch_info": handleWitchInfo(msg); break;
    case "ww_state": handleState(msg); break;
  }
}

// ============================================================
// 初始化
// ============================================================
function init() {
  // 解析 URL 参数
  const params = new URLSearchParams(window.location.search);
  S.roomId = params.get("roomId") || "";
  S.gameName = params.get("gameName") || "";
  S.username = params.get("username") || "";
  S.avatarText = params.get("avatarText") || "";
  S.textColor = params.get("textColor") || "#cccccc";
  S.borderColor = params.get("borderColor") || "#cccccc";

  // 加载模板
  loadTemplates();

  // 监听来自大厅的消息
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type && msg.type.startsWith("ww_")) {
      handleServerMessage(msg);
    }
    // 也处理 room_update 获取玩家列表
    if (msg && msg.type === "room_update") {
      handleRoomUpdate(msg);
    }
  });

  // 就绪信号
  sendToServer({ type: "game_ready" });

  // 初始化配置
  initConfig();
  // 初始化桌面
  renderTable();
  // 初始化卡牌信息
  initCardInfoPanel();
  // 绑定事件
  bindEvents();

  // 定时器: 更新倒计时
  setInterval(updateTimer, 500);

  // 窗口 resize 监听：重新计算 Canvas 尺寸
  let resizeDebounce;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => {
      S.canvasSize = 0; // 强制重新计算尺寸
      renderTable();
      renderMiniTable();
    }, 200);
  });

  // Ctrl+滚轮缩放（桌面端）；普通滚轮用于缩放后的平移
  document.addEventListener("wheel", (e) => {
    if (S.phase !== "waiting") return;
    if (e.target.closest && (e.target.closest(".overlay") || e.target.closest(".side-panel"))) return;
    if (!e.ctrlKey && !e.metaKey) return; // 仅 Ctrl+滚轮 缩放
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    changeZoom(delta);
  }, { passive: false });

  // 初始化 TTS
  initTTS();
}

function handleRoomUpdate(msg) {
  // 大厅传来的房间更新，可以用于同步玩家列表
}

// ============================================================
// 缩放控制
// ============================================================
function changeZoom(delta) {
  setZoom(S.zoom + delta);
}

function setZoom(level) {
  S.zoom = Math.max(0.5, Math.min(2.0, Math.round(level * 10) / 10));
  document.getElementById("zoomLabel").textContent = Math.round(S.zoom * 100) + "%";
  S.canvasSize = 0; // 强制重新计算尺寸
  renderTable();
}

// ============================================================
// 事件绑定
// ============================================================
function bindEvents() {
  // 配置面板
  document.getElementById("btnConfig").addEventListener("click", toggleConfigPanel);
  document.getElementById("btnCloseConfig").addEventListener("click", () => toggleConfigPanel(false));
  document.getElementById("configOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) toggleConfigPanel(false);
  });
  document.getElementById("btnDecreasePlayers").addEventListener("click", () => adjustPlayers(-1));
  document.getElementById("btnIncreasePlayers").addEventListener("click", () => adjustPlayers(1));
  document.getElementById("selectExpansionRole").addEventListener("change", onAddExpansionRole);
  document.getElementById("btnAddGenericVillager").addEventListener("click", addGenericVillager);
  document.getElementById("btnSaveTemplate").addEventListener("click", saveTemplate);
  document.getElementById("btnLoadTemplate").addEventListener("click", loadTemplate);
  document.getElementById("btnDeleteTemplate").addEventListener("click", deleteTemplate);
  document.getElementById("btnExportTemplate").addEventListener("click", exportTemplate);
  document.getElementById("btnImportTemplate").addEventListener("click", importTemplate);

  // 规则开关
  ["ruleWitchSelfSave","ruleRandomSeats","ruleRandomOrder","ruleMassacre","ruleNoSheriff","ruleNoMilkPenetrate"].forEach(id => {
    document.getElementById(id).addEventListener("change", onRuleChange);
  });

  // 卡牌信息
  document.getElementById("btnCardInfo").addEventListener("click", () => toggleCardInfo(true));
  document.getElementById("btnCloseCardInfo").addEventListener("click", () => toggleCardInfo(false));
  document.getElementById("cardInfoOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) toggleCardInfo(false);
  });

  // 开始游戏 / 离开
  document.getElementById("btnStartGame").addEventListener("click", startGame);
  document.getElementById("btnLeaveRoom").addEventListener("click", () => {
    sendToServer({ type: "leave_room" });
  });

  // 游戏内按钮
  document.getElementById("btnRoleCard").addEventListener("click", toggleRoleCard);
  document.getElementById("btnCloseRoleCard").addEventListener("click", () => toggleRoleCard(false));
  document.getElementById("roleCardOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) toggleRoleCard(false);
  });
  document.getElementById("btnMute").addEventListener("click", toggleMute);

  // 阶段操作按钮
  document.getElementById("btnEndSpeech").addEventListener("click", endSpeech);
  document.getElementById("btnVoteAbstain").addEventListener("click", () => submitVote("abstain"));
  document.getElementById("btnSheriffAbstain").addEventListener("click", () => submitSheriffVote("abstain"));
  document.getElementById("btnSubmitLastWords").addEventListener("click", submitLastWords);
  document.getElementById("btnPlayAgain").addEventListener("click", () => {
    sendToServer({ type: "ww_play_again" });
  });
  document.getElementById("btnResultPlayAgain").addEventListener("click", () => {
    sendToServer({ type: "ww_play_again" });
  });
  document.getElementById("btnResultLeave").addEventListener("click", () => {
    sendToServer({ type: "leave_room" });
  });

  // Tab 切换
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // 缩放控件
  document.getElementById("btnZoomIn").addEventListener("click", () => changeZoom(0.1));
  document.getElementById("btnZoomOut").addEventListener("click", () => changeZoom(-0.1));
  document.getElementById("btnZoomReset").addEventListener("click", () => setZoom(1.0));

  // 结果弹窗
  document.getElementById("resultOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById("resultOverlay").classList.add("hidden");
    }
  });
}

// ============================================================
// 配置初始化与管理
// ============================================================
function initConfig() {
  S.totalPlayers = 6;
  S.config = {
    totalPlayers: 6,
    roleSetup: { ...DEFAULT_SETUPS[6] },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight:false, randomSeats:false, randomOrder:false, massacreMode:true, noSheriff:false, noMilkPenetrate:false },
  };
  updateConfigUI();
  sendConfig();
}

function updateConfigUI() {
  document.getElementById("totalPlayersDisplay").textContent = S.config.totalPlayers;
  document.getElementById("ruleWitchSelfSave").checked = S.config.rules.witchSelfSaveAfterFirstNight;
  document.getElementById("ruleRandomSeats").checked = S.config.rules.randomSeats;
  document.getElementById("ruleRandomOrder").checked = S.config.rules.randomOrder;
  document.getElementById("ruleMassacre").checked = S.config.rules.massacreMode;
  document.getElementById("ruleNoSheriff").checked = S.config.rules.noSheriff;
  document.getElementById("ruleNoMilkPenetrate").checked = S.config.rules.noMilkPenetrate;

  // 角色配置网格
  renderRoleConfigGrid();
  // 扩展角色下拉
  renderExpansionSelect();
  // 通用民
  const gvc = S.config.genericVillagerCount || 0;
  document.getElementById("genericVillagerCount").textContent = gvc;
  document.getElementById("genericVillagerInfo").classList.toggle("hidden", gvc === 0);

  // 角色数验证
  const totalRoles = Object.values(S.config.roleSetup).reduce((a,b)=>a+b,0);
  const warning = document.getElementById("roleCountWarning");
  if (totalRoles !== S.config.totalPlayers) {
    warning.textContent = `(角色数${totalRoles} ≠ 玩家数${S.config.totalPlayers})`;
  } else {
    warning.textContent = "";
  }
}

function renderRoleConfigGrid() {
  const grid = document.getElementById("roleConfigGrid");
  grid.innerHTML = "";
  const setup = S.config.roleSetup;
  for (const [roleId, count] of Object.entries(setup)) {
    if (count <= 0 && !ROLE_DATA[roleId]) continue;
    const rd = ROLE_DATA[roleId];
    if (!rd) continue;
    const item = document.createElement("div");
    item.className = "role-config-item";
    item.innerHTML = `
      <span class="role-name">${rd.emoji} ${rd.name}</span>
      <div class="role-count-controls">
        <button class="btn-count" data-role="${roleId}" data-delta="-1">−</button>
        <span class="role-count">${count}</span>
        <button class="btn-count" data-role="${roleId}" data-delta="+1">+</button>
      </div>`;
    item.querySelectorAll(".btn-count").forEach(btn => {
      btn.addEventListener("click", () => adjustRole(btn.dataset.role, parseInt(btn.dataset.delta)));
    });
    grid.appendChild(item);
  }
}

function renderExpansionSelect() {
  const sel = document.getElementById("selectExpansionRole");
  sel.innerHTML = '<option value="">添加扩展角色...</option>';
  for (const [roleId, rd] of Object.entries(ROLE_DATA)) {
    if (!rd.isStandard && !S.config.roleSetup[roleId]) {
      sel.innerHTML += `<option value="${roleId}">${rd.emoji} ${rd.name}</option>`;
    }
  }
}

function adjustRole(roleId, delta) {
  const setup = S.config.roleSetup;
  setup[roleId] = Math.max(0, (setup[roleId] || 0) + delta);
  if (setup[roleId] === 0) delete setup[roleId];
  S.config.roleSetup = setup;
  updateConfigUI();
  sendConfig();
}

function onAddExpansionRole() {
  const sel = document.getElementById("selectExpansionRole");
  const roleId = sel.value;
  if (!roleId) return;
  if (!S.config.roleSetup[roleId]) S.config.roleSetup[roleId] = 1;
  sel.value = "";
  updateConfigUI();
  sendConfig();
}

function addGenericVillager() {
  S.config.genericVillagerCount = (S.config.genericVillagerCount || 0) + 1;
  S.config.totalPlayers++;
  updateConfigUI();
  sendConfig();
}

function adjustPlayers(delta) {
  const newVal = S.config.totalPlayers + delta;
  if (newVal < 6 || newVal > 18) return;
  S.config.totalPlayers = newVal;

  // 自动调整默认配置
  if (DEFAULT_SETUPS[newVal]) {
    // 只在配置是默认设置时自动更新
    const currentKeys = Object.keys(S.config.roleSetup).filter(k => S.config.roleSetup[k] > 0).sort().join(",");
    const defaultKeys = DEFAULT_SETUPS[newVal] ? Object.keys(DEFAULT_SETUPS[newVal]).sort().join(",") : "";
    if (currentKeys !== defaultKeys || newVal === 6) {
      S.config.roleSetup = { ...DEFAULT_SETUPS[newVal] };
    }
  }
  // 6人默认屠城
  if (newVal === 6) S.config.rules.massacreMode = true;
  updateConfigUI();
  sendConfig();
}

function onRuleChange() {
  S.config.rules = {
    witchSelfSaveAfterFirstNight: document.getElementById("ruleWitchSelfSave").checked,
    randomSeats: document.getElementById("ruleRandomSeats").checked,
    randomOrder: document.getElementById("ruleRandomOrder").checked,
    massacreMode: document.getElementById("ruleMassacre").checked,
    noSheriff: document.getElementById("ruleNoSheriff").checked,
    noMilkPenetrate: document.getElementById("ruleNoMilkPenetrate").checked,
  };
  sendConfig();
}

function sendConfig() {
  sendToServer({ type: "ww_config", config: S.config });
}

function handleConfigUpdate(msg) {
  S.config = msg.config;
  S.totalPlayers = msg.config.totalPlayers;
  updateConfigUI();
  renderTable();
}

// ============================================================
// 桌面 Canvas 渲染
// ============================================================
function calcCanvasSize() {
  const maxW = window.innerWidth * 0.85;
  const maxH = window.innerHeight * 0.75;
  return Math.min(maxW, maxH) * S.zoom;
}

function applyCanvasSize(size) {
  const canvas = document.getElementById("tableCanvas");
  if (!canvas) return;
  if (S.canvasSize === size) return; // 尺寸未变则跳过
  S.canvasSize = size;
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
}

function renderTable() {
  const canvas = document.getElementById("tableCanvas");
  if (!canvas) return;
  const size = calcCanvasSize();
  applyCanvasSize(size);
  if (size === 0) return;

  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size * 0.535;
  const tableR = size * 0.25;
  const seatR = tableR + size * 0.15;
  const total = S.config ? S.config.totalPlayers : 6;

  ctx.clearRect(0, 0, size, size);

  // 背景
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, size, size);

  // 圆桌
  ctx.beginPath();
  ctx.arc(cx, cy, tableR, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fill();
  ctx.strokeStyle = "#2a2a3e";
  ctx.lineWidth = 2;
  ctx.stroke();

  // 桌面色调
  const tableGrad = ctx.createRadialGradient(cx, cy, tableR*0.3, cx, cy, tableR);
  tableGrad.addColorStop(0, "#242440");
  tableGrad.addColorStop(1, "#12121a");
  ctx.fillStyle = tableGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, tableR - 4, 0, Math.PI*2);
  ctx.fill();

  // 桌子中心: 游戏信息区
  ctx.fillStyle = "#c9a84c";
  ctx.font = `bold ${Math.max(12,size*0.025)}px "Microsoft YaHei"`;
  ctx.textAlign = "center";
  ctx.fillText("🐺 狼人杀", cx, cy - 8);
  ctx.fillStyle = "#d4c5b9";
  ctx.font = `${Math.max(10,size*0.018)}px "Microsoft YaHei"`;
  ctx.fillText(S.config ? S.config.totalPlayers + "人局" : "6人局", cx, cy + 18);
  ctx.fillStyle = "#8a8a9a";
  ctx.fillText(S.phase === "waiting" ? "等待玩家入座..." : "游戏中", cx, cy + 38);

  // 座位
  for (let i = 1; i <= total; i++) {
    const angle = (2*Math.PI*(i-1))/total - Math.PI/2;
    const sx = cx + seatR * Math.cos(angle);
    const sy = cy + seatR * Math.sin(angle);
    const sr = size * 0.04;

    const seatData = S.seats && S.seats[i];
    const occupied = !!seatData;
    const isMe = seatData && seatData.username === S.username;
    const isDead = seatData && seatData.alive === false;

    // 座位圆圈
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI*2);
    if (isDead) {
      ctx.fillStyle = "rgba(231,76,60,0.3)";
      ctx.strokeStyle = "#e74c3c";
    } else if (isMe) {
      ctx.fillStyle = "#2a2a1a";
      ctx.strokeStyle = "#c9a84c";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(201,168,76,0.5)";
      ctx.shadowBlur = 8;
    } else if (occupied) {
      ctx.fillStyle = "#1a2a1a";
      ctx.strokeStyle = "#2e7d32";
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.strokeStyle = "#2a2a3e";
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;

    // 死亡标记
    if (isDead) {
      ctx.fillStyle = "#e74c3c";
      ctx.font = `bold ${sr*1.2}px sans-serif`;
      ctx.fillText("✕", sx, sy + sr*0.35);
    }

    // 座位号
    ctx.fillStyle = "#8a8a9a";
    ctx.font = `${Math.max(8,sr*0.6)}px sans-serif`;
    ctx.textAlign = "center";
    const labelY = sy + sr + Math.max(4, size * 0.018);
    ctx.fillText(i + "号", sx, labelY);

    // 头像文字
    if (occupied) {
      ctx.fillStyle = seatData.textColor || "#ccc";
      ctx.font = `bold ${Math.max(10,sr*0.8)}px "Microsoft YaHei"`;
      ctx.fillText(seatData.avatarText || "?", sx, sy + sr*0.3);
    }

    // 警长标识
    if (S.sheriffSeat === i) {
      ctx.fillStyle = "#c9a84c";
      ctx.font = `${sr*0.6}px sans-serif`;
      ctx.fillText("⭐", sx + sr*0.5, sy - sr*0.5);
    }
  }

  // 法官位 (顶部)
  renderJudgePosition(cx, 0, size, ctx);

  // 点击处理
  canvas.onclick = (e) => handleTableClick(e, canvas, cx, cy, tableR, seatR, total, size);
}

function renderJudgePosition(cx, topY, size, ctx) {
  const judgeX = cx, judgeY = size * 0.04;
  const jr = size * 0.04;
  const occupied = !!S.judgeSeat;

  ctx.beginPath();
  ctx.arc(judgeX, judgeY, jr, 0, Math.PI*2);
  if (occupied) {
    ctx.fillStyle = "#2a1a1a";
    ctx.strokeStyle = "#c9a84c";
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = "#1a1a2e";
    ctx.strokeStyle = "#c9a84c";
    ctx.setLineDash([4, 4]);
  }
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#d4c5b9";
  ctx.font = `${Math.max(10,jr*0.8)}px "Microsoft YaHei"`;
  ctx.textAlign = "center";
  ctx.fillText("⚖️", judgeX, judgeY + jr*0.3);
  ctx.fillStyle = "#8a8a9a";
  ctx.font = `${Math.max(8,jr*0.5)}px "Microsoft YaHei"`;
  const judgeLabelY = judgeY + jr + Math.max(4, size * 0.018);
  ctx.fillText(occupied ? "法官已就位" : "等待法官入座", judgeX, judgeLabelY);
}

function handleTableClick(e, canvas, cx, cy, tableR, seatR, total, size) {
  if (S.phase !== "waiting") return;
  const rect = canvas.getBoundingClientRect();
  // 将屏幕坐标转换为 Canvas 像素坐标（考虑 CSS max-width 缩放）
  const scaleX = size / rect.width;
  const scaleY = size / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  // 点击法官位（Canvas 上方）
  const jr = size * 0.04;
  const judgeX = cx, judgeY = size * 0.04;
  const judgeDist = Math.hypot(mx - judgeX, my - judgeY);
  if (judgeDist < jr + 10) {
    sendToServer({ type: "ww_select_seat", seat: "judge" });
    return;
  }

  // 点击玩家座位
  for (let i = 1; i <= total; i++) {
    const angle = (2*Math.PI*(i-1))/total - Math.PI/2;
    const sx = cx + seatR * Math.cos(angle);
    const sy = cy + seatR * Math.sin(angle);
    const sr = size * 0.04;
    const dist = Math.hypot(mx - sx, my - sy);
    if (dist < sr + 8) {
      sendToServer({ type: "ww_select_seat", seat: i });
      return;
    }
  }
}

// ============================================================
// 座位更新处理
// ============================================================
function handleSeatUpdate(msg) {
  S.seats = msg.seats || [];
  S.judgeSeat = msg.judgeSeat;
  renderTable();

  // 更新开始按钮状态
  const total = S.config ? S.config.totalPlayers : 6;
  let filledCount = 0;
  for (let i = 1; i <= total; i++) {
    if (S.seats[i]) filledCount++;
  }
  const isHost = true; // 简化: 因为customReady模式，iframe中的第一个玩家就是自己
  const allFilled = filledCount >= total;
  document.getElementById("btnStartGame").disabled = !allFilled;
  if (allFilled) {
    document.getElementById("btnStartGame").textContent = "开始游戏";
  } else {
    document.getElementById("btnStartGame").textContent = `等待玩家入座 (${filledCount}/${total})`;
  }
}

// ============================================================
// 游戏开始 & 角色分配
// ============================================================
function startGame() {
  sendToServer({ type: "ww_start_game" });
}

function handleGameStarted(msg) {
  S.seats = msg.seats;
  S.totalPlayers = msg.config.totalPlayers;
  S.config = { ...S.config, ...msg.config };
  S.phase = "waiting";
  S.alive = true;

  document.getElementById("preGamePanel").classList.add("hidden");
  document.getElementById("gamePanel").classList.remove("hidden");
  document.getElementById("configOverlay").classList.add("hidden");
  document.getElementById("cardInfoOverlay").classList.add("hidden");

  // 初始化迷你桌面
  renderMiniTable();
  showPhase("phaseWaiting");
  document.getElementById("waitingStatus").textContent = "等待角色分配...";
}

function handleRoleAssign(msg) {
  S.myRole = msg.role;
  S.myRoleData = ROLE_DATA[msg.role];
  S.mySeat = msg.seatNumber;
  S.alive = true;

  // 更新底栏
  document.getElementById("mySeatDisplay").textContent = `座位: ${S.mySeat}号`;
  document.getElementById("roleCardIcon").textContent = msg.emoji || "🃏";
  document.getElementById("roleCardName").textContent = msg.roleName || "未知";

  // 更新角色卡弹窗内容
  document.getElementById("popupRoleIcon").textContent = msg.emoji || "🃏";
  document.getElementById("popupRoleName").textContent = msg.roleName || "未知";
  const teamEl = document.getElementById("popupRoleTeam");
  teamEl.textContent = msg.team === "werewolf" ? "狼人阵营" : msg.team === "villager" ? "好人阵营" : "第三方阵营";
  teamEl.className = "role-card-team " + msg.team;
  document.getElementById("popupRoleDesc").textContent = msg.skillDesc || "";
  document.getElementById("popupRoleStatus").textContent = "";

  document.getElementById("waitingStatus").textContent = `你的角色: ${msg.roleName} (${S.mySeat}号)`;

  // 自动弹出角色卡 3 秒
  toggleRoleCard(true);
  setTimeout(() => toggleRoleCard(false), 3000);
}

// ============================================================
// 阶段更新
// ============================================================
function handlePhaseUpdate(msg) {
  S.phase = msg.phase;
  S.round = msg.round;
  S.phaseEndTime = msg.phaseEndTime;
  if (msg.phaseData) {
    S.seats = msg.phaseData.seats || S.seats;
    S.judgeSeat = msg.phaseData.judgeSeat !== undefined ? msg.phaseData.judgeSeat : S.judgeSeat;
    S.sheriffSeat = msg.phaseData.sheriffSeat !== undefined ? msg.phaseData.sheriffSeat : S.sheriffSeat;
    S.speechOrder = msg.phaseData.speechOrder || [];
    S.currentSpeaker = msg.phaseData.currentSpeaker !== undefined ? msg.phaseData.currentSpeaker : -1;
  }

  // 更新顶栏
  updateTopBar();

  // 根据阶段切换中央区域
  if (S.phase.startsWith("NIGHT_")) {
    if (S.phase === "NIGHT_WEREWOLF") S.witchKillTarget = null; // 新一夜清除旧女巫信息
    showPhase("phaseNight");
    setupNightPhase(S.phase);
  } else if (S.phase === "SHERIFF_ELECTION") {
    showPhase("phaseSheriff");
    setupSheriffElection();
  } else if (S.phase === "DAWN") {
    showPhase("phaseDawn");
    handleDawn(msg);
  } else if (S.phase === "LAST_WORDS") {
    showPhase("phaseLastWords");
  } else if (S.phase === "DAY_SPEECH") {
    showPhase("phaseSpeech");
    setupSpeechPhase();
  } else if (S.phase === "DAY_VOTE") {
    showPhase("phaseVote");
    setupVotePhase();
  } else if (S.phase === "DUSK") {
    showPhase("phaseWaiting");
    document.getElementById("waitingStatus").textContent = "天黑请闭眼...";
  } else if (S.phase === "GAME_OVER") {
    // will be handled by ww_game_over
  }

  renderMiniTable();
}

function updateTopBar() {
  const phaseNames = {
    SHERIFF_ELECTION: "警长竞选",
    NIGHT_WEREWOLF: "狼人行动",
    NIGHT_SEER: "预言家查验",
    NIGHT_WITCH: "女巫用药",
    NIGHT_GUARD: "守卫守护",
    NIGHT_GARGOYLE: "石像鬼查验",
    NIGHT_DREAMWEAVER: "摄梦人行动",
    NIGHT_PENGUIN: "企鹅冰冻",
    NIGHT_DEMON_HUNTER: "猎魔人猎杀",
    NIGHT_MIRACLE_MERCHANT: "奇迹商人",
    NIGHT_CROW: "乌鸦插旗",
    DAWN: "天亮",
    LAST_WORDS: "遗言",
    DAY_SPEECH: "发言阶段",
    DAY_VOTE: "放逐投票",
    DUSK: "天黑",
    GAME_OVER: "游戏结束",
  };
  const icons = {
    NIGHT_WEREWOLF: "🌙", NIGHT_SEER: "🌙", NIGHT_WITCH: "🌙", NIGHT_GUARD: "🌙",
    NIGHT_GARGOYLE: "🌙", NIGHT_DREAMWEAVER: "🌙", NIGHT_PENGUIN: "🌙",
    NIGHT_DEMON_HUNTER: "🌙", NIGHT_MIRACLE_MERCHANT: "🌙", NIGHT_CROW: "🌙",
    DAWN: "☀️", DAY_SPEECH: "🗣️", DAY_VOTE: "🗳️", SHERIFF_ELECTION: "⭐", DUSK: "🌙",
  };
  document.getElementById("phaseIcon").textContent = icons[S.phase] || "⏳";
  document.getElementById("phaseName").textContent = phaseNames[S.phase] || S.phase;

  // 警长
  const sheriffBadge = document.getElementById("sheriffBadge");
  if (S.sheriffSeat) {
    sheriffBadge.classList.remove("hidden");
    document.getElementById("sheriffSeatDisplay").textContent = `警长: ${S.sheriffSeat}号`;
  } else {
    sheriffBadge.classList.add("hidden");
  }
}

function showPhase(phaseId) {
  document.querySelectorAll(".phase-content").forEach(el => el.classList.add("hidden"));
  const el = document.getElementById(phaseId);
  if (el) el.classList.remove("hidden");

  // 狼人聊天面板: 仅在狼人刀人阶段显示
  if (S.phase === "NIGHT_WEREWOLF" && S.myRoleData && S.myRoleData.team === "werewolf") {
    showWolfChat(true);
  } else {
    showWolfChat(false);
  }
}

// ============================================================
// 夜间阶段
// ============================================================
function setupNightPhase(phase) {
  const myRole = S.myRole;
  const myRoleData = S.myRoleData;
  S.actionSubmitted = false;

  let promptText = "";
  let showTargets = false;
  let requireTwoTargets = false;

  // 确定当前阶段对应哪个角色需要行动
  const phaseRoleMap = {
    NIGHT_WEREWOLF: "werewolf",
    NIGHT_GUARD: "guard",
    NIGHT_SEER: "seer",
    NIGHT_WITCH: "witch",
    NIGHT_GARGOYLE: "gargoyle",
    NIGHT_DREAMWEAVER: "dreamweaver",
    NIGHT_PENGUIN: "penguin",
    NIGHT_DEMON_HUNTER: "demon_hunter",
    NIGHT_MIRACLE_MERCHANT: "miracle_merchant",
    NIGHT_CROW: "crow",
    NIGHT_CUPID: "cupid",
    NIGHT_WOLF_BEAUTY: "wolf_beauty",
    NIGHT_DEMON: "demon",
  };

  const activeRole = phaseRoleMap[phase];
  if (!activeRole || myRole !== activeRole || !S.alive) {
    document.getElementById("nightPrompt").textContent = phase === "NIGHT_WEREWOLF"
      ? "等待狼人选择击杀目标..."
      : "等待行动中...";
    document.getElementById("nightTargetGrid").innerHTML = "";
    document.getElementById("nightActionButtons").innerHTML = "";
    return;
  }

  const rd = ROLE_DATA[activeRole];
  if (!rd || !rd.nightAction) {
    promptText = "等待中...";
  } else {
    showTargets = true;
    switch (activeRole) {
      case "werewolf":
        promptText = "请选择今晚要击杀的目标";
        break;
      case "guard":
        promptText = "请选择要守护的玩家";
        break;
      case "seer":
        promptText = "请选择要查验的玩家";
        break;
      case "witch":
        if (S.witchKillTarget) {
          promptText = `今晚 ${S.witchKillTarget} 号被刀了。请选择用药目标`;
        } else {
          promptText = "请选择用药目标（今夜无人被刀）";
        }
        break;
      case "gargoyle":
        promptText = "请选择要查验身份的玩家";
        break;
      case "dreamweaver":
        promptText = "请选择要摄梦的玩家";
        break;
      case "penguin":
        promptText = "请选择要冰冻的玩家";
        break;
      case "demon_hunter":
        promptText = "请选择要猎杀的玩家";
        break;
      case "miracle_merchant":
        promptText = "请选择要给予技能的玩家";
        break;
      case "crow":
        promptText = "请选择要插旗的玩家";
        break;
      default:
        promptText = "请选择目标";
    }
  }

  document.getElementById("nightPrompt").textContent = promptText;

  // 渲染可选目标
  if (showTargets) {
    renderNightTargets(activeRole);
  } else {
    document.getElementById("nightTargetGrid").innerHTML = "";
  }

  // 特殊按钮
  let actionHTML = "";
  if (activeRole === "witch") {
    actionHTML = '<button class="btn-primary" onclick="submitWitchAction(\'antidote\')">💚 使用解药</button>';
    actionHTML += '<button class="btn-secondary" onclick="submitWitchAction(\'poison\')">💀 使用毒药</button>';
    actionHTML += '<button class="btn-secondary" onclick="submitWitchAction(\'skip\')">跳过</button>';
  } else if (activeRole === "miracle_merchant") {
    actionHTML += '<div style="margin-top:12px"><label>给予技能: </label>';
    actionHTML += '<select id="giftSkillSelect" class="select-sm">';
    actionHTML += '<option value="check">验人 (查验)</option>';
    actionHTML += '<option value="poison">毒药</option>';
    actionHTML += '<option value="guard">守护</option>';
    actionHTML += '</select></div>';
    actionHTML += '<button class="btn-primary" onclick="submitMiracleGift()" style="margin-top:8px">送出技能</button>';
  } else {
    // 通用确认按钮 (狼人/预言家/守卫/猎魔人/etc)
    actionHTML = '<button class="btn-primary" onclick="submitNightAction()">✅ 确认目标</button>';
  }
  document.getElementById("nightActionButtons").innerHTML = actionHTML;
}

function renderNightTargets(activeRole) {
  const grid = document.getElementById("nightTargetGrid");
  grid.innerHTML = "";

  const alivePlayers = [];
  for (let i = 1; i < S.seats.length; i++) {
    if (S.seats[i] && S.seats[i].alive !== false) {
      alivePlayers.push({ seat: i, ...S.seats[i] });
    }
  }

  for (const p of alivePlayers) {
    const div = document.createElement("div");
    div.className = "target-item";
    div.dataset.seat = p.seat;
    // 狼人不可选自己 (除非只剩自己)
    if (activeRole === "werewolf" && p.username === S.username && alivePlayers.length > 1) {
      div.classList.add("dead");
    }
    div.innerHTML = `
      <div class="target-avatar" style="border-color:${p.borderColor||'#ccc'};color:${p.textColor||'#999'}">${p.avatarText||'?'}</div>
      <div class="target-seat">${p.seat}号</div>
      <div class="target-name">${p.username||''}</div>`;
    if (!div.classList.contains("dead")) {
      div.addEventListener("click", () => onNightTargetClick(p.seat, activeRole, div));
    }
    grid.appendChild(div);
  }
}

let _selectedNightTargets = [];
function onNightTargetClick(seat, activeRole, div) {
  // 切换选择
  if (activeRole === "witch") {
    // 女巫: 单选
    document.querySelectorAll("#nightTargetGrid .target-item").forEach(el => el.classList.remove("selected"));
    _selectedNightTargets = [seat];
    div.classList.add("selected");
  } else {
    // 单选
    document.querySelectorAll("#nightTargetGrid .target-item").forEach(el => el.classList.remove("selected"));
    _selectedNightTargets = [seat];
    div.classList.add("selected");
  }
}

function submitNightAction() {
  if (_selectedNightTargets.length === 0) return;
  const target = _selectedNightTargets[0];
  _selectedNightTargets = [];
  S.actionSubmitted = true;
  if (S.phase === "NIGHT_WEREWOLF") {
    sendToServer({ type: "ww_wolf_kill", targetSeat: target });
  } else {
    sendToServer({ type: "ww_night_action", roleId: S.myRole, targetSeat: target });
  }
  document.getElementById("nightPrompt").textContent = "已提交，等待其他玩家...";
  document.getElementById("nightTargetGrid").innerHTML = "";
  document.getElementById("nightActionButtons").innerHTML = "";
}

function submitWitchAction(action) {
  const target = _selectedNightTargets.length > 0 ? _selectedNightTargets[0] : null;
  _selectedNightTargets = [];
  S.actionSubmitted = true;
  sendToServer({
    type: "ww_night_action",
    roleId: "witch",
    targetSeat: target,
    antidoteTarget: action === "antidote" ? target : null,
    poisonTarget: action === "poison" ? target : null,
  });
  document.getElementById("nightPrompt").textContent = "已提交，等待其他玩家...";
  document.getElementById("nightTargetGrid").innerHTML = "";
  document.getElementById("nightActionButtons").innerHTML = "";
}

function submitMiracleGift() {
  if (_selectedNightTargets.length === 0) return;
  const skill = document.getElementById("giftSkillSelect") ? document.getElementById("giftSkillSelect").value : "check";
  sendToServer({
    type: "ww_night_action",
    roleId: "miracle_merchant",
    targetSeat: _selectedNightTargets[0],
    giftSkill: skill,
  });
  _selectedNightTargets = [];
  S.actionSubmitted = true;
  document.getElementById("nightPrompt").textContent = "已提交，等待其他玩家...";
  document.getElementById("nightTargetGrid").innerHTML = "";
  document.getElementById("nightActionButtons").innerHTML = "";
}

function handleActionAck(msg) {
  // 行动确认
}

function handleWitchInfo(msg) {
  // 女巫专属：被刀玩家信息
  S.witchKillTarget = msg.killTarget;
}

function handleNightResult(msg) {
  // 夜间个人结果暂存，DAWN 阶段统一展示
  S.pendingNightResults = S.pendingNightResults || [];
  const role = msg.role;
  if (role === "seer") {
    const alignmentText = msg.alignment === "werewolf" ? "狼人" : "好人";
    S.pendingNightResults.push(`${msg.targetSeat}号是 ${alignmentText}`);
  } else if (role === "gargoyle") {
    S.pendingNightResults.push(`${msg.targetSeat}号的身份是 ${msg.roleName || "未知"}`);
  } else if (role === "demon") {
    S.pendingNightResults.push(`${msg.targetSeat}号${msg.isGod ? "是神职" : "不是神职"}`);
  } else if (role === "gravekeeper") {
    S.pendingNightResults.push(`上一轮被放逐的是: ${msg.lastEliminatedRole === "werewolf" ? "狼人阵营" : "好人阵营"}`);
  }
}

// ============================================================
// 警长竞选
// ============================================================
function setupSheriffElection() {
  document.getElementById("sheriffResult").classList.add("hidden");
  const grid = document.getElementById("sheriffCandidates");
  grid.innerHTML = "";

  const alivePlayers = [];
  for (let i = 1; i < S.seats.length; i++) {
    if (S.seats[i] && S.seats[i].alive !== false) {
      alivePlayers.push({ seat: i, ...S.seats[i] });
    }
  }

  for (const p of alivePlayers) {
    const div = document.createElement("div");
    div.className = "candidate-item";
    div.dataset.seat = p.seat;
    div.innerHTML = `
      <div class="candidate-avatar" style="border:2px solid ${p.borderColor||'#ccc'};color:${p.textColor||'#999'}">${p.avatarText||'?'}</div>
      <span>${p.seat}号</span>`;
    div.addEventListener("click", () => {
      document.querySelectorAll("#sheriffCandidates .candidate-item").forEach(el => el.classList.remove("selected"));
      div.classList.add("selected");
    });
    grid.appendChild(div);
  }
}

function submitSheriffVote(target) {
  const selected = document.querySelector("#sheriffCandidates .candidate-item.selected");
  const seat = target === "abstain" ? "abstain" : (selected ? parseInt(selected.dataset.seat) : "abstain");
  sendToServer({ type: "ww_sheriff_vote", targetSeat: seat === "abstain" ? null : seat });
  document.getElementById("sheriffCandidates").innerHTML = '<p style="color:var(--text-dim)">已投票，等待其他玩家...</p>';
}

function handleSheriffResult(msg) {
  S.sheriffSeat = msg.sheriffSeat;
  document.getElementById("sheriffResult").classList.remove("hidden");
  document.getElementById("sheriffResult").innerHTML = S.sheriffSeat
    ? `<p style="color:var(--accent-gold);font-size:18px">⭐ ${S.sheriffSeat}号当选警长!</p>`
    : `<p style="color:var(--text-dim)">平票，本局无警长</p>`;
  updateTopBar();
}

// ============================================================
// 天亮
// ============================================================
function handleDawn(msg) {
  const deaths = msg.phaseData ? msg.phaseData.deadSeats || [] : [];
  const msgEl = document.getElementById("dawnMessage");
  let text = "";
  if (deaths.length === 0) {
    text = "昨夜是平安夜，无人死亡。";
  } else {
    text = "昨晚 " + deaths.map(d => d + "号").join("、") + " 玩家死亡。";
  }

  // 夜间个人结果（预言家验人等）
  if (S.pendingNightResults && S.pendingNightResults.length > 0) {
    text += "\n\n" + S.pendingNightResults.join("\n");
  }
  S.pendingNightResults = [];
  msgEl.textContent = text;

  // 如果自己死了，准备遗言输入
  if (S.mySeat && deaths.includes(S.mySeat)) {
    S.alive = false;
    document.getElementById("mySeatDisplay").textContent = `座位: ${S.mySeat}号 (已死亡)`;
  }
}

// ============================================================
// 遗言
// ============================================================
function submitLastWords() {
  const text = document.getElementById("lastWordsInput").value.trim();
  document.getElementById("lastWordsInput").style.display = "none";
  document.getElementById("btnSubmitLastWords").style.display = "none";
  document.getElementById("lastWordsDisplay").classList.remove("hidden");
  document.getElementById("lastWordsText").textContent = text || "(无遗言)";
}

// ============================================================
// 发言阶段
// ============================================================
function setupSpeechPhase() {
  document.getElementById("speechQueue").innerHTML = "";
  document.getElementById("currentSpeakerInfo").classList.add("hidden");
  document.getElementById("btnEndSpeech").classList.add("hidden");

  // 渲染发言队列
  const order = S.speechOrder || [];
  const queue = document.getElementById("speechQueue");
  for (const seat of order) {
    const div = document.createElement("div");
    div.className = "speech-queue-item";
    div.textContent = seat;
    if (seat === S.currentSpeaker) div.classList.add("current");
    if (S.seats[seat] && S.seats[seat].alive === false) div.classList.add("done");
    queue.appendChild(div);
  }
}

function handleSpeechToken(msg) {
  S.currentSpeaker = msg.speaker;
  document.getElementById("currentSpeakerInfo").classList.remove("hidden");
  document.getElementById("speakerSeat").textContent = msg.speaker;
  document.getElementById("btnEndSpeech").classList.toggle("hidden", msg.speaker !== S.mySeat);

  // 更新队列高亮
  document.querySelectorAll(".speech-queue-item").forEach(el => {
    el.classList.remove("current");
    if (parseInt(el.textContent) === msg.speaker) el.classList.add("current");
    if (parseInt(el.textContent) < msg.speaker) el.classList.add("done");
  });
}

function handleSpeechSkip(msg) {
  // AI 跳过发言
}

function endSpeech() {
  if (S.currentSpeaker !== S.mySeat) return;
  sendToServer({ type: "ww_speech_end" });
}

// ============================================================
// 投票阶段
// ============================================================
function setupVotePhase() {
  const grid = document.getElementById("voteGrid");
  grid.innerHTML = "";
  document.getElementById("voteTally").classList.add("hidden");
  S.votes = {};

  const alivePlayers = [];
  for (let i = 1; i < S.seats.length; i++) {
    if (S.seats[i] && S.seats[i].alive !== false && S.seats[i].username !== S.username) {
      alivePlayers.push({ seat: i, ...S.seats[i] });
    }
  }

  for (const p of alivePlayers) {
    const div = document.createElement("div");
    div.className = "target-item";
    div.dataset.seat = p.seat;
    div.innerHTML = `
      <div class="target-avatar" style="border-color:${p.borderColor||'#ccc'};color:${p.textColor||'#999'}">${p.avatarText||'?'}</div>
      <div class="target-seat">${p.seat}号</div>`;
    div.addEventListener("click", () => {
      document.querySelectorAll("#voteGrid .target-item").forEach(el => el.classList.remove("selected"));
      div.classList.add("selected");
    });
    grid.appendChild(div);
  }
}

function submitVote(target) {
  if (target === "abstain") {
    sendToServer({ type: "ww_day_vote", target: "abstain" });
  } else {
    const selected = document.querySelector("#voteGrid .target-item.selected");
    if (!selected) return;
    sendToServer({ type: "ww_day_vote", target: parseInt(selected.dataset.seat) });
  }
  document.getElementById("voteGrid").innerHTML = '<p style="color:var(--text-dim)">已投票，等待其他玩家...</p>';
}

function handleVoteUpdate(msg) {
  S.votes = msg.votes || {};
  const tallyDiv = document.getElementById("voteTally");
  tallyDiv.classList.remove("hidden");
  let html = `<p style="font-size:13px;color:var(--text-dim);margin-bottom:8px">已投票: ${msg.votedCount}/${msg.totalVoters}</p>`;
  const tally = {};
  for (const [voter, target] of Object.entries(S.votes)) {
    if (target === "abstain") continue;
    tally[target] = (tally[target] || 0) + 1;
  }
  for (const [seat, count] of Object.entries(tally)) {
    html += `<div class="vote-tally-row"><span>${seat}号</span><span>${count}票</span></div>`;
    html += `<div class="vote-tally-bar" style="width:${Math.min(100, count*30)}%"></div>`;
  }
  tallyDiv.innerHTML = html;
}

function handleVoteResult(msg) {
  document.getElementById("voteTally").innerHTML = "";
  if (msg.eliminated) {
    document.getElementById("voteTally").innerHTML = `<p style="font-size:18px;color:var(--danger);text-align:center">${msg.eliminated}号玩家 (${msg.role}) 被放逐出局</p>`;
    if (msg.special) {
      document.getElementById("voteTally").innerHTML += `<p style="color:var(--accent-gold);text-align:center">${msg.special}</p>`;
    }
  } else {
    document.getElementById("voteTally").innerHTML = `<p style="font-size:16px;color:var(--text-dim);text-align:center">${msg.reason || "无人出局"}</p>`;
  }
}

// ============================================================
// 骑士决斗
// ============================================================
function handleKnightResult(msg) {
  if (msg.success) {
    alert(`骑士决斗成功！${msg.target}号是狼人，已死亡。`);
  } else {
    alert(`骑士决斗失败！${msg.target}号是好人，骑士 ${msg.knight}号 以死谢罪。`);
  }
}

// ============================================================
// 狼人聊天
// ============================================================
function showWolfChat(visible) {
  let panel = document.getElementById("wolfChatPanel");
  if (!visible) {
    if (panel) panel.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "wolfChatPanel";
    panel.innerHTML = `
      <div id="wolfChatHeader">
        <span>🐺 狼队频道</span>
        <button class="btn-close" onclick="showWolfChat(false)" style="color:white;font-size:16px">✕</button>
      </div>
      <div id="wolfChatMessages"></div>
      <div id="wolfChatInput">
        <input type="text" id="wolfChatText" placeholder="输入消息..." maxlength="200">
        <button class="btn-primary" id="btnSendWolfChat">发送</button>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById("btnSendWolfChat").addEventListener("click", sendWolfChat);
    document.getElementById("wolfChatText").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendWolfChat();
    });
  }
  panel.style.display = "block";

  // 渲染历史消息
  const msgDiv = document.getElementById("wolfChatMessages");
  msgDiv.innerHTML = "";
  for (const m of (S.wolfChat || [])) {
    msgDiv.innerHTML += `<div class="wolf-chat-msg"><span class="chat-seat">${m.from}号${m.fromName?':'+m.fromName:''}</span>: ${m.text} <span class="chat-time">${new Date(m.timestamp).toLocaleTimeString()}</span></div>`;
  }
  msgDiv.scrollTop = msgDiv.scrollHeight;
}

function sendWolfChat() {
  const input = document.getElementById("wolfChatText");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendToServer({ type: "ww_wolf_chat", text });
}

function handleWolfChatMsg(msg) {
  S.wolfChat = S.wolfChat || [];
  S.wolfChat.push(msg);
  const msgDiv = document.getElementById("wolfChatMessages");
  if (msgDiv) {
    msgDiv.innerHTML += `<div class="wolf-chat-msg"><span class="chat-seat">${msg.from}号</span>: ${msg.text} <span class="chat-time">${new Date(msg.timestamp).toLocaleTimeString()}</span></div>`;
    msgDiv.scrollTop = msgDiv.scrollHeight;
  }
}

// ============================================================
// 游戏结束
// ============================================================
function handleGameOver(msg) {
  S.phase = "GAME_OVER";
  document.getElementById("preGamePanel").classList.add("hidden");

  const winnerText = msg.winner === "villager" ? "🎉 好人阵营获胜！" : msg.winner === "lovers" ? "💘 情侣阵营获胜！" : "🐺 狼人阵营获胜！";
  document.getElementById("resultTitle").textContent = winnerText;
  document.getElementById("resultTitle").className = msg.winner === "villager" ? "win-villager" : "win-werewolf";
  document.getElementById("resultReason").textContent = msg.reason || "";

  // 角色揭示
  const table = document.getElementById("resultTable");
  table.innerHTML = "";
  for (const p of (msg.roleReveal || [])) {
    const rd = ROLE_DATA[p.role] || {};
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <div class="res-avatar" style="border:2px solid ${rd.team==='werewolf'?'#8b0000':rd.team==='villager'?'#2e7d32':'#7b1fa2'}">${rd.emoji||'?'}</div>
      <span>${p.seatNumber}号 ${p.username||''}</span>
      <span class="res-role">${p.roleName||p.role}</span>
      <span class="res-team" style="color:${rd.team==='werewolf'?'#c0392b':rd.team==='villager'?'#4caf50':'#ce93d8'}">${rd.team==='werewolf'?'狼人':rd.team==='villager'?'好人':'第三方'}${p.isAI?' (AI)':''} ${p.alive?'存活':'死亡'}</span>`;
    table.appendChild(row);
  }

  document.getElementById("resultOverlay").classList.remove("hidden");

  // 也显示中心区域的结果
  document.getElementById("gameOverTitle").textContent = winnerText;
  document.getElementById("gameOverReason").textContent = msg.reason || "";
  const revealGrid = document.getElementById("roleRevealTable");
  revealGrid.innerHTML = "";
  for (const p of (msg.roleReveal || [])) {
    const rd = ROLE_DATA[p.role] || {};
    const card = document.createElement("div");
    card.className = "role-reveal-card " + rd.team;
    card.innerHTML = `
      <div class="rr-seat">${p.seatNumber}号 ${p.username||''}</div>
      <div class="rr-emoji">${rd.emoji||'?'}</div>
      <div class="rr-name">${p.roleName||p.role} ${p.isAI?'(AI)':''}</div>`;
    revealGrid.appendChild(card);
  }
  showPhase("phaseGameOver");
}

function handlePlayAgain() {
  // 重置 UI
  S.phase = "waiting";
  S.myRole = null;
  S.myRoleData = null;
  S.mySeat = null;
  S.alive = true;
  S.wolfChat = [];
  S.votes = {};
  S.speechOrder = [];
  S.currentSpeaker = -1;
  S.sheriffSeat = null;
  S.actionSubmitted = false;
  _selectedNightTargets = [];

  document.getElementById("gamePanel").classList.add("hidden");
  document.getElementById("resultOverlay").classList.add("hidden");
  document.getElementById("preGamePanel").classList.remove("hidden");
  showWolfChat(false);

  document.getElementById("phaseIcon").textContent = "⏳";
  document.getElementById("phaseName").textContent = "等待中";
  document.getElementById("sheriffBadge").classList.add("hidden");
  document.getElementById("mySeatDisplay").textContent = "座位: -";
  document.getElementById("roleCardIcon").textContent = "🃏";
  document.getElementById("roleCardName").textContent = "角色卡";

  renderTable();
  updateConfigUI();
}

// ============================================================
// TTS 语音播报
// ============================================================
function initTTS() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }
}

function handleVoice(msg) {
  if (!msg.text) return;
  if (S.muted) return;
  speak(msg.text);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) utterance.voice = zhVoice;
  window.speechSynthesis.speak(utterance);
}

function toggleMute() {
  S.muted = !S.muted;
  const btn = document.getElementById("btnMute");
  btn.textContent = S.muted ? "🔇" : "🔊";
}

// ============================================================
// 配置面板切换
// ============================================================
function toggleConfigPanel(show) {
  const overlay = document.getElementById("configOverlay");
  if (show === false) {
    overlay.classList.add("hidden");
  } else {
    overlay.classList.toggle("hidden");
  }
}

// ============================================================
// 卡牌信息面板
// ============================================================
function initCardInfoPanel() {
  // 角色介绍 tab - 按阵营分组
  const rolesTab = document.getElementById("tabRoles");
  const teams = [
    { key: "werewolf", label: "🐺 狼人阵营", color: "#c0392b" },
    { key: "villager", label: "🏘️ 好人阵营", color: "#4caf50" },
    { key: "third_party", label: "⚖️ 第三方阵营", color: "#ce93d8" },
  ];
  let html = "";
  for (const team of teams) {
    const members = Object.entries(ROLE_DATA).filter(([id, rd]) => rd.team === team.key);
    if (members.length === 0) continue;
    html += `<h3 style="color:${team.color};margin:12px 0 6px;font-size:15px;grid-column:1/-1">${team.label}</h3>`;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">';
    for (const [id, rd] of members) {
      html += `<div style="background:var(--bg-light);padding:10px;border-radius:8px;border-left:3px solid ${team.color};cursor:pointer" onclick="showRoleDetail('${id}')">
        <span style="font-size:20px">${rd.emoji}</span>
        <strong style="font-size:14px">${rd.name}</strong>
        ${!rd.isStandard ? '<span style="font-size:10px;color:var(--text-dim)">扩展</span>' : ''}
        <p style="font-size:12px;color:var(--text-dim);margin-top:4px;line-height:1.5">${rd.skillDesc}</p>
      </div>`;
    }
    html += '</div>';
  }
  rolesTab.innerHTML = html;

  // 术语表 tab
  const terms = [
    ["金水","预言家查验出的好人"],
    ["查杀","预言家查验出的狼人"],
    ["银水","女巫救起的玩家"],
    ["悍跳","狼人假扮预言家"],
    ["警徽流","预言家提前说明的验人顺序"],
    ["自刀","狼人夜间刀自己人骗取解药"],
    ["表水","解释自己行为以洗清嫌疑"],
    ["归票","最后一个发言的玩家号召投票目标"],
    ["退水","警上玩家放弃竞选"],
    ["冲票","多人集中投票同一目标"],
    ["倒钩","狼人假装站边真预言家"],
    ["撕警徽","投票放逐警长"],
    ["吞警徽","狼人自爆导致本局无警长"],
    ["奶穿","守卫和女巫同守同救导致的死亡"],
    ["板子","角色配置方案"],
    ["上警","参与警长竞选"],
    ["警上","参与警长竞选的玩家"],
    ["警下","未参与警长竞选的玩家"],
    ["自爆","狼人在白天主动暴露身份，直接进入黑夜"],
    ["平安夜","夜晚无人死亡"],
    ["屠边","狼人杀死所有神职或所有平民即获胜"],
    ["屠城","狼人杀死所有好人即获胜"],
  ];
  let termsHTML = '<table style="width:100%"><thead><tr><th>术语</th><th>含义</th></tr></thead><tbody>';
  for (const [term, def] of terms) {
    termsHTML += `<tr><td style="color:var(--accent-gold);padding:6px">${term}</td><td style="padding:6px;color:var(--text-dim)">${def}</td></tr>`;
  }
  termsHTML += '</tbody></table>';
  document.getElementById("tabTerms").innerHTML = termsHTML;

  // 游戏流程 tab
  document.getElementById("tabFlow").innerHTML = `
    <div style="line-height:2;font-size:14px">
      <h3 style="color:var(--accent-gold)">一、游戏前准备</h3>
      <p>1. 根据人数确定角色配置（板子）</p>
      <p>2. 系统随机分配角色，每人确认身份</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">二、首日流程</h3>
      <p>1. <b>警长竞选</b>：玩家举手参与，发言后投票，得票最多者当选</p>
      <p>2. <b>公布死讯</b>：宣布昨晚死亡情况（首夜无人死亡）</p>
      <p>3. <b>发言阶段</b>：有警长时由警长决定发言方向</p>
      <p>4. <b>放逐投票</b>：投票放逐一名玩家，警长1.5票</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">三、夜间流程</h3>
      <p>按顺序唤醒：守卫→狼人→女巫→预言家→猎人确认</p>
      <p>各角色秘密操作，结果汇总到服务端</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">四、后续轮次</h3>
      <p>重复 公布死讯→发言→投票→夜晚 循环</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">五、胜利条件</h3>
      <p><b>好人阵营</b>：放逐所有狼人</p>
      <p><b>狼人阵营（屠边）</b>：杀死所有神职或所有平民</p>
      <p><b>狼人阵营（屠城）</b>：杀死所有好人</p>
      <p><b>情侣阵营</b>：情侣存活到最后</p>
    </div>`;

  // 游戏规则 tab
  document.getElementById("tabRules").innerHTML = `
    <div style="line-height:2;font-size:14px">
      <h3 style="color:var(--accent-gold)">基本规则</h3>
      <p>• 游戏分为狼人阵营和好人阵营，通过昼夜交替进行</p>
      <p>• 夜间狼人击杀一名玩家，神职按顺序使用技能</p>
      <p>• 白天所有存活玩家发言讨论，投票放逐一名玩家</p>
      <p>• 被放逐或杀死的玩家出局，翻牌公布身份</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">重要规则</h3>
      <p>• <b>同守同救（奶穿）</b>：守卫和女巫解药同时作用于同一玩家，该玩家仍死亡</p>
      <p>• <b>女巫不可自救</b>：标准规则下女巫首夜之后不可用解药救自己（可选规则可调整）</p>
      <p>• <b>猎人毒亡不开枪</b>：猎人被女巫毒杀时不能发动技能</p>
      <p>• <b>守卫不可连守</b>：不能连续两晚守护同一人</p>
      <p>• <b>警长投票1.5票</b>：放逐投票中警长拥有1.5票</p>
      <p>• <b>白痴翻牌免死</b>：被投票放逐时翻牌自证，留在场上但失去投票权</p>
      <h3 style="color:var(--accent-gold);margin-top:16px">发言规则</h3>
      <p>• 按顺序轮流发言，不能插话</p>
      <p>• 警长决定发言方向（死者左或右开始）</p>
      <p>• 无警长时从死者右手边开始</p>
      <p>• 超时自动跳过</p>
    </div>`;
}

function showRoleDetail(roleId) {
  const rd = ROLE_DATA[roleId];
  if (!rd) return;
  toggleCardInfo(false);
  document.getElementById("popupRoleIcon").textContent = rd.emoji;
  document.getElementById("popupRoleName").textContent = rd.name;
  const teamEl = document.getElementById("popupRoleTeam");
  teamEl.textContent = rd.team === "werewolf" ? "狼人阵营" : rd.team === "villager" ? "好人阵营" : "第三方阵营";
  teamEl.className = "role-card-team " + rd.team;
  document.getElementById("popupRoleDesc").textContent = rd.skillDesc || "";
  document.getElementById("popupRoleStatus").textContent = "";
  toggleRoleCard(true);
}

function toggleCardInfo(show) {
  const overlay = document.getElementById("cardInfoOverlay");
  if (show === false) overlay.classList.add("hidden");
  else overlay.classList.toggle("hidden");
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById("tab" + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add("active");
}

// ============================================================
// 角色卡弹窗
// ============================================================
function toggleRoleCard(show) {
  const overlay = document.getElementById("roleCardOverlay");
  if (show === false) {
    overlay.classList.add("hidden");
  } else {
    // 刷新当前角色状态
    if (S.myRoleData) {
      document.getElementById("popupRoleIcon").textContent = S.myRoleData.emoji || "🃏";
      document.getElementById("popupRoleName").textContent = S.myRoleData.name || "未知";
      const teamEl = document.getElementById("popupRoleTeam");
      teamEl.textContent = S.myRoleData.team === "werewolf" ? "狼人阵营" : S.myRoleData.team === "villager" ? "好人阵营" : "第三方阵营";
      teamEl.className = "role-card-team " + (S.myRoleData.team || "villager");
      document.getElementById("popupRoleDesc").textContent = S.myRoleData.skillDesc || "";
      document.getElementById("popupRoleStatus").textContent = S.alive ? "状态: 存活" : "状态: 已死亡";
    }
    overlay.classList.remove("hidden");
  }
}

// ============================================================
// 迷你桌面 (游戏内)
// ============================================================
function renderMiniTable() {
  const canvas = document.getElementById("miniTableCanvas");
  if (!canvas || S.phase === "waiting") return;
  const size = Math.min(350, window.innerWidth * 0.8, window.innerHeight * 0.4);
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";

  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const tableR = size * 0.2;
  const seatR = tableR + size * 0.12;
  const total = S.totalPlayers || 6;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, size, size);

  // 圆桌
  ctx.beginPath();
  ctx.arc(cx, cy, tableR, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fill();
  ctx.strokeStyle = "#2a2a3e";
  ctx.stroke();

  // 座位
  for (let i = 1; i <= total; i++) {
    const angle = (2 * Math.PI * (i - 1)) / total - Math.PI / 2;
    const sx = cx + seatR * Math.cos(angle);
    const sy = cy + seatR * Math.sin(angle);
    const sr = size * 0.04;

    const seatData = S.seats && S.seats[i];
    const isMe = seatData && seatData.username === S.username;
    const isDead = seatData && seatData.alive === false;

    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    if (isDead) { ctx.fillStyle = "rgba(231,76,60,0.3)"; ctx.strokeStyle = "#e74c3c"; }
    else if (isMe) { ctx.fillStyle = "#2a2a1a"; ctx.strokeStyle = "#c9a84c"; ctx.lineWidth = 2; }
    else if (seatData) { ctx.fillStyle = "#1a2a1a"; ctx.strokeStyle = "#2e7d32"; }
    else { ctx.fillStyle = "#1a1a2e"; ctx.strokeStyle = "#2a2a3e"; }
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;

    if (isDead) {
      ctx.fillStyle = "#e74c3c";
      ctx.font = `${sr}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✕", sx, sy + sr * 0.3);
    }

    ctx.fillStyle = "#8a8a9a";
    ctx.font = `${Math.max(7, sr * 0.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(i, sx, sy + sr + 10);

    if (seatData) {
      ctx.fillStyle = seatData.textColor || "#ccc";
      ctx.font = `${Math.max(8, sr * 0.7)}px "Microsoft YaHei"`;
      ctx.fillText(seatData.avatarText || "?", sx, sy + sr * 0.3);
    }

    if (S.sheriffSeat === i) {
      ctx.fillStyle = "#c9a84c";
      ctx.font = `${sr * 0.5}px sans-serif`;
      ctx.fillText("⭐", sx + sr * 0.4, sy - sr * 0.4);
    }
  }

  // 中心文字
  ctx.fillStyle = "#8a8a9a";
  ctx.font = `${Math.max(8, size * 0.02)}px "Microsoft YaHei"`;
  ctx.textAlign = "center";
  const phaseShort = { SHERIFF_ELECTION: "竞选", DAY_SPEECH: "发言", DAY_VOTE: "投票" };
  ctx.fillText(phaseShort[S.phase] || S.phase || "", cx, cy + 4);
}

// ============================================================
// 倒计时更新
// ============================================================
function updateTimer() {
  if (!S.phaseEndTime) {
    document.getElementById("timerFill").style.width = "100%";
    document.getElementById("timerText").textContent = "--:--";
    return;
  }
  const remaining = Math.max(0, S.phaseEndTime - Date.now());
  const total = S.phaseEndTime > 0 ? (S.phaseEndTime - (Date.now() - 1000)) : 1;
  const percent = Math.min(100, Math.max(0, (remaining / Math.max(1, total)) * 100));
  const seconds = Math.ceil(remaining / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  document.getElementById("timerFill").style.width = percent + "%";
  document.getElementById("timerFill").classList.toggle("warning", percent < 20);
  document.getElementById("timerText").textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// ============================================================
// 模板系统 (localStorage)
// ============================================================
const DEFAULT_TEMPLATES = {
  "标准 12 人局": {
    totalPlayers: 12,
    roleSetup: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight: false, randomSeats: false, randomOrder: false, massacreMode: true, noSheriff: false, noMilkPenetrate: false },
  },
  "标准 9 人局": {
    totalPlayers: 9,
    roleSetup: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight: false, randomSeats: false, randomOrder: false, massacreMode: true, noSheriff: false, noMilkPenetrate: false },
  },
  "标准 6 人局": {
    totalPlayers: 6,
    roleSetup: { werewolf: 2, villager: 2, seer: 1, witch: 1 },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight: false, randomSeats: false, randomOrder: false, massacreMode: true, noSheriff: false, noMilkPenetrate: false },
  },
  "花板子 12 人": {
    totalPlayers: 12,
    roleSetup: { werewolf: 3, white_wolf_king: 1, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1, knight: 1, bear: 1 },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight: false, randomSeats: false, randomOrder: false, massacreMode: true, noSheriff: false, noMilkPenetrate: false },
  },
  "第三方 12 人": {
    totalPlayers: 12,
    roleSetup: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1, cupid: 1, bomber: 1 },
    genericVillagerCount: 0,
    rules: { witchSelfSaveAfterFirstNight: false, randomSeats: false, randomOrder: false, massacreMode: true, noSheriff: false, noMilkPenetrate: false },
  },
};

function loadTemplates() {
  try {
    S.templates = JSON.parse(localStorage.getItem("ww_templates") || "{}");
  } catch { S.templates = {}; }
  // 如果本地没有模板，预填充默认模板
  if (Object.keys(S.templates).length === 0) {
    S.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
    saveTemplates();
  }
  updateTemplateSelect();
}

function saveTemplates() {
  localStorage.setItem("ww_templates", JSON.stringify(S.templates));
  updateTemplateSelect();
}

function updateTemplateSelect() {
  const sel = document.getElementById("selectTemplate");
  sel.innerHTML = '<option value="">加载模板...</option>';
  for (const name of Object.keys(S.templates)) {
    sel.innerHTML += `<option value="${name}">${name}</option>`;
  }
}

function saveTemplate() {
  const name = document.getElementById("templateName").value.trim();
  if (!name) { alert("请输入模板名称"); return; }
  S.templates[name] = JSON.parse(JSON.stringify(S.config));
  saveTemplates();
  document.getElementById("templateName").value = "";
}

function loadTemplate() {
  const name = document.getElementById("selectTemplate").value;
  if (!name || !S.templates[name]) return;
  S.config = JSON.parse(JSON.stringify(S.templates[name]));
  updateConfigUI();
  sendConfig();
  renderTable();
}

function deleteTemplate() {
  const name = document.getElementById("selectTemplate").value;
  if (!name) return;
  delete S.templates[name];
  saveTemplates();
}

function exportTemplate() {
  const json = JSON.stringify(S.config, null, 2);
  navigator.clipboard.writeText(json).then(() => alert("已复制到剪贴板"));
}

function importTemplate() {
  const json = prompt("请粘贴 JSON 配置:");
  if (!json) return;
  try {
    S.config = JSON.parse(json);
    updateConfigUI();
    sendConfig();
    renderTable();
  } catch { alert("JSON 格式错误"); }
}

// ============================================================
// 其他处理器
// ============================================================
function handleState(msg) {
  // 重连恢复状态
  S.phase = msg.phase;
  S.round = msg.round;
  S.phaseEndTime = msg.phaseEndTime;
  S.seats = msg.seats;
  S.judgeSeat = msg.judgeSeat;
  S.sheriffSeat = msg.sheriffSeat;
  S.mySeat = msg.mySeat;
  S.myRole = msg.myRole;
  S.myRoleData = ROLE_DATA[msg.myRole];
  S.config = msg.config;
  S.alive = msg.alive;
  renderTable();
  updateConfigUI();
}

function handlePlayerDisconnect(msg) {
  // 玩家断线
}

function handleMiracleGift(msg) {
  alert(`奇迹商人给了你技能: ${msg.skill === "check" ? "查验" : msg.skill === "poison" ? "毒药" : "守护"}`);
}

function showError(msg) {
  // 简单提示
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#e74c3c;color:white;padding:10px 20px;border-radius:8px;z-index:999;font-size:14px;";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// ============================================================
// 启动
// ============================================================
document.addEventListener("DOMContentLoaded", init);
