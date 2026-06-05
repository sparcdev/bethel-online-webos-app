// Horizontal row of tiles.
import { createTile } from './tile.js';

export function createRow(title, items, onTileActivate) {
  const wrap = document.createElement('section');
  wrap.className = 'row';
  wrap.innerHTML = `
    <h2 class="row-title">${(title || '').replace(/</g, '&lt;')}</h2>
    <div class="row-track"></div>
  `;
  const track = wrap.querySelector('.row-track');
  (items || []).forEach((item) => {
    track.appendChild(createTile(item, onTileActivate));
  });
  if (!items || !items.length) {
    track.innerHTML = `<div class="row-empty">No items</div>`;
  }
  return wrap;
}

export function createSkeletonRow(title) {
  const wrap = document.createElement('section');
  wrap.className = 'row row-skeleton';
  wrap.innerHTML = `
    <h2 class="row-title">${(title || '').replace(/</g, '&lt;')}</h2>
    <div class="row-track">
      ${Array.from({ length: 6 }).map(() => `<div class="tile tile-skeleton"></div>`).join('')}
    </div>
  `;
  return wrap;
}
