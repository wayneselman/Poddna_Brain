import { db } from "./db";
import { podcasts, episodes, transcriptSegments, annotations, users } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Clear existing data for fresh seed
  console.log("Clearing existing data...");
  await db.delete(annotations);
  await db.delete(transcriptSegments);
  await db.delete(episodes);
  await db.delete(podcasts);
  await db.delete(users);

  // Create test users first
  console.log("Creating test users...");
  const testUsers = await db
    .insert(users)
    .values([
      {
        id: "user-1",
        email: "hiphophead92@example.com",
        firstName: "Hip Hop",
        lastName: "Head",
      },
      {
        id: "user-2",
        email: "musiclover23@example.com",
        firstName: "Music",
        lastName: "Lover",
      },
      {
        id: "user-3",
        email: "industryinsider@example.com",
        firstName: "Industry",
        lastName: "Insider",
      },
      {
        id: "user-4",
        email: "realhiphop@example.com",
        firstName: "Real",
        lastName: "HipHop",
      },
    ])
    .returning();

  // Insert podcasts
  const podcast1 = await db
    .insert(podcasts)
    .values({
      id: "podcast-1",
      title: "The Joe Budden Podcast",
      host: "Joe Budden",
      description: "Join Joe Budden and his crew for unfiltered conversations about music, culture, relationships, and everything in between",
      artworkUrl: "https://i.scdn.co/image/ab6765630000ba8a5d54ce93f2298d268e7cf47f",
    })
    .returning();

  const podcast2 = await db
    .insert(podcasts)
    .values({
      id: "podcast-2",
      title: "The Joe Rogan Experience",
      host: "Joe Rogan",
      description: "The official podcast of comedian Joe Rogan featuring long-form conversations with interesting people",
      artworkUrl: "https://i.scdn.co/image/ab6765630000ba8a24e77ec0c653f5e8e17c0914",
    })
    .returning();

  const podcast3 = await db
    .insert(podcasts)
    .values({
      id: "podcast-3",
      title: "The Diary Of A CEO",
      host: "Steven Bartlett",
      description: "Unfiltered success lessons from the world's most influential people hosted by entrepreneur Steven Bartlett",
      artworkUrl: "https://i.scdn.co/image/ab6765630000ba8a87dac70a20acfbb4c2c6e5f9",
    })
    .returning();

  // Insert episodes
  await db.insert(episodes).values([
    {
      id: "episode-1",
      podcastId: "podcast-1",
      title: "Episode 691 | The State of Hip-Hop in 2024",
      episodeNumber: 691,
      publishedAt: new Date("2024-11-20"),
      duration: 8400,
      type: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      description: "The crew discusses the current state of hip-hop, new releases, and industry drama",
    },
    {
      id: "episode-2",
      podcastId: "podcast-1",
      title: "Episode 692 | Thanksgiving Special",
      episodeNumber: 692,
      publishedAt: new Date("2024-11-22"),
      duration: 7200,
      type: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      description: "The fellas share what they're thankful for and recap the wildest moments of the year",
    },
    {
      id: "episode-3",
      podcastId: "podcast-2",
      title: "#2234 - Marc Andreessen",
      episodeNumber: 2234,
      publishedAt: new Date("2024-11-18"),
      duration: 10800,
      type: "audio",
      mediaUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      description: "Marc Andreessen is a entrepreneur, investor, and software engineer. He is co-author of Mosaic, the first widely used web browser, co-founder of Netscape, and co-founder of the venture capital firm Andreessen Horowitz",
    },
    {
      id: "episode-4",
      podcastId: "podcast-2",
      title: "#2235 - Jamie Foxx",
      episodeNumber: 2235,
      publishedAt: new Date("2024-11-21"),
      duration: 9600,
      type: "audio",
      mediaUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      description: "Jamie Foxx is an actor, singer, and comedian. Catch him in the new Netflix film 'Back in Action' on January 17, 2025",
    },
    {
      id: "episode-5",
      podcastId: "podcast-3",
      title: "E299: Moment 182: The Exercise Neuroscientist: NEW RESEARCH, You Can Grow New Brain Cells Here's How",
      episodeNumber: 299,
      publishedAt: new Date("2024-11-19"),
      duration: 5400,
      type: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      description: "Dr. Wendy Suzuki discusses the transformative effects of exercise on brain health, neuroplasticity, and mental performance",
    },
    {
      id: "episode-6",
      podcastId: "podcast-3",
      title: "E300: The Money Expert: From $0 to Millions In 5 Years Without Any Hard Work!",
      episodeNumber: 300,
      publishedAt: new Date("2024-11-23"),
      duration: 6300,
      type: "video",
      mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      description: "Ramit Sethi reveals his proven strategies for building wealth and achieving financial freedom through smart systems",
    },
  ]);

  // Insert transcript segments
  await db.insert(transcriptSegments).values([
    {
      id: "seg-1-1",
      episodeId: "episode-1",
      startTime: 0,
      endTime: 45,
      text: "What's happening everybody! Welcome back to the Joe Budden Podcast. I'm your humble and gracious host Joe Budden here with Parks, Ice, and Ish. We got a lot to talk about today.",
      type: "speech",
      speaker: "Joe Budden",
    },
    {
      id: "seg-1-2",
      episodeId: "episode-1",
      startTime: 45,
      endTime: 120,
      text: "Man, the state of hip-hop right now is crazy. You got all these new artists coming up, but at the same time, it feels like something is missing. The artistry, the lyricism - it's not what it used to be. And I'm not just being an old head saying that.",
      type: "speech",
      speaker: "Joe Budden",
    },
    {
      id: "seg-1-3",
      episodeId: "episode-1",
      startTime: 120,
      endTime: 150,
      text: "[Intro music fades in]",
      type: "music",
    },
    {
      id: "seg-1-4",
      episodeId: "episode-1",
      startTime: 150,
      endTime: 240,
      text: "I disagree with that actually. I think there's plenty of good music out there, you just gotta look for it. The algorithm ain't gonna feed it to you. You got cats like JID, Tierra Whack, REASON - they're making incredible music. The issue is the industry doesn't know how to market real talent anymore.",
      type: "speech",
      speaker: "Ice",
    },
    {
      id: "seg-1-5",
      episodeId: "episode-1",
      startTime: 240,
      endTime: 260,
      text: "[CLIP: Drake's recent interview snippet]",
      type: "clip",
      speaker: "Drake (archived)",
    },
    {
      id: "seg-1-6",
      episodeId: "episode-1",
      startTime: 260,
      endTime: 360,
      text: "See, that's what I'm talking about right there. Drake just said what we've all been thinking. The game has changed, and not necessarily for the better. But you know what? We adapt. That's what hip-hop has always been about - adapting to the times while staying true to the culture.",
      type: "speech",
      speaker: "Joe Budden",
    },
  ]);

  // Insert annotations
  console.log("Creating annotations...");
  await db.insert(annotations).values([
    {
      id: "ann-1-1",
      episodeId: "episode-1",
      segmentId: "seg-1-2",
      userId: "user-1",
      text: "it feels like something is missing. The artistry, the lyricism",
      startOffset: 95,
      endOffset: 155,
      content: "Joe always keeps it real about the state of hip-hop. The bar for lyricism has definitely dropped. Everyone's chasing hits and streams instead of making timeless music.",
      createdAt: new Date("2024-11-21T10:30:00"),
      upvotes: 342,
      downvotes: 18,
    },
    {
      id: "ann-1-2",
      episodeId: "episode-1",
      segmentId: "seg-1-4",
      userId: "user-2",
      text: "The algorithm ain't gonna feed it to you",
      startOffset: 102,
      endOffset: 142,
      content: "Facts! This is the biggest problem with music discovery today. The algorithm only shows you what's already popular, not what's actually good. You have to actively search for quality music.",
      createdAt: new Date("2024-11-21T14:15:00"),
      upvotes: 567,
      downvotes: 12,
    },
    {
      id: "ann-1-3",
      episodeId: "episode-1",
      segmentId: "seg-1-6",
      userId: "user-3",
      text: "The game has changed, and not necessarily for the better",
      startOffset: 95,
      endOffset: 151,
      content: "Streaming killed the album era. Artists don't get paid fairly, labels control the playlists, and singles matter more than cohesive projects. The whole ecosystem is broken.",
      createdAt: new Date("2024-11-21T16:45:00"),
      upvotes: 289,
      downvotes: 45,
    },
    {
      id: "ann-1-4",
      episodeId: "episode-1",
      segmentId: "seg-1-4",
      userId: "user-4",
      text: "cats like JID, Tierra Whack, REASON - they're making incredible music",
      startOffset: 52,
      endOffset: 123,
      content: "JID is so underrated! Dreamers series is pure fire. Tierra Whack is one of the most creative artists out right now. More people need to discover these artists.",
      createdAt: new Date("2024-11-22T09:20:00"),
      upvotes: 423,
      downvotes: 7,
    },
  ]);

  console.log("Database seeded successfully!");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error seeding database:", error);
    process.exit(1);
  });
