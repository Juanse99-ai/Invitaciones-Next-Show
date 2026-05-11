/**
 * NEXT SHOW · Toast notifications
 * Stack vertical en #toast-container. Auto-hide a los 4s con animacion CSS.
 *
 * Uso:
 *   import { Toast } from '/shared/toast.js';
 *   const toast = new Toast();
 *   toast.show('Cupon aplicado', 'success');
 */

export class Toast {
  constructor(containerId = 'toast-container') {
    this.containerId = containerId;
  }

  _container() {
    let el = document.getElementById(this.containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = this.containerId;
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * @param {string} msg
   * @param {'success'|'error'|'info'} [type='info']
   * @param {number} [duration=4000]
   */
  show(msg, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    this._container().appendChild(el);

    // Animacion entrada
    requestAnimationFrame(() => el.classList.add('toast-in'));

    setTimeout(() => {
      el.classList.remove('toast-in');
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  success(msg, duration) { this.show(msg, 'success', duration); }
  error(msg, duration)   { this.show(msg, 'error', duration); }
  info(msg, duration)    { this.show(msg, 'info', duration); }
}

// Instancia singleton para uso rapido
export const toast = new Toast();
