(() => {
  const screens = {
    landing: document.getElementById('landing'),
    searching: document.getElementById('searching'),
    chat: document.getElementById('chat'),
  };

  const nameInput = document.getElementById('nameInput');
  const startBtn = document.getElementById('startBtn');
  const cancelSearchBtn = document.getElementById('cancelSearchBtn');
  const skipBtn = document.getElementById('skipBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const chatLog = document.getElementById('chatLog');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatWithLabel = document.getElementById('chatWithLabel');
  const typingIndicator = document.getElementById('typingIndicator');
  const leftToast = document.getElementById('leftToast');
  const toastFindBtn = document.getElementById('toastFindBtn');
  const dialFreq = document.getElementById('dialFreq');

  let ws = null;
  let typingTimeout = null;
  let remoteTypingTimeout = null;

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  function randomFreq() {
    return (Math.random() * (108 - 88) + 88).toFixed(1);
  }
  setInterval(() => { dialFreq.textContent = randomFreq(); }, 900);

  function connectSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      const name = nameInput.value.trim();
      if (name) ws.send(JSON.stringify({ type: 'set_name', name }));
      ws.send(JSON.stringify({ type: 'find' }));
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    });

    ws.addEventListener('close', () => {
      // connection dropped — if we were mid-chat, surface it
      if (!screens.landing.classList.contains('hidden')) return;
      addSystemBubble('Connection lost. Reconnecting…');
    });
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'waiting':
        showScreen('searching');
        break;

      case 'matched':
        chatLog.innerHTML = '';
        chatWithLabel.textContent = `Connected to ${msg.strangerName || 'Stranger'}`;
        showScreen('chat');
        addSystemBubble("You're connected. Say hi 👋");
        leftToast.classList.add('hidden');
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
    }
  }

  function addBubble(text, who) {
    const div = document.createElement('div');
    div.className = `bubble bubble--${who}`;
    div.textContent = text;
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

  // ---- Landing actions ----
  startBtn.addEventListener('click', () => {
    showScreen('searching');
    connectSocket();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
  });

  // ---- Searching actions ----
  cancelSearchBtn.addEventListener('click', () => {
    if (ws) ws.close();
    showScreen('landing');
  });

  // ---- Chat actions ----
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat_message', text }));
    addBubble(text, 'me');
    chatInput.value = '';
  });

  chatInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    clearTimeout(typingTimeout);
    ws.send(JSON.stringify({ type: 'typing' }));
    typingTimeout = setTimeout(() => {}, 1000);
  });

  skipBtn.addEventListener('click', () => {
    if (!ws) return;
    leftToast.classList.add('hidden');
    ws.send(JSON.stringify({ type: 'skip' }));
    showScreen('searching');
  });

  leaveBtn.addEventListener('click', () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'leave' }));
      ws.close();
    }
    showScreen('landing');
  });

  toastFindBtn.addEventListener('click', () => {
    leftToast.classList.add('hidden');
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'find' }));
    showScreen('searching');
  });
})();
