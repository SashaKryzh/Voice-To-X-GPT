import { InlineKeyboard } from 'https://deno.land/x/grammy@v1.17.2/mod.ts';
import { MyContext } from './bot.ts';
import { prisma } from './database.ts';

export const tweetButton = InlineKeyboard.text('Tweet 📄', 'tweet');
export const threadButton = InlineKeyboard.text('Thread 📘', 'thread');

export const isLongForm = (text: string) => text.length > 150;

export const zwnj = '\u200C';

export const downloadFile = async (ctx: MyContext, fileId: string) => {
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

  return path;
};

export const accessMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
) => {
  const from = ctx.from;

  if (!from) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: from.id } });

  if (!user?.hasAccess) {
    ctx.callbackQuery && ctx.answerCallbackQuery();
    return ctx.reply(
      'You are not authorized to use this bot.\nIf you want to receive it, please use /requestaccess command'
    );
  }

  await next();
};
