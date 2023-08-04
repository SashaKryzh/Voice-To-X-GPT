import {
  ChatCompletionMessage,
  OpenAI,
} from 'https://deno.land/x/openai@1.4.2/mod.ts';

const openaiToken = Deno.env.get('OPENAI_API_KEY')!;

const openai = new OpenAI(openaiToken);

export const transcribe = async (filePath: string) => {
  const resp = await openai.createTranscription({
    file: filePath,
    model: 'whisper-1',
  });
  return resp.text;
};

export const writeX = async (text: string) => {
  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a helpful assistant to write tweets.
	You will be given a regular text of any size and form, and you will have to write a tweet based on it.
	Respond ONLY with the content of the tweet that should be posted, without any additional text.
	Use the same language as the original text.
	Begin!`,
    },
    { role: 'user', content: text },
  ];

  const resp = await openai.createChatCompletion({
    messages,
    model: 'gpt-3.5-turbo',
  });

  return resp.choices[0].message.content;
};
