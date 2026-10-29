(() => {
  const snow = document.getElementById('snow');
  const loginCard = document.getElementById('loginCard');
  const appCard = document.getElementById('appCard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const participantName = document.getElementById('participantName');
  const attendanceBadge = document.getElementById('attendanceBadge');
  const statusMessage = document.getElementById('statusMessage');
  const rouletteWrap = document.getElementById('rouletteWrap');
  const revealCard = document.getElementById('revealCard');
  const recipientNameEl = document.getElementById('recipientName');
  const spinBtn = document.getElementById('spinBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const toast = document.getElementById('toast');
  const eventTitle = document.getElementById('eventTitle');
  const countdown = document.getElementById('countdown');
  const wheel = document.getElementById('wheel');

  let csrfToken = '';
  let me = null;
  let spinning = false;
  let turn = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const init = { credentials: 'same-origin', ...options, headers };
    if (init.body && typeof init.body === 'object') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    if (csrfToken && init.method && init.method !== 'GET') {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (data.csrfToken) csrfToken = data.csrfToken;
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function refreshCsrf() {
    const data = await api('/api/csrf');
    csrfToken = data.csrfToken;
  }

  function makeSnow() {
    const count = window.matchMedia('(max-width: 700px)').matches ? 14 : 22;
    for (let i = 0; i < count; i += 1) {
      const flake = document.createElement('span');
      flake.className = 'flake';
      flake.textContent = '❄';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${9 + Math.random() * 10}s`;
      flake.style.animationDelay = `${Math.random() * 8}s`;
      flake.style.opacity = String(0.35 + Math.random() * 0.5);
      snow.appendChild(flake);
    }
  }

  function formatCountdown(iso) {
    if (!iso) {
      countdown.textContent = 'Event date will appear here once the organizer sets it.';
      return;
    }
    const target = new Date(iso).getTime();
    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        countdown.textContent = 'It’s party time. Bring your gift and keep your recipient a secret.';
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      countdown.textContent = `${days}d ${hours}h ${minutes}m until the exchange`;
    }
    tick();
    setInterval(tick, 30000);
  }

  function badgeClass(attendance) {
    attendanceBadge.className = `badge ${attendance}`;
    const labels = {
      confirmed: 'Confirmed',
      tentative: 'Tentative',
      not_attending: 'Not attending'
    };
    attendanceBadge.textContent = labels[attendance] || attendance;
  }

  function revealedKey(id) {
    return `roulette-revealed:${id}`;
  }

  function renderApp() {
    loginCard.classList.add('hidden');
    appCard.classList.remove('hidden');
    participantName.textContent = me.displayName;
    badgeClass(me.attendance);

    rouletteWrap.classList.add('hidden');
    revealCard.classList.add('hidden');

    if (me.attendance !== 'confirmed') {
      statusMessage.textContent =
        me.attendance === 'tentative'
          ? 'You’re listed as tentative, so you are not in the draw yet. Ask the organizer if you can confirm.'
          : 'You’re marked as not attending, so you won’t receive a recipient.';
      return;
    }

    if (me.drawStatus !== 'finalized') {
      statusMessage.textContent = "The Christmas roulette isn't ready yet. Please wait for the organizer.";
      return;
    }

    statusMessage.textContent = 'The organizer has finalized the draw. Your recipient is waiting behind the wheel.';
    const already = sessionStorage.getItem(revealedKey(me.id));
    if (already) {
      recipientNameEl.textContent = already;
      revealCard.classList.remove('hidden');
      return;
    }
    rouletteWrap.classList.remove('hidden');
  }

  async function loadMe() {
    try {
      me = await api('/api/participant/me');
      renderApp();
    } catch (_err) {
      me = null;
      loginCard.classList.remove('hidden');
      appCard.classList.add('hidden');
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    loginBtn.disabled = true;
    try {
      await api('/api/participant/login', {
        method: 'POST',
        body: { accessCode: document.getElementById('accessCode').value }
      });
      await refreshCsrf();
      await loadMe();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    } finally {
      loginBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/participant/logout', { method: 'POST' });
    } catch (_err) {
      // still return to login
    }
    await refreshCsrf();
    me = null;
    loginForm.reset();
    loginCard.classList.remove('hidden');
    appCard.classList.add('hidden');
  });

  spinBtn.addEventListener('click', async () => {
    if (spinning || !me) return;
    spinning = true;
    spinBtn.disabled = true;
    spinBtn.textContent = 'Spinning…';

    let recipientName = '';
    try {
      const assigned = await api('/api/participant/assignment');
      recipientName = assigned.recipientName;
    } catch (err) {
      spinning = false;
      spinBtn.disabled = false;
      spinBtn.textContent = 'Spin the roulette';
      showToast(err.message);
      return;
    }

    turn += 1800 + Math.floor(Math.random() * 360);
    wheel.style.setProperty('--turn', `${turn}deg`);

    window.setTimeout(() => {
      sessionStorage.setItem(revealedKey(me.id), recipientName);
      recipientNameEl.textContent = recipientName;
      rouletteWrap.classList.add('hidden');
      revealCard.classList.remove('hidden');
      spinning = false;
    }, 4500);
  });

  async function boot() {
    makeSnow();
    try {
      await refreshCsrf();
      const event = await api('/api/public/event');
      eventTitle.textContent = event.name || 'Christmas Exchange Gift';
      formatCountdown(event.eventDate);
      await loadMe();
    } catch (_err) {
      countdown.textContent = 'Could not reach the server. Check your connection.';
    }
  }

  boot();
})();
