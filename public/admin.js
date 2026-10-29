(() => {
  const loginView = document.getElementById('loginView');
  const dashView = document.getElementById('dashView');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminLoginError = document.getElementById('adminLoginError');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const statsEl = document.getElementById('stats');
  const peopleBody = document.getElementById('peopleBody');
  const search = document.getElementById('search');
  const toast = document.getElementById('toast');
  const personModal = document.getElementById('personModal');
  const codeModal = document.getElementById('codeModal');
  const confirmModal = document.getElementById('confirmModal');
  const sidebar = document.getElementById('sidebar');
  const assignmentList = document.getElementById('assignmentList');

  let csrfToken = '';
  let people = [];
  let eventInfo = null;

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
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
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  async function refreshCsrf() {
    const data = await api('/api/csrf');
    csrfToken = data.csrfToken;
  }

  function openPanel(name) {
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('hidden'));
    document.getElementById(`panel-${name}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.panel === name);
    });
    const titles = { overview: 'Overview', people: 'Participants', draw: 'Roulette' };
    document.getElementById('dashTitle').textContent = titles[name];
    sidebar.classList.remove('is-open');
  }

  function attendanceLabel(value) {
    return { confirmed: 'Confirmed', tentative: 'Tentative', not_attending: 'Not attending' }[value] || value;
  }

  function renderStats(stats) {
    const items = [
      ['Total', stats.total],
      ['Confirmed', stats.confirmed],
      ['Tentative', stats.tentative],
      ['Not attending', stats.notAttending]
    ];
    statsEl.innerHTML = '';
    items.forEach(([label, value]) => {
      const card = document.createElement('article');
      card.className = 'stat card glass';
      const strong = document.createElement('strong');
      strong.textContent = String(value);
      const p = document.createElement('p');
      p.textContent = label;
      card.append(strong, p);
      statsEl.appendChild(card);
    });
  }

  function renderPeople() {
    const q = search.value.trim().toLowerCase();
    peopleBody.textContent = '';
    const locked = eventInfo?.drawStatus === 'finalized';
    people
      .filter((person) => person.displayName.toLowerCase().includes(q))
      .forEach((person) => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = person.displayName;
        const statusTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge ${person.attendance}`;
        badge.textContent = attendanceLabel(person.attendance);
        statusTd.appendChild(badge);
        const assignedTd = document.createElement('td');
        assignedTd.textContent = person.assigned ? 'Yes' : 'No';
        const actionTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'row-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost';
        editBtn.textContent = 'Edit';
        editBtn.disabled = locked;
        editBtn.addEventListener('click', () => openPersonModal(person));

        const codeBtn = document.createElement('button');
        codeBtn.className = 'btn btn-ghost';
        codeBtn.textContent = 'New code';
        codeBtn.addEventListener('click', () => regenerateCode(person));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.disabled = locked;
        delBtn.addEventListener('click', () => deletePerson(person));

        actions.append(editBtn, codeBtn, delBtn);
        actionTd.appendChild(actions);
        tr.append(nameTd, statusTd, assignedTd, actionTd);
        peopleBody.appendChild(tr);
      });
  }

  function fillEventForm() {
    document.getElementById('eventName').value = eventInfo?.name || '';
    if (eventInfo?.eventDate) {
      const d = new Date(eventInfo.eventDate);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('eventDate').value = local;
    }
    const status = eventInfo?.drawStatus === 'finalized' ? 'Finalized and locked' : 'Draft — not started';
    document.getElementById('drawStatusText').textContent =
      `${status}. ${eventInfo?.drawStatus === 'finalized' ? 'Participant edits are blocked until you reset.' : 'You can still add tentative guests and change attendance.'}`;
    document.getElementById('finalizeBtn').disabled = eventInfo?.drawStatus === 'finalized';
  }

  async function loadDashboard() {
    const [stats, list, event] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/participants'),
      api('/api/admin/event')
    ]);
    eventInfo = event;
    people = list;
    renderStats(stats);
    fillEventForm();
    renderPeople();
    await loadAssignments(false);
  }

  async function loadAssignments(reveal) {
    const data = await api(`/api/admin/assignments${reveal ? '?reveal=1' : ''}`);
    assignmentList.textContent = '';
    data.assignments.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'assignment-item';
      const left = document.createElement('strong');
      left.textContent = row.giverName;
      const right = document.createElement('span');
      if (data.reveal) {
        right.textContent = `→ ${row.recipientName}`;
      } else {
        right.textContent = row.assigned ? 'Assigned' : row.attendance === 'confirmed' ? 'Waiting' : attendanceLabel(row.attendance);
      }
      item.append(left, right);
      assignmentList.appendChild(item);
    });
  }

  function openPersonModal(person) {
    document.getElementById('personModalTitle').textContent = person ? 'Edit participant' : 'Add participant';
    document.getElementById('personId').value = person?.id || '';
    document.getElementById('personName').value = person?.displayName || '';
    document.getElementById('personAttendance').value = person?.attendance || 'confirmed';
    personModal.showModal();
  }

  function showCode(code) {
    document.getElementById('codeDisplay').textContent = code;
    codeModal.showModal();
  }

  function askConfirm({ title, text, dangerLabel = 'Confirm', requireResetPhrase = false }) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmYes').textContent = dangerLabel;
    const input = document.getElementById('confirmInput');
    const label = document.getElementById('confirmLabel');
    input.value = '';
    input.classList.toggle('hidden', !requireResetPhrase);
    label.classList.toggle('hidden', !requireResetPhrase);
    confirmModal.showModal();
    return new Promise((resolve) => {
      const onClose = () => {
        confirmModal.removeEventListener('close', onClose);
        if (confirmModal.returnValue !== 'yes') {
          resolve(null);
          return;
        }
        resolve(requireResetPhrase ? input.value.trim() : true);
      };
      confirmModal.addEventListener('close', onClose);
    });
  }

  async function regenerateCode(person) {
    const ok = await askConfirm({
      title: 'Regenerate access code?',
      text: `The old code for ${person.displayName} will stop working immediately.`
    });
    if (!ok) return;
    try {
      const data = await api(`/api/admin/participants/${person.id}/regenerate-code`, { method: 'POST' });
      showCode(data.accessCode);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function deletePerson(person) {
    const ok = await askConfirm({
      title: 'Delete participant?',
      text: `Remove ${person.displayName}? This cannot be undone. Duplicate names are allowed, so check you have the right person.`,
      dangerLabel: 'Delete'
    });
    if (!ok) return;
    try {
      await api(`/api/admin/participants/${person.id}`, { method: 'DELETE' });
      await loadDashboard();
      showToast('Participant deleted.');
    } catch (err) {
      showToast(err.message);
    }
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => openPanel(btn.dataset.panel));
  });
  document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('is-open'));
  search.addEventListener('input', renderPeople);
  document.getElementById('addBtn').addEventListener('click', () => openPersonModal(null));

  document.getElementById('personSave').addEventListener('click', async (event) => {
    event.preventDefault();
    const id = document.getElementById('personId').value;
    const body = {
      displayName: document.getElementById('personName').value,
      attendance: document.getElementById('personAttendance').value
    };
    try {
      if (id) {
        await api(`/api/admin/participants/${id}`, { method: 'PATCH', body });
        personModal.close();
        await loadDashboard();
        showToast('Participant updated.');
      } else {
        const created = await api('/api/admin/participants', { method: 'POST', body });
        personModal.close();
        await loadDashboard();
        showCode(created.accessCode);
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('eventForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const dateValue = document.getElementById('eventDate').value;
    try {
      await api('/api/admin/event', {
        method: 'PATCH',
        body: {
          name: document.getElementById('eventName').value,
          eventDate: dateValue ? new Date(dateValue).toISOString() : null
        }
      });
      await loadDashboard();
      showToast('Event saved.');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('finalizeBtn').addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Finalize the roulette?',
      text: 'Only guests marked Confirmed right now will be included. Tentative people are skipped. The list will lock, and everyone gets one secret recipient. This cannot be quietly undone.'
    });
    if (!ok) return;
    try {
      const data = await api('/api/admin/finalize', { method: 'POST' });
      await loadDashboard();
      showToast(data.message);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    const typed = await askConfirm({
      title: 'Reset the entire draw?',
      text: 'If someone cancelled after finalization, do not reshuffle silently. Resetting deletes EVERY pairing. Guests who already saw a recipient will get a new person after you finalize again.',
      dangerLabel: 'Reset',
      requireResetPhrase: true
    });
    if (typed === null) return;
    try {
      const data = await api('/api/admin/reset', { method: 'POST', body: { confirmation: typed } });
      await loadDashboard();
      showToast(data.message);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('revealBtn').addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Show all pairings?',
      text: 'This reveals every recipient to you as organizer. Participants still cannot see anyone else’s result.'
    });
    if (!ok) return;
    try {
      await loadAssignments(true);
    } catch (err) {
      showToast(err.message);
    }
  });

  adminLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    adminLoginError.hidden = true;
    adminLoginBtn.disabled = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: {
          email: document.getElementById('adminEmail').value,
          password: document.getElementById('adminPassword').value
        }
      });
      await refreshCsrf();
      loginView.classList.add('hidden');
      dashView.classList.remove('hidden');
      await loadDashboard();
    } catch (err) {
      adminLoginError.textContent = err.message;
      adminLoginError.hidden = false;
    } finally {
      adminLoginBtn.disabled = false;
    }
  });

  document.getElementById('adminLogout').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch (_err) {
      // ignore
    }
    await refreshCsrf();
    dashView.classList.add('hidden');
    loginView.classList.remove('hidden');
  });

  async function boot() {
    try {
      await refreshCsrf();
      await api('/api/admin/me');
      loginView.classList.add('hidden');
      dashView.classList.remove('hidden');
      await loadDashboard();
    } catch (_err) {
      loginView.classList.remove('hidden');
      dashView.classList.add('hidden');
    }
  }

  boot();
})();
