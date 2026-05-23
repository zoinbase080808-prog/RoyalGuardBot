require("dotenv").config();
const express = require("express");
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

const users = {};
const GROUP_ID = 188707916;

const REPORT_CHANNEL_ID    = "1507711197175218257";
const REPORT_CATEGORY_ID   = "1507759179589226648";
const MOD_ROLE_ID          = "1507711328020598897";

async function getRobloxUserId(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  return data.data?.[0]?.id || null;
}

async function getRobloxRank(userId) {
  const res = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  const data = await res.json();
  const group = data.data?.find(g => g.group.id === GROUP_ID);
  return group?.role?.name || null;
}

async function getRobloxAvatar(userId) {
  const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`);
  const data = await res.json();
  return data.data?.[0]?.imageUrl || null;
}

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

app.post("/verify", (req, res) => {
  const { robloxName, code } = req.body;
  for (const discordId in users) {
    if (users[discordId].code === code && !users[discordId].linked) {
      users[discordId].linked = true;
      users[discordId].roblox = robloxName;
      console.log(`✅ Verified: ${discordId} → ${robloxName}`);
      return res.json({ success: true });
    }
  }
  return res.json({ success: false });
});

app.get("/", (req, res) => res.send("BAR Guard is alive ✅"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API running on port ${process.env.PORT || 3000}`);
});

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

  // ── Верификационный канал ──────────────────────────────────────────
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
            { name: "1️⃣ Respect everyone", value: "• Be respectful to all members no matter their rank.\n• Bullying, insults and harassment are not allowed." },
            { name: "2️⃣ No cheating", value: "• Do not use cheats, exploits or hacks in Roblox.\n• Any unfair advantage is a bannable offense." },
            { name: "3️⃣ Follow orders", value: "• Listen to your superior officers during operations and trainings.\n• Do not ignore commands from higher ranks." },
            { name: "4️⃣ No spam or trolling", value: "• Do not spam messages or ping people without reason.\n• Trolling during operations will result in a ban." },
            { name: "5️⃣ No advertising", value: "• Do not send links to other Discord servers or communities." },
            { name: "6️⃣ Keep it clean", value: "• No inappropriate content of any kind.\n• Behave properly — this is a serious military community." },
            { name: "📩 Need help?", value: "If you have any questions or want to report someone, go to <#1507711197175218257> and our <@&1507711328020598897> team will help you." }
          )
          .setFooter({ text: "BAR | British Army Regiment" })
          .setTimestamp();

        await channel.send({ embeds: [rulesEmbed] });
        console.log("📋 Rules message sent.");

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

  // ── Канал репортов ─────────────────────────────────────────────────
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const guild = interaction.guild;

  // ── Создать тикет ──────────────────────────────────────────────────
  if (interaction.customId === "create_report") {
    await interaction.deferReply({ flags: 64 });

    // Проверяем нет ли уже открытого тикета у этого юзера
    const existing = guild.channels.cache.find(
      c => c.name === `report-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}` && c.parentId === REPORT_CATEGORY_ID
    );

    if (existing) {
      return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing.id}>` });
    }

    try {
      const ticketChannel = await guild.channels.create({
        name: `report-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        type: ChannelType.GuildText,
        parent: REPORT_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: userId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: MOD_ROLE_ID,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels]
          }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle("📋 New Report Ticket")
        .setDescription(
          `Hello <@${userId}>! 👋\n\n` +
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

      await ticketChannel.send({ embeds: [ticketEmbed], components: [closeRow] });
      await interaction.editReply({ content: `✅ Your ticket has been created: <#${ticketChannel.id}>` });
      console.log(`🎫 Ticket created: ${ticketChannel.name}`);

    } catch (err) {
      console.error("❌ Error creating ticket:", err);
      await interaction.editReply({ content: "❌ Failed to create ticket. Please contact a moderator." });
    }
  }

  // ── Закрыть тикет ──────────────────────────────────────────────────
  if (interaction.customId === "close_ticket") {
    const member = await guild.members.fetch(userId);
    const isMod = member.roles.cache.has(MOD_ROLE_ID);
    const isOwner = guild.ownerId === userId;

    if (!isMod && !isOwner) {
      return interaction.reply({ flags: 64, content: "❌ Only moderators can close tickets." });
    }

    await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
        console.log(`🔒 Ticket closed by ${interaction.user.tag}`);
      } catch (err) {
        console.error("❌ Error closing ticket:", err);
      }
    }, 5000);
  }

  // ── Верификация ────────────────────────────────────────────────────
  if (interaction.customId === "link") {
    if (users[userId]?.linked) {
      const robloxName = users[userId].roblox;
      const profileUrl = `https://www.roblox.com/users/profile?username=${robloxName}`;
      const embed = new EmbedBuilder()
        .setTitle("✅ Already Verified")
        .setDescription(`You are already linked as **[${robloxName}](${profileUrl})**\n\nUse **Update Role** to refresh your roles.`)
        .setColor(0x00ff00)
        .setFooter({ text: "BAR | British Army Regiment" });
      return interaction.reply({ flags: 64, embeds: [embed] });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    users[userId] = { code, linked: false, roblox: null };

    const embed = new EmbedBuilder()
      .setTitle("Verification")
      .setDescription(
        `Join the game and enter your code:\n[Verification Game](https://www.roblox.com/games/117521342225865/Verification)\n\n**Your code:** \`${code}\`\n\nAfter entering the code, click **Update Role**.`
      )
      .setColor(0xffaa00)
      .setFooter({ text: "BAR | British Army Regiment" });

    return interaction.reply({ flags: 64, embeds: [embed] });
  }

  if (interaction.customId === "update") {
    const user = users[userId];

    if (!user?.linked) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Not Verified")
        .setDescription(
          "You are not verified yet.\n\n" +
          "👉 Click **Link Roblox Account** first,\n" +
          "then enter the code in the Roblox game."
        )
        .setColor(0xff0000)
        .setFooter({ text: "BAR | British Army Regiment" });
      return interaction.reply({ flags: 64, embeds: [embed] });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const robloxName = user.roblox;
      const profileUrl = `https://www.roblox.com/users/profile?username=${robloxName}`;

      const robloxId = await getRobloxUserId(robloxName);
      const rankName = robloxId ? await getRobloxRank(robloxId) : null;
      const avatarUrl = robloxId ? await getRobloxAvatar(robloxId) : null;

      console.log(`📊 Rank for ${robloxName}: "${rankName}"`);

      const rankInfo = rankName ? RANK_MAP[rankName] : null;
      const prefix = rankInfo?.prefix || "[???]";
      const roleName = rankInfo?.role || null;

      const member = await guild.members.fetch(userId);
      const botMember = guild.members.me;
      const botHighest = botMember.roles.highest.position;
      const memberHighest = member.roles.highest.position;
      const isOwner = guild.ownerId === userId;

      // Меняем ник
      const newNickname = `${prefix} ${robloxName}`;
      try {
        if (isOwner) {
          console.warn("⚠️ Cannot change nickname of server owner.");
        } else if (botHighest <= memberHighest) {
          console.warn(`⚠️ Bot role too low to change nickname.`);
        } else {
          await member.setNickname(newNickname);
          console.log(`✏️ Nickname set: ${newNickname}`);
        }
      } catch (e) {
        console.warn("⚠️ Nickname error:", e.message);
      }

      // Меняем роли
      if (roleName) {
        try {
          const allRoleNames = Object.values(RANK_MAP).map(r => r.role);
          for (const rn of allRoleNames) {
            const oldRole = guild.roles.cache.find(r => r.name === rn);
            if (oldRole && member.roles.cache.has(oldRole.id)) {
              await member.roles.remove(oldRole);
            }
          }
          const discordRole = guild.roles.cache.find(r => r.name === roleName);
          if (discordRole) {
            await member.roles.add(discordRole);
            console.log(`🎖️ Role added: ${roleName}`);
          } else {
            console.warn(`⚠️ Role not found: "${roleName}"`);
          }
        } catch (e) {
          console.warn("⚠️ Role error:", e.message);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${prefix} ${robloxName}`)
        .setURL(profileUrl)
        .setColor(0x00ff00)
        .setThumbnail(avatarUrl)
        .addFields(
          { name: "🎮 Roblox", value: `[${robloxName}](${profileUrl})`, inline: true },
          { name: "🎖️ Rank", value: rankName || "Not in group", inline: true },
          { name: "💬 Discord", value: `<@${userId}>`, inline: true }
        )
        .setFooter({ text: "BAR | British Army Regiment" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("❌ Unexpected error:", err);
      return interaction.editReply({ content: "❌ Something went wrong. Try again later." });
    }
  }
});

client.login(process.env.TOKEN);
