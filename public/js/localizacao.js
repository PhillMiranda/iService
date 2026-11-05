// Localização do cliente e proximidade.
//   Opção A (atual):  filtra por cidade de atendimento do prestador.
//   Opção B (futuro): distância real por coordenadas.
// A função dentroDoLocal já decide sozinha: se houver coordenadas dos dois lados,
// usa distância (B); senão, cai na cidade (A). Migrar para B = preencher coordenadas.

const CHAVE = 'iservice_local';

export function lerLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
}

export function salvarLocal(local) {
  try { localStorage.setItem(CHAVE, JSON.stringify(local || {})); } catch { /* ignora */ }
}

// Distância em km entre {lat,lng} (Haversine). Pronta para a opção B.
export function distanciaKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Posição atual via GPS do navegador (ou null se negar/indisponível).
export function posicaoAtual() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

// Geocodifica um endereço via Nominatim (OpenStreetMap). Sem chave; respeite o
// limite de ~1 req/s e guarde o resultado (aqui só é chamado quando o prestador salva).
export async function geocodificar(endereco) {
  if (!endereco) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;
  try {
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!arr?.length) return null;
    return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
  } catch { return null; }
}

// Um serviço entra no filtro de localização?
export function dentroDoLocal(servico, local) {
  const p = servico.prestadores || {};
  // Opção B — distância real (só quando os dois lados têm coordenadas)
  if (local?.lat != null && p.latitude != null) {
    const d = distanciaKm(local, { lat: Number(p.latitude), lng: Number(p.longitude) });
    const raio = p.raio_km || 15;
    return d != null && d <= raio;
  }
  // Opção A — por cidade (fallback)
  if (!local?.cidade) return true;                 // "Todas as cidades"
  return (p.atende_cidade || '') === local.cidade;
}
