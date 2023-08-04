import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import {
  Api,
  Bot,
  Context,
  InlineKeyboard,
} from 'https://deno.land/x/grammy@v1.17.2/mod.ts';
import {
  FileApiFlavor,
  FileFlavor,
  hydrateFiles,
} from 'https://deno.land/x/grammy_files@v1.0.4/mod.ts';
import { autoRetry } from 'https://esm.sh/@grammyjs/auto-retry@1.1.1';
import { transcribe, writeX } from './openai_calls.ts';

type MyContext = FileFlavor<Context>;
type MyApi = FileApiFlavor<Api>;

const token = Deno.env.get('BOT_TOKEN')!;

const bot = new Bot<MyContext, MyApi>(token);

bot.api.config.use(hydrateFiles(bot.token));
bot.api.config.use(autoRetry());

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

bot.command('test', async (ctx) => {
  await ctx.reply('This is a test command. Why did you run it?');
});

bot.on('message:text', async (ctx) => {
  await ctx.reply("I can't read. Send me a voice message!");
});

bot.on('message:voice', async (ctx) => {
  const transcribeButton = InlineKeyboard.text('Transcribe', `transcribe`);

  const keyboard = InlineKeyboard.from([[transcribeButton]]);

  await ctx.reply(
    `Got a voice message! I will process it if you use the button below.`,
    {
      reply_to_message_id: ctx.message.message_id,
      reply_markup: keyboard,
    }
  );
});

bot.callbackQuery('transcribe', async (ctx) => {
  const fileMessage = ctx.callbackQuery.message?.reply_to_message;
  const fileId = fileMessage?.voice?.file_id;

  if (!fileId) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  await ctx.answerCallbackQuery();

  const transcribeMessage = await ctx.reply(`Transcribing...`, {
    reply_to_message_id: fileMessage?.message_id,
  });

  const file = await ctx.api.getFile(fileId);

  const filename = file.file_unique_id + '.ogg';
  const path = `files/${filename}`;

  try {
    await file.download(path);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      console.log('File already exists, skipping download');
    } else {
      throw e;
    }
  }

  try {
    const text = await transcribe(path);

    await ctx.editMessageText(text, {
      message_id: transcribeMessage.message_id,
    });

    Deno.removeSync(path);

    await ctx.reply('Converting to tweet...');

    const x = await writeX(text);

    await ctx.reply('Done ✅');

    await ctx.reply(x ?? '');
  } catch (e) {
    await ctx.reply('Something went wrong...');
    console.error(e);
  }
});

bot.on('callback_query:data', async (ctx) => {
  console.log('Unknown button event with payload', ctx.callbackQuery.data);
  await ctx.answerCallbackQuery(); // remove loading animation
});

Deno.addSignalListener("SIGINT", () => bot.stop());
Deno.addSignalListener("SIGTERM", () => bot.stop());

bot.catch(async (err) => {
  await console.error(err);
  err.ctx.reply('Some unhandled error occurred. Go away!');
});

bot.start();
