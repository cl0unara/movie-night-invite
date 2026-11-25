const movieDescriptions = {
  Интерстеллар: 'Большое космическое приключение о семье, времени и выборе. Для вечера с атмосферой и разговорами после титров.',
  Чернобыль: 'Напряжённый мини-сериал из пяти серий о событиях на ЧАЭС. Лучше выбрать, если хочется погружения на несколько вечеров.',
  '1+1': 'Тёплая комедия-драма о дружбе, которая меняет жизнь. Самый лёгкий вариант для уютного вечера.',
};

const movieDetail = document.querySelector('#movie-detail');

document.querySelectorAll('.movie-card').forEach((card) => {
  card.addEventListener('click', () => {
    const movie = card.dataset.movie;
    movieDetail.textContent = movieDescriptions[movie] || '';
    movieDetail.hidden = !movieDetail.textContent;
  });
});
