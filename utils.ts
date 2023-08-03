import { ffmpeg } from 'https://deno.land/x/deno_ffmpeg@v3.1.0/mod.ts';

export const convertOggToMp3 = async (filePath: string) => {
  const outputFilePath = filePath.replace(/(\.ogg|\.oga)$/, '.mp3');

  const converter = ffmpeg({
    input: filePath,
    // TODO: How to get this dynamically?
    ffmpegDir: '/opt/homebrew/bin/ffmpeg',
  });
  await converter.save(outputFilePath);

  Deno.removeSync(filePath);

  return outputFilePath;
};
