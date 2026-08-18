// db.js — MongoDB persistence layer for the inbox feature.
// Designed to fail gracefully: if MONGODB_URI isn't set or the connection
// isn't ready, every function here becomes a safe no-op instead of crashing
// the server. This means anonymous live chat keeps working even without a
// database configured.

const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  contactId: { type: String, required: true },
  contactName: { type: String, default: 'Stranger' },
  createdAt: { type: Date, default: Date.now },
});
contactSchema.index({ ownerId: 1, contactId: 1 }, { unique: true });

const messageSchema = new mongoose.Schema({
  fromId: { type: String, required: true, index: true },
  toId: { type: String, required: true, index: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
});

const Contact = mongoose.model('Contact', contactSchema);
const Message = mongoose.model('Message', messageSchema);

function isReady() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('MONGODB_URI not set — inbox/contacts feature disabled, anonymous chat still works.');
    return;
  }
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB — inbox feature enabled.');
  } catch (err) {
    console.error('MongoDB connection failed — inbox feature disabled. Reason:', err.message);
  }
}

// ---- Contacts ----
async function saveContactPair(idA, nameA, idB, nameB) {
  if (!isReady()) return false;
  try {
    await Contact.updateOne(
      { ownerId: idA, contactId: idB },
      { $set: { contactName: nameB } },
      { upsert: true }
    );
    await Contact.updateOne(
      { ownerId: idB, contactId: idA },
      { $set: { contactName: nameA } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    console.error('saveContactPair failed:', err.message);
    return false;
  }
}

async function getContacts(ownerId) {
  if (!isReady()) return [];
  try {
    const contacts = await Contact.find({ ownerId }).lean();
    const results = [];
    for (const c of contacts) {
      const unreadCount = await Message.countDocuments({
        fromId: c.contactId,
        toId: ownerId,
        read: false,
      });
      const lastMsg = await Message.findOne({
        $or: [
          { fromId: ownerId, toId: c.contactId },
          { fromId: c.contactId, toId: ownerId },
        ],
      }).sort({ createdAt: -1 }).lean();
      results.push({
        contactId: c.contactId,
        name: c.contactName,
        unreadCount,
        lastMessage: lastMsg ? lastMsg.text : null,
        lastAt: lastMsg ? lastMsg.createdAt : c.createdAt,
      });
    }
    results.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    return results;
  } catch (err) {
    console.error('getContacts failed:', err.message);
    return [];
  }
}

// ---- Messages ----
async function saveMessage(fromId, toId, text) {
  if (!isReady()) return null;
  try {
    const msg = await Message.create({ fromId, toId, text });
    return msg;
  } catch (err) {
    console.error('saveMessage failed:', err.message);
    return null;
  }
}

async function getThread(userA, userB) {
  if (!isReady()) return [];
  try {
    const messages = await Message.find({
      $or: [
        { fromId: userA, toId: userB },
        { fromId: userB, toId: userA },
      ],
    }).sort({ createdAt: 1 }).lean();
    return messages;
  } catch (err) {
    console.error('getThread failed:', err.message);
    return [];
  }
}

async function markThreadRead(fromId, toId) {
  if (!isReady()) return;
  try {
    await Message.updateMany({ fromId, toId, read: false }, { $set: { read: true } });
  } catch (err) {
    console.error('markThreadRead failed:', err.message);
  }
}

module.exports = {
  connect,
  isReady,
  saveContactPair,
  getContacts,
  saveMessage,
  getThread,
  markThreadRead,
};
