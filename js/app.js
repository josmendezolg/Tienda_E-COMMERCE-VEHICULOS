/* Luxury Motors Elite — SPA de catálogo, alquiler, carrito, pago simulado y PDF */
(() => {
  'use strict';

  /* ---------- Constantes y utilidades ---------- */
  const FIANZA = 500;          // USD por vehículo alquilado (reembolsable)
  const ITBIS = 0.18;          // 18 %
  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="100%" height="100%" fill="#0d121c"/>' +
    '<text x="50%" y="50%" fill="#00d2ff" font-family="Arial" font-size="28" text-anchor="middle">Imagen no disponible</text></svg>');
  const OFERTAS = [
    '🚚 Entrega a domicilio gratis', '✨ Detailing premium incluido', '🛡️ Seguro Platinum sin costo extra',
    '🥂 Chofer de cortesía en la entrega', '⛽ Primer tanque de cortesía', '🎟️ Acceso VIP a eventos corporativos'
  ];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeHtml = esc;
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const thumb = path => (window.PDF_THUMBNAILS && window.PDF_THUMBNAILS[path]) || path;

  const state = { items: [], tab: 'vehiculos', q: '', cart: [], rental: null, busy: false };

  const Toast = () => Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2200, timerProgressBar: true,
    customClass: { popup: 'lm-swal' }
  });
  const swalBase = { customClass: { popup: 'lm-swal' }, background: '#0d121c', color: '#ffffff', confirmButtonColor: '#ff9800' };

  /* ---------- Carga de datos (fetch + respaldo embebido) ---------- */
  async function loadCatalog() {
    try {
      const r = await fetch('vehiculo.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      console.warn('fetch(vehiculo.json) falló; usando respaldo embebido.', e);
      return window.CATALOGO_FALLBACK || { vehiculos: [], motos: [] };
    }
  }
  // Completa campos de alquiler/compra si el JSON no los trae (derivados del precio de venta)
  function normalize(it, col) {
    const o = { ...it, coleccion: col };
    const venta = Number(o.precio_venta) || 0;
    if (!(o.precio_compra > 0)) o.precio_compra = Math.round(venta * 0.85);
    if (!(o.precio_alquiler_dia > 0)) o.precio_alquiler_dia = Math.max(50, Math.round(venta * (col === 'motos' ? 0.004 : 0.0045) / 10) * 10);
    if (!(o.precio_alquiler_hora > 0)) o.precio_alquiler_hora = Math.max(10, Math.round(o.precio_alquiler_dia / 10 / 5) * 5);
    if (!o.oferta_alquiler) o.oferta_alquiler = OFERTAS[o.codigo % OFERTAS.length];
    o.existencia = Math.max(0, Number(o.existencia) || 0);
    return o;
  }
  const byCode = c => state.items.find(i => i.codigo === Number(c));

  /* ---------- Catálogo ---------- */
  function filtered() {
    const q = norm(state.q).trim();
    return state.items.filter(i => i.coleccion === state.tab &&
      (!q || norm([i.codigo, i.marca, i.modelo, i.tipo, i.categoria, i.caracteristicas, i.motor, i.combustible].join(' ')).includes(q)));
  }
  function stockBadge(n) {
    if (n <= 0) return '<span class="badge-stock out">Agotado</span>';
    if (n <= 5) return `<span class="badge-stock low">¡Solo ${n}!</span>`;
    return `<span class="badge-stock">${n.toLocaleString('en-US')} en stock</span>`;
  }
  function cardHtml(i) {
    const out = i.existencia <= 0;
    const doors = i.coleccion === 'motos' ? 'Moto · 2 ruedas' : `${i.numeroPuertas} puertas`;
    return `
    <article class="v-card" data-code="${i.codigo}">
      <div class="v-media">
        <img class="v-photo" data-fallback loading="lazy" src="${esc(i.imagen)}" alt="${esc(i.modelo)}">
        <span class="badge-oferta" title="${esc(i.oferta_alquiler)}">${esc(i.oferta_alquiler)}</span>
        ${stockBadge(i.existencia)}
      </div>
      <div class="v-body">
        <div class="v-head">
          <img class="brand-logo" data-fallback-hide loading="lazy" src="${esc(i.logo)}" alt="Logo ${esc(i.marca)}">
          <div><div class="v-brand">${esc(i.marca)}</div><h3 class="v-model">${esc(i.modelo)}</h3></div>
          <span class="v-code">#${i.codigo}</span>
        </div>
        <p class="v-desc">${esc(i.caracteristicas)}</p>
        <ul class="v-specs">
          <li><i class="fa-solid fa-door-open"></i>${esc(doors)}</li>
          <li><i class="fa-solid fa-gears"></i>${esc(i.motor)}</li>
          <li><i class="fa-solid fa-gas-pump"></i>${esc(i.combustible)}</li>
          <li><i class="fa-solid fa-tag"></i>${esc(i.tipo)}</li>
        </ul>
        <div class="v-prices">
          <div class="price-row"><span>Precio de venta</span><span class="price-sale">${money(i.precio_venta)}</span></div>
          <div class="price-row"><span>Alquiler / día</span><span class="price-rent">${money(i.precio_alquiler_dia)}</span></div>
          <div class="price-row"><span>Alquiler / hora</span><span class="price-rent">${money(i.precio_alquiler_hora)}</span></div>
        </div>
        <div class="v-actions">
          <button class="btn-lm btn-rent" data-act="rent" data-code="${i.codigo}" ${out ? 'disabled' : ''}>🔑 Alquilar</button>
          <button class="btn-lm btn-buy" data-act="buy" data-code="${i.codigo}" ${out ? 'disabled' : ''}>🛒 Comprar</button>
        </div>
      </div>
    </article>`;
  }
  function renderCatalog() {
    const list = filtered();
    $('#catalogGrid').innerHTML = list.length ? list.map(cardHtml).join('')
      : `<div class="empty-state"><strong>Sin resultados</strong><br>Prueba con otra marca, modelo o código.</div>`;
    $('#resultCount').textContent = `${list.length} unidad${list.length === 1 ? '' : 'es'}`;
  }

  /* ---------- Carrito ---------- */
  const lineSub = l => r2(l.unit * l.qty);
  function totals() {
    const subtotal = r2(state.cart.reduce((s, l) => s + lineSub(l), 0));
    const itbis = r2(subtotal * ITBIS);
    const rentUnits = state.cart.filter(l => l.kind === 'alquiler').reduce((s, l) => s + l.qty, 0);
    const fianza = r2(rentUnits * FIANZA);
    return { subtotal, itbis, fianza, total: r2(subtotal + itbis + fianza), hasSale: state.cart.some(l => l.kind === 'venta'), hasRent: rentUnits > 0 };
  }
  function updateBadge() { $('#cartBadge').textContent = state.cart.reduce((s, l) => s + l.qty, 0); }
  function addLine(line) {
    const it = byCode(line.code);
    const ex = state.cart.find(l => l.key === line.key);
    const inCart = state.cart.filter(l => l.code === line.code).reduce((s, l) => s + l.qty, 0);
    if (inCart + 1 > it.existencia) { Toast().fire({ icon: 'warning', title: 'Stock insuficiente para esta unidad' }); return false; }
    if (ex) ex.qty += 1; else state.cart.push({ ...line, qty: 1 });
    updateBadge();
    Toast().fire({ icon: 'success', title: `${it.modelo} agregado al carrito` });
    return true;
  }
  function renderCart() {
    const body = $('#cartBody'), footer = $('#cartFooter');
    if (!state.cart.length) {
      body.innerHTML = '<div class="empty-cart"><div style="font-size:3rem">🛒</div><p class="mb-0">Tu carrito está vacío. Elige un vehículo para comprar o alquilar.</p></div>';
      footer.classList.add('d-none'); return;
    }
    footer.classList.remove('d-none');
    const t = totals();
    const row = l => {
      const it = byCode(l.code);
      const meta = l.kind === 'venta'
        ? `Adquisición definitiva · ${money(l.unit)} c/u`
        : `${l.duracion} ${l.modalidad} · desde ${l.fechaInicio} · ${money(l.rate)}/${l.modalidad.startsWith('Hora') ? 'hora' : 'día'}`;
      return `<div class="cart-line">
        <img src="${esc(it.imagen)}" data-fallback alt="${esc(it.modelo)}">
        <div>
          <div class="cl-name"><span class="type-tag ${l.kind}">${l.kind === 'venta' ? 'VENTA' : 'ALQUILER'}</span>${esc(it.modelo)}</div>
          <div class="cl-meta">${esc(meta)}</div>
          <div class="qty-ctl">
            <button data-cart="dec" data-key="${esc(l.key)}" aria-label="Disminuir">−</button><span class="q">${l.qty}</span>
            <button data-cart="inc" data-key="${esc(l.key)}" aria-label="Aumentar">+</button>
            <button class="del" data-cart="del" data-key="${esc(l.key)}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="cl-sub">${money(lineSub(l))}</div></div>`;
    };
    const sales = state.cart.filter(l => l.kind === 'venta'), rents = state.cart.filter(l => l.kind === 'alquiler');
    body.innerHTML =
      (sales.length ? `<div class="cart-section-title">Compras definitivas</div>${sales.map(row).join('')}` : '') +
      (rents.length ? `<div class="cart-section-title">Contratos de alquiler</div>${rents.map(row).join('')}` : '') +
      `<div class="lm-alert mt-3">
        <div class="sum-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
        <div class="sum-row"><span>Impuestos (ITBIS 18%)</span><span>${money(t.itbis)}</span></div>
        ${t.hasRent ? `<div class="sum-row"><span>Depósito de fianza reembolsable</span><span>${money(t.fianza)}</span></div>` : ''}
        <div class="sum-row total"><span>Total a pagar</span><span>${money(t.total)}</span></div>
      </div>`;
  }
  function cartAction(act, key) {
    const l = state.cart.find(x => x.key === key); if (!l) return;
    const it = byCode(l.code);
    if (act === 'inc') {
      const inCart = state.cart.filter(x => x.code === l.code).reduce((s, x) => s + x.qty, 0);
      if (inCart + 1 > it.existencia) { Toast().fire({ icon: 'warning', title: 'No hay más unidades en stock' }); return; }
      l.qty++;
    } else if (act === 'dec') { l.qty--; if (l.qty <= 0) state.cart = state.cart.filter(x => x !== l); }
    else if (act === 'del') state.cart = state.cart.filter(x => x !== l);
    updateBadge(); renderCart();
  }

  /* ---------- Modal de alquiler ---------- */
  const rentModal = () => bootstrap.Modal.getOrCreateInstance($('#rentModal'));
  function openRental(code) {
    const it = byCode(code); state.rental = it;
    $('#rentPhoto').src = it.imagen; $('#rentPhoto').alt = it.modelo; $('#rentPhoto').setAttribute('data-fallback', '');
    $('#rentModel').textContent = it.modelo; $('#rentBrand').textContent = `${it.marca} · #${it.codigo}`;
    $('#rentRateDay').textContent = money(it.precio_alquiler_dia) + ' /Día';
    $('#rentRateHour').textContent = money(it.precio_alquiler_hora) + ' /Hora';
    $('#modeDay').checked = true;
    $('#rentalDurationInput').value = 3;
    const d = $('#rentalStartDate'); d.min = todayISO(); d.value = todayISO();
    updateRentCalc(); rentModal().show();
  }
  function rentParams() {
    const it = state.rental, hour = $('#modeHour').checked;
    const max = hour ? 720 : 365;
    let dur = parseInt($('#rentalDurationInput').value, 10);
    if (!Number.isFinite(dur) || dur < 1) dur = 1; if (dur > max) dur = max;
    return { it, hour, dur, max, modalidad: hour ? 'Hora(s)' : 'Día(s)', rate: hour ? it.precio_alquiler_hora : it.precio_alquiler_dia };
  }
  function updateRentCalc() {
    if (!state.rental) return;
    const p = rentParams();
    $('#durLabel').textContent = p.hour ? 'Cantidad de horas' : 'Cantidad de días';
    $('#rentalDurationInput').max = p.max;
    $('#calcRate').textContent = `${money(p.rate)} / ${p.hour ? 'hora' : 'día'}`;
    $('#calcDur').textContent = `${p.dur} ${p.modalidad}`;
    $('#calcSub').textContent = money(r2(p.rate * p.dur));
  }
  function addRental() {
    const p = rentParams(), fecha = $('#rentalStartDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < todayISO()) {
      Swal.fire({ ...swalBase, icon: 'warning', title: 'Fecha de inicio inválida', text: 'Elige una fecha de hoy en adelante.' }); return;
    }
    $('#rentalDurationInput').value = p.dur;
    const ok = addLine({
      key: `a-${p.it.codigo}-${p.modalidad}-${p.dur}-${fecha}`, kind: 'alquiler', code: p.it.codigo,
      modalidad: p.modalidad, duracion: p.dur, fechaInicio: fecha, rate: p.rate, unit: r2(p.rate * p.dur)
    });
    if (ok) rentModal().hide();
  }

  /* ---------- Checkout ---------- */
  const DEMO = {
    fName: 'Ing. Juancito Peña Vizcaíno', fId: '001-1234567-8', fLicense: 'DO-8874125-VIP (Vigente)', fPhone: '+1 (809) 555-0199',
    fEmail: 'juancito.pena@luxurymotors.com', fAddress: 'Av. Anacaona #105, Torre Bella Vista, Santo Domingo, D.N.',
    fCard: '4532 8901 2345 8899', fExp: '12/28', fCvv: '789'
  };
  function fillDemo() { Object.entries(DEMO).forEach(([id, v]) => { $('#' + id).value = v; }); updateCcPreview(); }
  function updateCcPreview() { $('#ccPreview').textContent = $('#fCard').value.trim() || '•••• •••• •••• ••••'; }
  function swapModal(fromSel, toSel) {
    const from = $(fromSel), to = $(toSel);
    const inst = bootstrap.Modal.getInstance(from);
    if (inst && from.classList.contains('show')) {
      from.addEventListener('hidden.bs.modal', () => bootstrap.Modal.getOrCreateInstance(to).show(), { once: true });
      inst.hide();
    } else bootstrap.Modal.getOrCreateInstance(to).show();
  }
  function openCheckout() {
    if (!state.cart.length) return;
    const t = totals();
    $('#ckTotal').textContent = money(t.total);
    $('#licenseRow').classList.toggle('d-none', !t.hasRent);
    swapModal('#cartModal', '#checkoutModal');
  }
  function validateForm() {
    const v = id => $('#' + id).value.trim(), t = totals(), errs = [];
    if (v('fName').length < 3) errs.push('Nombre y apellidos');
    if (v('fId').length < 5) errs.push('Documento / cédula');
    if (t.hasRent && v('fLicense').length < 4) errs.push('Licencia de conducir');
    if (!/^[+()\d\s-]{7,}$/.test(v('fPhone'))) errs.push('Teléfono');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fEmail'))) errs.push('Correo electrónico');
    if (v('fAddress').length < 5) errs.push('Dirección de entrega');
    const digits = v('fCard').replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(digits)) errs.push('Número de tarjeta');
    const m = v('fExp').match(/^(\d{2})\/(\d{2})$/);
    const now = new Date();
    if (!m || +m[1] < 1 || +m[1] > 12 || (2000 + +m[2]) * 12 + +m[1] < now.getFullYear() * 12 + now.getMonth() + 1) errs.push('Vencimiento (MM/AA vigente)');
    if (!/^\d{3,4}$/.test(v('fCvv'))) errs.push('CVV');
    if (errs.length) {
      Swal.fire({ ...swalBase, icon: 'error', title: 'Revisa estos campos', html: '<div style="text-align:left">• ' + errs.map(esc).join('<br>• ') + '</div>' });
      return false;
    }
    return true;
  }

  /* ---------- PDF ---------- */
  const rand6 = () => String(Math.floor(100000 + Math.random() * 900000));
  function docMeta(t) {
    if (t.hasSale && t.hasRent) return { title: 'FACTURA DE VENTA Y CONTRATO DE ALQUILER', file: 'factura_de_venta_y_contrato_de_alquiler' };
    if (t.hasRent) return { title: 'CONTRATO DE ALQUILER Y ACUERDO DE RESPONSABILIDAD', file: 'contrato_de_alquiler_y_acuerdo_de_responsabilidad' };
    return { title: 'FACTURA DE VENTA', file: 'factura_de_venta' };
  }
  function buildDocHtml(o) {
    const { cart, t, client, docNo, when } = o;
    const clientName = client.name, clientId = client.id;
    const meta = docMeta(t);
    const TD = 'padding:5px 4px;border-bottom:1px solid #e5e7eb;vertical-align:middle;color:#333333 !important;';
    const rows = cart.map((l, idx) => {
      const it = l.item, isSale = l.kind === 'venta';
      const detail = isSale ? 'Adquisición Vehicular Definitiva'
        : `Alquiler: ${l.duracion} ${l.modalidad} (Desde ${l.fechaInicio})`;
      const badge = isSale
        ? '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#e8f5e9;color:#1b5e20 !important;font-weight:bold;font-size:8px;">VENTA</span>'
        : '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#e1f5fe;color:#01579b !important;font-weight:bold;font-size:8px;">ALQUILER</span>';
      return `<tr style="page-break-inside:avoid;">
        <td style="${TD}text-align:center;">${idx + 1}</td>
        <td style="${TD}"><img src="${thumb(it.imagen)}" width="55" height="38" style="width:55px;height:38px;object-fit:cover;border-radius:3px;display:block;" alt=""></td>
        <td style="${TD}"><strong style="color:#111111 !important;">${esc(it.marca)}</strong><br>${esc(it.modelo)}<br><span style="font-size:8px;color:#555555 !important;">Cód. ${it.codigo}</span></td>
        <td style="${TD}">${badge}</td>
        <td style="${TD}font-size:9px;">${esc(detail)}</td>
        <td style="${TD}text-align:right;">${money(l.unit)}</td>
        <td style="${TD}text-align:center;">${l.qty}</td>
        <td style="${TD}text-align:right;font-weight:bold;color:#111111 !important;">${money(r2(l.unit * l.qty))}</td></tr>`;
    }).join('');

    const clausesHtml = `
<!-- Acuerdo de Responsabilidad y Términos de Alquiler (OBLIGATORIO EN ALQUILER - BLINDADO CON !IMPORTANT) -->
<div style="margin-top: 15px; padding: 10px 14px; background: #fafafa !important; border: 1px solid #e5e5e5; border-radius: 6px; font-size: 9.5px; color: #333333 !important; line-height: 1.45; page-break-inside: avoid;">
  <h5 style="margin: 0 0 6px 0; font-size: 10.5px; font-weight: bold; color: #111111 !important; text-transform: uppercase;">
    Acuerdo de Responsabilidad y Términos de Alquiler:
  </h5>
  <p style="margin: 0 0 4px 0; color: #333333 !important;"><strong style="color: #111111 !important;">1. Custodia del Bien:</strong> El arrendatario se compromete a operar la unidad bajo las leyes de tránsito vigentes, no exceder los límites de velocidad y mantener el vehículo en óptimas condiciones mecánicas y estéticas.</p>
  <p style="margin: 0 0 4px 0; color: #333333 !important;"><strong style="color: #111111 !important;">2. Cobertura & Deducible:</strong> La unidad cuenta con póliza de seguro completa con deducible del 10% en caso de colisión comprobada. Daños por negligencia, ingesta de alcohol o sustancias ilícitas son de responsabilidad exclusiva del arrendatario.</p>
  <p style="margin: 0 0 4px 0; color: #333333 !important;"><strong style="color: #111111 !important;">3. Política de Combustible:</strong> La unidad se entrega con tanque lleno y debe ser devuelta en las mismas condiciones. De lo contrario, se aplicará el cargo estándar de reposición.</p>
</div>

<!-- Firmas de Responsabilidad (BLINDADAS CONTRA TEXTO INVISIBLE) -->
<table style="width: 100%; margin-top: 30px; font-size: 10px; text-align: center; page-break-inside: avoid;" cellpadding="0" cellspacing="0">
  <tr>
    <td style="width: 45%; vertical-align: top;">
      <div style="border-top: 1px solid #333; padding-top: 6px; margin: 0 20px;">
        <strong style="color: #111111 !important;">LUXURY MOTORS ELITE CORP.</strong><br>
        <span style="font-size: 9px; color: #555555 !important;">Firma Autorizada / Departamento Comercial</span>
      </div>
    </td>
    <td style="width: 10%;"></td>
    <td style="width: 45%; vertical-align: top;">
      <div style="border-top: 1px solid #333; padding-top: 6px; margin: 0 20px;">
        <strong style="color: #111111 !important;">${escapeHtml(clientName)}</strong><br>
        <span style="font-size: 9px; color: #555555 !important;">Doc ID: ${escapeHtml(clientId)} (Cliente / Arrendatario)</span>
      </div>
    </td>
  </tr>
</table>`;
    const saleHtml = `
<!-- Bloque de Entrega Venta -->
<div style="margin-top: 20px; padding: 10px; background: #fdfdfd; border-left: 3px solid #2e7d32; font-size: 9.5px; color: #444444 !important; page-break-inside: avoid;">
  <strong style="color: #111111 !important;">Garantía de Satisfacción:</strong> Unidad vendida con garantía certificada de 3 años o 60,000 km, traspaso legal garantizado y asistencia vial 24/7 de cortesía durante el primer año.
</div>`;

    return `<div class="pdf-doc-root" style="background:#ffffff !important;color:#333333 !important;font-family:Arial,Helvetica,sans-serif;font-size:10px;padding:6px 4px;">
  <div style="text-align:center;">
    <img src="${thumb('assets/logo_pagina.png')}" alt="Luxury Motors Elite" style="height:54px;width:auto;margin-bottom:4px;">
    <h2 style="margin:4px 0 2px;font-size:18px;letter-spacing:1.5px;color:#111111 !important;font-weight:bold;">LUXURY MOTORS ELITE CORP.</h2>
    <div style="font-size:9px;color:#334155 !important;">Av. Anacaona #105, Torre Empresarial Elite, Piso 14 | Tel: +1 (809) 555-ELITE | info@luxurymotors.com</div>
    <div style="margin:10px 0 12px;"><span style="display:inline-block;background:#111111 !important;color:#ffffff !important;font-size:13px;font-weight:bold;padding:4px 18px;border-radius:4px;text-transform:uppercase;">${meta.title}</span></div>
  </div>
  <table style="width:100%;border-collapse:separate;border-spacing:0;background:#f8f9fa !important;border:1px solid #e9ecef;border-radius:6px;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:50%;vertical-align:top;padding:8px 12px;font-size:9.5px;line-height:1.55;color:#333333 !important;">
        <strong style="color:#1e3a8a !important;">DATOS DEL CLIENTE:</strong><br>
        <strong style="color:#111111 !important;">Nombre:</strong> ${esc(clientName)}<br>
        <strong style="color:#111111 !important;">Identificación:</strong> ${esc(clientId)}<br>
        <strong style="color:#111111 !important;">Teléfono:</strong> ${esc(client.phone)}<br>
        <strong style="color:#111111 !important;">Email:</strong> ${esc(client.email)}<br>
        <strong style="color:#111111 !important;">Dirección:</strong> ${esc(client.address)}
      </td>
      <td style="width:50%;vertical-align:top;padding:8px 12px;font-size:9.5px;line-height:1.55;color:#333333 !important;">
        <strong style="color:#1e3a8a !important;">DETALLES DE LA TRANSACCIÓN:</strong><br>
        <strong style="color:#111111 !important;">No. Documento:</strong> ${docNo}<br>
        <strong style="color:#111111 !important;">Fecha &amp; Hora:</strong> ${esc(when)}<br>
        <strong style="color:#111111 !important;">Método de Pago:</strong> ${esc(client.pay)}<br>
        <strong style="color:#111111 !important;">Estado:</strong> <span style="color:#2e7d32 !important;font-weight:bold;">Procesado &amp; Confirmado</span><br>
        <strong style="color:#111111 !important;">Agente Emisor:</strong> Sistema Automatizado JPV Pro
        ${t.hasRent && client.license ? `<br><strong style="color:#111111 !important;">Licencia:</strong> ${esc(client.license)}` : ''}
      </td>
    </tr>
  </table>
  <table style="width:100%;margin-top:12px;border-collapse:collapse;table-layout:fixed;font-size:9.5px;" cellpadding="0" cellspacing="0">
    <thead><tr style="background:#111111 !important;">
      ${[['#', 4], ['Foto', 12], ['Vehículo / Modelo', 28], ['Tipo', 11], ['Detalle', 21], ['Precio', 10], ['Cant.', 4], ['Subtotal', 10]]
        .map(([h, w]) => `<th style="width:${w}%;background:#111111 !important;color:#ffffff !important;padding:6px 4px;text-align:left;font-size:9px;">${h}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table style="width:100%;margin-top:12px;page-break-inside:avoid;" cellpadding="0" cellspacing="0"><tr>
    <td style="width:55%;vertical-align:top;padding-right:16px;font-size:9.5px;color:#555555 !important;">* Este documento constituye una certificación legal y comercial de los servicios y compras pactadas con Luxury Motors Elite Corp. Todo vehículo cuenta con inspección técnica certificada de 150 puntos.</td>
    <td style="width:45%;vertical-align:top;">
      <table style="width:100%;font-size:10px;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:3px 0;color:#333333 !important;">Subtotal Bruto</td><td style="padding:3px 0;text-align:right;color:#333333 !important;">${money(t.subtotal)}</td></tr>
        <tr><td style="padding:3px 0;color:#333333 !important;">Impuestos &amp; Tasas (ITBIS 18%)</td><td style="padding:3px 0;text-align:right;color:#333333 !important;">${money(t.itbis)}</td></tr>
        ${t.hasRent ? `<tr><td style="padding:3px 0;color:#333333 !important;">Fianza reembolsable</td><td style="padding:3px 0;text-align:right;color:#333333 !important;">${money(t.fianza)}</td></tr>` : ''}
        <tr><td style="padding:6px 0 0;border-top:2px solid #111;font-size:14px;font-weight:800;color:#111111 !important;">TOTAL GENERAL</td><td style="padding:6px 0 0;border-top:2px solid #111;text-align:right;font-size:14px;font-weight:800;color:#111111 !important;">${money(t.total)}</td></tr>
      </table>
    </td></tr></table>
  ${t.hasSale ? saleHtml : ''}
  ${t.hasRent ? clausesHtml : ''}
  <div style="margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 8px; text-align: center; font-size: 8.5px; color: #666666 !important;">
    Documento generado automáticamente por el Sistema E-Commerce &amp; Alquiler de Vehículos Premium | Arquitectura por Ing. Juancito Peña
  </div>
</div>`;
  }

  function hardCloseModals() {
    $$('.modal').forEach(m => { const i = bootstrap.Modal.getInstance(m); if (i) i.hide(); });
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
    document.body.style.removeProperty('overflow');
  }

  function pay() {
    if (state.busy || !validateForm()) return;
    state.busy = true;
    const v = id => $('#' + id).value.trim();
    const t = totals();
    const docNo = 'LME-' + rand6();
    const cart = state.cart.map(l => ({ ...l, item: byCode(l.code) }));
    const html = buildDocHtml({
      cart, t, docNo, when: new Date().toLocaleString('es-DO'),
      client: { name: v('fName'), id: v('fId'), phone: v('fPhone'), email: v('fEmail'), address: v('fAddress'), license: v('fLicense'),
        pay: 'Tarjeta •••• ' + v('fCard').replace(/\s/g, '').slice(-4) + ' (simulada)' }
    });
    const filename = `${docMeta(t).file}_${docNo}.pdf`;
    const opt = {
      margin: [8, 8, 8, 8], filename, image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, scrollY: 0, scrollX: 0, useCORS: true, logging: false, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h5'] }
    };
    const bought = state.cart.filter(l => l.kind === 'venta');

    // 1) cerrar modales y limpiar backdrops huérfanos ANTES de html2pdf
    hardCloseModals();
    Toast().fire({ icon: 'info', title: 'Generando documento…', timer: 1800 });

    // 2) disparo directo con string HTML
    setTimeout(() => {
      html2pdf().set(opt).from(html).save().then(() => {
        bought.forEach(l => { const it = byCode(l.code); it.existencia = Math.max(0, it.existencia - l.qty); });
        state.cart = []; updateBadge(); renderCart(); renderCatalog();
        state.busy = false;
        Swal.fire({ ...swalBase, icon: 'success', title: '¡Pago procesado!',
          html: `Documento <strong style="color:#ffd700">${docNo}</strong> generado.<br><span style="color:#d6e4f0">${esc(filename)}</span>` });
      }).catch(err => {
        console.error(err); state.busy = false;
        Swal.fire({ ...swalBase, icon: 'error', title: 'No se pudo generar el PDF', text: 'Tu carrito se conserva. Intenta de nuevo.' });
      });
    }, 350);
  }

  /* ---------- Eventos ---------- */
  function bind() {
    $('#searchInput').addEventListener('input', e => { state.q = e.target.value; renderCatalog(); });
    $$('.tab-pill').forEach(b => b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      $$('.tab-pill').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
      renderCatalog();
    }));
    $('#catalogGrid').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const it = byCode(btn.dataset.code);
      if (btn.dataset.act === 'rent') openRental(it.codigo);
      else addLine({ key: `v-${it.codigo}`, kind: 'venta', code: it.codigo, unit: it.precio_venta });
    });
    $('#rentalDurationInput').addEventListener('input', updateRentCalc);
    $$('input[name="rentMode"]').forEach(r => r.addEventListener('change', () => {
      $('#rentalDurationInput').value = r.value.startsWith('Hora') ? 4 : 3; updateRentCalc();
    }));
    $('#rentAddBtn').addEventListener('click', addRental);
    $('#cartModal').addEventListener('show.bs.modal', renderCart);
    $('#cartBody').addEventListener('click', e => { const b = e.target.closest('[data-cart]'); if (b) cartAction(b.dataset.cart, b.dataset.key); });
    $('#clearCartBtn').addEventListener('click', () => { state.cart = []; updateBadge(); renderCart(); });
    $('#goCheckoutBtn').addEventListener('click', openCheckout);
    $('#backToCartBtn').addEventListener('click', () => swapModal('#checkoutModal', '#cartModal'));
    $('#fillDemoBtn').addEventListener('click', () => { fillDemo(); Toast().fire({ icon: 'success', title: 'Datos de prueba cargados' }); });
    $('#fCard').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); updateCcPreview();
    });
    $('#payBtn').addEventListener('click', pay);
    $('#checkoutForm').addEventListener('submit', e => { e.preventDefault(); pay(); });
    // Imágenes rotas → placeholder (logos → ocultos)
    document.addEventListener('error', e => {
      const el = e.target; if (!(el instanceof HTMLImageElement)) return;
      if (el.hasAttribute('data-fallback') && el.src !== PLACEHOLDER) el.src = PLACEHOLDER;
      else if (el.hasAttribute('data-fallback-hide')) el.style.visibility = 'hidden';
    }, true);
  }

  async function init() {
    const data = await loadCatalog();
    state.items = [
      ...(data.vehiculos || []).map(i => normalize(i, 'vehiculos')),
      ...(data.motos || []).map(i => normalize(i, 'motos'))
    ];
    $('#rentalStartDate').value = todayISO();
    bind(); renderCatalog(); updateBadge();
  }
  init();
})();
