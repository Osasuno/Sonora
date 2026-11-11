"use strict";

/**
 * Cache em memoria com validade e limite de tamanho.
 *
 * Por que existe: o catalogo publico tem limite de requisicoes por IP. Guardar
 * as respostas por alguns minutos deixa a navegacao instantanea e evita levar
 * bloqueio quando varias pessoas usam o app ao mesmo tempo.
 */
class TtlCache {
  constructor({ maxEntries = 800, defaultTtlMs = 10 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Reinsere para manter a ordem de uso (descarte do mais antigo primeiro).
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Busca no cache ou executa o carregador e guarda o resultado. */
  async wrap(key, ttlMs, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    return this.set(key, value, ttlMs);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TtlCache };
