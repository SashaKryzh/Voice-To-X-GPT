import { MyContext } from './bot.ts';

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
