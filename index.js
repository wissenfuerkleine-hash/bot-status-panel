import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

/* =========================
   SETUP
========================= */

const app = express();
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =========================
   CONFIG
========================= */

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = "DEIN_CHANNEL_ID"; // <- HIER EINTRAGEN

const UPDATE_INTERVAL = 10000; // Panel Update
const CHECK_INTERVAL = 10000;  // Down Check
const TIMEOUT = 90 * 1000;     // 90 Sekunden = DOWN

/* =========================
   STORAGE
========================= */

const botStatus = {};
let panelMessage = null;

/* =========================
   API (Bots senden Status hierhin)
========================= */

app.post("/status", (req, res) => {
  const { name, status } = req.body;

  botStatus[name] = {
    status: status || "active",
    lastSeen: Date.now()
  };

  res.sendStatus(200);
});

/* =========================
   AUTO DOWN CHECK
========================= */

function checkDownBots() {
  const now = Date.now();

  for (const name in botStatus) {
    const bot = botStatus[name];

    if (now - bot.lastSeen > TIMEOUT) {
      bot.status = "down";
    }
  }
}

/* =========================
   EMBED BUILDER
========================= */

function buildEmbed() {
  const text = Object.entries(botStatus)
    .map(([name, data]) => {
      const emoji =
        data.status === "active" ? "🟢" :
        data.status === "down" ? "🔴" :
        data.status === "maintenance" ? "🛠" :
        "🟡";

      return `${emoji} **${name}**`;
    })
    .join("\n") || "Keine Daten";

  return new EmbedBuilder()
    .setTitle("📊 Bot Status Panel")
    .setColor(0x00ff00)
    .setDescription(text)
    .setFooter({ text: "Auto-Update aktiv" })
    .setTimestamp();
}

/* =========================
   PANEL ERSTELLEN
========================= */

async function createPanel(channel) {
  panelMessage = await channel.send({
    embeds: [buildEmbed()]
  });
}

/* =========================
   PANEL UPDATEN
========================= */

async function updatePanel() {
  if (!panelMessage) return;

  await panelMessage.edit({
    embeds: [buildEmbed()]
  });
}

/* =========================
   DISCORD READY
========================= */

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(1520386261284688004);

  await createPanel(channel);

  setInterval(() => {
    checkDownBots();
  }, CHECK_INTERVAL);

  setInterval(() => {
    updatePanel();
  }, UPDATE_INTERVAL);
});

/* =========================
   START SERVER
========================= */

app.listen(3000, () => {
  console.log("🚀 API läuft auf Port 3000");
});

/* =========================
   LOGIN
========================= */

client.login(DISCORD_TOKEN);