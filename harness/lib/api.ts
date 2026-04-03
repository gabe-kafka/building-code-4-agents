import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'

const client = new Anthropic()

/**
 * Send a message to Claude, using streaming for large max_tokens to avoid timeout.
 * Returns the full text response.
 */
export async function sendMessage(
  params: MessageCreateParamsNonStreaming
): Promise<string> {
  // Use streaming to avoid 10-minute timeout on large responses
  const stream = client.messages.stream(params)
  const response = await stream.finalMessage()

  const textBlock = response.content.find((c) => c.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}
