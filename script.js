const filterButtons = document.querySelectorAll('.filter-button');
const menuCards = document.querySelectorAll('.menu-card');
const toast = document.getElementById('toast');
let toastTimer;

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    menuCards.forEach((card) => {
      card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter);
    });
  });
});

document.querySelectorAll('.add-button').forEach((button) => {
  button.addEventListener('click', () => {
    toast.textContent = `تمت إضافة ${button.dataset.item} إلى طلبك ✓`;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  });
});

const bookingForm = document.getElementById('bookingForm');
bookingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = bookingForm.elements.name.value.trim();
  document.getElementById('formMessage').textContent = `شكرًا ${name}، وصلنا طلب حجزك وسنتواصل معك قريبًا.`;
  bookingForm.reset();
});

function makeRestaurantQr() {
  const text = 'https://www.google.com/maps?q=33.486019,36.345146';
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const appendBits = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  appendBits(0b0100, 4);
  appendBits(bytes.length, 8);
  bytes.forEach((byte) => appendBits(byte, 8));
  for (let i = 0; i < Math.min(4, 640 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; data.length < 80; pad++) data.push(pad % 2 ? 0x11 : 0xec);

  const gfMultiply = (left, right) => {
    let result = 0;
    while (right) {
      if (right & 1) result ^= left;
      left <<= 1;
      if (left & 0x100) left ^= 0x11d;
      right >>>= 1;
    }
    return result;
  };
  let generator = [1];
  let root = 1;
  for (let i = 0; i < 20; i++) {
    const next = Array(generator.length + 1).fill(0);
    generator.forEach((coefficient, index) => {
      next[index] ^= gfMultiply(coefficient, root);
      next[index + 1] ^= coefficient;
    });
    generator = next;
    root = gfMultiply(root, 2);
  }
  const remainder = [...data, ...Array(20).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i];
    if (factor) generator.forEach((coefficient, index) => {
      remainder[i + index] ^= gfMultiply(coefficient, factor);
    });
  }
  const allBits = [...data, ...remainder.slice(data.length)].flatMap((byte) =>
    Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1)
  );

  const size = 33;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const setFinder = (top, left) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const row = top + dy;
      const col = left + dx;
      if (row < 0 || col < 0 || row >= size || col >= size) continue;
      matrix[row][col] = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6 &&
        (dy === 0 || dy === 6 || dx === 0 || dx === 6 || (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4));
    }
  };
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    matrix[26 + dy][26 + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
  }

  const formatData = 0b01000;
  let formatRemainder = formatData << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((formatRemainder >>> bit) & 1) formatRemainder ^= 0x537 << (bit - 10);
  }
  const format = ((formatData << 10) | formatRemainder) ^ 0x5412;
  const formatBit = (index) => ((format >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i++) matrix[i][8] = formatBit(i);
  matrix[7][8] = formatBit(6);
  matrix[8][8] = formatBit(7);
  matrix[8][7] = formatBit(8);
  for (let i = 9; i < 15; i++) matrix[8][14 - i] = formatBit(i);
  for (let i = 0; i < 8; i++) matrix[8][size - 1 - i] = formatBit(i);
  for (let i = 8; i < 15; i++) matrix[size - 15 + i][8] = formatBit(i);
  matrix[size - 8][8] = true;

  let bitIndex = 0;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < size; vertical++) {
      const row = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const col = right - offset;
        if (matrix[row][col] !== null) continue;
        const value = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
        matrix[row][col] = Boolean(value ^ ((row + col) % 2 === 0 ? 1 : 0));
      }
    }
  }

  const path = matrix.flatMap((row, y) => row.flatMap((dark, x) =>
    dark ? [`M${x + 4},${y + 4}h1v1h-1z`] : []
  )).join('');
  document.getElementById('restaurantQr').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41" shape-rendering="crispEdges" role="img" aria-label="رمز QR لموقع المطعم"><rect width="41" height="41" fill="white"/><path d="${path}" fill="#11100f"/></svg>`;
}

makeRestaurantQr();
