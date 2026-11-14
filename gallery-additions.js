// Adds the before/after photos without changing or re-encoding the originals.
const EXTRA_GROUP = [
  { title: 'Porta inteira', before: 'vomito-porta-antes.jpg', after: 'vomito-porta-depois.jpg' },
  { title: 'Forro da porta', before: 'vomito-forro-antes.jpg', after: 'vomito-forro-depois.jpg' },
];
const BANK_IMAGE_ORDER = ['bancos-3.jpg', 'bancos-2.jpg', 'bancos-1.jpg'];

function reorderBankGalleryImages(gallery) {
  const children = [...gallery.children];
  const bankFigures = children.filter((figure) => {
    const image = figure.matches('.gi') ? figure.querySelector('img') : null;
    return image && BANK_IMAGE_ORDER.some((filename) => image.src.endsWith(`/img/${filename}`));
  });
  if (bankFigures.length !== BANK_IMAGE_ORDER.length) return;

  const bankByFilename = new Map(bankFigures.map((figure) => {
    const image = figure.querySelector('img');
    const filename = BANK_IMAGE_ORDER.find((item) => image.src.endsWith(`/img/${item}`));
    return [filename, figure];
  }));
  let nextBank = 0;
  const reordered = children.map((child) => child.matches('.gi') && bankFigures.includes(child)
    ? bankByFilename.get(BANK_IMAGE_ORDER[nextBank++])
    : child);
  gallery.append(...reordered);
}

function addVomitGalleryGroup() {
  const app = document.getElementById('app');
  if (!app) return;
  const heading = [...app.querySelectorAll('h1')].find((item) => item.textContent.trim() === 'Antes e depois');
  const gallery = app.querySelector('.gal');
  if (!heading || !gallery) return;

  reorderBankGalleryImages(gallery);
  if (gallery.querySelector('[data-gallery-extra="vomito"]')) return;

  const group = document.createElement('section');
  group.className = 'gal-extra';
  group.dataset.galleryExtra = 'vomito';

  const title = document.createElement('h2');
  title.textContent = 'Descontaminação interna da porta com remoção do forro';
  group.append(title);

  const photos = document.createElement('div');
  photos.className = 'gal-extra-pairs';

  for (const pair of EXTRA_GROUP) {
    for (const [imageFile, state] of [[pair.before, 'ANTES'], [pair.after, 'DEPOIS']]) {
      const figure = document.createElement('figure');
      figure.className = 'gal-extra-pair';
      const photo = document.createElement('div');
      photo.className = 'gal-extra-photo';

      const image = document.createElement('img');
      image.src = `img/${imageFile}`;
      image.alt = `${pair.title} ${state.toLowerCase()} da higienização`;
      image.loading = 'lazy';

      const badge = document.createElement('span');
      badge.className = 'gal-extra-badge';
      badge.textContent = state;
      photo.append(image, badge);
      figure.append(photo);
      photos.append(figure);
    }
  }

  group.append(photos);
  gallery.append(group);
}

const observer = new MutationObserver(addVomitGalleryGroup);
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
addVomitGalleryGroup();
