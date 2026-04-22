const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class ChatStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.db = {
      threadsByKey: {}
    };
    this.load();
  }

  load() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }

    const raw = fs.readFileSync(this.filePath, "utf-8");
    if (!raw.trim()) {
      this.save();
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      this.db = parsed;
    }
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2), "utf-8");
  }

  getThread(userId, otherUserId) {
    const key = threadKey(userId, otherUserId);
    const thread = this.db.threadsByKey[key];
    if (!thread) {
      return {
        key,
        participants: [String(userId), String(otherUserId)].sort(),
        messages: []
      };
    }
    return thread;
  }

  sendMessage({ fromUserId, toUserId, text }) {
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      throw new Error("MESSAGE_EMPTY");
    }
    const key = threadKey(fromUserId, toUserId);
    const nowIso = new Date().toISOString();

    if (!this.db.threadsByKey[key]) {
      this.db.threadsByKey[key] = {
        key,
        participants: [String(fromUserId), String(toUserId)].sort(),
        messages: []
      };
    }

    const message = {
      id: crypto.randomUUID(),
      fromUserId: String(fromUserId),
      toUserId: String(toUserId),
      text: cleanText,
      createdAt: nowIso,
      readBy: [String(fromUserId)]
    };

    this.db.threadsByKey[key].messages.push(message);
    this.save();
    return message;
  }

  markThreadRead(userId, otherUserId) {
    const key = threadKey(userId, otherUserId);
    const thread = this.db.threadsByKey[key];
    if (!thread) return;

    const readerId = String(userId);
    for (const message of thread.messages) {
      if (!Array.isArray(message.readBy)) {
        message.readBy = [];
      }
      if (!message.readBy.includes(readerId)) {
        message.readBy.push(readerId);
      }
    }
    this.save();
  }

  getInbox(userId) {
    const uid = String(userId);
    const items = [];

    for (const thread of Object.values(this.db.threadsByKey)) {
      if (!thread.participants.includes(uid)) continue;
      const otherUserId = thread.participants.find((id) => id !== uid);
      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      const lastMessage = messages[messages.length - 1] || null;
      const unreadCount = messages.filter((message) => {
        const readBy = Array.isArray(message.readBy) ? message.readBy : [];
        return message.fromUserId !== uid && !readBy.includes(uid);
      }).length;

      items.push({
        otherUserId,
        unreadCount,
        lastMessage
      });
    }

    items.sort((a, b) => {
      const aTime = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
      const bTime = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
      return bTime - aTime;
    });
    return items;
  }
}

function threadKey(a, b) {
  return [String(a), String(b)].sort().join("|");
}

module.exports = {
  ChatStore
};
