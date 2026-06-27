const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const prioritySelect = document.getElementById('priority');
const taskList = document.getElementById('task-list');
const searchInput = document.getElementById('search');
const filterButtons = document.querySelectorAll('.filters button');
const dateEl = document.getElementById('current-date');
const themeBtn = document.getElementById('theme-btn');
const toastContainer = document.getElementById('toast-container');
const root = document.documentElement;

let tasks = [];
let filter = 'all';
let search = '';
let completedExpanded = false;
let idleTimer = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getPriorityLabel(priority) {
  const normalized = String(priority || '').toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'low') return 'Low';
  return 'Medium';
}

function getPriorityClass(priority) {
  const normalized = String(priority || '').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'med';
}

function addToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateFilterCounts() {
  const totalCount = tasks.length;
  const activeCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.filter((task) => task.completed).length;

  filterButtons.forEach((button) => {
    const countSpan = button.querySelector('.filter-count');
    if (!countSpan) return;
    if (button.dataset.filter === 'all') countSpan.textContent = totalCount;
    if (button.dataset.filter === 'active') countSpan.textContent = activeCount;
    if (button.dataset.filter === 'completed') countSpan.textContent = completedCount;
  });
}

function resetIdlePulse() {
  const button = document.querySelector('.add-btn');
  if (!button) return;
  button.classList.remove('pulse');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => button.classList.add('pulse'), 4000);
}

async function loadTasks() {
  const response = await fetch('/api/tasks');
  const data = await response.json();
  tasks = data.tasks || [];
  renderTasks();
}

function renderTasks() {
  updateFilterCounts();

  const groups = {
    today: tasks.filter((task) => !task.completed),
    completed: tasks.filter((task) => task.completed),
  };

  const hasTasks = groups.today.length || groups.completed.length;
  const anySearch = search.length > 0;

  if (!hasTasks && !anySearch) {
    taskList.innerHTML = `
      <li class="empty-state">
        <div class="empty-illustration">✧</div>
        <strong>No tasks yet</strong>
        <p>Create your first task and get moving.</p>
        <button type="button" class="empty-cta">Start a task</button>
      </li>
    `;
    document.querySelector('.empty-cta')?.addEventListener('click', () => input.focus());
  } else {
    const tasksToShow = tasks.filter((task) => {
      const completed = Boolean(task.completed);
      const matchFilter =
        filter === 'all' ||
        (filter === 'active' && !completed) ||
        (filter === 'completed' && completed);
      const taskText = String(task.task || '').toLowerCase();
      const matchesSearch = taskText.includes(search);
      return matchFilter && matchesSearch;
    });

    const todayTasks = tasksToShow.filter((task) => !task.completed);
    const completedTasks = tasksToShow.filter((task) => task.completed);

    let html = '';
    if (todayTasks.length) {
      html += `<li class="section-heading">Today <span>${todayTasks.length}</span></li>`;
      html += todayTasks
        .map(getTaskHtml)
        .join('');
    }

    if (completedTasks.length) {
      html += `
        <li class="section-heading completed-heading">
          Completed <span>${completedTasks.length}</span>
          <button class="completed-toggle" type="button">${completedExpanded ? '▾' : '▸'}</button>
        </li>
      `;
      html += completedTasks
        .map((task) => getTaskHtml(task, !completedExpanded))
        .join('');
    }

    if (!html) {
      taskList.innerHTML = '<li class="empty-state">No tasks match your view.</li>';
    } else {
      taskList.innerHTML = html;
    }
  }

  const total = tasks.length;
  const completed = tasks.filter((task) => Boolean(task.completed)).length;
  const pending = total - completed;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const circumference = 2 * Math.PI * 35;

  document.getElementById('total-task').textContent = total;
  document.getElementById('completed-task').textContent = completed;
  document.getElementById('pending-task').textContent = pending;
  document.getElementById('progress-text').textContent = `${pct}%`;
  document.getElementById('progress-summary').textContent = `${completed} of ${total} tasks done`;
  document.getElementById('progress-label').textContent =
    total === 0
      ? 'Add a task to begin your flow'
      : pct === 100
        ? 'All tasks complete — great work!'
        : 'Keep momentum going';
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('ring-fill').style.strokeDashoffset = circumference - (circumference * pct) / 100;
}

function getTaskHtml(task, hidden = false) {
  return `
    <li class="task-item ${task.completed ? 'done' : ''}${hidden ? ' collapsed' : ''}" data-id="${task.id}" data-status="${getPriorityClass(task.priority)}">
      <button class="check-btn ${task.completed ? 'checked' : ''}" title="Toggle task">✓</button>
      <div class="task-body">
        <div class="task-text">${escapeHtml(task.task || '')}</div>
      </div>
      <span class="badge ${getPriorityClass(task.priority)}">${escapeHtml(getPriorityLabel(task.priority))}</span>
      <button class="del-btn" title="Delete task">✕</button>
    </li>
  `;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const task = input.value.trim();
  if (!task) return;

  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, priority: prioritySelect.value }),
  });

  if (response.ok) {
    addToast('Task added', 'success');
  }

  input.value = '';
  prioritySelect.value = 'med';
  await loadTasks();
});

taskList.addEventListener('click', async (event) => {
  const toggle = event.target.closest('.completed-toggle, .completed-heading');
  if (toggle) {
    completedExpanded = !completedExpanded;
    renderTasks();
    return;
  }

  const item = event.target.closest('.task-item');
  if (!item) {
    const emptyCta = event.target.closest('.empty-cta');
    if (emptyCta) {
      input.focus();
    }
    return;
  }

  const taskId = item.dataset.id;
  if (event.target.closest('.check-btn')) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (task) {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed }),
      });
      addToast(task.completed ? 'Task reopened' : 'Task completed', 'info');
    }
  }

  if (event.target.closest('.del-btn')) {
    item.classList.add('removing');
    await new Promise((resolve) => setTimeout(resolve, 180));
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    addToast('Task deleted', 'info');
  }

  await loadTasks();
});

searchInput.addEventListener('input', (event) => {
  search = event.target.value.trim().toLowerCase();
  renderTasks();
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.filters button.active')?.classList.remove('active');
    button.classList.add('active');
    filter = button.dataset.filter || 'all';
    renderTasks();
  });
});

const mobileTabs = document.querySelectorAll('.mobile-tab');
function setActiveMobileTab(action) {
  mobileTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.action === action);
  });
}

mobileTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const action = tab.dataset.action;
    setActiveMobileTab(action);

    if (action === 'home') {
      filter = 'all';
      document.querySelector('.filters button[data-filter="all"]')?.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'search') {
      searchInput.focus();
      return;
    }

    if (action === 'add') {
      input.focus();
      return;
    }

    if (action === 'stats') {
      document.querySelector('.dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (action === 'more') {
      themeBtn.focus();
      addToast('Tap the theme button to switch modes.', 'info');
      return;
    }
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'n' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    input.focus();
  }
});

function applyTheme() {
  const dark = localStorage.getItem('theme') !== 'light';
  root.dataset.theme = dark ? 'dark' : 'light';
  themeBtn.textContent = dark ? '🌙' : '☀️';
}

themeBtn.addEventListener('click', () => {
  const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', nextTheme);
  applyTheme();
});

dateEl.textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

['mousemove', 'keydown', 'click'].forEach((eventName) => {
  window.addEventListener(eventName, resetIdlePulse);
});

resetIdlePulse();
applyTheme();
window.addEventListener('DOMContentLoaded', () => loadTasks());
