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

// ── Express API (запускаем ДО бота) ──────────────────────────
const app = express();
app.use(express.json());

const users = {}; // { discordId: { code, linked, roblox } }

// Roblox игра шлёт сюда POST когда игрок вводит код
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

// Health check — нужен Railway чтобы не усыплял сервис
app.get("/", (req, res) => res.send("BAR Guard is alive ✅"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API running on port ${process.env.PORT || 3000}`);
});

// ── Discord Bot ───────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) return console.error("❌ Channel not found");

    // Проверяем последние 10 сообщений — есть ли уже наше?
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      m => m.author.id === client.user.id && m.components.length > 0
    );

    // Если уже есть — не дублируем, просто логируем
    if (existing) {
      console.log("📌 Verification message already exists, skipping send.");
      return;
    }

    // Если нет — отправляем новое
    const embed = new EmbedBuilder()
      .setTitle("ROBLOX VERIFICATION SYSTEM")
      .setDescription("Press a button below to verify or update your role.")
      .setColor(0x00ff00);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("link")
        .setLabel("Link Roblox Account")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("update")
        .setLabel("Update Role")
        .setStyle(ButtonStyle.Success)
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

    // Если уже верифицирован — сообщаем
    if (users[userId]?.linked) {
      return interaction.reply({
        content: `✅ You are already verified as **${users[userId].roblox}**!\n\nUse "Update Role" to refresh your Discord roles.`,
        ephemeral: true
      });
    }

    // Генерируем новый код
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    users[userId] = { code, linked: false, roblox: null };

    return interaction.reply({
      content: [
        `🎮 **ROBLOX VERIFICATION**`,
        ``,
        `Join the verification game and enter this code:`,
        ``,
        `🔑 \`${code}\``,
        ``,
        `⏳ Code expires when you restart verification.`,
        `After entering the code in-game, click **Update Role**.`
      ].join("\n"),
      ephemeral: true
    });
  }

  // ── UPDATE ROLE ───────────────────────────────────────────
  if (interaction.customId === "update") {
    const user = users[userId];

    if (!user?.linked) {
      return interaction.reply({
        content: [
          `❌ **Not verified yet.**`,
          ``,
          `👉 Click **"Link Roblox Account"** first,`,
          `then enter the code in the Roblox game.`
        ].join("\n"),
        ephemeral: true
      });
    }

    // Здесь потом добавишь выдачу ролей через guild.members
    return interaction.reply({
      content: [
        `👤 **YOUR PROFILE**`,
        ``,
        `Roblox: **${user.roblox}**`,
        `Status: ✅ Verified`
      ].join("\n"),
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);