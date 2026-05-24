require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const app = express();
app.use(express.json());

// ── Персистентное хранилище привязок ──────────────────────────────────
const DB_PATH = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch (e) {
    console.warn("⚠️ Could not load users.json:", e.message);
  }
  return {};
}

function saveUsers() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
  } catch (e) {
    console.warn("⚠️ Could not save users.json:", e.message);
  }
}

// users[discordId] = { code, linked, roblox, pendingCode }
const users = loadUsers();

// Коды верификации хранятся отдельно — не портят старую привязку
// pendingCode: { code, expires }
const GROUP_ID = 188707916;

const GUILD_ID           = "1507454509578981538";
const REPORT_CHANNEL_ID  = "1507711197175218257";
const REPORT_CATEGORY_ID = "1507759179589226648";
const MOD_ROLE_ID        = "1507711328020598897";

// Код живёт 15 минут
const CODE_TTL_MS = 15 * 60 * 1000;

// ── Roblox API helpers ─────────────────────────────────────────────────
async function getRobloxUserId(username) {
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const data = await res.json();
    return data.data?.[0]?.id || null;
  } catch (e) {
    console.warn("⚠️ getRobloxUserId error:", e.message);
    return null;
  }
}

async function getRobloxRank(userId) {
  try {
    const res = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const data = await res.json();
    const group = data.data?.find(g => g.group.id === GROUP_ID);
    return group?.role?.name || null;
  } catch (e) {
    console.warn("⚠️ getRobloxRank error:", e.message);
    return null;
  }
}

async function getRobloxAvatar(userId) {
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`);
    const data = await res.json();
    return data.data?.[0]?.imageUrl || null;
  } catch (e) {
    console.warn("⚠️ getRobloxAvatar error:", e.message);
    return null;
  }
}

// ── Rank map ───────────────────────────────────────────────────────────
const RANK_MAP = {
  "[OR-1] Recruit (Trainee)":     { prefix: "[OR-1]", role: "Recruit (Trainee)" },
  "[OR-2] Private":               { prefix: "[OR-2]", role: "Private" },
  "[OR-3] Lance Corporal":        { prefix: "[OR-3]", role: "Lance Corporal" },
  "[OR-4] Corporal":              { prefix: "[OR-4]", role: "Corporal" },
  "[OR-5] Sergeant":              { prefix: "[OR-5]", role: "Sergeant" },
  "[OR-6] Staff Sergeant":        { prefix: "[OR-6]", role: "Staff Sergeant" },
  "[OR-7] Sergeant First Class":  { prefix: "[OR-7]", role: "Sergeant First Class" },
  "[OR-8] Warrant Officer II":    { prefix: "[OR-8]", role: "Warrant Officer II" },
  "[OR-9] Warrant Officer I":     { prefix: "[OR-9]", role: "Warrant Officer I" },
  "[OF-1] Lieutenant":            { prefix: "[OF-1]", role: "Lieutenant" },
  "[OF-2] Captain":               { prefix: "[OF-2]", role: "Captain" },
  "[OF-3] Major":                 { prefix: "[OF-3]", role: "Major" },
  "[OF-4] Lieutenant Colonel":    { prefix: "[OF-4]", role: "Lieutenant Colonel" },
  "[OF-5] Colonel":               { prefix: "[OF-5]", role: "Colonel" },
  "[OF-6] Brigadier":             { prefix: "[OF-6]", role: "Brigadier" },
  "[OF-7] Major General":         { prefix: "[OF-7]", role: "Major General" },
  "[OF-8] Lieutenant General":    { prefix: "[OF-8]", role: "Lieutenant General" },
  "[OF-9] General":               { prefix: "[OF-9]", role: "General" },
  "[ASM] Army Sergeant Major":    { prefix: "[ASM]", role: "Army Sergeant Major" },
  "[ACGS] Assistant CGS":         { prefix: "[ACGS]", role: "Assistant CGS" },
  "[DCGS] Deputy CGS":            { prefix: "[DCGS]", role: "Deputy CGS" },
  "[CGS] Chief of General Staff": { prefix: "[CGS]", role: "Chief of General Staff" },
  "[DEV] Developer":              { prefix: "[DEV]", role: "Developer" },
  "[BOD] Board of Directors":     { prefix: "[BOD]", role: "Board of Directors" },
  "[FM] Field Marshal":           { prefix: "[FM]", role: "Field Marshal" },
};

const ALL_RANK_ROLE_NAMES = Object.values(RANK_MAP).map(r => r.role);

const VERIFIED_ROLE_NAME = "✅ Roblox Verified";
const NON_BA_ROLE_NAME   = "Non-BA";

// Роли которые бот НИКОГДА не удаляет и не выдаёт сам —
// но показывает их в embed при Update.
// Добавляй сюда любые свои кастомные роли.
const PROTECTED_ROLES = [
  "Moderation",
  "OwnerShip",
  // "EventHost",   // пример — раскомментируй если нужно
];

// Все роли которые бот отслеживает для показа в embed (ранги + спец.)
const ALL_TRACKED_ROLE_NAMES = [
  ...ALL_RANK_ROLE_NAMES,
  VERIFIED_ROLE_NAME,
  NON_BA_ROLE_NAME,
  ...PROTECTED_ROLES,
];

// ── Основная функция обновления ────────────────────────────────────────
async function updateMember(discordId, robloxName) {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return { success: false, error: "Guild not found" };

  const robloxId   = await getRobloxUserId(robloxName);
  const rankName   = robloxId ? await getRobloxRank(robloxId)   : null;
  const avatarUrl  = robloxId ? await getRobloxAvatar(robloxId) : null;

  const rankInfo = rankName ? RANK_MAP[rankName] : null;
  const prefix   = rankInfo?.prefix || "[???]";
  const newRole  = rankInfo?.role   || null;

  let member;
  try {
    // force:true — всегда свежие данные из Discord API
    member = await guild.members.fetch({ user: discordId, force: true });
  } catch {
    return { success: false, error: "Member not found in guild" };
  }

  const botMember    = guild.members.me;
  const botHighest   = botMember.roles.highest.position;
  const memberHighest = member.roles.highest.position;
  const isOwner      = guild.ownerId === discordId;

  // ── Смена ника ──
  // Если не в группе — ставим [CIV], иначе ранговый префикс
  const displayPrefix = newRole ? prefix : "[CIV]";
  try {
    if (!isOwner && botHighest > memberHighest) {
      await member.setNickname(`${displayPrefix} ${robloxName}`);
      console.log(`✏️  Nick → ${displayPrefix} ${robloxName}`);
    }
  } catch (e) {
    console.warn("⚠️ Nickname error:", e.message);
  }

  // ── Смена ролей ──
  let addedRole   = null;
  let removedRole = null;

  // Собираем все rank-роли у участника (до изменений)
  const currentRankRoles = ALL_RANK_ROLE_NAMES
    .map(rn => guild.roles.cache.find(r => r.name === rn))
    .filter(r => r && member.roles.cache.has(r.id));

  // Удаляем все старые rank-роли
  for (const oldRole of currentRankRoles) {
    if (oldRole.name === newRole) continue; // уже нужная — оставим
    try {
      await member.roles.remove(oldRole);
      removedRole = oldRole.name;
      console.log(`➖ Role removed: ${oldRole.name}`);
    } catch (e) {
      console.warn(`⚠️ Could not remove role ${oldRole.name}:`, e.message);
    }
  }

  // Добавляем новую rank-роль (если ещё нет)
  if (newRole) {
    const discordRole = guild.roles.cache.find(r => r.name === newRole);
    if (discordRole) {
      if (!member.roles.cache.has(discordRole.id)) {
        try {
          await member.roles.add(discordRole);
          addedRole = newRole;
          console.log(`➕ Role added: ${newRole}`);
        } catch (e) {
          console.warn(`⚠️ Could not add role ${newRole}:`, e.message);
        }
      } else {
        addedRole = newRole;
      }
    } else {
      console.warn(`⚠️ Discord role not found: ${newRole}`);
    }
  }

  // ── ✅ Roblox Verified — выдаём всем верифицированным ──
  const verifiedRole = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
  if (verifiedRole) {
    if (!member.roles.cache.has(verifiedRole.id)) {
      try {
        await member.roles.add(verifiedRole);
        console.log(`✅ Verified role added to ${robloxName}`);
      } catch (e) {
        console.warn("⚠️ Could not add Verified role:", e.message);
      }
    }
  } else {
    console.warn(`⚠️ Role not found in Discord: "${VERIFIED_ROLE_NAME}"`);
  }

  // ── Non-BA — выдаём если не в группе, убираем если в группе ──
  const nonBaRole = guild.roles.cache.find(r => r.name === NON_BA_ROLE_NAME);
  if (nonBaRole) {
    const isInGroup = !!newRole; // есть ранг = состоит в группе
    const hasNonBa  = member.roles.cache.has(nonBaRole.id);

    if (!isInGroup && !hasNonBa) {
      try {
        await member.roles.add(nonBaRole);
        console.log(`🔵 Non-BA role added to ${robloxName}`);
      } catch (e) {
        console.warn("⚠️ Could not add Non-BA role:", e.message);
      }
    } else if (isInGroup && hasNonBa) {
      try {
        await member.roles.remove(nonBaRole);
        console.log(`🔴 Non-BA role removed from ${robloxName}`);
      } catch (e) {
        console.warn("⚠️ Could not remove Non-BA role:", e.message);
      }
    }
  } else {
    console.warn(`⚠️ Role not found in Discord: "${NON_BA_ROLE_NAME}"`);
  }

  return {
    success: true,
    robloxName,
    rankName,
    prefix,
    avatarUrl,
    addedRole,
    removedRole: removedRole === addedRole ? null : removedRole
  };
}

// ── /verify endpoint (вызывается из Roblox-игры) ──────────────────────
app.post("/verify", async (req, res) => {
  const { robloxName, code } = req.body;

  for (const discordId in users) {
    const u = users[discordId];

    // Проверяем pending-код (с TTL)
    if (
      u.pendingCode &&
      u.pendingCode.code === code &&
      Date.now() < u.pendingCode.expires
    ) {
      // Помечаем как верифицированного
      users[discordId].linked  = true;
      users[discordId].roblox  = robloxName;
      users[discordId].pendingCode = null; // сбрасываем одноразовый код
      saveUsers();

      console.log(`✅ Verified: ${discordId} → ${robloxName}`);

      // Автообновление ролей
      updateMember(discordId, robloxName)
        .then(r => {
          if (r.success) console.log(`🔄 Auto-updated: ${robloxName}`);
          else console.warn(`⚠️ Auto-update failed: ${r.error}`);
        })
        .catch(e => console.warn("⚠️ Auto-update error:", e.message));

      return res.json({ success: true });
    }
  }

  return res.json({ success: false, reason: "Invalid or expired code" });
});

app.get("/", (req, res) => res.send("BAR Guard is alive ✅"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API running on port ${process.env.PORT || 3000}`);
});

// ── Discord client ─────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // ── Верификационный канал ──
  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (channel) {
      const messages = await channel.messages.fetch({ limit: 10 });
      const existing = messages.find(
        m => m.author.id === client.user.id && m.components.length > 0
      );

      if (!existing) {
        const rulesEmbed = new EmbedBuilder()
          .setTitle("📋 OFFICIAL BAR RULES")
          .setColor(0xff0000)
          .addFields(
            { name: "1️⃣ Respect everyone",    value: "• Be respectful to all members no matter their rank.\n• Bullying, insults and harassment are not allowed." },
            { name: "2️⃣ No cheating",          value: "• Do not use cheats, exploits or hacks in Roblox.\n• Any unfair advantage is a bannable offense." },
            { name: "3️⃣ Follow orders",         value: "• Listen to your superior officers during operations and trainings.\n• Do not ignore commands from higher ranks." },
            { name: "4️⃣ No spam or trolling",   value: "• Do not spam messages or ping people without reason.\n• Trolling during operations will result in a ban." },
            { name: "5️⃣ No advertising",        value: "• Do not send links to other Discord servers or communities." },
            { name: "6️⃣ Keep it clean",          value: "• No inappropriate content of any kind.\n• Behave properly — this is a serious military community." },
            { name: "📩 Need help?",             value: `If you have any questions or want to report someone, go to <#${REPORT_CHANNEL_ID}> and our <@&${MOD_ROLE_ID}> team will help you.` }
          )
          .setFooter({ text: "BAR | British Army Regiment" })
          .setTimestamp();

        await channel.send({ embeds: [rulesEmbed] });

        const verifyEmbed = new EmbedBuilder()
          .setTitle("🔗 ROBLOX VERIFICATION SYSTEM")
          .setDescription("Press a button below to verify or update your role.")
          .setColor(0x00ff00)
          .setFooter({ text: "BAR | British Army Regiment" })
          .setTimestamp();

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("link").setLabel("Link Roblox Account").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("update").setLabel("Update Role").setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        console.log("📨 Verification message sent.");
      } else {
        console.log("📌 Verification message already exists.");
      }
    }
  } catch (err) {
    console.error("❌ Error in verify channel:", err);
  }

  // ── Канал репортов ──
  try {
    const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID);
    if (reportChannel) {
      const messages = await reportChannel.messages.fetch({ limit: 10 });
      const existing = messages.find(
        m => m.author.id === client.user.id && m.components.length > 0
      );

      if (!existing) {
        const reportEmbed = new EmbedBuilder()
          .setTitle("🚨 REPORT SYSTEM")
          .setDescription(
            "If you want to report a player for rule violations, click the button below.\n\n" +
            "A private ticket will be created where you can describe the situation.\n" +
            "Our moderation team will review it as soon as possible."
          )
          .setColor(0xff0000)
          .setFooter({ text: "BAR | British Army Regiment" })
          .setTimestamp();

        const reportRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("create_report").setLabel("📋 Create Report").setStyle(ButtonStyle.Danger)
        );

        await reportChannel.send({ embeds: [reportEmbed], components: [reportRow] });
        console.log("🚨 Report message sent.");
      } else {
        console.log("📌 Report message already exists.");
      }
    }
  } catch (err) {
    console.error("❌ Error in report channel:", err);
  }
});

// ── Interactions ───────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const guild  = interaction.guild;

  // ── Создать тикет ──
  if (interaction.customId === "create_report") {
    await interaction.deferReply({ flags: 64 });

    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = guild.channels.cache.find(
      c => c.name === `report-${safeName}` && c.parentId === REPORT_CATEGORY_ID
    );

    if (existing) {
      return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing.id}>` });
    }

    try {
      const ticketChannel = await guild.channels.create({
        name: `report-${safeName}`,
        type: ChannelType.GuildText,
        parent: REPORT_CATEGORY_ID,
        permissionOverwrites: [
          { id: guild.roles.everyone,  deny: [PermissionFlagsBits.ViewChannel] },
          { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: MOD_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle("New Report Ticket")
        .setDescription(
          `Hello <@${userId}>!\n\n` +
          "Please describe your report:\n" +
          "• **Who** are you reporting? (Roblox username)\n" +
          "• **What** did they do?\n" +
          "• **When** did it happen?\n" +
          "• Any **proof**? (screenshots, video)\n\n" +
          `<@&${MOD_ROLE_ID}> will review your report shortly.`
        )
        .setColor(0xff0000)
        .setFooter({ text: "BAR | British Army Regiment" })
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({ content: `<@&${MOD_ROLE_ID}>`, embeds: [ticketEmbed], components: [closeRow] });
      await interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
      console.log(`🎫 Ticket created: ${ticketChannel.name}`);

    } catch (err) {
      console.error("❌ Error creating ticket:", err);
      await interaction.editReply({ content: "❌ Failed to create ticket. Please contact a moderator." });
    }
    return;
  }

  // ── Закрыть тикет ──
  if (interaction.customId === "close_ticket") {
    const member  = await guild.members.fetch(userId);
    const isMod   = member.roles.cache.has(MOD_ROLE_ID);
    const isOwner = guild.ownerId === userId;

    if (!isMod && !isOwner) {
      return interaction.reply({ flags: 64, content: "❌ Only moderators can close tickets." });
    }

    await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
    setTimeout(async () => {
      try { await interaction.channel.delete(); }
      catch (err) { console.error("❌ Error closing ticket:", err); }
    }, 5000);
    return;
  }

  // ── Link: генерируем одноразовый код ──
  if (interaction.customId === "link") {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Сохраняем pending-код с TTL, НЕ трогаем уже существующую привязку
    if (!users[userId]) users[userId] = { linked: false, roblox: null };
    users[userId].pendingCode = { code, expires: Date.now() + CODE_TTL_MS };
    saveUsers();

    const embed = new EmbedBuilder()
      .setTitle("🔗 Verification")
      .setDescription(
        `Join the game and enter your code:\n[Verification Game](https://www.roblox.com/games/117521342225865/Verification)\n\n` +
        `**Your code:** \`${code}\`\n\n` +
        `⏳ Code expires in **15 minutes**.\n\n` +
        `After entering the code, click **Update Role**.`
      )
      .setColor(0xffaa00)
      .setFooter({ text: "BAR | British Army Regiment" });

    return interaction.reply({ flags: 64, embeds: [embed] });
  }

  // ── Update: обновляем роли ──
  if (interaction.customId === "update") {
    const user = users[userId];

    // Принимаем либо уже привязанный аккаунт, либо только что верифицированный
    if (!user?.linked || !user?.roblox) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Not Verified")
        .setDescription(
          "You are not verified yet.\n\n" +
          "Click **Link Roblox Account** first,\n" +
          "then enter the code in the Roblox game."
        )
        .setColor(0xff0000)
        .setFooter({ text: "BAR | British Army Regiment" });
      return interaction.reply({ flags: 64, embeds: [embed] });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      // Состояние ролей ДО обновления (с fresh fetch)
      const memberBefore = await guild.members.fetch({ user: userId, force: true });
      const rolesBefore = ALL_TRACKED_ROLE_NAMES.filter(rn => {
        const r = guild.roles.cache.find(role => role.name === rn);
        return r && memberBefore.roles.cache.has(r.id);
      });

      const result = await updateMember(userId, user.roblox);

      if (!result.success) {
        return interaction.editReply({ content: `❌ ${result.error || "Something went wrong. Try again later."}` });
      }

      // Состояние ролей ПОСЛЕ обновления
      const memberAfter = await guild.members.fetch({ user: userId, force: true });
      const rolesAfter = ALL_TRACKED_ROLE_NAMES.filter(rn => {
        const r = guild.roles.cache.find(role => role.name === rn);
        return r && memberAfter.roles.cache.has(r.id);
      });

      const added   = rolesAfter.filter(r => !rolesBefore.includes(r));
      const removed = rolesBefore.filter(r => !rolesAfter.includes(r));

      const profileUrl = `https://www.roblox.com/users/profile?username=${encodeURIComponent(result.robloxName)}`;

      const embed = new EmbedBuilder()
        .setAuthor({ name: result.robloxName, iconURL: result.avatarUrl ?? undefined, url: profileUrl })
        .setTitle("✅ Roles Update")
        .setDescription("Successfully updated your roles.")
        .setColor(0x2b2d31)
        .addFields(
          { name: "Nickname",      value: `${result.rankName ? result.prefix : "[CIV]"} ${result.robloxName}`, inline: false },
          { name: "Rank",          value: result.rankName ?? "Not in group (CIV)",  inline: false },
          { name: "Roles Added",   value: added.length   > 0 ? added.join(", ")   : "None", inline: false },
          { name: "Roles Removed", value: removed.length > 0 ? removed.join(", ") : "None", inline: false }
        )
        .setFooter({ text: "BAR | British Army Regiment" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("❌ Unexpected error in update:", err);
      return interaction.editReply({ content: "❌ Something went wrong. Try again later." });
    }
  }
});

// ── Error handlers ─────────────────────────────────────────────────────
client.on("error", (err) => {
  console.error("⚠️ Discord client error:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("⚠️ Unhandled rejection:", err?.message ?? err);
});

client.login(process.env.TOKEN);
