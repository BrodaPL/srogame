import { describe, expect, it } from 'vitest';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { PlayerMessage } from '../player-message';

describe('PlayerMessage domain', () => {
  it('marks messages as read and deletes selected messages', () => {
    const player = new Player(1, 'Tester', [], new Map(), [], PlayerType.PLAYER);
    const firstMessage = new PlayerMessage({
      messageId: player.createMessageId(),
      createdTurn: 4,
      title: 'Alpha',
      body: 'First body',
      senderPlayerId: 2,
      senderPlayerName: 'Sender'
    });
    const secondMessage = new PlayerMessage({
      messageId: player.createMessageId(),
      createdTurn: 5,
      title: 'Beta',
      body: 'Second body',
      senderPlayerId: 3,
      senderPlayerName: 'Other'
    });

    player.addMessage(firstMessage);
    player.addMessage(secondMessage);

    expect(player.markMessageAsRead(firstMessage.messageId)).toBe(true);
    expect(firstMessage.isRead).toBe(true);
    expect(player.deleteMessages([secondMessage.messageId])).toBe(1);
    expect(player.messages.map((message) => message.messageId)).toEqual([firstMessage.messageId]);
  });
});
