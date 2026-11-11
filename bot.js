require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
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
const SKZ_YTJPN_CHANNEL_ID = "UCXhj2pPWvONXmvgHX5wllCA"


// 5. DISCORD EVENTS
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);

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
async function checkSocialMedia() {
  try {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel) return;

    // YouTube Tracking
    if (process.env.YOUTUBE_API_KEY) {
      const ytUrl = `https://googleapis.com{process.env.YOUTUBE_API_KEY}&channelId=${SKZ_YT_CHANNEL_ID}&part=snippet,id&order=date&maxResults=1`;
      const ytResponse = await axios.get(ytUrl);
      const latestVideo = ytResponse.data.items?.[0];

      if (latestVideo && latestVideo.id?.videoId) {
        const videoId = latestVideo.id.videoId;
        if (lastSeen.youtube && lastSeen.youtube !== videoId) {
          const embed = new EmbedBuilder()
            .setTitle(`🎬 New Stray Kids Video!`)
            .setDescription(latestVideo.snippet.title)
            .setURL(`https://youtube.com{videoId}`)
            .setImage(latestVideo.snippet.thumbnails.high.url)
            .setColor("#FF0000")
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        }
        lastSeen.youtube = videoId;
        saveCache();
      }
    }

    // Instagram Tracking (RSS)
    if (process.env.INSTAGRAM_RSS_URL) {
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
    }

    // X / Twitter Tracking (RSS)
    if (process.env.TWITTER_RSS_URL) {
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
    }
  } catch (error) {
    console.error("Error handling social media loop:", error.message);
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
