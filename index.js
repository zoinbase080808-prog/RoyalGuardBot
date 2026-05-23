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

// Получаем Roblox User ID по нику
async function getRobloxUserId(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  const data = await res.json();
  return data.data?.[0]?.id || null;
}

// Получаем ранг игрока в группе
async function getRobloxRank(userId) {
  const res = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  const data = await res.json();
  const group = data.data?.find(g => g.group.id === GROUP_ID);
  return group?.role?.name || null;
}

// Получаем аватарку игрока
async function getRobloxAvatar(userId) {
  const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`);
  const data = await res.json();
  return data.data?.[0]?.imageUrl || null;
}

// Маппинг ранга Roblox → префикс ника + Discord роль
const RANK_MAP = {
  "Recruit (Trainee)": { prefix: "[OR-1]", role: "Recruit (Trainee)" },
  "Private":           { prefix: "[OR-2]", role: "Private" },
  "Lance Corporal":    { prefix: "[OR-3]", role: "Lance Corporal" },
  "Corporal":          { prefix: "[OR-4]", role: "Corporal" },
  "Sergeant":          { prefix: "[OR-5]", role: "Sergeant" },
  "Staff Sergeant":    { prefix: "[OR-6]", role: "Staff Sergeant" },
  "Sergeant First":    { prefix: "[OR-7]", role: "Sergeant First" },
  "Warrant Officer":   { prefix: "[OR-8]", role: "Warrant Officer" },
  "Warrant Officer 1": { prefix: "[OR-9]", role: "Warrant Officer 1" },
  "Lieutenant":        { prefix: "[OF-1]", role: "Lieutenant" },
  "Captain":           { prefix: "[OF-2]", role: "Captain" },
  "Major":             { prefix: "[OF-3]", role: "Major" },
  "Lieutenant Colonel":{ prefix: "[OF-4]", role: "Lieutenant Colonel" },
  "Colonel":           { prefix: "[OF-5]", role: "Colonel" },
  "Brigadier":         { prefix: "[OF-6]", role: "Brigadier" },
  "Major General":     { prefix: "[OF-7]", role: "Major General" },
  "Lieutenant General":{ prefix: "[OF-8]", role: "Lieutenant General" },
  "General":           { prefix: "[OF-9]", role: "General" },
  "Army Sergeant":     { prefix: "[ASM]", role: "Army Sergeant" },
  "Assistant Chief":   { prefix: "[ACGS]", role: "Assistant Chief" },
  "Deputy Chief":      { prefix: "[DCGS]", role: "Deputy Chief" },
  "Chief of General":  { prefix: "[CGS]", role: "Chief of General" },
  "Developer":         { prefix: "[DEV]", role: "Developer" },
  "Board of Directors":{ prefix: "[BOD]", role: "Board of Directors" },
  "Field Marshal":     { prefix: "[FM]", role: "Field Marshal" },
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once("ready", async () => {
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
        .setDescription(`You are already linked as **[${robloxName}](${profileUrl})**`)
        .setColor(0x00ff00)
        .setFooter({ text: "BAR | British Army Regiment" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
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

    return interaction.reply({ embeds: [embed], ephemeral: true });
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
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const robloxName = user.roblox;
      const profileUrl = `https://www.roblox.com/users/profile?username=${robloxName}`;

      // Получаем данные из Roblox
      const robloxId = await getRobloxUserId(robloxName);
      const rankName = robloxId ? await getRobloxRank(robloxId) : null;
      const avatarUrl = robloxId ? await getRobloxAvatar(robloxId) : null;

      const rankInfo = rankName ? RANK_MAP[rankName] : null;
      const prefix = rankInfo?.prefix || "[???]";
      const roleName = rankInfo?.role || null;

      // Меняем ник в Discord
      const guild = interaction.guild;
      const member = await guild.members.fetch(userId);

      try {
        await member.setNickname(`${prefix} ${robloxName}`);
      } catch (e) {
        console.warn("⚠️ Cannot change nickname:", e.message);
      }

      // Выдаём роль
      if (roleName) {
        try {
          const discordRole = guild.roles.cache.find(r => r.name === roleName);
          if (discordRole) {
            // Убираем все старые роли из RANK_MAP
            const allRoleNames = Object.values(RANK_MAP).map(r => r.role);
            for (const rn of allRoleNames) {
              const oldRole = guild.roles.cache.find(r => r.name === rn);
              if (oldRole && member.roles.cache.has(oldRole.id)) {
                await member.roles.remove(oldRole);
              }
            }
            await member.roles.add(discordRole);
            console.log(`🎖️ Role assigned: ${roleName} to ${robloxName}`);
          }
        } catch (e) {
          console.warn("⚠️ Cannot assign role:", e.message);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${prefix} ${robloxName}`)
        .setURL(profileUrl)
        .setColor(0x00ff00)
        .setThumbnail(avatarUrl)
        .addFields(
          { name: "Roblox", value: `[${robloxName}](${profileUrl})`, inline: true },
          { name: "Rank", value: rankName || "Not in group", inline: true },
          { name: "Discord", value: `<@${userId}>`, inline: true }
        )
        .setFooter({ text: "BAR | British Army Regiment" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("❌ Update error:", err);
      return interaction.editReply({ content: "❌ Something went wrong. Try again later." });
    }
  }
});

client.login(process.env.TOKEN);