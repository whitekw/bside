import type { ChatMessage } from './types'

export function shouldNotifyDesktopChat(
  message: ChatMessage,
  currentParticipantId: string,
): message is Extract<ChatMessage, { type: 'message' }> {
  return message.type === 'message'
    && Boolean(currentParticipantId)
    && message.participantId !== currentParticipantId
}
