import type { ChatMessage } from '../types'

export function parseChatReadSequence(value: string | null): number {
  const sequence = Number(value)
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0
}

export function countUnreadChatMessages(messages: ChatMessage[], lastReadSequence: number, participantId: string) {
  return messages.filter(message => message.type === 'message' &&
    message.sequence > lastReadSequence && message.participantId !== participantId).length
}
