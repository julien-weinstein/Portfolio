'use strict';

/* ============================================================
   STATE
   ============================================================ */
const state = {
  cart: [],
  selectedColor: 'navy',
  selectedSize: null,
  qty: 1,
};

const COLOR_MAP = {
  navy:  { hex: '#0d1b2e', name: 'Navy' },
  white: { hex: '#f0f0f0', name: 'White' },
  red:   { hex: '#c0392b', name: 'Red' },
};

const PRICE = 29.99;

/* ============================================================
   DOM REFS
   ============================================================ */
const $ = id => document.getElementById(id);

const cartBtn       = $('cartBtn');
const cartCount     = $('cartCount');
const cartDrawer    = $('cartDrawer');
const cartOverlay   = $('cartOverlay');
const cartClose     = $('cartClose');
const cartBody      = $('cartBody');
const cartEmpty     = $('cartEmpty');
const cartItemsList = $('cartItems');
const cartFooter    = $('cartFooter');
const cartSubtotal  = $('cartSubtotal');

const colorLabel    = $('colorLabel');
const sizeLabel     = $('sizeLabel');
const qtyValue      = $('qtyValue');
const qtyMinus      = $('qtyMinus');
const qtyPlus       = $('qtyPlus');
const addToCartBtn  = $('addToCartBtn');
const buyNowBtn     = $('buyNowBtn');
const sizeError     = $('sizeError');

const sizeGuideBtn  = $('sizeGuideBtn');
const sizeModal     = $('sizeModal');
const sizeModalOverlay = $('sizeModalOverlay');
const sizeModalClose = $('sizeModalClose');

const checkoutBtn    = $('checkoutBtn');
const checkoutModal  = $('checkoutModal');
const checkoutOverlay = $('checkoutOverlay');
const checkoutModalClose = $('checkoutModalClose');
const checkoutForm   = $('checkoutForm');
const checkoutTotal  = $('checkoutTotal');

const successModal   = $('successModal');
const successOverlay = $('successOverlay');
const successClose   = $('successClose');
const successEmail   = $('successEmail');

const shirtPreview   = $('shirtPreview');

/* ============================================================
   COLOR SELECTION
   ============================================================ */
document.querySelectorAll('.swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    state.selectedColor = color;
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s === btn));
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('active', t.dataset.color === color));
    colorLabel.textContent = COLOR_MAP[color].name;
    applyShirtColor(color);
  });
});

document.querySelectorAll('.thumb').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    state.selectedColor = color;
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.color === color));
    colorLabel.textContent = COLOR_MAP[color].name;
    applyShirtColor(color);
  });
});

function applyShirtColor(color) {
  const hex = COLOR_MAP[color].hex;
  document.querySelectorAll('.shirt-body').forEach(el => {
    el.style.background = hex;
  });
  const collar = document.querySelectorAll('.shirt-collar');
  collar.forEach(el => {
    el.style.background = hex;
  });
}

/* ============================================================
   SIZE SELECTION
   ============================================================ */
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.selectedSize = btn.dataset.size;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b === btn));
    sizeLabel.textContent = btn.dataset.size;
    sizeError.classList.remove('visible');
  });
});

/* ============================================================
   QUANTITY
   ============================================================ */
qtyMinus.addEventListener('click', () => {
  if (state.qty > 1) { state.qty--; qtyValue.textContent = state.qty; }
});
qtyPlus.addEventListener('click', () => {
  if (state.qty < 10) { state.qty++; qtyValue.textContent = state.qty; }
});

/* ============================================================
   CART
   ============================================================ */
addToCartBtn.addEventListener('click', () => {
  if (!state.selectedSize) { sizeError.classList.add('visible'); return; }
  addToCart();
});

buyNowBtn.addEventListener('click', () => {
  if (!state.selectedSize) { sizeError.classList.add('visible'); return; }
  addToCart();
  openCart();
});

function addToCart() {
  const key = `${state.selectedColor}-${state.selectedSize}`;
  const existing = state.cart.find(i => i.key === key);
  if (existing) {
    existing.qty += state.qty;
  } else {
    state.cart.push({
      key,
      color: state.selectedColor,
      colorName: COLOR_MAP[state.selectedColor].name,
      size: state.selectedSize,
      qty: state.qty,
      price: PRICE,
    });
  }
  renderCart();
  flashCartBtn();
}

function removeFromCart(key) {
  state.cart = state.cart.filter(i => i.key !== key);
  renderCart();
}

function renderCart() {
  const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
  const count = state.cart.reduce((s, i) => s + i.qty, 0);

  cartCount.textContent = count;
  cartCount.classList.toggle('visible', count > 0);

  const isEmpty = state.cart.length === 0;
  cartEmpty.style.display = isEmpty ? 'flex' : 'none';
  cartItemsList.style.display = isEmpty ? 'none' : 'flex';
  cartFooter.style.display = isEmpty ? 'none' : 'block';

  cartItemsList.innerHTML = '';
  state.cart.forEach(item => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <img src="design.png" alt="Hunter Biden 2028 tee" class="cart-item-img" />
      <div class="cart-item-details">
        <div class="cart-item-name">Hunter Biden 2028 Tee</div>
        <div class="cart-item-meta">${item.colorName} / ${item.size} &times; ${item.qty}</div>
        <div class="cart-item-controls">
          <span class="cart-item-price">$${(item.qty * item.price).toFixed(2)}</span>
          <button class="cart-item-remove" data-key="${item.key}">Remove</button>
        </div>
      </div>
    `;
    cartItemsList.appendChild(li);
  });

  cartItemsList.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.key));
  });

  cartSubtotal.textContent = `$${total.toFixed(2)}`;
  checkoutTotal.textContent = `$${total.toFixed(2)}`;
}

function openCart() {
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

cartBtn.addEventListener('click', openCart);
cartClose.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

function flashCartBtn() {
  cartBtn.style.transform = 'scale(1.12)';
  setTimeout(() => { cartBtn.style.transform = ''; }, 200);
}

/* ============================================================
   SIZE GUIDE MODAL
   ============================================================ */
sizeGuideBtn.addEventListener('click', () => openModal(sizeModal, sizeModalOverlay));
sizeModalClose.addEventListener('click', () => closeModal(sizeModal, sizeModalOverlay));
sizeModalOverlay.addEventListener('click', () => closeModal(sizeModal, sizeModalOverlay));

/* ============================================================
   CHECKOUT MODAL
   ============================================================ */
checkoutBtn.addEventListener('click', () => {
  closeCart();
  setTimeout(() => openModal(checkoutModal, checkoutOverlay), 300);
});

checkoutModalClose.addEventListener('click', () => closeModal(checkoutModal, checkoutOverlay));
checkoutOverlay.addEventListener('click', () => closeModal(checkoutModal, checkoutOverlay));

checkoutForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateCheckoutForm()) return;
  const email = $('email').value.trim();
  closeModal(checkoutModal, checkoutOverlay);
  setTimeout(() => {
    successEmail.textContent = email;
    state.cart = [];
    renderCart();
    openModal(successModal, successOverlay);
  }, 250);
});

successClose.addEventListener('click', () => closeModal(successModal, successOverlay));
successOverlay.addEventListener('click', () => closeModal(successModal, successOverlay));

function validateCheckoutForm() {
  let valid = true;
  ['firstName','lastName','email','address','city','state','zip','cardNumber','expiry','cvv'].forEach(id => {
    const el = $(id);
    if (!el.value.trim()) {
      el.classList.add('invalid');
      valid = false;
    } else {
      el.classList.remove('invalid');
    }
  });
  return valid;
}

// Auto-format card number
$('cardNumber').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 16);
  e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
});

// Auto-format expiry
$('expiry').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
  if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
  e.target.value = v;
});

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(modal, overlay) {
  modal.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal, overlay) {
  modal.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Close modals with Escape
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeCart();
  closeModal(sizeModal, sizeModalOverlay);
  closeModal(checkoutModal, checkoutOverlay);
  closeModal(successModal, successOverlay);
});

/* ============================================================
   INIT
   ============================================================ */
renderCart();
