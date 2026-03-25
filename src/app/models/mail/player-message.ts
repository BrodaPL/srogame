export type PlayerMessageData = {
  messageId: number;
  createdTurn: number;
  title: string;
  body: string;
  isRead?: boolean;
  senderPlayerId?: number | null;
  senderPlayerName?: string | null;
};

export class PlayerMessage {
  public messageId: number;
  public createdTurn: number;
  public title: string;
  public body: string;
  public isRead: boolean;
  public senderPlayerId: number | null;
  public senderPlayerName: string | null;

  constructor(data: PlayerMessageData) {
    this.messageId = data.messageId;
    this.createdTurn = data.createdTurn;
    this.title = data.title;
    this.body = data.body;
    this.isRead = data.isRead ?? false;
    this.senderPlayerId = data.senderPlayerId ?? null;
    this.senderPlayerName = data.senderPlayerName ?? null;
  }

  public markAsRead(): void {
    this.isRead = true;
  }

  public copy(): PlayerMessage {
    return new PlayerMessage({
      messageId: this.messageId,
      createdTurn: this.createdTurn,
      title: this.title,
      body: this.body,
      isRead: this.isRead,
      senderPlayerId: this.senderPlayerId,
      senderPlayerName: this.senderPlayerName
    });
  }
}
