const emailAddress = '4ida2282@gmail.com';
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

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateSummary() {
  const date = dateInput.value
    ? new Date(`${dateInput.value}T12:00:00`).toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    : '';
  if (selectedMovie && date && timeInput.value) {
    summary.textContent = `Твой выбор: ${selectedMovie}, ${date} в ${timeInput.value}`;
  } else if (selectedMovie) {
    summary.textContent = `Выбрано: ${selectedMovie}. Осталось выбрать день`;
  } else {
    summary.textContent = 'Сначала выбери, что посмотреть';
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

function emailHref(subject, message) {
  return `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

function showFinal(dialog, subject, message, accepted) {
  closeDialog(dialog);
  if (accepted) {
    document.querySelector('#thanks-copy').textContent =
      'Открой письмо и нажми «Отправить», чтобы я узнал, какой фильм и время тебе подходят.';
    document.querySelector('#send-email').href = emailHref(subject, message);
    openDialog(thanks);
  } else {
    document.querySelector('#decline-email').href = emailHref(subject, message);
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
  const subject = 'Ответ на приглашение';
  const message = 'Спасибо за приглашение, но в этот раз не получится.';
  closeDialog(welcome);
  showFinal(null, subject, message, false);
});

planForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!planForm.reportValidity() || !selectedMovie) {
    if (!selectedMovie) summary.textContent = 'Сначала выбери фильм или сериал, пожалуйста';
    return;
  }
  const date = new Date(`${dateInput.value}T12:00:00`).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const message = `Давай посмотрим: ${selectedMovie}.\nМне удобно: ${date}, ${timeInput.value}.\nЖду тебя, Газява ❤️`;
  showFinal(null, 'Наш киновечер 🍿', message, true);
});

document.querySelector('#decline').addEventListener('click', () => {
  const subject = 'Ответ на приглашение';
  const message = 'Спасибо за приглашение, но в этот раз не получится.';
  showFinal(null, subject, message, false);
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
