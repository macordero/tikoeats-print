// =============================================================================
// The window: link screen → branch → "Mis impresoras", plus the job loop.
//
// The loop asks Tiko for work every few seconds. Each job (a kitchen
// comanda, a customer receipt, a test page) goes to every printer set up for
// that kind of ticket, then the result is reported back. A job that fails is
// handed out again by the server (up to 3 tries).
// =============================================================================

import './styles.css';
import { api, ApiError, type Job, type Poll } from './api';
import { jobHtml, testPageHtml } from './tickets';

type PrinterCfg = {
  id: string;
  name: string; // "Cocina", "Caja"
  device: string; // the OS printer's name
  copies: number;
  kitchen: boolean;
  customer: boolean;
};

type LogEntry = { ok: boolean | null; text: string; at: number };

const POLL_MS = 3000;
const POLL_BACKOFF_MS = 10000;

const $app = document.getElementById('app')!;
const state = {
  token: null as string | null,
  info: null as { version: string; platform: string; hostname: string; openAtLogin: boolean } | null,
  device: null as { name: string; branch_name: string; account_name: string } | null,
  printers: [] as PrinterCfg[],
  osPrinters: [] as { name: string; displayName: string; isDefault: boolean }[],
  log: [] as LogEntry[],
  online: false,
  busy: new Set<string>(), // printer ids currently printing
  lastPrint: {} as Record<string, number>,
};

// ---- helpers ------------------------------------------------------------------------

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
const uid = () => Math.random().toString(36).slice(2, 10);

function toast(msg: string) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((t as any)._h);
  (t as any)._h = setTimeout(() => (t.hidden = true), 2600);
}

function addLog(ok: boolean | null, text: string) {
  state.log.unshift({ ok, text, at: Date.now() });
  state.log = state.log.slice(0, 60);
  renderSide();
}

const ERRORS: Record<string, string> = {
  invalid_code: 'Código incorrecto o vencido. Generá uno nuevo en el panel.',
  too_many_attempts: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
  offline: 'Sin conexión a internet.',
  not_configured: 'La app no está configurada (falta la dirección de Tiko).',
};
const errText = (e: unknown) => ERRORS[(e as ApiError)?.code] ?? 'Algo salió mal. Intentá de nuevo.';

async function savePrinters() {
  await window.tiko.store.set('printers', state.printers);
  // Tell Tiko what this computer prints, for the panel's list.
  if (state.token) {
    api
      .info(
        state.token,
        state.printers.map((p) => ({ name: p.name, device: p.device, kitchen: p.kitchen, customer: p.customer })),
      )
      .catch(() => {});
  }
}

// ---- screens ------------------------------------------------------------------------

function renderLink(err = '') {
  $app.innerHTML = `
    <div class="center"><div class="card">
      <div class="brand">tiko</div>
      <h2>Vinculá esta computadora</h2>
      <p>En el panel de Tiko, entrá a <b>Configuración › Impresoras y tickets</b>, elegí
         <b>Automática con app de PC</b> y tocá <b>Vincular computadora</b>. Escribí aquí el código de 6 dígitos.</p>
      <div class="code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" aria-label="Dígito ${i + 1}">`).join('')}</div>
      <div class="err">${esc(err)}</div>
      <button class="btn btn--p btn--wide" id="go">Vincular</button>
      <span class="muted">El código vence en 10 minutos. No hace falta tu contraseña en esta computadora.</span>
    </div></div>`;

  const inputs = Array.from($app.querySelectorAll<HTMLInputElement>('.code input'));
  inputs[0].focus();
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) inputs[i - 1].focus();
      if (e.key === 'Enter') go();
    });
    inp.addEventListener('paste', (e) => {
      const t = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
      if (!t) return;
      e.preventDefault();
      t.split('').forEach((c, j) => inputs[j] && (inputs[j].value = c));
      inputs[Math.min(t.length, 5)].focus();
    });
  });

  const btn = $app.querySelector<HTMLButtonElement>('#go')!;
  async function go() {
    const code = inputs.map((i) => i.value).join('');
    if (code.length < 6) return renderLinkErr('Escribí los 6 dígitos.');
    btn.disabled = true;
    try {
      const info = await api.checkCode(code);
      renderBranch(code, info);
    } catch (e) {
      renderLinkErr(errText(e));
    } finally {
      btn.disabled = false;
    }
  }
  function renderLinkErr(m: string) {
    $app.querySelector('.err')!.textContent = m;
  }
  btn.addEventListener('click', go);
}

function renderBranch(code: string, info: Awaited<ReturnType<typeof api.checkCode>>) {
  $app.innerHTML = `
    <div class="center"><div class="card">
      <h2>¿Qué sucursal imprime aquí?</h2>
      <p>Cuenta <b>${esc(info.account_name)}</b></p>
      <div class="branches">
        ${info.branches
          .map(
            (b, i) => `<label><input type="radio" name="br" value="${esc(b.id)}" ${i === 0 ? 'checked' : ''}>
              <span><b>${esc(b.name)}</b>${b.address ? `<br><small>${esc(b.address)}</small>` : ''}</span></label>`,
          )
          .join('')}
      </div>
      <label class="field"><span>Nombre de esta computadora</span>
        <input id="pcname" maxlength="60" value="${esc(state.info?.hostname ?? 'Caja')}"></label>
      <div class="err"></div>
      <button class="btn btn--p btn--wide" id="go">Continuar</button>
    </div></div>`;

  $app.querySelector('#go')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const branchId = ($app.querySelector('input[name=br]:checked') as HTMLInputElement | null)?.value;
    if (!branchId) return;
    btn.disabled = true;
    try {
      const name = ($app.querySelector('#pcname') as HTMLInputElement).value.trim() || 'Caja';
      const r = await api.link(code, branchId, name, state.info!.platform, state.info!.version);
      state.token = r.token;
      await window.tiko.token.set(r.token);
      addLog(true, 'Computadora vinculada');
      await start();
      toast('Computadora vinculada');
    } catch (err) {
      $app.querySelector('.err')!.textContent = errText(err);
      btn.disabled = false;
    }
  });
}

function renderMain() {
  $app.innerHTML = `
    <header class="ahead">
      <span class="logo">tiko<small>Impresión</small></span>
      <span class="live ${state.online ? 'live--on' : ''}" id="live"><i></i>${state.online ? 'En línea' : 'Sin conexión'}</span>
      <span class="sp"></span>
      <div class="acct"><b>${esc(state.device?.account_name)}</b><small>Sucursal ${esc(state.device?.branch_name)} · ${esc(state.device?.name)}</small></div>
    </header>
    <main class="amain">
      <section>
        <div class="atitle">
          <h2>Mis impresoras</h2>
          <div class="abtns">
            <button class="btn" id="refresh">↻ Actualizar impresoras</button>
            <button class="btn btn--p" id="add">+ Agregar impresora</button>
          </div>
        </div>
        <div class="printers" id="printers"></div>
      </section>
      <aside class="side" id="side"></aside>
    </main>
    <footer class="afoot"><span>Imprime solo los pedidos de Tiko · revisa cada 3 segundos</span><span>Versión ${esc(state.info?.version)}</span></footer>`;

  $app.querySelector('#refresh')!.addEventListener('click', async () => {
    await loadOsPrinters();
    renderPrinters();
    toast(`Se encontraron ${state.osPrinters.length} impresoras instaladas`);
  });
  $app.querySelector('#add')!.addEventListener('click', () => {
    const def = state.osPrinters.find((p) => p.isDefault) ?? state.osPrinters[0];
    state.printers.push({
      id: uid(),
      name: state.printers.length === 0 ? 'Cocina' : `Impresora ${state.printers.length + 1}`,
      device: def?.name ?? '',
      copies: 1,
      kitchen: state.printers.length === 0,
      customer: false,
    });
    void savePrinters();
    renderPrinters();
  });
  renderPrinters();
  renderSide();
}

function renderPrinters() {
  const el = document.getElementById('printers');
  if (!el) return;
  if (state.printers.length === 0) {
    el.innerHTML = `<div class="empty">Todavía no hay impresoras. Tocá <b>+ Agregar impresora</b> y elegí la impresora de tickets instalada en esta computadora.</div>`;
    return;
  }
  el.innerHTML = state.printers
    .map((p) => {
      const missing = p.device && !state.osPrinters.some((o) => o.name === p.device);
      const st = state.busy.has(p.id)
        ? '<span class="st st--busy">● Imprimiendo…</span>'
        : !p.device || missing
          ? '<span class="st st--bad">● Sin impresora</span>'
          : '<span class="st st--ok">● Lista</span>';
      const opts = state.osPrinters
        .map((o) => `<option value="${esc(o.name)}" ${o.name === p.device ? 'selected' : ''}>${esc(o.displayName)}</option>`)
        .join('');
      return `<div class="pcard ${state.busy.has(p.id) ? 'busy' : ''}" data-id="${p.id}">
        <div class="pcard__h"><input data-k="name" value="${esc(p.name)}" aria-label="Nombre">${st}</div>
        <label class="fld"><span>Impresora de esta computadora</span>
          <select data-k="device"><option value="">— Elegí una —</option>${opts}${missing ? `<option selected value="${esc(p.device)}">${esc(p.device)} (no encontrada)</option>` : ''}</select></label>
        <label class="fld"><span>Copias</span>
          <select data-k="copies">${[1, 2, 3].map((n) => `<option ${p.copies === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="fld"><span>Qué imprime</span><div class="checks">
          <label class="chk"><input type="checkbox" data-k="kitchen" ${p.kitchen ? 'checked' : ''}> Comanda de cocina</label>
          <label class="chk"><input type="checkbox" data-k="customer" ${p.customer ? 'checked' : ''}> Tiquete del cliente</label>
        </div></div>
        <div class="pcard__f">
          <span>Último: <b>${state.lastPrint[p.id] ? hhmm(state.lastPrint[p.id]) : '—'}</b></span>
          <span class="row">
            <button class="btn btn--sm btn--link" data-del>Quitar</button>
            <button class="btn btn--sm" data-test>Imprimir prueba</button>
          </span>
        </div>
      </div>`;
    })
    .join('');

  el.querySelectorAll<HTMLElement>('.pcard').forEach((card) => {
    const p = state.printers.find((x) => x.id === card.dataset.id)!;
    card.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      const k = t.dataset.k as keyof PrinterCfg | undefined;
      if (!k) return;
      if (k === 'kitchen' || k === 'customer') p[k] = t.checked;
      else if (k === 'copies') p.copies = Number(t.value) || 1;
      else if (k === 'name') p.name = t.value.trim() || p.name;
      else if (k === 'device') p.device = t.value;
      void savePrinters();
      if (k !== 'name') renderPrinters();
    });
    card.querySelector('[data-test]')!.addEventListener('click', () => void printTest(p));
    card.querySelector('[data-del]')!.addEventListener('click', () => {
      state.printers = state.printers.filter((x) => x.id !== p.id);
      void savePrinters();
      renderPrinters();
    });
  });
}

function renderSide() {
  const el = document.getElementById('side');
  if (!el) return;
  el.innerHTML = `
    <div class="box"><h3>Actividad</h3>
      <ul class="log">${
        state.log.length
          ? state.log
              .map(
                (l) =>
                  `<li><span class="${l.ok === false ? 'bad' : l.ok === null ? 'wait' : 'ok'}">${l.ok === false ? '✕' : l.ok === null ? '…' : '✓'}</span><span>${esc(l.text)}</span><small>${hhmm(l.at)}</small></li>`,
              )
              .join('')
          : '<li class="muted">Sin actividad todavía.</li>'
      }</ul></div>
    <div class="box"><h3>Esta computadora</h3>
      <label class="chk"><input type="checkbox" id="login" ${state.info?.openAtLogin ? 'checked' : ''}> Abrir al encender la computadora</label>
      <p class="muted small">Al cerrar la ventana, Tiko Impresión sigue imprimiendo desde la bandeja. Para cerrarla del todo: clic derecho en el ícono › Salir.</p>
      <button class="btn btn--sm" id="unlink">Desvincular</button>
    </div>`;
  el.querySelector('#login')!.addEventListener('change', async (e) => {
    const on = (e.target as HTMLInputElement).checked;
    await window.tiko.app.setOpenAtLogin(on);
    state.info = { ...state.info!, openAtLogin: on };
  });
  el.querySelector('#unlink')!.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (b.dataset.sure !== '1') {
      b.dataset.sure = '1';
      b.textContent = '¿Seguro? Tocá de nuevo para desvincular';
      b.classList.add('btn--danger');
      return;
    }
    try {
      if (state.token) await api.unlink(state.token);
    } catch {
      /* unlinked locally anyway */
    }
    await forgetDevice();
    toast('Computadora desvinculada');
  });
}

function setOnline(on: boolean) {
  if (state.online === on) return;
  state.online = on;
  const el = document.getElementById('live');
  if (el) {
    el.className = `live ${on ? 'live--on' : ''}`;
    el.innerHTML = `<i></i>${on ? 'En línea' : 'Sin conexión'}`;
  }
}

// ---- printing -----------------------------------------------------------------------

async function printOn(p: PrinterCfg, html: string) {
  state.busy.add(p.id);
  renderPrinters();
  try {
    await window.tiko.print.html(p.device, html, p.copies);
    state.lastPrint[p.id] = Date.now();
  } finally {
    state.busy.delete(p.id);
    renderPrinters();
  }
}

async function printTest(p: PrinterCfg) {
  if (!p.device) return toast('Elegí primero la impresora.');
  try {
    await printOn(p, testPageHtml(state.device ? { account: { name: state.device.account_name } as any } : null, null, p.name));
    addLog(true, `Prueba → ${p.name}`);
  } catch (e) {
    addLog(false, `Prueba → ${p.name}: ${(e as Error).message}`);
  }
}

const LABEL: Record<Job['kind'], string> = { kitchen: 'Comanda', customer: 'Tiquete', test: 'Prueba' };

async function runJob(job: Job, bundle: NonNullable<Poll['bundle']>) {
  const targets =
    job.kind === 'test'
      ? state.printers.filter((p) => p.device)
      : state.printers.filter((p) => p.device && (job.kind === 'kitchen' ? p.kitchen : p.customer));
  const what = job.order ? `${LABEL[job.kind]} #${job.order.number}` : LABEL[job.kind];

  if (targets.length === 0) {
    addLog(false, `${what}: ninguna impresora está marcada para «${job.kind === 'kitchen' ? 'Comanda de cocina' : 'Tiquete del cliente'}»`);
    await api.done(state.token!, job.id, false, 'no_printer_for_kind').catch(() => {});
    return;
  }

  try {
    const html = await jobHtml(job, bundle);
    const errors: string[] = [];
    for (const p of targets) {
      try {
        await printOn(p, job.kind === 'test' ? testPageHtml(bundle, job.requested_by, p.name) : html);
        addLog(true, `${what} → ${p.name}${job.requested_by ? ` (${job.requested_by})` : ''}`);
      } catch (e) {
        errors.push(`${p.name}: ${(e as Error).message}`);
        addLog(false, `${what} → ${p.name}: ${(e as Error).message}`);
      }
    }
    // Done if at least one printer got it: retrying would duplicate paper
    // on the printers that did print.
    await api.done(state.token!, job.id, errors.length < targets.length, errors.join('; ') || undefined);
  } catch (e) {
    addLog(false, `${what}: ${(e as Error).message}`);
    await api.done(state.token!, job.id, false, (e as Error).message).catch(() => {});
  }
}

// ---- loop ------------------------------------------------------------------------------

let loopTimer: ReturnType<typeof setTimeout> | null = null;
let looping = false;

async function tick() {
  if (!state.token || looping) return;
  looping = true;
  let delay = POLL_MS;
  try {
    const r = await api.poll(state.token, state.info!.version);
    setOnline(true);
    if (r.bundle) for (const job of r.jobs) await runJob(job, r.bundle);
  } catch (e) {
    const code = (e as ApiError).code;
    setOnline(false);
    delay = POLL_BACKOFF_MS;
    if (code === 'device_unlinked') {
      await forgetDevice();
      toast('Esta computadora fue desvinculada desde el panel.');
      looping = false;
      return;
    }
  }
  looping = false;
  loopTimer = setTimeout(tick, delay);
}

async function loadOsPrinters() {
  try {
    state.osPrinters = await window.tiko.printers.list();
  } catch {
    state.osPrinters = [];
  }
}

async function forgetDevice() {
  if (loopTimer) clearTimeout(loopTimer);
  state.token = null;
  state.device = null;
  await window.tiko.token.set(null);
  setOnline(false);
  renderLink();
}

async function start() {
  try {
    state.device = await api.info(
      state.token!,
      state.printers.map((p) => ({ name: p.name, device: p.device, kitchen: p.kitchen, customer: p.customer })),
    );
    setOnline(true);
  } catch (e) {
    if ((e as ApiError).code === 'device_unlinked') return forgetDevice();
    // Offline at startup: keep going, the loop retries.
  }
  await loadOsPrinters();
  renderMain();
  void tick();
}

async function boot() {
  state.info = await window.tiko.app.info();
  state.printers = ((await window.tiko.store.get<PrinterCfg[]>('printers')) ?? []).filter(Boolean);
  state.token = await window.tiko.token.get();
  if (state.token) await start();
  else renderLink();
}

void boot();
