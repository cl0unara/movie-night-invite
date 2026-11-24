const movieButtons = [...document.querySelectorAll('.movie-card')];
const planForm = document.querySelector('#plan-form');
const dateInput = document.querySelector('#date');
const datePicks = document.querySelector('#date-picks');
const timeInput = document.querySelector('#time');
const timeButtons = [...document.querySelectorAll('.time-chip')];
const sendButton = document.querySelector('#send-answer');
const summary = document.querySelector('#summary');
const welcome = document.querySelector('#welcome');
const thanks = document.querySelector('#thanks');
const declineThanks = document.querySelector('#decline-thanks');

let selectedMovie = '';

const movieCodes = {
  Интерстеллар: 'i',
  Чернобыль: 'c',
  '1+1': 'p',
};
const telegramBotUsername = 'priglosgazavybot';

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function selectedDate() {
  const date = new Date(`${dateInput.value}T12:00:00`);
  if (timeInput.value === '00:00') date.setDate(date.getDate() + 1);
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
  if (selectedMovie && date && timeInput.value) {
    const night = timeInput.value === '00:00' ? 'Ночь на ' : '';
    summary.textContent = `Выбрано: ${selectedMovie}, ${night}${date} в ${timeInput.value}`;
  } else if (selectedMovie) {
    summary.textContent = `Выбрано: ${selectedMovie}. Осталось выбрать день`;
  } else {
    summary.textContent = 'Сначала выбери фильм';
  }
  sendButton.disabled = !(selectedMovie && dateInput.value && timeInput.value);
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
    document.querySelector('#send-telegram').href =
      telegramBotHref(selectedPlanPayload());
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

movieButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedMovie = button.dataset.movie;
    movieButtons.forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    updateSummary();
  });
});

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
  showFinal(null, true);
});

document.querySelector('#decline').addEventListener('click', () => {
  showFinal(null, false);
});

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
