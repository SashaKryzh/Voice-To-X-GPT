import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import {
  Api,
  Bot,
  CallbackQueryContext,
  Context,
  InlineKeyboard,
} from 'https://deno.land/x/grammy@v1.17.2/mod.ts';
import { Message } from 'https://deno.land/x/grammy@v1.17.2/types.deno.ts';
import {
  FileApiFlavor,
  FileFlavor,
  hydrateFiles,
} from 'https://deno.land/x/grammy_files@v1.0.4/mod.ts';
import { autoRetry } from 'https://esm.sh/@grammyjs/auto-retry@1.1.1';
import { prisma } from './database.ts';
import { transcribe, writeX, writeXThread } from './openai_calls.ts';
import {
  accessMiddleware,
  downloadFile,
  isLongForm,
  threadButton,
  tweetButton,
  zwnj,
} from './utils.ts';

export const isDev = Deno.env.get('NODE_ENV') === 'development';

export type MyContext = FileFlavor<Context>;
export type MyApi = FileApiFlavor<Api>;

const token = Deno.env.get('BOT_TOKEN')!;
const bot = new Bot<MyContext, MyApi>(token);

bot.api.config.use(hydrateFiles(bot.token));
bot.api.config.use(autoRetry());

const botDescription =
  'Telegram bot that converts voice messages to text, and text to Twitter tweets or threads.';
bot.api.setMyDescription(botDescription);
bot.api.setMyShortDescription(botDescription);

//#region Commands

bot.api.setMyCommands([
  { command: 'help', description: 'Show help message' },
  ...(isDev ? [{ command: 'test', description: 'Test command' }] : []),
]);

bot.command('start', async (ctx) => {
  const message = `Hi 👋
  
I'm VoiceToX bot, and I can help you generate tweets and threads from your messages\\.

Now send me a *text* or *voice* message\\.`;
  await ctx.reply(message, { parse_mode: 'MarkdownV2' });
});

bot.command('help', (ctx) =>
  ctx.reply(
    `My name is VoiceToX bot 🤖

I can help you transcribe voice messages and generate tweets and threads from text\\.

I generate threads only from messages that are longer than 150 characters\\.

\\[[GitHub repository](https://github.com/SashaKryzh/tg-voice-gpt)\\]

Please send me a *text* or *voice* message\\.`,
    {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }
  )
);

bot.command('requestaccess', async (ctx) => {
  const from = ctx.from;

  if (!from) {
    return ctx.reply('Something went wrong...');
  }

  const dbUser = await prisma.user.findUnique({ where: { id: from.id } });

  if (dbUser?.hasAccess) {
    return ctx.reply('You already have access. Enjoy!');
  }

  if (!dbUser) {
    const name = `${from.first_name} ${from.last_name ?? ''}`.trim();

    await prisma.user.upsert({
      where: { id: from.id },
      update: {},
      create: { id: from.id, username: from.username, name: name },
    });
  }

  await ctx.reply(
    "Your request has been sent. Wait.\n\nAlso, notify @SashaKryzh to review it if you haven't done it yet."
  );
});

if (isDev) {
  bot.command('test', async (ctx) => {
    await ctx.reply('This is a test command. Why did you run it?');
  });
}

//#endregion

//#region Messages

bot.on('message:text', accessMiddleware, async (ctx) => {
  const keyboard = InlineKeyboard.from([
    [tweetButton, ...(isLongForm(ctx.message.text) ? [threadButton] : [])],
  ]);

  await ctx.reply('What do you want me to do?' + zwnj, {
    reply_to_message_id: ctx.message.message_id,
    reply_markup: keyboard,
  });
});

bot.on('message:voice', accessMiddleware, async (ctx) => {
  const transcribeButton = InlineKeyboard.text('Transcribe ✍️', `transcribe`);

  const keyboard = InlineKeyboard.from([[transcribeButton]]);

  await ctx.reply(
    `Got a voice message! I will process it if you use the button below.`,
    {
      reply_to_message_id: ctx.message.message_id,
      reply_markup: keyboard,
    }
  );
});

bot.on('message', async (ctx) => {
  await ctx.reply("I don't understand 🤡\nSend me a text or voice message 🗣️");
});

//#endregion

//#region Callbacks

bot.callbackQuery('transcribe', accessMiddleware, async (ctx) => {
  const callbackMessage = ctx.callbackQuery.message;
  const messageWithFile = callbackMessage?.reply_to_message;
  const fileId = messageWithFile?.voice?.file_id;

  if (!fileId) {
    return ctx.answerCallbackQuery({
      text: 'Something went wrong... Try sending file again.',
    });
  }

  await ctx.answerCallbackQuery();

  const transcribedMessage = await ctx.reply(`Transcribing...`, {
    reply_to_message_id: messageWithFile?.message_id,
  });

  let text = '';
  try {
    const path = await downloadFile(ctx, fileId);
    text = await transcribe(path);
    Deno.removeSync(path);
  } catch (e) {
    await ctx.reply('Something went wrong...');
    console.error(e);
    return;
  }

  const keyboard = InlineKeyboard.from([
    [tweetButton, ...(isLongForm(text) ? [threadButton] : [])],
  ]);
  const chatId = ctx.chat?.id ?? '';

  await ctx.api.editMessageText(chatId, transcribedMessage.message_id, text, {
    reply_markup: keyboard,
  });

  if (!isDev) {
    await ctx.api.deleteMessage(chatId, callbackMessage?.message_id ?? 0);
  }
});

bot.callbackQuery('tweet', accessMiddleware, (ctx) =>
  genXCallbackHandler(ctx, 'tweet')
);

bot.callbackQuery('thread', accessMiddleware, (ctx) =>
  genXCallbackHandler(ctx, 'thread')
);

const genXCallbackHandler = async (
  ctx: CallbackQueryContext<MyContext>,
  type: 'tweet' | 'thread'
) => {
  const callbackMessage = ctx.callbackQuery.message;
  if (!callbackMessage) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }
  let messageWithText: Message | undefined;
  if (callbackMessage.text?.endsWith(zwnj)) {
    messageWithText = callbackMessage.reply_to_message;
  } else {
    messageWithText = callbackMessage;
  }

  const text = messageWithText?.text;

  if (!text) {
    return ctx.answerCallbackQuery({ text: 'Something went wrong...' });
  }

  await ctx.answerCallbackQuery();

  const xMessage = await ctx.reply(`Generating ${type}...`, {
    reply_to_message_id: messageWithText?.message_id,
  });

  const x = await (type === 'tweet' ? writeX(text) : writeXThread(text));

  return ctx.api.editMessageText(
    ctx.chat?.id ?? '',
    xMessage.message_id,
    x ?? 'Something went wrong...'
  );
};

//#endregion

bot.on('callback_query:data', async (ctx) => {
  console.log('Unknown button event with payload', ctx.callbackQuery.data);
  await ctx.answerCallbackQuery();
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error('Error while handling update ', ctx.update.update_id);
  console.error(err.error);
  ctx.reply('Some unhandled error occurred. Go away!');
});

Deno.addSignalListener('SIGINT', () => bot.stop());
Deno.addSignalListener('SIGTERM', () => bot.stop());

bot.start();
