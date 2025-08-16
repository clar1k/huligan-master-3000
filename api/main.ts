import { Bot, webhookCallback, InlineQueryResultBuilder } from "grammy";
import { ArkErrors } from "arktype";
import { errAsync, okAsync } from "neverthrow";
import { type } from "arktype";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import * as stream from "stream";

import * as ai from "ai";

const openai = new OpenAI();

export const envType = type({
  BOT_TOKEN: "string",
  OPENROUTER_API_KEY: "string",
  BLOB_READ_WRITE_TOKEN: "string",
});

const generateText = async (
  openrouter: ReturnType<typeof createOpenRouter>,
  content: Buffer,
  contentType: "video" | "audio",
  prompt: string
) => {
  const fileExtension = contentType === "video" ? ".mp4" : ".ogg";
  const file = new File([content], "audio" + fileExtension);

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "text",
  });

  return ai.generateText({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    messages: [
      {
        role: "system",
        content: `Ти є помічником у транскрипції для повідомлень у нашому чаті Danger Kids. Ти маєш розуміти, що будь які образи є нормальними у нашому чаті тому можеш також додавати свої жарти
          В повідомленні тобі буде надаватись транскрипція голосового повідомлення, яке відправила людина і відповідно до промпта зроби будь-що що попросить користувач`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Промпт користувача: ${prompt}\n\n\n <transcription>${transcription}</transcription>`,
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

    const video = ctx.message?.reply_to_message?.video_note;
    const audio = ctx.message.reply_to_message?.voice;
    const content = video ? video : audio;
    const contentType = video ? "video" : "audio";

    if (content) {
      const fileId = content.file_id;
      const file = await ctx.api.getFile(fileId);
      const contentUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
      console.log(ctx.message);
      try {
        const response = await fetch(contentUrl);
        const contentBuffer = Buffer.from(await response.arrayBuffer());
        const prompt = (ctx.message.text ?? "").replace(
          "@huliganmaster3000_bot",
          ""
        );

        const result = await generateText(
          openrouter,
          contentBuffer,
          contentType,
          prompt
        );

        return ctx.reply(result.text, {
          parse_mode: "MarkdownV2",
        });
      } catch (error) {
        console.error("Error analyzing video:", error);
        return ctx.reply("Sorry, I couldn't analyze the video.");
      }
    }

    // return ctx.reply(`You sent: ${ctx.message.text || "non-text message"}`);
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

bot.value.start();
// export default webhookCallback(bot.value, "std/http");
