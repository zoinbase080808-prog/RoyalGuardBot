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

// ── Express API ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const users = {};

app.post("/verify", (req, res) => {
  const { robloxName, code } = req.body;

  for (const discordId in users) {
    if (users[discordId].code === code && !users[discordId].linked) {
      users[discordId].linked = true;
      users[discordId].roblox = robloxName;
      console.log(`✅ Verified: ${discordId} → ${robloxName}`);
      return res.json({ success: true, discordId });
    }
  }

  return res.json({ success: false, reason: "Invalid or expired code" });
});

app.get("/", (req, res) => res.send("BAR Guard is alive ✅"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API running on port ${process.env.PORT || 3000}`);
});

// ── Discord Bot ──────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) return console.error("❌ Channel not found");

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      m => m.author.id === client.user.id && m.components.length > 0
    );

    if (existing) {
      console.log("📌 Verification message already exists, skipping send.");
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
    console.error("❌ Error in ready event:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  // ── LINK ACCOUNT ─────────────────────────────────────────
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

  // ── UPDATE ROLE ───────────────────────────────────────────
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

    const robloxName = user.roblox;
    const profileUrl = `https://www.roblox.com/users/profile?username=${robloxName}`;

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${robloxName}`)
      .setURL(profileUrl)
      .setColor(0x00ff00)
      .addFields(
        { name: "Roblox Username", value: `[${robloxName}](${profileUrl})`, inline: true },
        { name: "Status", value: "✅ Verified", inline: true },
        { name: "Discord", value: `<@${userId}>`, inline: true }
      )
      .setFooter({ text: "BAR | British Army Regiment" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.login(process.env.TOKEN);