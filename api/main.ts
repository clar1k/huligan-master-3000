import { Bot, webhookCallback, InlineQueryResultBuilder } from "grammy";
import { ArkErrors } from "arktype";
import { errAsync, okAsync } from "neverthrow";
import { type } from "arktype";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import * as ai from "ai";

export const envType = type({
  BOT_TOKEN: "string",
  OPENROUTER_API_KEY: "string",
});
console.log("you can just build things");
const generateText = async (
  openrouter: ReturnType<typeof createOpenRouter>,
  videoBuffer: Buffer
) => {
  return ai.generateText({
    model: openrouter.chat("anthropic/claude-sonnet-4"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this video and describe what's happening",
          },
          {
            type: "file",
            mediaType: "video/mp4",
            data: videoBuffer,
          },
        ],
      },
    ],
  });
};

const setupBot = async () => {
  const env = envType(process.env);
  if (env instanceof ArkErrors) {
    return errAsync(env);
  }

  const bot = new Bot(env.BOT_TOKEN);
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

  await bot.api.setMyCommands([
    { command: "hello", description: "Simple hello world command" },
  ]);

  bot.command("hello", async (ctx) => {
    return ctx.reply("Hello, World!");
  });

  bot.command("start", async (ctx) => {
    return ctx.reply("Hello! Use /hello to get a greeting.");
  });

  bot.on("message", async (ctx) => {
    const containsHandleValidator = type(/@huliganmaster3000_bot/);
    const shouldReply = containsHandleValidator(ctx.message.text);

    if (shouldReply instanceof type.errors) {
      return;
    }

    // Handle video_note (circular video messages)
    if (ctx.message.video_note) {
      const fileId = ctx.message.video_note.file_id;
      const file = await ctx.api.getFile(fileId);
      const videoUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;

      console.log("Video note URL:", videoUrl);
      return ctx.reply(`Video note URL: ${videoUrl}`);
    }

    const video = ctx.message?.reply_to_message?.video_note;

    if (video) {
      const fileId = video.file_id;
      const file = await ctx.api.getFile(fileId);
      const videoUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;

      try {
        const response = await fetch(videoUrl);
        const videoBuffer = Buffer.from(await response.arrayBuffer());

        const result = await generateText(openrouter, videoBuffer);

        return ctx.reply(`AI Analysis: ${result.text}`);
      } catch (error) {
        console.error("Error analyzing video:", error);
        return ctx.reply("Sorry, I couldn't analyze the video.");
      }
    }

    console.log(ctx.message);
    return ctx.reply(`You sent: ${ctx.message.text || "non-text message"}`);
  });

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query;
    console.log(query);
    if (query === "hello") {
      const result = InlineQueryResultBuilder.article(
        "hello-world",
        "Hello World",
        {}
      ).text("Hello, World! 👋");

      await ctx.answerInlineQuery([result]);
    } else {
      await ctx.answerInlineQuery([]);
    }
  });

  return okAsync(bot);
};

const bot = await setupBot();

if (bot.isErr()) {
  throw bot.error;
}

// bot.value.start();
export default webhookCallback(bot.value, "https");
