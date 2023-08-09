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
import { transcribe, writeX, writeXThread } from './openai_calls.ts';

type MyContext = FileFlavor<Context>;
type MyApi = FileApiFlavor<Api>;

export const isProd = Deno.env.get('NODE_ENV') === 'development' ? false : true;

const token = Deno.env.get('BOT_TOKEN')!;

const bot = new Bot<MyContext, MyApi>(token);

bot.api.config.use(hydrateFiles(bot.token));
bot.api.config.use(autoRetry());

await bot.api.setMyCommands([
  { command: 'start', description: 'Start the bot' },
  ...(isProd ? [] : [{ command: 'test', description: 'Test command' }]),
]);

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

if (!isProd) {
  bot.command('test', async (ctx) => {
    await ctx.reply('This is a test command. Why did you run it?');
  });
}

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
  const actionMessage = ctx.callbackQuery.message;
  const messageWithFile = actionMessage?.reply_to_message;
  const fileId = messageWithFile?.voice?.file_id;

  if (!fileId) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  await ctx.answerCallbackQuery();

  const transcribeMessage = await ctx.reply(`Transcribing...`, {
    reply_to_message_id: messageWithFile?.message_id,
  });

  const file = await ctx.api.getFile(fileId);
  const filename = file.file_unique_id + '.ogg';
  const path = `files/${filename}`;

  try {
    await file.download(path);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      console.log('File already exists, skipping download.');
    } else {
      throw e;
    }
  }

  try {
    const text = await transcribe(path);

    const isLongform = text.length > 200;

    const tweetButton = InlineKeyboard.text('Tweet', `tweet`);
    const threadButton = InlineKeyboard.text('Thread', `thread`);

    const buttons = isLongform ? [tweetButton, threadButton] : [tweetButton];

    const keyboard = InlineKeyboard.from([buttons]);

    await ctx.api.editMessageText(
      ctx.chat?.id ?? '',
      transcribeMessage.message_id,
      text,
      {
        reply_markup: keyboard,
      }
    );

    if (!isProd) {
      await ctx.api.deleteMessage(
        ctx.chat?.id ?? '',
        actionMessage?.message_id ?? 0
      );
    }

    Deno.removeSync(path);
  } catch (e) {
    await ctx.reply('Something went wrong...');
    console.error(e);
  }
});

bot.callbackQuery('tweet', async (ctx) => {
  const messageWithText = ctx.callbackQuery.message;
  const text = messageWithText?.text;

  if (!text) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  await ctx.answerCallbackQuery();

  const tweetMessage = await ctx.reply('Converting to tweet...', {
    reply_to_message_id: messageWithText?.message_id,
  });

  const x = await writeX(text);

  if (!x) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  ctx.api.editMessageText(ctx.chat?.id ?? '', tweetMessage.message_id, x);
});

bot.callbackQuery('thread', async (ctx) => {
  const messageWithText = ctx.callbackQuery.message;
  const text = messageWithText?.text;

  if (!text) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  await ctx.answerCallbackQuery();

  const threadMessage = await ctx.reply('Converting to twitter thread...', {
    reply_to_message_id: messageWithText?.message_id,
  });

  const xThread = await writeXThread(text);

  if (!xThread) {
    return ctx.reply('Something went wrong...');
  }

  ctx.api.editMessageText(
    ctx.chat?.id ?? '',
    threadMessage.message_id,
    xThread
  );
});

bot.on('callback_query:data', async (ctx) => {
  console.log('Unknown button event with payload', ctx.callbackQuery.data);
  await ctx.answerCallbackQuery(); // remove loading animation
});

bot.catch(async (err) => {
  await console.error(err);
  err.ctx.reply('Some unhandled error occurred. Go away!');
});

Deno.addSignalListener('SIGINT', () => bot.stop());
Deno.addSignalListener('SIGTERM', () => bot.stop());

bot.start();
