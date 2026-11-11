// Add this near the top of bot.js with your other requirements
const http = require("http");

// Create a basic web server so Render's port check passes
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Stray Kids Discord Bot is running!\n");
});

// Render automatically injects a PORT environment variable
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Dummy web server listening on port ${PORT}`);
});

const fs = require("fs");
const path = require("path");
const CACHE_FILE = path.join(__dirname, "cache.json");

const Parser = require("rss-parser");
const parser = new Parser(); // 👈 This must be lowercase 'parser' to match the loop code!
require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 👈 This must be added here
  ],
});

let lastSeenYouTubeVideoId = null;
let lastSeenJPNYouTubeVideoId = null;
let lastSeenTwitterTweetId = null;
let lastSeenInstagramPostId = null;
let isCheckingSocialMedia = false;

if (fs.existsSync(CACHE_FILE)) {
  try {
    const savedCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    lastSeenYouTubeVideoId = savedCache.youTubeVideoId ?? null;
    lastSeenJPNYouTubeVideoId = savedCache.jpnYouTubeVideoId ?? null;
    lastSeenTwitterTweetId = savedCache.twitterTweetId ?? null;
    lastSeenInstagramPostId = savedCache.instagramPostId ?? null;
    console.log("💾 Successfully loaded historical post cache from disk.");
  } catch (e) {
    console.error("⚠️ Failed to read cache file, starting fresh:", e.message);
  }
}
// Target IDs for Stray Kids Official Accounts
const SKZ_YT_CHANNEL_ID = "UC9rMiEjNaCSsebs31MRDCRA"; // Official Stray Kids Channel
const SKZ_JPN_CHANNEL_ID = "UCXhj2pPWvONXmvgHX5wllCA"; // Japanese Stray Kids Channel";

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.trim().toLowerCase() !== "!test") return;

  console.log(`Received !test in channel ${message.channelId}.`);
  try {
    await message.reply(
      "⏳ Forcing a manual check of social media channels now...",
    );
    await checkSocialMedia();
  } catch (error) {
    console.error("Error handling !test:", error.message);
  }
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);

  void checkSocialMedia();
  setInterval(() => {
    void checkSocialMedia();
  }, 300000);
});

async function checkSocialMedia() {
  if (isCheckingSocialMedia) return;
  isCheckingSocialMedia = true;

  try {
    if (!process.env.CHANNEL_ID) {
      console.error("Error tracking social media: CHANNEL_ID is not configured.");
      return;
    }

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      console.error(
        "Error tracking social media: CHANNEL_ID is not a text-based channel.",
      );
      return;
    }

    if (!process.env.YOUTUBE_API_KEY) {
      console.error("Error tracking YouTube: YOUTUBE_API_KEY is not configured.");
    } else {
      try {
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBE_API_KEY}&channelId=${SKZ_YT_CHANNEL_ID}&part=snippet,id&order=date&maxResults=1`;
        const ytResponse = await axios.get(ytUrl);
        const latestVideo = ytResponse.data.items?.[0];

        if (latestVideo && latestVideo.id.videoId) {
          const videoId = latestVideo.id.videoId;
          if (lastSeenYouTubeVideoId && lastSeenYouTubeVideoId !== videoId) {
            const embed = new EmbedBuilder()
              .setTitle("🎬 New Stray Kids Video!")
              .setDescription(latestVideo.snippet.title)
              .setURL(`https://www.youtube.com/watch?v=${videoId}`)
              .setColor("#FF0000")
              .setTimestamp();

            const thumbnailUrl = latestVideo.snippet.thumbnails?.high?.url;
            if (thumbnailUrl) embed.setImage(thumbnailUrl);

            await channel.send({ embeds: [embed] });
          }
          lastSeenYouTubeVideoId = videoId;
          saveCache();
        }
      } catch (error) {
        console.error("Error tracking YouTube:", error.message);
      }
    }

    try {
      if (process.env.INSTAGRAM_RSS_URL) {
        const feed = await parser.parseURL(process.env.INSTAGRAM_RSS_URL);
        const latestPost = feed.items[0];

        if (latestPost) {
          const postId = latestPost.id || latestPost.link;

          if (lastSeenInstagramPostId && lastSeenInstagramPostId !== postId) {
            const embed = new EmbedBuilder()
              .setTitle("📸 New Stray Kids Instagram Post!")
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
          lastSeenInstagramPostId = postId;
          saveCache();
        }
      }
    } catch (error) {
      console.error("Error tracking Instagram RSS:", error.message);
    }

    try {
      if (process.env.TWITTER_RSS_URL) {
        const feed = await parser.parseURL(process.env.TWITTER_RSS_URL);
        const latestTweet = feed.items[0];

        if (latestTweet) {
          const tweetId = latestTweet.id || latestTweet.link;

          if (lastSeenTwitterTweetId && lastSeenTwitterTweetId !== tweetId) {
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
          lastSeenTwitterTweetId = tweetId;
          saveCache();
        }
      }
    } catch (error) {
      console.error("Error tracking X RSS:", error.message);
    }
  } catch (error) {
    console.error("Error checking social media:", error.message);
  } finally {
    isCheckingSocialMedia = false;
  }
}

if (!process.env.DISCORD_TOKEN) {
  console.error("Error: DISCORD_TOKEN is not configured.");
} else {
  console.log("Connecting to Discord...");
  void client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error("Error connecting to Discord:", error.message);
  });
}
function saveCache() {
  const cache = {
    youTubeVideoId: lastSeenYouTubeVideoId,
    jpnYouTubeVideoId: lastSeenJPNYouTubeVideoId,
    twitterTweetId: lastSeenTwitterTweetId,
    instagramPostId: lastSeenInstagramPostId,
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}
