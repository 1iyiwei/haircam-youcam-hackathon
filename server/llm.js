// Minimal OpenAI Chat Completions client with tool calling.
const MODEL = () => process.env.OPENAI_MODEL || 'gpt-5.4-mini';

export async function chat(messages, tools) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      // Tool calls with reasoning need the Responses API; a chat stylist doesn't need it.
      reasoning_effort: 'none',
      parallel_tool_calls: false,
      messages,
      tools,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI: ${json.error?.message || res.status}`);
  return json.choices[0].message;
}
