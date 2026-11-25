const movieButtons = [...document.querySelectorAll('.movie-card')];
const planForm = document.querySelector('#plan-form');
const dateInput = document.querySelector('#date');
const datePicks = document.querySelector('#date-picks');
const timeInput = document.querySelector('#time');
const timePicks = document.querySelector('#time-picks');
let timeButtons = [];
const sendButton = document.querySelector('#send-answer');
const summary = document.querySelector('#summary');
const welcome = document.querySelector('#welcome');
const thanks = document.querySelector('#thanks');
const declineThanks = document.querySelector('#decline-thanks');
const cancelPlanPanel = document.querySelector('#cancel-plan');
const cancelPlanButton = document.querySelector('#cancel-plan-button');
const savedPlanKey = 'movie-night-invite-plan';
const watchedMoviesKey = 'movie-night-invite-watched';
const watchedShelf = document.querySelector('#watched-movies');
const watchedSection = document.querySelector('#watched-section');
const watchedCount = document.querySelector('#watched-count');

let selectedMovie = '';

const movieCodes = {
  Интерстеллар: 'i',
  Чернобыль: 'c',
  '1+1': 'p',
  'Достать ножи': 'k',
  'Телохранители': 't',
  'Титаник': 'a',
  'Один дома': 'h',
};
const telegramBotUsername = 'priglosgazavy2026_bot';

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function selectedDate() {
  const date = new Date(`${dateInput.value}T12:00:00`);
  return date;
}

function selectedDateTime() {
  const date = selectedDate();
  const [hours, minutes] = timeInput.value.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function updateSummary() {
  const date = dateInput.value
    ? selectedDate().toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    : '';
  const hasSelection = Boolean(selectedMovie && dateInput.value && timeInput.value);
  const isFuture = hasSelection && selectedDateTime().getTime() > Date.now();

  if (selectedMovie && date && timeInput.value && isFuture) {
    summary.textContent = `Выбрано: ${selectedMovie}, ${date} в ${timeInput.value}`;
  } else if (hasSelection) {
    summary.textContent = 'Это время уже прошло. Выбери будущую дату или время';
  } else if (selectedMovie) {
    summary.textContent = `Выбрано: ${selectedMovie}. Осталось выбрать день`;
  } else {
    summary.textContent = 'Сначала выбери фильм';
  }

  sendButton.disabled = !(hasSelection && isFuture);
  datePicks.querySelectorAll('.date-chip').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.date === dateInput.value));
  });
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');
}

function closeDialog(dialog) {
  if (dialog && dialog.open) dialog.close();
}

function telegramBotHref(payload) {
  return `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(payload)}`;
}

function renderSavedPlan(payload) {
  if (typeof payload !== 'string' || !/^yes_[icp]_\d{4}-\d{2}-\d{2}_\d{4}$/.test(payload)) {
    cancelPlanPanel.hidden = true;
    return;
  }
  const cancelHref = telegramBotHref(payload.replace(/^yes_/, 'cancel_'));
  cancelPlanButton.href = cancelHref;
  document.querySelector('#cancel-telegram').href = cancelHref;
  cancelPlanPanel.hidden = false;
}

function clearSavedPlan() {
  try {
    localStorage.removeItem(savedPlanKey);
  } catch {
    // The Telegram cancellation link still works if browser storage is unavailable.
  }
  cancelPlanPanel.hidden = true;
}

try {
  renderSavedPlan(localStorage.getItem(savedPlanKey));
} catch {
  // The planning flow remains usable when browser storage is unavailable.
}

function selectedPlanPayload() {
  const movieCode = movieCodes[selectedMovie];
  if (!movieCode) throw new Error(`Unsupported movie selected: ${selectedMovie}`);
  const timeCode = timeInput.value.replace(':', '');
  return `yes_${movieCode}_${localDate(selectedDate())}_${timeCode}`;
}

function showFinal(dialog, accepted) {
  closeDialog(dialog);
  if (accepted) {
    document.querySelector('#thanks-copy').textContent =
      'Откроется бот. Нажми «Start/Старт», и ответ сразу придёт мне.';
    const payload = selectedPlanPayload();
    document.querySelector('#send-telegram').href = telegramBotHref(payload);
    try {
      localStorage.setItem(savedPlanKey, payload);
    } catch {
      // The cancellation action remains available in the confirmation dialog.
    }
    renderSavedPlan(payload);
    openDialog(thanks);
  } else {
    document.querySelector('#decline-telegram').href = telegramBotHref('no');
    openDialog(declineThanks);
  }
}

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
dateInput.min = localDate(new Date());
dateInput.value = localDate(tomorrow);

const dateOptions = [];
for (let offset = 1; offset <= 7; offset += 1) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
  const month = date.toLocaleDateString('ru-RU', { month: 'long' });
  const special = offset === 1 ? 'завтра' : offset === 2 ? 'послезавтра' : '';
  dateOptions.push(`
    <button class="date-chip" type="button" data-date="${localDate(date)}"
      aria-label="${weekday}, ${date.getDate()} ${month}${special ? `, ${special}` : ''}"
      aria-pressed="${offset === 1}">
      <span class="date-weekday">${weekday}</span>
      <b class="date-number">${date.getDate()}</b>
      <span class="date-month">${month}</span>
      <span class="date-special">${special || '&nbsp;'}</span>
    </button>`);
}
datePicks.innerHTML = dateOptions.join('');

const timeOptions = [];
for (let minutes = 18 * 60; minutes < 24 * 60; minutes += 15) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minutePart = String(minutes % 60).padStart(2, '0');
  const time = `${hours}:${minutePart}`;
  const selected = time === '20:00';
  timeOptions.push(`
    <button type="button" class="time-chip${selected ? ' selected' : ''}"
      data-time="${time}" aria-pressed="${selected}">
      <span aria-hidden="true">${minutes < 19 * 60 ? '☀' : minutes < 21 * 60 ? '◷' : '☾'}</span>${time}
    </button>`);
}
timePicks.innerHTML = timeOptions.join('');
timeButtons = [...timePicks.querySelectorAll('.time-chip')];

function updateWatchedShelf() {
  const count = watchedShelf.children.length;
  watchedCount.textContent = String(count);
  watchedSection.hidden = count === 0;
}

function saveWatchedMovies() {
  const watched = [...watchedShelf.querySelectorAll('.movie-card')].map((card) => card.dataset.movie);
  try {
    localStorage.setItem(watchedMoviesKey, JSON.stringify(watched));
  } catch {
    // The shelf still works for the current page session.
  }
  updateWatchedShelf();
}

function setWatched(card, watched) {
  const entry = card.closest('.movie-entry');
  const toggle = entry.querySelector('.watched-toggle');
  if (watched) {
    if (selectedMovie === card.dataset.movie) {
      selectedMovie = '';
      card.setAttribute('aria-pressed', 'false');
      updateSummary();
    }
    card.disabled = true;
    toggle.textContent = 'Вернуть в каталог';
    toggle.setAttribute('aria-label', `Вернуть «${card.dataset.movie}» в каталог`);
    watchedShelf.append(entry);
  } else {
    card.disabled = false;
    toggle.textContent = 'Уже смотрели';
    toggle.setAttribute('aria-label', `Отметить «${card.dataset.movie}» просмотренным`);
    document.querySelector('#movie-catalog').append(entry);
  }
  saveWatchedMovies();
}

movieButtons.forEach((card) => {
  const entry = document.createElement('div');
  entry.className = 'movie-entry';
  card.parentNode.insertBefore(entry, card);
  entry.append(card);
  const toggle = document.createElement('button');
  toggle.className = 'watched-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Уже смотрели';
  toggle.setAttribute('aria-label', `Отметить «${card.dataset.movie}» просмотренным`);
  toggle.addEventListener('click', () => setWatched(card, !card.disabled));
  entry.append(toggle);
  card.addEventListener('click', () => {
    if (card.disabled) return;
    selectedMovie = card.dataset.movie;
    movieButtons.forEach((item) => {
      item.setAttribute('aria-pressed', String(item === card));
    });
    updateSummary();
  });
});

try {
  const watched = JSON.parse(localStorage.getItem(watchedMoviesKey) || '[]');
  if (Array.isArray(watched)) {
    movieButtons.forEach((card) => {
      if (watched.includes(card.dataset.movie)) setWatched(card, true);
    });
  }
} catch {
  // Ignore invalid or unavailable local storage and keep the full catalog.
}
updateWatchedShelf();

datePicks.addEventListener('click', (event) => {
  const button = event.target.closest('[data-date]');
  if (!button) return;
  dateInput.value = button.dataset.date;
  updateSummary();
});
dateInput.addEventListener('change', updateSummary);
timeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    timeInput.value = button.dataset.time;
    timeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    updateSummary();
  });
});
document.querySelector('#open-invitation').addEventListener('click', () => {
  closeDialog(welcome);
  document.querySelector('#invitation').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.querySelector('#welcome-later').addEventListener('click', () => {
  closeDialog(welcome);
  showFinal(null, false);
});

planForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!planForm.reportValidity() || !selectedMovie) {
    if (!selectedMovie) summary.textContent = 'Сначала выбери фильм или сериал, пожалуйста';
    return;
  }

  // Re-check at submit time in case the page stayed open until the selected slot passed.
  if (selectedDateTime().getTime() <= Date.now()) {
    updateSummary();
    sendButton.disabled = true;
    summary.textContent = 'Это время уже прошло. Выбери будущую дату или время';
    return;
  }

  showFinal(null, true);
});

document.querySelector('#decline').addEventListener('click', () => {
  showFinal(null, false);
});

cancelPlanButton.addEventListener('click', clearSavedPlan);
document.querySelector('#cancel-telegram').addEventListener('click', clearSavedPlan);

document.querySelector('#close-thanks').addEventListener('click', () => {
  closeDialog(thanks);
});
document.querySelector('#close-decline').addEventListener('click', () => {
  closeDialog(declineThanks);
});

for (const dialog of [welcome, thanks, declineThanks]) {
  dialog.addEventListener('close', () => {
    if (![welcome, thanks, declineThanks].some((item) => item.open)) {
      document.body.classList.remove('dialog-open');
    }
  });
}

openDialog(welcome);
updateSummary();
