export function encodeState(persons) {
  if (!persons.length) return "";
  const ids = persons.map((p) => p.id).join(",");
  return `?p=${ids}`;
}

export function decodeState(search) {
  const params = new URLSearchParams(search);
  const raw = params.get("p");
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^Q\d+$/.test(id));
}
