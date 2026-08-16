(() => {
  function generateUserId() {
  return 'WVL_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function generateUserTag() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tag = '';
  for (let i = 0; i < 4; i++) {
    tag += chars[Math.floor(Math.random() * chars.length)];
  }
  return tag;
}

let userId = localStorage.getItem('userId');
let userTag = localStorage.getItem('userTag');

if (!userId) {
  userId = generateUserId();
  localStorage.setItem('userId', userId);
}

if (!userTag) {
  userTag = generateUserTag();
  localStorage.setItem('userTag', userTag);
}
  const screens = {
    landing: document.getElementById('landing'),
    searching: document.getElementById('searching'),
    chat: document.getElementById('chat'),
  };

  const nameInput = document.getElementById('nameInput');
  const startBtn = document.getElementById('startBtn');
  const codeInput = document.getElementById('codeInput');
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
  const userTagDisplay = document.getElementById('userTagDisplay');

  let ws = null;
  let typingTimeout = null;
  let remoteTypingTimeout = null;
  let currentStrangerName = 'Stranger';
  let pendingConnectByCode = false;
  let chatHistoryPushed = false;
  let reconnectAttempts = 0;
  let userInitiatedClose = false;

  // ---------- Contacts (stored only in this browser's localStorage) ----------
  const CONTACTS_KEY = 'wavelength_contacts';

  function getContacts() {
    try {
      return JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveContact(code, name) {
    const contacts = getContacts().filter((c) => c.code !== code);
    contacts.unshift({ code, name: name || 'Stranger', addedAt: Date.now() });
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts.slice(0, 30)));
    renderContacts();
  }

  function removeContact(code) {
    const contacts = getContacts().filter((c) => c.code !== code);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    renderContacts();
  }

  function renderContacts() {
    const contacts = getContacts();
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
      btn.addEventListener('click', () => removeContact(btn.dataset.code));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renderContacts();
  userTagDisplay.textContent = `Your tag: #${userTag}`;

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
        // user said no — re-trap the back button for next time
        pushChatHistoryState();
      }
    }
  });

  function exitChatToLanding() {
    if (ws) {
      userInitiatedClose = true;
      ws.send(JSON.stringify({ type: 'leave' }));
      ws.close();
    }
    emojiPanel.classList.add('hidden');
    showScreen('landing');
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

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  // ---------- WebSocket ----------
  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      const name = nameInput.value.trim();
      if (name) ws.send(JSON.stringify({ type: 'set_name', name }));

      if (pendingConnectByCode) {
        ws.send(JSON.stringify({ type: 'connect_code', code: pendingConnectByCode }));
      } else {
        ws.send(JSON.stringify({ type: 'find' }));
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
      if (screens.landing.classList.contains('hidden')) {
        addSystemBubble('Connection lost. Reconnecting…');
        attemptReconnect();
      }
    });

    ws.addEventListener('error', () => {
      // 'close' fires right after 'error' too, so no extra handling needed here.
    });
  }

  function attemptReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(1000 * reconnectAttempts, 5000); // backs off up to 5s
    setTimeout(() => {
      if (screens.landing.classList.contains('hidden')) {
        connectSocket();
      }
    }, delay);
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
        pendingConnectByCode = false;
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
        addBubble(msg.text, 'stranger');
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
        saveContact(msg.code, msg.strangerName);
        friendCodeText.textContent = `Saved! Your code with ${msg.strangerName}: ${msg.code}`;
        friendCodeToast.classList.remove('hidden');
        addSystemBubble(`Saved as a contact. Reconnect anytime with code ${msg.code}.`);
        setTimeout(() => friendCodeToast.classList.add('hidden'), 6000);
        break;
    }
  }

  function addBubble(text, who) {
  const div = document.createElement('div');
  div.className = `bubble bubble--${who}`;

  const urlRegex = /(https?:\/\/[^\s]+)/g;

  div.innerHTML = escapeHtml(text).replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
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

  // ---------- Landing actions ----------
  startBtn.addEventListener('click', () => {
    requestNotificationPermission();
    pendingConnectByCode = false;
    showScreen('searching');
    scanLabel.innerHTML = 'Scanning frequencies<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
    scanSub.textContent = 'Looking for someone else tuned in right now';
    connectSocket();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
  });

  codeBtn.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    requestNotificationPermission();
    pendingConnectByCode = code;
    showScreen('searching');
    connectSocket();
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') codeBtn.click();
  });

  // ---------- Searching actions ----------
  cancelSearchBtn.addEventListener('click', () => {
    if (ws) {
      userInitiatedClose = true;
      ws.close();
    }
    pendingConnectByCode = false;
    showScreen('landing');
  });

  // ---------- Chat actions ----------
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat_message', text }));
    addBubble(text, 'me');
    chatInput.value = '';
    chatInput.style.height = 'auto';
    emojiPanel.classList.add('hidden');
  });

  chatInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    clearTimeout(typingTimeout);
    ws.send(JSON.stringify({ type: 'typing' }));
    typingTimeout = setTimeout(() => {}, 1000);
  });

  chatInput.addEventListener('input', () => {
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
    chatInput.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }, 200);
});

  skipBtn.addEventListener('click', () => {
    if (!ws) return;
    leftToast.classList.add('hidden');
    emojiPanel.classList.add('hidden');
    ws.send(JSON.stringify({ type: 'skip' }));
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
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'find' }));
    showScreen('searching');
  });

  // ---------- Friend requests ----------
  friendBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'friend_request' }));
    addSystemBubble('Contact request sent.');
  });

  friendAcceptBtn.addEventListener('click', () => {
    friendRequestToast.classList.add('hidden');
    if (ws) ws.send(JSON.stringify({ type: 'friend_response', accepted: true }));
  });

  friendDeclineBtn.addEventListener('click', () => {
    friendRequestToast.classList.add('hidden');
    if (ws) ws.send(JSON.stringify({ type: 'friend_response', accepted: false }));
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
})();
