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

const systemMessageContent = {
  tweet: `You are a helpful assistant to write tweets.
	You will be given a regular text of any size and form, and you will have to write a tweet based on it.
	Respond ONLY with the content of the tweet that should be posted, without any additional text.
	Use the same language as the original text.
	Begin!`,
  thread: `You are a helpful assistant to write twitter threads.
  You ALWAYS have to write a thread, even if the text is short with minimum 2 tweets!
	You will be given a regular text of any size and form, and you will have to write a twitter thread based on it.
	Respond ONLY with the content of the whole thread that should be posted in 1 message, without any additional text.
  Separate each tweet in the thread with "---".
	Use the same language as the original text.
	Begin!`,
} as const;

export const writeX = async (text: string) => {
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemMessageContent.tweet },
    { role: 'user', content: text },
  ];

  const resp = await openai.createChatCompletion({
    messages,
    model: gptModel,
  });

  return resp.choices[0].message.content;
};

export const writeXThread = async (text: string) => {
  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: systemMessageContent.thread },
    { role: 'user', content: text },
  ];

  const resp = await openai.createChatCompletion({
    messages,
    model: gptModel,
  });

  return resp.choices[0].message.content;
};

//#endregion
