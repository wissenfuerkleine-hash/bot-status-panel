import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

/* =========================
   CONFIG
========================= */

const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const CHANNEL_ID      = process.env.DISCORD_CHANNEL_ID;
const RAILWAY_TOKEN_1 = process.env.RAILWAY_TOKEN_1;
const RAILWAY_TOKEN_2 = process.env.RAILWAY_TOKEN_2;
const UPDATE_INTERVAL = 3000; // 3 Sekunden

/* =========================
   RAILWAY PROJECTS & SERVICES
========================= */

const PROJECTS = [
  {
    id: "7f09cc52-46d8-4f09-9e4a-213b033f173c",
    name: "vibrant-quietude",
    token: RAILWAY_TOKEN_1,
    services: ["compassionate-freedom", "scintillating-flow"]
  },
  {
    id: "3a80fbb3-07c8-45bf-a8e0-763323506064",
    name: "devoted-possibility",
    token: RAILWAY_TOKEN_2,
    services: ["devoted-possibility"]
  }
];

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

/* =========================
   STORAGE
========================= */

// serviceStatus: { "serviceName": "online" | "offline" | "deploying" | "unknown" }
const serviceStatus = {};
let panelMessage = null;

/* =========================
   RAILWAY API QUERY
========================= */

const DEPLOYMENTS_QUERY = `
  query GetDeployments($projectId: String!) {
    deployments(
      input: { projectId: $projectId }
      first: 50
    ) {
      edges {
        node {
          id
          status
          service {
            name
          }
        }
      }
    }
  }
`;

async function fetchProjectStatus(project) {
  try {
    const response = await fetch(RAILWAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${project.token}`
      },
      body: JSON.stringify({
        query: DEPLOYMENTS_QUERY,
        variables: { projectId: project.id }
      })
    });

    if (!response.ok) {
      console.error(`[Railway] HTTP ${response.status} fuer Projekt ${project.name}`);
      return;
    }

    const json = await response.json();

    if (json.errors) {
      console.error(`[Railway] GraphQL-Fehler fuer ${project.name}:`, json.errors);
      return;
    }

    const edges = json?.data?.deployments?.edges ?? [];

    // Fuer jeden ueberwachten Service den neuesten Deployment-Status ermitteln
    for (const serviceName of project.services) {
      const deployments = edges
        .filter(e => e.node.service?.name === serviceName)
        .map(e => e.node);

      if (deployments.length === 0) {
        serviceStatus[serviceName] = "unknown";
        continue;
      }

      // Neuestes Deployment (API liefert bereits sortiert, erstes Element nehmen)
      const latest = deployments[0];
      const raw = (latest.status ?? "").toUpperCase();

      if (raw === "SUCCESS") {
        serviceStatus[serviceName] = "online";
      } else if (["FAILED", "CRASHED", "REMOVED"].includes(raw)) {
        serviceStatus[serviceName] = "offline";
      } else if (["BUILDING", "DEPLOYING", "INITIALIZING", "WAITING"].includes(raw)) {
        serviceStatus[serviceName] = "deploying";
      } else {
        serviceStatus[serviceName] = "unknown";
      }
    }
  } catch (err) {
    console.error(`[Railway] Netzwerkfehler fuer Projekt ${project.name}:`, err.message);
  }
}

async function fetchAllStatuses() {
  await Promise.all(PROJECTS.map(p => fetchProjectStatus(p)));
}

/* =========================
   EMBED BUILDER
========================= */

function statusEmoji(status) {
  switch (status) {
    case "online":    return "🟢";
    case "offline":   return "🔴";
    case "deploying": return "🛠";
    default:          return "⚪";
  }
}

function statusLabel(status) {
  switch (status) {
    case "online":    return "Online";
    case "offline":   return "Offline / Crashed";
    case "deploying": return "Deploying...";
    default:          return "Unbekannt";
  }
}

function buildEmbed() {
  const lines = [];

  for (const project of PROJECTS) {
    lines.push(`**${project.name}**`);
    for (const svc of project.services) {
      const s = serviceStatus[svc] ?? "unknown";
      lines.push(`${statusEmoji(s)} \`${svc}\` — ${statusLabel(s)}`);
    }
    lines.push("");
  }

  return new EmbedBuilder()
    .setTitle("📊 Bot Status Panel")
    .setColor(0x5865f2)
    .setDescription(lines.join("\n").trim())
    .setFooter({ text: `Aktualisiert alle ${UPDATE_INTERVAL / 1000}s` })
    .setTimestamp();
}

/* =========================
   PANEL ERSTELLEN / UPDATEN
========================= */

async function createPanel(channel) {
  panelMessage = await channel.send({ embeds: [buildEmbed()] });
  console.log("✅ Status-Panel erstellt.");
}

async function updatePanel() {
  if (!panelMessage) return;
  try {
    await panelMessage.edit({ embeds: [buildEmbed()] });
  } catch (err) {
    console.error("[Discord] Fehler beim Panel-Update:", err.message);
  }
}

/* =========================
   DISCORD CLIENT & READY
========================= */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);

  if (!CHANNEL_ID) {
    console.error("❌ DISCORD_CHANNEL_ID ist nicht gesetzt!");
    process.exit(1);
  }

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    console.error(`❌ Channel ${CHANNEL_ID} nicht gefunden!`);
    process.exit(1);
  }

  // Initialer Abruf vor dem ersten Panel
  await fetchAllStatuses();
  await createPanel(channel);

  // Alle 3 Sekunden: Railway API abfragen + Panel aktualisieren
  setInterval(async () => {
    await fetchAllStatuses();
    await updatePanel();
  }, UPDATE_INTERVAL);
});

/* =========================
   LOGIN
========================= */

client.login(DISCORD_TOKEN);
