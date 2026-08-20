(() => {
  const screens = {
    landing: document.getElementById('landing'),
    searching: document.getElementById('searching'),
    chat: document.getElementById('chat'),
    inbox: document.getElementById('inbox'),
    thread: document.getElementById('thread'),
  };

  const nameInput = document.getElementById('wlHandleInput');
  const startBtn = document.getElementById('startBtn');
  const codeInput = document.getElementById('wlJoinCodeInput');
  const codeBtn = document.getElementById('codeBtn');
  const cancelSearchBtn = document.getElementById('cancelSearchBtn');
  const skipBtn = document.getElementById('skipBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const friendBtn = document.getElementById('friendBtn');
  const chatLog = document.getElementById('chatLog');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatWithLabel = document.getElementById('chatWithLabel');
  const typingIndicator = document.getElementById('typingIndicator');
  const leftToast = document.getElementById('leftToast');
  const toastFindBtn = document.getElementById('toastFindBtn');
  const dialFreq = document.getElementById('dialFreq');
  const onlineCount = document.getElementById('onlineCount');
  const scanLabel = document.getElementById('scanLabel');
  const scanSub = document.getElementById('scanSub');
  const contactsSection = document.getElementById('contactsSection');
  const contactsList = document.getElementById('contactsList');
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPanel = document.getElementById('emojiPanel');
  const friendRequestToast = document.getElementById('friendRequestToast');
  const friendRequestText = document.getElementById('friendRequestText');
  const friendAcceptBtn = document.getElementById('friendAcceptBtn');
  const friendDeclineBtn = document.getElementById('friendDeclineBtn');
  const friendCodeToast = document.getElementById('friendCodeToast');
  const friendCodeText = document.getElementById('friendCodeText');

  const inboxBtn = document.getElementById('inboxBtn');
  const inboxBadge = document.getElementById('inboxBadge');
  const inboxBackBtn = document.getElementById('inboxBackBtn');
  const inboxList = document.getElementById('inboxList');
  const inboxEmpty = document.getElementById('inboxEmpty');
  const threadBackBtn = document.getElementById('threadBackBtn');
  const threadWithLabel = document.getElementById('threadWithLabel');
  const threadAvatar = document.getElementById('threadAvatar');
  const threadLog = document.getElementById('threadLog');
  const threadForm = document.getElementById('threadForm');
  const threadInput = document.getElementById('threadInput');

  let ws = null;
  let typingTimeout = null;
  let remoteTypingTimeout = null;
  let currentStrangerName = 'Stranger';
  let pendingConnectByCode = false;
  let chatHistoryPushed = false;
  let reconnectAttempts = 0;
  let userInitiatedClose = false;
  let currentThreadContactId = null;
  let latestContacts = [];

  // ---------- Persistent device identity (for the inbox feature only) ----------
  const DEVICE_ID_KEY = 'wavelength_device_id';

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).slice(2) + Date.now());
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
  const myDeviceId = getDeviceId();

  // ---------- Contacts (legacy quick-reconnect codes, stored locally) ----------
  const CONTACTS_KEY = 'wavelength_contacts';

  function getLocalContacts() {
    try {
      return JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalContact(code, name) {
    const contacts = getLocalContacts().filter((c) => c.code !== code);
    contacts.unshift({ code, name: name || 'Stranger', addedAt: Date.now() });
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts.slice(0, 30)));
    renderLocalContacts();
  }

  function removeLocalContact(code) {
    const contacts = getLocalContacts().filter((c) => c.code !== code);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    renderLocalContacts();
  }

  function renderLocalContacts() {
    const contacts = getLocalContacts();
    if (contacts.length === 0) {
      contactsSection.classList.add('hidden');
      return;
    }
    contactsSection.classList.remove('hidden');
    contactsList.innerHTML = '';
    contacts.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'contact-row';
      row.innerHTML = `
        <span class="contact-name">${escapeHtml(c.name)}</span>
        <div class="contact-actions">
          <button class="btn-chip contact-connect" data-code="${c.code}">Connect</button>
          <button class="btn-chip btn-chip--muted contact-remove" data-code="${c.code}">✕</button>
        </div>`;
      contactsList.appendChild(row);
    });

    contactsList.querySelectorAll('.contact-connect').forEach((btn) => {
      btn.addEventListener('click', () => {
        codeInput.value = btn.dataset.code;
        codeBtn.click();
      });
    });
    contactsList.querySelectorAll('.contact-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeLocalContact(btn.dataset.code));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Avatar + timestamp helpers (for the WhatsApp-style Inbox) ----------
  const AVATAR_COLORS = ['#00a884', '#6b5ce7', '#e17055', '#0984e3', '#d63384', '#e8830f', '#20b2aa', '#8e44ad'];

  function avatarColorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function avatarInitial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function formatInboxTime(dateInput) {
    const date = new Date(dateInput);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (isYesterday) return 'Yesterday';
    const daysAgo = Math.floor((now - date) / 86400000);
    if (daysAgo < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function formatBubbleTime(dateInput) {
    return new Date(dateInput).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  renderLocalContacts();

  // ---------- Screen switching ----------
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  function randomFreq() {
    return (Math.random() * (108 - 88) + 88).toFixed(1);
  }
  setInterval(() => { dialFreq.textContent = randomFreq(); }, 900);

  // ---------- Back button confirmation (mobile & desktop) ----------
  function pushChatHistoryState() {
    if (!chatHistoryPushed) {
      history.pushState({ screen: 'chat' }, '', location.href);
      chatHistoryPushed = true;
    }
  }

  window.addEventListener('popstate', () => {
    if (!screens.chat.classList.contains('hidden')) {
      const reallyLeave = confirm('Leave this chat and go back to the main screen?');
      if (reallyLeave) {
        chatHistoryPushed = false;
        exitChatToLanding();
      } else {
        pushChatHistoryState();
      }
    }
  });

  function exitChatToLanding() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave' }));
    }
    emojiPanel.classList.add('hidden');
    showScreen('landing');
    refreshInboxBadge();
  }

  // ---------- Sound + browser notification ----------
  let audioCtx = null;
  function playBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // audio not available — silently skip
    }
  }

  function notifyMatch(strangerName) {
    playBeep();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('Wavelength', { body: `Connected to ${strangerName}` });
    }
  }

  function notifyInboxMessage(name) {
    playBeep();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('Wavelength', { body: `New message from ${name}` });
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  // ---------- WebSocket (single persistent connection for the whole app) ----------
  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      ws.send(JSON.stringify({ type: 'identify', deviceId: myDeviceId }));
      const name = nameInput.value.trim();
      if (name) ws.send(JSON.stringify({ type: 'set_name', name }));
      refreshInboxBadge();

      if (pendingConnectByCode) {
        ws.send(JSON.stringify({ type: 'connect_code', code: pendingConnectByCode }));
        pendingConnectByCode = false;
      }
    });

    ws.addEventListener('message', (event) => {
      handleServerMessage(JSON.parse(event.data));
    });

    ws.addEventListener('close', () => {
      if (userInitiatedClose) {
        userInitiatedClose = false;
        return;
      }
      attemptReconnect();
    });
  }

  function attemptReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(1000 * reconnectAttempts, 5000);
    setTimeout(connectSocket, delay);
  }

  function sendWs(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'online_count':
        onlineCount.textContent = `${msg.count} ${msg.count === 1 ? 'person' : 'people'} online now`;
        break;

      case 'waiting':
        scanLabel.innerHTML = 'Scanning frequencies<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
        scanSub.textContent = 'Looking for someone else tuned in right now';
        showScreen('searching');
        break;

      case 'waiting_code':
        scanLabel.textContent = 'Waiting for your contact…';
        scanSub.textContent = `Share code ${msg.code} with them, or wait — they may already have it`;
        showScreen('searching');
        break;

      case 'matched':
        currentStrangerName = msg.strangerName || 'Stranger';
        chatLog.innerHTML = '';
        chatWithLabel.textContent = `Connected to ${currentStrangerName}`;
        showScreen('chat');
        pushChatHistoryState();
        addSystemBubble("You're connected. Say hi 👋");
        leftToast.classList.add('hidden');
        notifyMatch(currentStrangerName);
        chatInput.focus();
        break;

      case 'chat_message':
        addBubble(chatLog, msg.text, 'stranger');
        hideTyping();
        break;

      case 'typing':
        showTyping();
        break;

      case 'stranger_left':
        leftToast.classList.remove('hidden');
        addSystemBubble('The stranger disconnected.');
        break;

      case 'friend_request_received':
        friendRequestText.textContent = `${msg.fromName} wants to save each other as contacts`;
        friendRequestToast.classList.remove('hidden');
        break;

      case 'friend_response':
        if (!msg.accepted) addSystemBubble('They declined the contact request.');
        break;

      case 'friend_code':
        saveLocalContact(msg.code, msg.strangerName);
        friendCodeText.textContent = `Saved! You can now message ${msg.strangerName} anytime from your Inbox.`;
        friendCodeToast.classList.remove('hidden');
        addSystemBubble(`Saved as a contact. Message them anytime from your Inbox — no need to reconnect.`);
        setTimeout(() => friendCodeToast.classList.add('hidden'), 6000);
        break;

      // ---- Inbox events ----
      case 'contacts_list':
        latestContacts = msg.contacts || [];
        renderInboxList();
        updateInboxBadge();
        break;

      case 'thread_history':
        if (msg.contactId === currentThreadContactId) {
          threadLog.innerHTML = '';
          msg.messages.forEach((m) => {
            addThreadBubble(m.text, m.fromId === myDeviceId ? 'me' : 'them', m.createdAt, m._id || m.id);
          });
          if (msg.messages.some((m) => m.fromId === myDeviceId)) markThreadBubblesRead();
        }
        break;

      case 'inbox_message': {
        const isForMe = msg.toId === myDeviceId;
        const isFromMe = msg.fromId === myDeviceId;
        const otherPartyId = isFromMe ? msg.toId : msg.fromId;

        if (!screens.thread.classList.contains('hidden') && currentThreadContactId === otherPartyId) {
          hideThreadTyping();
          addThreadBubble(msg.text, isFromMe ? 'me' : 'them', msg.createdAt, msg.id);
        } else if (isForMe) {
          const contact = latestContacts.find((c) => c.contactId === otherPartyId);
          notifyInboxMessage(contact ? contact.name : 'a contact');
        }
        sendWs('get_contacts'); // refresh unread counts / previews
        break;
      }

      case 'inbox_typing':
        if (!screens.thread.classList.contains('hidden') && currentThreadContactId === msg.fromId) {
          showThreadTyping();
        }
        break;

      case 'read_receipt':
        if (!screens.thread.classList.contains('hidden') && currentThreadContactId === msg.byId) {
          markThreadBubblesRead();
        }
        break;
    }
  }

  function addBubble(logEl, text, who) {
    const div = document.createElement('div');
    div.className = `bubble bubble--${who}`;

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    div.innerHTML = escapeHtml(text).replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // WhatsApp-style bubble for the Inbox/Thread screen (includes timestamp + read ticks).
  function addThreadBubble(text, who, timestamp, msgId) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const linked = escapeHtml(text).replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    const row = document.createElement('div');
    row.className = `wa-bubble-row wa-bubble-row--${who === 'me' ? 'me' : 'them'}`;

    const bubble = document.createElement('div');
    bubble.className = `wa-bubble wa-bubble--${who === 'me' ? 'me' : 'them'}`;
    if (msgId) bubble.dataset.msgId = msgId;

    const tickHtml = who === 'me' ? '<span class="wa-tick">✓</span>' : '';
    bubble.innerHTML = `<span class="wa-bubble__text">${linked}</span><span class="wa-bubble__time">${formatBubbleTime(timestamp || Date.now())}${tickHtml}</span>`;

    row.appendChild(bubble);
    threadLog.appendChild(row);
    threadLog.scrollTop = threadLog.scrollHeight;
  }

  function markThreadBubblesRead() {
    threadLog.querySelectorAll('.wa-bubble--me .wa-tick').forEach((tick) => {
      tick.textContent = '✓✓';
      tick.classList.add('wa-tick--read');
    });
  }

  // ---------- Inbox typing indicator ----------
  let threadTypingRow = null;
  let threadTypingHideTimeout = null;

  function showThreadTyping() {
    if (!threadTypingRow) {
      threadTypingRow = document.createElement('div');
      threadTypingRow.className = 'wa-typing-row';
      threadTypingRow.innerHTML = '<div class="wa-typing-bubble"><span></span><span></span><span></span></div>';
      threadLog.appendChild(threadTypingRow);
      threadLog.scrollTop = threadLog.scrollHeight;
    }
    clearTimeout(threadTypingHideTimeout);
    threadTypingHideTimeout = setTimeout(hideThreadTyping, 2500);
  }

  function hideThreadTyping() {
    if (threadTypingRow) {
      threadTypingRow.remove();
      threadTypingRow = null;
    }
  }

  function addSystemBubble(text) {
    const div = document.createElement('div');
    div.className = 'bubble bubble--system';
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function showTyping() {
    typingIndicator.classList.remove('hidden');
    clearTimeout(remoteTypingTimeout);
    remoteTypingTimeout = setTimeout(hideTyping, 2000);
  }
  function hideTyping() {
    typingIndicator.classList.add('hidden');
  }

  // ---------- Inbox rendering ----------
  function updateInboxBadge() {
    const totalUnread = latestContacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    if (totalUnread > 0) {
      inboxBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      inboxBadge.classList.remove('hidden');
    } else {
      inboxBadge.classList.add('hidden');
    }
  }

  function refreshInboxBadge() {
    sendWs('get_contacts');
  }

  function renderInboxList() {
    inboxList.querySelectorAll('.inbox-row').forEach((el) => el.remove());
    if (latestContacts.length === 0) {
      inboxEmpty.classList.remove('hidden');
      return;
    }
    inboxEmpty.classList.add('hidden');

    latestContacts.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'inbox-row';
      const unread = c.unreadCount > 0;
      row.innerHTML = `
        <span class="inbox-row__avatar" style="background:${avatarColorFor(c.name)}">${escapeHtml(avatarInitial(c.name))}</span>
        <div class="inbox-row__main">
          <div class="inbox-row__top">
            <span class="inbox-row__name">${escapeHtml(c.name)}</span>
            <span class="inbox-row__time${unread ? ' inbox-row__time--unread' : ''}">${formatInboxTime(c.lastAt)}</span>
          </div>
          <div class="inbox-row__bottom">
            <span class="inbox-row__preview">${c.lastMessage ? escapeHtml(c.lastMessage) : 'Say hi…'}</span>
            ${unread ? `<span class="inbox-row__badge">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : ''}
          </div>
        </div>
      `;
      row.addEventListener('click', () => openThread(c.contactId, c.name));
      inboxList.appendChild(row);
    });
  }

  function openThread(contactId, name) {
    currentThreadContactId = contactId;
    threadWithLabel.textContent = name;
    threadAvatar.textContent = avatarInitial(name);
    threadAvatar.style.background = avatarColorFor(name);
    threadLog.innerHTML = '';
    threadTypingRow = null;
    showScreen('thread');
    sendWs('open_thread', { contactId });
    threadInput.focus();
  }

  // ---------- Landing actions ----------
  startBtn.addEventListener('click', () => {
    requestNotificationPermission();
    pendingConnectByCode = false;
    showScreen('searching');
    scanLabel.innerHTML = 'Scanning frequencies<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    scanSub.textContent = 'Looking for someone else tuned in right now';
    sendWs('find');
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
  });
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    if (name) sendWs('set_name', { name });
  });

  codeBtn.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    requestNotificationPermission();
    showScreen('searching');
    sendWs('connect_code', { code });
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') codeBtn.click();
  });

  // ---------- Searching actions ----------
  cancelSearchBtn.addEventListener('click', () => {
    sendWs('leave');
    pendingConnectByCode = false;
    showScreen('landing');
  });

  // ---------- Chat actions (live random/paired chat) ----------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    sendWs('chat_message', { text });
    addBubble(chatLog, text, 'me');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    emojiPanel.classList.add('hidden');
  });

  chatInput.addEventListener('input', () => {
    sendWs('typing');
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatInput.addEventListener('focus', () => {
    setTimeout(() => {
      chatInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 200);
  });

  skipBtn.addEventListener('click', () => {
    leftToast.classList.add('hidden');
    emojiPanel.classList.add('hidden');
    sendWs('skip');
    showScreen('searching');
    scanLabel.innerHTML = 'Scanning frequencies<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    scanSub.textContent = 'Looking for someone else tuned in right now';
  });

  leaveBtn.addEventListener('click', () => {
    chatHistoryPushed = false;
    exitChatToLanding();
  });

  toastFindBtn.addEventListener('click', () => {
    leftToast.classList.add('hidden');
    sendWs('find');
    showScreen('searching');
  });

  // ---------- Friend requests ----------
  friendBtn.addEventListener('click', () => {
    sendWs('friend_request');
    addSystemBubble('Contact request sent.');
  });

  friendAcceptBtn.addEventListener('click', () => {
    friendRequestToast.classList.add('hidden');
    sendWs('friend_response', { accepted: true });
  });

  friendDeclineBtn.addEventListener('click', () => {
    friendRequestToast.classList.add('hidden');
    sendWs('friend_response', { accepted: false });
  });

  // ---------- Inbox / Thread navigation ----------
  inboxBtn.addEventListener('click', () => {
    showScreen('inbox');
    sendWs('get_contacts');
  });

  inboxBackBtn.addEventListener('click', () => {
    showScreen('landing');
  });

  threadBackBtn.addEventListener('click', () => {
    currentThreadContactId = null;
    showScreen('inbox');
    sendWs('get_contacts');
  });

  let threadTypingSendTimeout = null;
  threadInput.addEventListener('input', () => {
    if (!currentThreadContactId) return;
    if (threadTypingSendTimeout) return; // throttle to once per ~1.2s
    sendWs('inbox_typing', { toDeviceId: currentThreadContactId });
    threadTypingSendTimeout = setTimeout(() => { threadTypingSendTimeout = null; }, 1200);
  });

  threadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = threadInput.value.trim();
    if (!text || !currentThreadContactId) return;
    sendWs('send_inbox_message', { toDeviceId: currentThreadContactId, text });
    threadInput.value = '';
  });

  // ---------- Emoji picker ----------
  const EMOJIS = ['😀','😂','😅','😉','😊','😍','😘','😜','🤔','😎','😢','😭','😡','👍','👎','🙏','👋','🎉','❤️','🔥','✨','💀','🤝','😴'];

  function buildEmojiPanel() {
    emojiPanel.innerHTML = '';
    EMOJIS.forEach((e) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-item';
      btn.textContent = e;
      btn.addEventListener('click', () => {
        chatInput.value += e;
        chatInput.focus();
      });
      emojiPanel.appendChild(btn);
    });
  }
  buildEmojiPanel();

  emojiBtn.addEventListener('click', () => {
    emojiPanel.classList.toggle('hidden');
  });

  // ---------- Real visible viewport height (fixes Android keyboard overlay gap) ----------
  function setAppHeight() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  }
  setAppHeight();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
  }
  window.addEventListener('resize', setAppHeight);

  // ---------- Boot ----------
  connectSocket();
})();
