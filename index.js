require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const app = express();
app.use(express.json());

const users = {};
const GROUP_ID = 188707916;

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
    GatewayIntentBits.GuildMembers
  ]
});

client.once("clientReady", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      m => m.author.id === client.user.id && m.components.length > 0
    );

    if (existing) {
      console.log("📌 Verification message already exists.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔗 ROBLOX VERIFICATION SYSTEM")
      .setDescription(
        "Link your Roblox account to gain access to the server.\n\n" +
        "**How it works:**\n" +
        "1️⃣ Click **Link Roblox Account**\n" +
        "2️⃣ Join the verification game and enter the code\n" +
        "3️⃣ Return here and click **Update Role**"
      )
      .setColor(0x00ff00)
      .setFooter({ text: "BAR | British Army Regiment" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("link")
        .setLabel("Link Roblox Account")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("update")
        .setLabel("Update Role")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    console.log("📨 Verification message sent.");

  } catch (err) {
    console.error("❌ Error:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (interaction.customId === "link") {
    if (users[userId]?.linked) {
      const robloxName = users[userId].roblox;
      const profileUrl = `https://www.roblox.com/users/profile?username=${robloxName}`;
      const embed = new EmbedBuilder()
        .setTitle("✅ Already Verified")
        .setDescription(`You are already linked as **[${robloxName}](${profileUrl})**\n\nUse **Update Role** to refresh your roles.`)
        .setColor(0x00ff00)
        .setFooter({ text: "BAR | British Army Regiment" });
      return interaction.reply({
        flags: 64,
        embeds: [embed]
      });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    users[userId] = { code, linked: false, roblox: null };

    const embed = new EmbedBuilder()
      .setTitle("🎮 ROBLOX VERIFICATION")
      .setDescription(
        "Join the verification game and enter this code:\n\n" +
        `🔑 \`${code}\`\n\n` +
        "⏳ Code expires when you restart verification.\n" +
        "After entering the code in-game, click **Update Role**."
      )
      .setColor(0xffaa00)
      .setFooter({ text: "BAR | British Army Regiment" });

    return interaction.reply({
      flags: 64,
      embeds: [embed]
    });
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
      return interaction.reply({
        flags: 64,
        embeds: [embed]
      });
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

      const guild = interaction.guild;
      const member = await guild.members.fetch(userId);

      // Меняем ник
      try {
        await member.setNickname(`${prefix} ${robloxName}`);
        console.log(`✏️ Nickname: ${prefix} ${robloxName}`);
      } catch (e) {
        console.warn("⚠️ Nickname error:", e.message);
      }

      // Убираем старые роли и выдаём новую
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
            console.log(`🎖️ Role: ${roleName}`);
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
      console.error("❌ Error:", err);
      return interaction.editReply({ content: "❌ Something went wrong. Try again later." });
    }
  }
});

client.login(process.env.TOKEN);