import {
  ChatCompletionMessage,
  OpenAI,
} from 'https://deno.land/x/openai@1.4.2/mod.ts';

const token = Deno.env.get('OPENAI_API_KEY')!;
const openai = new OpenAI(token);

const whisperModel = 'whisper-1';
const gptModel = 'gpt-3.5-turbo';

//#region Transcription

export const transcribe = async (filePath: string) => {
  const resp = await openai.createTranscription({
    file: filePath,
    model: whisperModel,
  });

  return resp.text;
};

//#endregion

//#region Writing tweets and threads.

export const writeX = async (text: string) => {
  const system = `You are a professional content creator that helps people generate tweets.
  You will be given a regular text and have to write a tweet based on it.
  You MUST respond ONLY with the tweet content that should be posted. Don't add additional information to your response.
  Write tweets in the same language as the original text. But if you add tags, ONLY they should be in English.
  Begin!`;

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ];

  const resp = await openai.createChatCompletion({
    messages,
    model: gptModel,
  });

  return resp.choices[0].message.content;
};

export const writeXThread = async (text: string) => {
  const system = `You are a professional content creator that helps people generate Twitter threads.
  You will be given a regular text, and have to write a Twitter thread based on it.
  You ALWAYS must write a thread with two or more tweets and a summary at the beginning.
  Before writing, identify the language used in a text and write in the same language.
  You MUST respond ONLY with the thread content that should be posted. Don't add additional information to your response.
  Begin!`;

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ];

  const resp = await openai.createChatCompletion({
    messages,
    model: gptModel,
  });

  return resp.choices[0].message.content;
};

//#endregion
