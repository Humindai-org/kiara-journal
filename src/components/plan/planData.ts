export interface RuleItem {
  id: string;
  label: string;
  enabled: boolean;
  isCustom?: boolean;
  image?: string;
}

// ─── MATVARD template generators ─────────────────────────────
// These are used when the user clicks "Cargar plantilla MATVARD"

export function matvardChartingItems(): RuleItem[] {
  return [
    { id: "mc1", label: "Macro — Anotar horas de publicaciones macroeconómicas relevantes", enabled: true },
    { id: "mc2", label: "Rollover — Revisar volumen contrato actual vs próximo", enabled: true },
    { id: "mc3", label: "LT-VWAPs & LT-PVAs — Analizar posición precio vs Y/Q/M/W DVA", enabled: true },
    { id: "mc4", label: "Estructura TPO y DVA-ETH — Máximos/mínimos previos", enabled: true },
    { id: "mc5", label: "LIS — Marcar zonas de confluencia, clasificar alcista/bajista", enabled: true },
    { id: "mc6", label: "Narrativa principal — Alcista / Bajista / Difusa", enabled: true },
    { id: "mc7", label: "Delta (OF) y Ritmo+Aceptación — Estado del delta cumulativo", enabled: true },
    { id: "mc8", label: "Hipótesis — Máximo 3, puntuadas A+/A/B/C", enabled: true },
  ];
}

export function matvardConfluenceItems(): RuleItem[] {
  return [
    // Contexto de Valor
    { id: "b1", label: "Setup en/cerca de MRCVA H/L (gold)", enabled: true },
    { id: "b2", label: "Soporte de OCVA relevante en la zona (gray)", enabled: true },
    { id: "b3", label: "PVA del día anterior da confluencia (magenta)", enabled: true },
    { id: "b4", label: "Precio lejos del POC (no en zona de ruido)", enabled: true },
    { id: "b5", label: "Single Prints o Poor H/L dan contexto", enabled: true },
    // DVA y Condición
    { id: "c1", label: "DVA-ETH alineada con la dirección del trade", enabled: true },
    { id: "c2", label: "DVA-RTH alineada con la dirección del trade", enabled: true },
    { id: "c3", label: "W-DVA alineada con la dirección del trade", enabled: true },
    { id: "c4", label: "M-DVA alineada con la dirección del trade", enabled: true },
    { id: "c5", label: "AP Origen identificada (confluencia CVA + DVA extremo)", enabled: true },
    // Ritmo y Timing
    { id: "d1", label: "FCS (First Condition Shift) identificado", enabled: true },
    { id: "d2", label: "Pullback del 40-50% del impulso previo (T2)", enabled: true },
    { id: "d3", label: "Estamos en T3 (zona óptima de entrada)", enabled: true },
    { id: "d4", label: "Pullback con bajo slope y alta frecuencia", enabled: true },
    { id: "d5", label: "Vela impulsiva de entrada con delta favorable", enabled: true },
    // PRAC y Narrativa
    { id: "e1", label: "Escenario PRAC es FA (Full Alignment)", enabled: true },
    { id: "e2", label: "Dirección del trade consistente con la narrativa", enabled: true },
    { id: "e3", label: "Sin conflicto en alta temporalidad (no CAT/CMP)", enabled: true },
    { id: "e4", label: "No es escenario MM (Mixture of Modes)", enabled: true },
    // Sesión y Noticias
    { id: "f1", label: "Sesión activa: London, NY u Overlap", enabled: true },
    { id: "f2", label: "Sin noticias HIGH en los próximos 30 min", enabled: true },
    { id: "f3", label: "Volumen adecuado para el instrumento y hora", enabled: true },
  ];
}

export function matvardModelItems(): RuleItem[] {
  return [
    { id: "m1", label: "RPB — Return Pullback: precio sale del VA, retrocede a borde, continúa", enabled: true },
    { id: "m2", label: "BPB — Breakout Pullback: compresión → rotura → pullback → continuación", enabled: true },
    { id: "m3", label: "IPB — Imbalance Pullback: imbalance confirmado + test + continuación", enabled: true },
    { id: "m4", label: "EF — Extreme Fade: fade en ±2σ/±3σ del DVA", enabled: false },
    { id: "m5", label: "Rotación VA — Rebote de extremo VAL/VAH dentro del equilibrio", enabled: false },
    { id: "m6", label: "Migración histórica — Precio abandona VA y va a OCVA previo", enabled: false },
    { id: "m7", label: "Rechazo POC/VWAP — V-shape en POC o VWAP con fuerza", enabled: false },
    { id: "m8", label: "Test Poor H/L — Prueba de extremo incompleto", enabled: false },
  ];
}

export function matvardManagementItems(): RuleItem[] {
  return [
    { id: "tm1", label: "Definir el tamaño de posición ANTES de abrir la orden", enabled: true },
    { id: "tm2", label: "No redimensionar la posición a mitad del trade", enabled: true },
    { id: "tm3", label: "Si la invalidación se activa → cerrar sin excepción", enabled: true },
    { id: "tm4", label: "Cerrar 50% al llegar a TP1 (1:3 R:R)", enabled: true },
    { id: "tm5", label: "Mover SL a breakeven al alcanzar TP1", enabled: true },
    { id: "tm6", label: "Dejar correr 50% hasta TP2 (1:5 R:R) si el contexto lo permite", enabled: true },
    { id: "tm7", label: "Si precio >15 pips a favor: no convertir en pérdida", enabled: true },
  ];
}

export function matvardExitItems(): RuleItem[] {
  return [
    { id: "ec1", label: "Stop Loss tocado → cierre automático, sin moverlo", enabled: true },
    { id: "ec2", label: "Precio lateral >30 min sin avanzar hacia TP → scratch", enabled: true },
    { id: "ec3", label: "ATR de 4-5 días ya recorrido en sesión → tomar parciales", enabled: true },
    { id: "ec4", label: "2 pérdidas en el mismo día → cerrar sesión inmediatamente", enabled: true },
    { id: "ec5", label: "$300 de pérdida neta → stop diario, cerrar plataforma", enabled: true },
    { id: "ec6", label: "Narrativa cambia mid-trade → reevaluar y considerar cierre", enabled: true },
  ];
}

export function matvardNoteItems(): RuleItem[] {
  return [
    { id: "n1", label: "Leer la narrativa principal ANTES de buscar setups", enabled: true },
    { id: "n2", label: "El charting diario es OBLIGATORIO antes de cualquier trade", enabled: true },
    { id: "n3", label: "El mejor trade a veces es NO operar", enabled: true },
    { id: "n4", label: "Ejecuta el proceso, no el resultado", enabled: true },
    { id: "n5", label: "Un día rojo ejecutando bien > un día verde por suerte", enabled: true },
  ];
}

// ─── Parse helpers ────────────────────────────────────────────

export function parseRuleArray(raw: unknown, fallback: RuleItem[] = []): RuleItem[] {
  if (!raw) return fallback;

  // Already an array of RuleItems
  if (Array.isArray(raw)) {
    if (raw.length === 0) return fallback;
    // Validate shape
    if (typeof raw[0] === "object" && raw[0] !== null && "label" in raw[0]) {
      return raw as RuleItem[];
    }
  }

  // Old format: { steps: [...] } (charting_process)
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj?.steps)) {
    return (obj.steps as { id: string; label: string; enabled: boolean }[]).map((s) => ({
      id: s.id,
      label: s.label,
      enabled: s.enabled,
    }));
  }

  // Old format: { confluences: [...] } (entry_criteria)
  if (Array.isArray(obj?.confluences)) {
    return (obj.confluences as { id: string; label: string; enabled: boolean }[]).map((c) => ({
      id: c.id,
      label: c.label,
      enabled: c.enabled,
    }));
  }

  // Old format: text with JSON
  if (typeof raw === "string") {
    try {
      return parseRuleArray(JSON.parse(raw), fallback);
    } catch {
      if (raw.trim()) return [{ id: "legacy", label: raw.trim(), enabled: true, isCustom: true }];
    }
  }

  return fallback;
}
