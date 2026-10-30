import assert from 'node:assert/strict'
import test from 'node:test'
import { countUnreadChatMessages, parseChatReadSequence } from '../src/features/room/chat/chatReadState.ts'

const messages = [
  { id: '1', type: 'message', participantId: 'friend', sequence: 1 },
  { id: '2', type: 'message', participantId: 'self', sequence: 2 },
  { id: '3', type: 'system', sequence: 3 },
  { id: '4', type: 'message', participantId: 'friend', sequence: 4 },
]

test('counts other participants unread messages even before the first chat opening', () => {
  assert.equal(countUnreadChatMessages(messages, 0, 'self'), 2)
  assert.equal(countUnreadChatMessages(messages, 1, 'self'), 1)
  assert.equal(countUnreadChatMessages(messages, 4, 'self'), 0)
})

test('new messages are unread after a saved read position; own messages and logs never count', () => {
  const incoming = [...messages,
    { id: '5', type: 'message', participantId: 'self', sequence: 5 },
    { id: '6', type: 'system', sequence: 6 },
    { id: '7', type: 'message', participantId: 'friend', sequence: 7 },
  ]
  assert.equal(countUnreadChatMessages(incoming, parseChatReadSequence('4'), 'self'), 1)
  assert.equal(countUnreadChatMessages(incoming, 7, 'self'), 0)
  assert.equal(countUnreadChatMessages([], 7, 'self'), 0)
})

test('restores a read position safely when storage is empty or malformed', () => {
  assert.equal(parseChatReadSequence('42'), 42)
  for (const value of [null, '', '-1', '1.5', 'bad', 'Infinity', '9007199254740992']) {
    assert.equal(parseChatReadSequence(value), 0)
  }
})
