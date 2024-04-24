import fastify from "fastify";
import { pino } from "pino";
import dotenv from "dotenv";
import { RoutePlanner, Scraper } from "@sirubot/yt-related-scraper";
dotenv.config();

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: number;
      IP_BLOCKS?: string;
      EXCLUDE_IP_ADDRESSES?: string;
      SCRAPER_TIMEOUT: string;
    }
  }
}

const logger = pino({
  transport: {
    target: "pino-pretty",
  },
});

let routeplanner: RoutePlanner | undefined;
if (process.env.IP_BLOCKS) {
  routeplanner = new RoutePlanner({
    ipBlocks: process.env.IP_BLOCKS.split(";"),
    excludeIps: process.env.EXCLUDE_IP_ADDRESSES
      ? process.env.EXCLUDE_IP_ADDRESSES.split(";")
      : undefined,
    log: {
      debug: (msg) => logger.debug(msg),
      info: (msg) => logger.info(msg),
    },
  });
  logger.info(
    `Route planner is enabled. ${
      process.env.IP_BLOCKS.split(";").length
    } IP blocks are loaded.`
  );
}

if (!!process.env.EXCLUDE_IP_ADDRESSES && !process.env.IP_BLOCKS) {
  logger.warn(
    "EXCLUDE_IP_ADDRESSES is set but IP_BLOCKS is not set. Route planner will not be used."
  );
}

const scraperOptions = {
  timeout: process.env.SCRAPER_TIMEOUT
    ? parseInt(process.env.SCRAPER_TIMEOUT)
    : 10000,
};
const scraper = new Scraper({
  ...scraperOptions,
  log: {
    debug: (msg) => logger.debug(msg),
    info: (msg) => logger.info(msg),
  },
});
if (process.env.SCRAPER_TIMEOUT) {
  logger.info(`Scraper timeout is set to ${scraperOptions.timeout}ms.`);
}

const server = fastify({
  logger,
});

server.get(
  "/query",
  {
    schema: {
      querystring: {
        type: "object",
        properties: {
          url: {
            type: "string",
          },
        },
      },
    },
  },
  async (request, reply) => {
    const query = request.query as { url?: string };
    if (!query.url) {
      return reply.code(400).send({ error: "Missing url querystring." });
    }
    if (!isURL(query.url)) {
      return reply.code(400).send({ error: "Invalid URL." });
    }
    if (!validateYoutubeURL(query.url)) {
      return reply.code(400).send({ error: "Invalid Youtube URL." });
    }
    const youtubeIdentifier = getYoutubeIdentifierFromURL(query.url);
    if (!youtubeIdentifier) {
      return reply.code(400).send({ error: "Invalid Youtube URL." });
    }
    try {
      const result = await scraper.scrape(youtubeIdentifier, routeplanner);
      if (!result) {
        return reply.code(404).send({ error: "Related videos not found." });
      } else {
        return reply.code(200).send(
          result.map((e) => {
            return { ...e, url: `https://youtu.be/${e.videoId}` };
          })
        );
      }
    } catch (error) {
      return reply.code(500).send({ error: error });
    }
  }
);

server.get("/health", async () => {
  return { health: "OK :3", uptime: { seconds: process.uptime() } };
});

server.get("/", async () => {
  return {
    path: "/query?url=youtube_url",
    health: "/health",
  };
});

server.listen(
  {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  },
  (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    logger.info(`Server listening at ${address}`);
  }
);

function isURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

function getYoutubeIdentifierFromURL(url: string): string {
  const urlObj = new URL(url);
  if (urlObj.hostname === "youtu.be") {
    return urlObj.pathname.slice(1);
  } else if (urlObj.hostname === "www.youtube.com" || urlObj.hostname === "youtube.com") {
    const searchParams = new URLSearchParams(urlObj.search);
    return searchParams.get("v") || "";
  }
  return "";
}

function validateYoutubeURL(url: string) {
  const regex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
  return regex.test(url);
}
