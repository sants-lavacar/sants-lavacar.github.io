// Adds the new before/after set without changing or re-encoding the original photos.
const EXTRA_GROUP = [
  { title: 'Porta inteira', before: 'vomito-porta-antes.jpg', after: 'vomito-porta-depois.jpg' },
  { title: 'Forro da porta', before: 'vomito-forro-antes.jpg', after: 'vomito-forro-depois.jpg' },
];

function addVomitGalleryGroup() {
  const app = document.getElementById('app');
  if (!app) return;
  const heading = [...app.querySelectorAll('h1')].find((item) => item.textContent.trim() === 'Antes e depois');
  const gallery = app.querySelector('.gal');
  if (!heading || !gallery || gallery.querySelector('[data-gallery-extra="vomito"]')) return;

  const group = document.createElement('section');
  group.className = 'gal-extra';
  group.dataset.galleryExtra = 'vomito';

  const title = document.createElement('h2');
  title.textContent = 'Higienização após vômito';
  group.append(title);

  const pairs = document.createElement('div');
  pairs.className = 'gal-extra-pairs';

  for (const pair of EXTRA_GROUP) {
    const figure = document.createElement('figure');
    figure.className = 'gal-extra-pair';

    const photo = document.createElement('div');
    photo.className = 'gal-extra-photo';

    const image = document.createElement('img');
    image.src = `img/${pair.before}`;
    image.alt = `${pair.title} antes da higienização`;
    image.loading = 'lazy';
    const badge = document.createElement('span');
    badge.className = 'gal-extra-badge';
    badge.textContent = 'ANTES';
    photo.append(image, badge);

    const caption = document.createElement('figcaption');
    caption.textContent = `${pair.title} · ANTES`;
    figure.append(photo, caption);
    pairs.append(figure);

    const afterFigure = document.createElement('figure');
    afterFigure.className = 'gal-extra-pair';
    const afterPhoto = document.createElement('div');
    afterPhoto.className = 'gal-extra-photo';
    const afterImage = document.createElement('img');
    afterImage.src = `img/${pair.after}`;
    afterImage.alt = `${pair.title} depois da higienização`;
    afterImage.loading = 'lazy';
    const afterBadge = document.createElement('span');
    afterBadge.className = 'gal-extra-badge';
    afterBadge.textContent = 'DEPOIS';
    afterPhoto.append(afterImage, afterBadge);
    const afterCaption = document.createElement('figcaption');
    afterCaption.textContent = `${pair.title} · DEPOIS`;
    afterFigure.append(afterPhoto, afterCaption);
    pairs.append(afterFigure);
  }

  group.append(pairs);
  gallery.append(group);
}

const observer = new MutationObserver(addVomitGalleryGroup);
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
addVomitGalleryGroup();
