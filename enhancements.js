const movieCatalog = {
  Интерстеллар: {
    genre: 'Фантастика, драма, приключения',
    year: '2014',
    duration: '2 ч 49 мин',
    rating: '8.7/10',
    ratingSource: 'IMDb',
    stars: '★★★★☆',
    description: 'Когда Земля постепенно становится непригодной для жизни, бывший пилот Купер отправляется вместе с командой исследовать далёкие планеты. Но за масштабным космическим путешествием скрывается очень личная история об отношениях отца и дочери, времени и выборе между долгом и семьёй. Фильм с мощной атмосферой, красивой музыкой и тем самым послевкусием, после которого хочется ещё немного поговорить.',
  },
  Чернобыль: {
    genre: 'Историческая драма, мини-сериал',
    year: '2019',
    duration: '5 серий · около 5 ч',
    rating: '9.3/10',
    ratingSource: 'IMDb',
    stars: '★★★★★',
    description: 'Пятисерийная история о катастрофе на Чернобыльской АЭС в апреле 1986 года. Сериал показывает работу учёных, пожарных и обычных людей, которые столкнулись с последствиями аварии, а также цену замалчивания правды. Тяжёлый, напряжённый и очень сильный вариант, если хочется серьёзного просмотра.',
  },
  Титаник: {
    genre: 'Романтическая драма, катастрофа',
    year: '1997',
    duration: '3 ч 14 мин',
    rating: '7.9/10',
    ratingSource: 'IMDb',
    stars: '★★★★☆',
    description: 'На борту роскошного лайнера встречаются Роза из богатой семьи и Джек — свободолюбивый художник без гроша за душой. За несколько дней между ними возникает чувство, которое меняет их жизни. Большая романтическая история о любви, выборе и памяти — фильм для вечера, когда хочется и переживать, и потом ещё долго обсуждать.',
  },
  'Один дома': {
    genre: 'Семейная комедия, рождественский фильм',
    year: '1990',
    duration: '1 ч 43 мин',
    rating: '7.7/10',
    ratingSource: 'IMDb',
    stars: '★★★★☆',
    description: 'Многодетная семья в спешке улетает на рождественские каникулы и случайно оставляет дома младшего Кевина. Сначала он наслаждается свободой, но вскоре ему приходится защищать дом от двух незадачливых грабителей. Максимально уютная праздничная классика — отличный вариант посмотреть вместе перед Новым годом.',
  },
  'Достать ножи': {
    genre: 'Детектив, комедия, криминал',
    year: '2019',
    duration: '2 ч 10 мин',
    rating: '7.9/10',
    ratingSource: 'IMDb',
    stars: '★★★★☆',
    description: 'Знаменитого писателя детективов находят мёртвым после семейного праздника. За дело берётся необычный частный сыщик, а каждый родственник оказывается со своим секретом и мотивом. Ироничный, стильный детектив с кучей подозреваемых и приятными сюжетными поворотами — главное, не гуглить спойлеры.',
  },
  Телохранители: {
    genre: 'Комедия, сериал',
    year: '2023',
    duration: '2 сезона · серии около 25 мин',
    rating: '8.3/10',
    ratingSource: 'Кинопоиск',
    stars: '★★★★☆',
    description: 'Трое боксёров из Челябинска после неудачной истории в Москве получают неожиданное предложение: вместо тюрьмы стать личной охраной известного адвоката. Дальше — столкновение простых уральских парней с богатыми клиентами, странными поручениями и московскими заморочками. Лёгкая комедия, чтобы просто поржать.',
  },
  '1+1': {
    genre: 'Комедия, драма',
    year: '2011',
    duration: '1 ч 52 мин',
    rating: '8.5/10',
    ratingSource: 'IMDb',
    stars: '★★★★☆',
    description: 'После несчастного случая богатый аристократ Филипп ищет помощника и неожиданно знакомится с Дриссом — парнем из совершенно другого мира. Их дружба начинается с недоверия, но постепенно превращается в историю о свободе, юморе и поддержке. Очень тёплый, смешной и душевный фильм — отличный выбор для уютного вечера.',
  },
};

const movieDetail = document.querySelector('#movie-detail');

document.querySelectorAll('.movie-card').forEach((card) => {
  const movie = card.dataset.movie;
  const details = movieCatalog[movie];
  if (!details) return;

  const rating = document.createElement('small');
  rating.className = 'movie-rating';
  rating.textContent = `${details.stars} ${details.rating} · ${details.ratingSource || 'IMDb'}`;
  card.querySelector('.movie-info').append(rating);

  card.addEventListener('click', () => {
    movieDetail.replaceChildren();
    const heading = document.createElement('strong');
    heading.className = 'movie-detail-title';
    heading.textContent = movie;
    const metadata = document.createElement('span');
    metadata.className = 'movie-detail-meta';
    metadata.textContent = `${details.genre} · ${details.year} · ${details.duration}`;
    const ratingLine = document.createElement('span');
    ratingLine.className = 'movie-detail-rating';
    ratingLine.textContent = `${details.stars}  ${details.rating} · рейтинг ${details.ratingSource || 'IMDb'}`;
    const description = document.createElement('span');
    description.className = 'movie-detail-copy';
    description.textContent = details.description;
    movieDetail.append(heading, metadata, ratingLine, description);
    movieDetail.hidden = false;
  });
});
