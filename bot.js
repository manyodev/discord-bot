require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Parser = require("rss-parser");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "cache.json");

// 1. INITIALIZE WEB SERVER (Keeps Render Free Tier Alive)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Stray Kids Discord Bot is running!\n");
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🌍 Dummy web server listening on port ${PORT}`);
});

// 2. INITIALIZE DISCORD CLIENT
const parser = new Parser();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 3. TRACKING STATE & LOCAL CACHE LOADING
let lastSeen = {
  youtube: null,
  youtubejpn: null,
  instagram: null,
  twitter: null,
};

if (fs.existsSync(CACHE_FILE)) {
  try {
    lastSeen = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    console.log("💾 Successfully loaded historical post cache from disk.");
  } catch (e) {
    console.error("⚠️ Failed to read cache file, starting fresh:", e.message);
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(lastSeen, null, 2), "utf8");
}

// 4. TARGET IDS FOR STRAY KIDS OFFICIAL ACCOUNTS
const SKZ_YT_CHANNEL_ID = "UC9rMiEjNaCSsebs31MRDCRA";
const SKZ_YTJPN_CHANNEL_ID = "UCXhj2pPWvONXmvgHX5wllCA";

// 5. DISCORD EVENTS
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  if (!process.env.INSTAGRAM_RSS_URL) {
    console.warn("Instagram tracking is disabled: INSTAGRAM_RSS_URL is not configured.");
  }
  if (!process.env.TWITTER_RSS_URL) {
    console.warn("X / Twitter tracking is disabled: TWITTER_RSS_URL is not configured.");
  }

  // Check for updates every 5 minutes
  setInterval(checkSocialMedia, 300000);
  checkSocialMedia();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!test") {
    message.reply("⏳ Forcing a manual check of social media channels now...");
    await checkSocialMedia();
  }
});

// 6. CORE TRACKING LOGIC
async function checkTracker(name, tracker) {
  try {
    await tracker();
  } catch (error) {
    console.error(`Error checking ${name}:`, error.message);
  }
}

async function checkSocialMedia() {
  let channel;
  try {
    if (!process.env.CHANNEL_ID) {
      throw new Error("CHANNEL_ID is not configured");
    }

    channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) {
      throw new Error("Configured Discord channel was not found");
    }
  } catch (error) {
    console.error("Unable to access the configured Discord channel:", error.message);
    return;
  }

  const youtubeChannels = [
    {
      key: "youtube",
      channelId: SKZ_YT_CHANNEL_ID,
      label: "🎬 New Stray Kids Video!",
    },
    {
      key: "youtubejpn",
      channelId: SKZ_YTJPN_CHANNEL_ID,
      label: "🎬 New Stray Kids Japan Video!",
    },
  ];

  for (const youtubeChannel of youtubeChannels) {
    await checkTracker(youtubeChannel.key, async () => {
      const feed = await parser.parseURL(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannel.channelId}`,
      );
      const latestVideo = feed.items?.[0];
      if (!latestVideo) {
        return;
      }

      const videoId =
        latestVideo.id?.replace(/^yt:video:/, "") ||
        (latestVideo.link
          ? new URL(latestVideo.link).searchParams.get("v")
          : null);
      if (!videoId) {
        return;
      }

      const previousVideoId = lastSeen[youtubeChannel.key];

      if (previousVideoId && previousVideoId !== videoId) {
        const embed = new EmbedBuilder()
          .setTitle(youtubeChannel.label)
          .setDescription(latestVideo.title)
          .setURL(`https://www.youtube.com/watch?v=${videoId}`)
          .setImage(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)
          .setColor("#FF0000")
          .setTimestamp(new Date(latestVideo.pubDate));

        await channel.send({ embeds: [embed] });
      }

      lastSeen[youtubeChannel.key] = videoId;
      saveCache();
    });
  }

  if (process.env.INSTAGRAM_RSS_URL) {
    await checkTracker("Instagram", async () => {
      const feed = await parser.parseURL(process.env.INSTAGRAM_RSS_URL);
      const latestPost = feed.items?.[0];

      if (latestPost) {
        const postId = latestPost.id || latestPost.link;
        if (lastSeen.instagram && lastSeen.instagram !== postId) {
          const embed = new EmbedBuilder()
            .setTitle(`📸 New Stray Kids Instagram Post!`)
            .setDescription(
              latestPost.contentSnippet?.substring(0, 250) ||
                "Click the link to view.",
            )
            .setURL(latestPost.link)
            .setColor("#E1306C")
            .setTimestamp(new Date(latestPost.pubDate));

          if (latestPost.enclosure?.url) {
            embed.setImage(latestPost.enclosure.url);
          }

          await channel.send({ embeds: [embed] });
        }
        lastSeen.instagram = postId;
        saveCache();
      }
    });
  }

  if (process.env.TWITTER_RSS_URL) {
    await checkTracker("X / Twitter", async () => {
      const feed = await parser.parseURL(process.env.TWITTER_RSS_URL);
      const latestTweet = feed.items?.[0];

      if (latestTweet) {
        const tweetId = latestTweet.id || latestTweet.link;
        if (lastSeen.twitter && lastSeen.twitter !== tweetId) {
          const embed = new EmbedBuilder()
            .setTitle(`🐦 New Stray Kids Tweet!`)
            .setDescription(
              latestTweet.contentSnippet?.substring(0, 280) ||
                "Click to read tweet.",
            )
            .setURL(latestTweet.link)
            .setColor("#1DA1F2")
            .setTimestamp(new Date(latestTweet.pubDate));

          await channel.send({ embeds: [embed] });
        }
        lastSeen.twitter = tweetId;
        saveCache();
      }
    });
  }
}

// 7. SECURE ENVIRONMENT ASSIGNMENT & LOGIN
// Replace the very bottom login section with this debugging configuration
console.log("🔑 Initializing Discord login routine...");

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ CRITICAL: process.env.DISCORD_TOKEN is completely missing from Render!",
  );
} else {
  console.log(
    `📡 Token detected. Length: ${process.env.DISCORD_TOKEN.length} characters.`,
  );
  console.log(
    `📡 Token starts with: "${process.env.DISCORD_TOKEN.substring(0, 5)}..."`,
  );
}

client
  .login(process.env.DISCORD_TOKEN)
  .then(() =>
    console.log("✅ Discord API connection established successfully!"),
  )
  .catch((err) =>
    console.error("❌ Discord login failed directly:", err.message),
  );
